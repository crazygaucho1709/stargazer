// src/components/viewport/StellariumSkyCanvas.tsx
"use client";

/**
 * Carte du ciel — moteur Stellarium Web Engine (WASM, AGPL-3.0), servi en
 * local depuis public/stellarium : aucun appel réseau, donc utilisable sur le
 * terrain sans internet, contrairement à la vue photo DSS2 (Aladin).
 *
 * Le moteur ne se détruit pas proprement (boucle de rendu et contexte WebGL
 * internes). Ce composant doit donc rester MONTÉ en permanence : pour le
 * masquer, passer `hidden` plutôt que de le démonter.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Waypoints, Tag, CloudSun, Mountain, Grid3x3, Globe, Sparkles,
  ZoomIn, ZoomOut, Crosshair, Image as ImageIcon, Loader2,
} from "lucide-react";
import { useStargazerStore } from "@/store/useStargazerStore";
import { CELESTIAL_CATALOG, CelestialObject } from "@/data/celestialCatalog";
import { notification } from "@/lib/notificationService";
import { parseRaDeg, parseDecDeg, FOV_PRESETS } from "@/components/viewport/HybridSkyCanvas";

const ENGINE_BASE = "/stellarium";
const SKYDATA = `${ENGINE_BASE}/skydata`;
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

// ─── Sous-ensemble typé de l'API du moteur ──────────────────────────────────

interface SweObj {
  designations: () => string[];
  getInfo: (info: string) => unknown;
  add: (obj: SweObj) => void;
  remove: (obj: SweObj) => void;
}

interface SweModule {
  visible: boolean;
  addDataSource: (args: { url: string; key?: string }) => void;
}

interface SweCore {
  observer: { latitude: number; longitude: number; utc: number };
  fov: number;
  selection: SweObj | null | 0;
  stars: SweModule;
  skycultures: SweModule;
  dsos: SweModule;
  landscapes: SweModule;
  milkyway: SweModule;
  minor_planets: SweModule;
  planets: SweModule;
  comets: SweModule;
  satellites: SweModule;
  atmosphere: SweModule;
  constellations: SweModule & { lines_visible: boolean; labels_visible: boolean };
  lines: { equatorial: SweModule; azimuthal: SweModule };
}

interface Stel {
  core: SweCore;
  observer: { v: number };
  s2c: (theta: number, phi: number) => number[];
  c2s: (v: number[]) => [number, number];
  anp: (a: number) => number;
  anpm: (a: number) => number;
  convertFrame: (obs: { v: number }, origin: string, dest: string, v: number[]) => number[];
  lookAt: (pos: number[], duration?: number) => void;
  zoomTo: (fovRad: number, duration?: number) => void;
  change: (cb: (obj: unknown, attr: string) => void) => void;
  createLayer: (data: { id: string; z: number; visible: boolean }) => SweObj;
  createObj: (type: string, args: unknown) => SweObj | null;
  date2MJD: (ms: number) => number;
  _observer_update: (obsPtr: number, fast: boolean) => void;
  _core_on_mouse: (id: number, state: number, x: number, y: number, buttons: number) => void;
}

declare global {
  interface Window {
    __stel?: Stel;
    StelWebEngine?: (opts: {
      wasmFile: string;
      canvas: HTMLCanvasElement;
      onReady: (stel: Stel) => void;
    }) => void;
  }
}

let scriptPromise: Promise<void> | null = null;
function loadEngineScript(): Promise<void> {
  if (window.StelWebEngine) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = `${ENGINE_BASE}/stellarium-web-engine.js`;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        scriptPromise = null;
        reject(new Error(`Échec du chargement de ${s.src}`));
      };
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

// ─── Conversions ────────────────────────────────────────────────────────────

function formatRa(deg: number): string {
  const h = deg / 15;
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  const ss = Math.round(((h - hh) * 60 - mm) * 60);
  return `${String(hh).padStart(2, "0")}h ${String(mm).padStart(2, "0")}m ${String(ss).padStart(2, "0")}s`;
}

function formatDec(deg: number): string {
  const sign = deg < 0 ? "-" : "+";
  const a = Math.abs(deg);
  const dd = Math.floor(a);
  const mm = Math.floor((a - dd) * 60);
  const ss = Math.round(((a - dd) * 60 - mm) * 60);
  return `${sign}${String(dd).padStart(2, "0")}° ${String(mm).padStart(2, "0")}' ${String(ss).padStart(2, "0")}"`;
}

/** "NAME Orion Nebula" → "Orion Nebula", "M 42" → "M42" */
function cleanDesignation(d: string): string {
  return d.replace(/^NAME /, "").replace(/^V?\* /, "").replace(/^(M|NGC|IC|C) (\d+)/, "$1$2").trim();
}

function angularSepDeg(ra1: number, dec1: number, ra2: number, dec2: number): number {
  const c =
    Math.sin(dec1 * D2R) * Math.sin(dec2 * D2R) +
    Math.cos(dec1 * D2R) * Math.cos(dec2 * D2R) * Math.cos((ra1 - ra2) * D2R);
  return Math.acos(Math.max(-1, Math.min(1, c))) * R2D;
}

const SOLAR_SYSTEM = new Set([
  "Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto",
]);

/** Objet du moteur → fiche Stargazer. Le catalogue maison prime (description,
 *  conseils de pose) ; sinon on construit une fiche minimale, sans rien inventer. */
function toCelestialObject(stel: Stel, sel: SweObj): CelestialObject | null {
  const radec = sel.getInfo("radec");
  if (!Array.isArray(radec)) return null;
  const [theta, phi] = stel.c2s(radec as number[]);
  const raDeg = stel.anp(theta) * R2D;
  const decDeg = stel.anpm(phi) * R2D;

  const raw = sel.designations();
  const names = raw.map(cleanDesignation);
  const byId = CELESTIAL_CATALOG.find((o) => names.includes(o.id));
  if (byId) return byId;
  const near = CELESTIAL_CATALOG.find(
    (o) => angularSepDeg(o.ra_deg, o.dec_deg, raDeg, decDeg) < 0.08,
  );
  if (near) return near;

  // Le moteur ne renvoie pas toujours de type : on le déduit des désignations
  // ("* bet Ori", "HIP 24436" pour une étoile ; nom propre pour une planète).
  const type: CelestialObject["type"] =
    SOLAR_SYSTEM.has(names[0] ?? "") ? "Planet"
    : raw.some((d) => /^(\* |V\* |HIP |HD |TYC |Gaia )/.test(d)) ? "Star"
    : "Other";
  const vmag = sel.getInfo("vmag");
  const name = names[0] ?? "Objet";

  return {
    id: name,
    name: names[1] ?? name,
    catalog: "Stellarium",
    ra: formatRa(raDeg),
    dec: formatDec(decDeg),
    ra_deg: raDeg,
    dec_deg: decDeg,
    magnitude: typeof vmag === "number" ? vmag : NaN,
    type,
    constellation: "",
    size_arcmin: "",
    description: "",
    best_months: [],
    difficulty: "Medium",
  };
}

/** Anneau fermé approchant un cercle de rayon r (degrés) autour de ra/dec. */
function circleRing(ra: number, dec: number, r: number): number[][] {
  const cosDec = Math.max(0.05, Math.cos(dec * D2R));
  const pts: number[][] = [];
  for (let i = 0; i <= 32; i++) {
    const a = (i / 32) * 2 * Math.PI;
    pts.push([ra + (r * Math.cos(a)) / cosDec, dec + r * Math.sin(a)]);
  }
  return pts;
}

function rectRing(ra: number, dec: number, wDeg: number, hDeg: number): number[][] {
  const dRa = wDeg / 2 / Math.max(0.05, Math.cos(dec * D2R));
  const dDec = hDeg / 2;
  return [
    [ra - dRa, dec - dDec], [ra + dRa, dec - dDec],
    [ra + dRa, dec + dDec], [ra - dRa, dec + dDec],
    [ra - dRa, dec - dDec],
  ];
}

// ─── Composant ──────────────────────────────────────────────────────────────

type ToggleId = "cstLines" | "cstLabels" | "atmosphere" | "landscape" | "equatorial" | "azimuthal" | "dsos";

const TOGGLES: { id: ToggleId; label: string; Icon: React.ElementType }[] = [
  { id: "cstLines",   label: "Lignes des constellations", Icon: Waypoints },
  { id: "cstLabels",  label: "Noms des constellations",   Icon: Tag },
  { id: "dsos",       label: "Objets du ciel profond",    Icon: Sparkles },
  { id: "landscape",  label: "Paysage et horizon",        Icon: Mountain },
  { id: "atmosphere", label: "Atmosphère (ciel de jour)", Icon: CloudSun },
  { id: "equatorial", label: "Grille équatoriale",        Icon: Grid3x3 },
  { id: "azimuthal",  label: "Grille azimutale",          Icon: Globe },
];

const DEFAULT_TOGGLES: Record<ToggleId, boolean> = {
  cstLines: true, cstLabels: true, dsos: true, landscape: true,
  atmosphere: false, equatorial: false, azimuthal: false,
};

function applyToggles(core: SweCore, t: Record<ToggleId, boolean>) {
  core.constellations.lines_visible = t.cstLines;
  core.constellations.labels_visible = t.cstLabels;
  core.dsos.visible = t.dsos;
  core.landscapes.visible = t.landscape;
  core.atmosphere.visible = t.atmosphere;
  core.lines.equatorial.visible = t.equatorial;
  core.lines.azimuthal.visible = t.azimuthal;
}

interface StellariumSkyCanvasProps {
  lat: number;
  lon: number;
  /** Instant affiché. Suit l'horloge tant que `realtime` est vrai. */
  date: Date;
  realtime: boolean;
  hidden?: boolean;
  /** Faux tant que la monture n'a pas été synchronisée sur le ciel : sa
   *  position céleste est alors sans valeur et ne doit pas être dessinée. */
  mountAligned: boolean;
  focusTarget: CelestialObject | null;
  frameRequestCounter: number;
  solvedCenter?: { raDeg: number; decDeg: number; seq: number } | null;
  onSelectObject: (obj: CelestialObject) => void;
  /** Bascule vers la vue photo DSS2 (Aladin). */
  onShowPhotoView: () => void;
}

export function StellariumSkyCanvas({
  lat, lon, date, realtime, hidden = false, mountAligned,
  focusTarget, frameRequestCounter, solvedCenter,
  onSelectObject, onShowPhotoView,
}: StellariumSkyCanvasProps) {
  const { ra, dec, isConnected } = useStargazerStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stelRef = useRef<Stel | null>(null);
  const layerRef = useRef<SweObj | null>(null);
  const overlayRef = useRef<SweObj | null>(null);
  const onSelectRef = useRef(onSelectObject);
  onSelectRef.current = onSelectObject;

  const [ready, setReady] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toggles, setToggles] = useState(DEFAULT_TOGGLES);

  const mountRaDeg = parseRaDeg(ra);
  const mountDecDeg = parseDecDeg(dec);
  // 0/0 est la valeur du store avant toute lecture de la monture, pas une position.
  const mountValid = isConnected && mountAligned
    && (Math.abs(mountRaDeg) > 0.001 || Math.abs(mountDecDeg) > 0.001);

  const lookAtRaDec = useCallback((raDeg: number, decDeg: number, duration = 1.0) => {
    const stel = stelRef.current;
    if (!stel) return;
    // Sans cette mise à jour, un lieu ou une heure tout juste modifiés ne
    // sont pris en compte qu'à l'image suivante, et la cible est convertie
    // avec l'ancien observateur : la vue partait ailleurs dans le ciel.
    stel._observer_update(stel.observer.v, false);
    const icrf = stel.s2c(raDeg * D2R, decDeg * D2R);
    stel.lookAt(stel.convertFrame(stel.observer, "ICRF", "OBSERVED", icrf), duration);
  }, []);

  // ── Démarrage du moteur (une seule fois) ──────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;

    loadEngineScript()
      .then(() => {
        if (cancelled || !window.StelWebEngine) return;
        window.StelWebEngine({
          wasmFile: `${ENGINE_BASE}/stellarium-web-engine.wasm`,
          canvas,
          onReady: (stel) => {
            if (cancelled) return;
            const core = stel.core;
            core.stars.addDataSource({ url: `${SKYDATA}/stars` });
            core.skycultures.addDataSource({ url: `${SKYDATA}/skycultures/western`, key: "western" });
            core.dsos.addDataSource({ url: `${SKYDATA}/dso` });
            core.landscapes.addDataSource({ url: `${SKYDATA}/landscapes/guereins`, key: "guereins" });
            core.milkyway.addDataSource({ url: `${SKYDATA}/surveys/milkyway` });
            core.minor_planets.addDataSource({ url: `${SKYDATA}/mpcorb.dat`, key: "mpc_asteroids" });
            core.planets.addDataSource({ url: `${SKYDATA}/surveys/sso/moon`, key: "moon" });
            core.planets.addDataSource({ url: `${SKYDATA}/surveys/sso/sun`, key: "sun" });
            core.planets.addDataSource({ url: `${SKYDATA}/surveys/sso/moon`, key: "default" });
            core.comets.addDataSource({ url: `${SKYDATA}/CometEls.txt`, key: "mpc_comets" });

            applyToggles(core, DEFAULT_TOGGLES);
            core.fov = 60 * D2R;
            layerRef.current = stel.createLayer({ id: "stargazer", z: 50, visible: true });

            stel.change((_obj, attr) => {
              if (attr !== "selection") return;
              const sel = stel.core.selection;
              if (!sel) return;
              const obj = toCelestialObject(stel, sel);
              if (obj) onSelectRef.current(obj);
            });

            stelRef.current = stel;
            window.__stel = stel; // poignée de diagnostic (console du navigateur)
            setReady(true);
          },
        });
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Moteur Stellarium indisponible";
        setErrorMsg(msg);
        notification.error("Carte Stellarium indisponible", { description: msg, source: "Carte du ciel" });
      });

    return () => { cancelled = true; };
  }, []);

  // ── Clics brefs ───────────────────────────────────────────────────────────
  // Le moteur ne signale l'appui qu'à l'image suivante. Un tap de trackpad
  // (appui et relâchement dans la même image, < 16 ms) n'était donc jamais vu
  // comme un clic et ne sélectionnait rien. On transmet l'appui tout de suite.
  useEffect(() => {
    const stel = stelRef.current;
    const canvas = canvasRef.current;
    if (!ready || !stel || !canvas) return;
    const onDown = (e: MouseEvent) => {
      userMovedRef.current = true;
      const rect = canvas.getBoundingClientRect();
      stel._core_on_mouse(0, 1, e.clientX - rect.left, e.clientY - rect.top, e.buttons);
    };
    canvas.addEventListener("mousedown", onDown);
    return () => canvas.removeEventListener("mousedown", onDown);
  }, [ready]);

  // ── Lieu et instant d'observation ─────────────────────────────────────────
  useEffect(() => {
    const stel = stelRef.current;
    if (!ready || !stel) return;
    stel.core.observer.latitude = lat * D2R;
    stel.core.observer.longitude = lon * D2R;
  }, [ready, lat, lon]);

  useEffect(() => {
    const stel = stelRef.current;
    if (!ready || !stel) return;
    // Le moteur fait ensuite avancer son horloge seul (time_speed = 1).
    stel.core.observer.utc = stel.date2MJD((realtime ? new Date() : date).getTime());
  }, [ready, date, realtime]);

  useEffect(() => {
    const stel = stelRef.current;
    if (ready && stel) applyToggles(stel.core, toggles);
  }, [ready, toggles]);

  // ── Vue initiale : la monture si elle est connue, sinon M42 ───────────────
  // La vue est tenue en azimut/hauteur : si le lieu change (le GPS du
  // navigateur répond après le démarrage), le ciel tourne et la cible sort du
  // champ. On réoriente donc à chaque changement de lieu, tant que
  // l'utilisateur n'a pas lui-même bougé la carte ou choisi une cible.
  const userMovedRef = useRef(false);
  useEffect(() => {
    if (!ready || userMovedRef.current || focusTarget) return;
    if (mountValid) lookAtRaDec(mountRaDeg, mountDecDeg, 0);
    else lookAtRaDec(83.8221, -5.3911, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, lat, lon]);

  // ── Recentrages demandés par la page ──────────────────────────────────────
  useEffect(() => {
    if (ready && focusTarget) lookAtRaDec(focusTarget.ra_deg, focusTarget.dec_deg);
  }, [ready, focusTarget, lookAtRaDec]);

  useEffect(() => {
    const stel = stelRef.current;
    if (!ready || !stel || !focusTarget || frameRequestCounter === 0) return;
    lookAtRaDec(focusTarget.ra_deg, focusTarget.dec_deg);
    stel.zoomTo(FOV_PRESETS.canon600d.wDeg * 4 * D2R, 1.0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameRequestCounter]);

  useEffect(() => {
    if (ready && solvedCenter) lookAtRaDec(solvedCenter.raDeg, solvedCenter.decDeg);
  }, [ready, solvedCenter, lookAtRaDec]);

  // ── Réticule de la monture + cadre du capteur, dessinés sur le ciel ───────
  const frameRa = mountValid ? mountRaDeg : focusTarget?.ra_deg;
  const frameDec = mountValid ? mountDecDeg : focusTarget?.dec_deg;
  useEffect(() => {
    const stel = stelRef.current;
    const layer = layerRef.current;
    if (!ready || !stel || !layer) return;

    if (overlayRef.current) {
      layer.remove(overlayRef.current);
      overlayRef.current = null;
    }
    const features: unknown[] = [];
    const shape = (ring: number[][], stroke: string, width: number) => ({
      type: "Feature",
      properties: {
        stroke, "stroke-width": width, "stroke-opacity": 0.9,
        fill: "#000000", "fill-opacity": 0,
      },
      geometry: { type: "Polygon", coordinates: [ring] },
    });
    if (mountValid) {
      features.push(shape(circleRing(mountRaDeg, mountDecDeg, 0.35), "#00FFD1", 2));
    }
    if (frameRa !== undefined && frameDec !== undefined) {
      const p = FOV_PRESETS.canon600d;
      features.push(shape(rectRing(frameRa, frameDec, p.wDeg, p.hDeg), "#FFB347", 1.5));
    }
    if (features.length === 0) return;

    const obj = stel.createObj("geojson", { data: { type: "FeatureCollection", features } });
    if (obj) {
      layer.add(obj);
      overlayRef.current = obj;
    }
  }, [ready, mountValid, mountRaDeg, mountDecDeg, frameRa, frameDec]);

  const zoomBy = (factor: number) => {
    const stel = stelRef.current;
    if (!stel) return;
    const next = Math.min(120, Math.max(0.2, stel.core.fov * R2D * factor));
    stel.zoomTo(next * D2R, 0.4);
  };

  const btn =
    "min-w-[var(--size-touch)] min-h-[var(--size-touch)] flex items-center justify-center rounded-lg " +
    "transition-colors duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <div
      className="absolute inset-0 bg-[#05070E]"
      style={{ visibility: hidden ? "hidden" : "visible" }}
      aria-hidden={hidden}
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {!ready && !errorMsg && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#05070E] z-10 pointer-events-none">
          <Loader2 size={24} className="animate-spin text-[--astro-teal]" />
          <span className="text-hud-xs text-slate-400 tracking-wide">Démarrage de Stellarium…</span>
        </div>
      )}

      {errorMsg && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#05070E] z-10">
          <span className="text-hud-md font-medium text-slate-200">Carte Stellarium indisponible</span>
          <span className="text-hud-xs text-slate-400">{errorMsg}</span>
          <button type="button" onClick={onShowPhotoView} className="hud-toolbar-btn text-hud-xs mt-2">
            <ImageIcon size={14} aria-hidden /> Ouvrir la vue photo DSS2
          </button>
        </div>
      )}

      {/* Barre d'outils, sous l'en-tête */}
      <div className="absolute top-[70px] left-1/2 -translate-x-1/2 z-[var(--z-overlay)] flex items-center justify-center gap-1.5 flex-wrap max-w-[calc(100vw-24px)]">
        <div className="hud-glass flex items-center gap-0.5 p-1 rounded-xl" role="group" aria-label="Affichage du ciel">
          {TOGGLES.map(({ id, label, Icon }) => {
            const active = toggles[id];
            return (
              <button
                key={id}
                type="button"
                disabled={!ready}
                aria-pressed={active}
                aria-label={label}
                title={label}
                onClick={() => setToggles((t) => ({ ...t, [id]: !t[id] }))}
                className={`${btn} ${active ? "bg-[--astro-teal]/15 text-[--astro-teal]" : "text-slate-400 hover:bg-white/10 hover:text-white"}`}
              >
                <Icon size={15} aria-hidden />
              </button>
            );
          })}
        </div>

        <div className="hud-glass flex items-center gap-0.5 p-1 rounded-xl">
          <button type="button" disabled={!ready} onClick={() => zoomBy(0.5)} aria-label="Zoomer" title="Zoomer"
            className={`${btn} text-slate-300 hover:bg-white/10 hover:text-white`}>
            <ZoomIn size={15} aria-hidden />
          </button>
          <button type="button" disabled={!ready} onClick={() => zoomBy(2)} aria-label="Dézoomer" title="Dézoomer"
            className={`${btn} text-slate-300 hover:bg-white/10 hover:text-white`}>
            <ZoomOut size={15} aria-hidden />
          </button>
          <button
            type="button"
            disabled={!ready || !mountValid}
            onClick={() => lookAtRaDec(mountRaDeg, mountDecDeg)}
            aria-label="Centrer sur la monture"
            title={mountValid
              ? "Centrer sur la monture"
              : isConnected && !mountAligned
                ? "Monture non alignée : position inconnue sur le ciel"
                : "Position de la monture inconnue"}
            className={`${btn} text-[--astro-teal] hover:bg-white/10`}
          >
            <Crosshair size={15} aria-hidden />
          </button>
        </div>

        <button type="button" onClick={onShowPhotoView} title="Vue photographique DSS2 (internet requis)"
          className="hud-glass flex items-center gap-1.5 px-2.5 min-h-[calc(var(--size-touch)+8px)] rounded-xl text-hud-xs text-slate-300 hover:text-white cursor-pointer transition-colors duration-150">
          <ImageIcon size={14} aria-hidden />
          <span className="hidden sm:inline">Photo DSS2</span>
        </button>
      </div>
    </div>
  );
}
