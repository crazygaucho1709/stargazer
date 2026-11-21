// src/components/viewport/HybridSkyCanvas.tsx
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Grid3x3,
  Sparkles,
  Frame,
  ZoomIn,
  ZoomOut,
  Crosshair,
  Layers,
  Loader2,
} from "lucide-react";
import { CELESTIAL_CATALOG, CelestialObject } from "@/data/celestialCatalog";
import { useStargazerStore } from "@/store/useStargazerStore";

declare global {
  interface Window {
    A: any;
  }
}

interface AladinCatalog {
  addSources: (sources: unknown[]) => void;
  show: () => void;
  hide: () => void;
}

interface AladinInstance {
  addCatalog: (catalog: AladinCatalog) => void;
  setImageSurvey: (survey: string) => void;
  setFov: (fov: number) => void;
  gotoRaDec: (ra: number, dec: number) => void;
  showCooGrid?: () => void;
  hideCooGrid?: () => void;
  setCooGrid?: (visible: boolean) => void;
  on?: {
    (event: "zoomChanged", cb: (fovVal: number) => void): void;
    (event: "objectClicked", cb: (obj: { data?: { id?: string } } | null) => void): void;
  };
}

export type SurveyId =
  | "P/DSS2/color"
  | "P/Mellinger/color"
  | "P/PanSTARRS/DR1/color-z-zg-g"
  | "P/2MASS/color";

const SURVEYS: { id: SurveyId; label: string; defaultFov?: number }[] = [
  { id: "P/DSS2/color",                 label: "DSS2",        defaultFov: 3.5 },
  { id: "P/Mellinger/color",            label: "Voie Lactée", defaultFov: 55 },
  { id: "P/PanSTARRS/DR1/color-z-zg-g", label: "PanSTARRS",   defaultFov: 1.5 },
  { id: "P/2MASS/color",                label: "Infrarouge",  defaultFov: 4 },
];

export type FovPresetId = "canon600d" | "asi662" | "asi662_red";

export const FOV_PRESETS: Record<FovPresetId, { label: string; wDeg: number; hDeg: number }> = {
  canon600d:  { label: "4SE · Canon 600D",       wDeg: 0.96, hDeg: 0.64 },
  asi662:     { label: "4SE · ASI662MC",         wDeg: 0.24, hDeg: 0.14 },
  asi662_red: { label: "4SE · ASI662 + Réd 0,6×", wDeg: 0.40, hDeg: 0.23 },
};

export function parseRaDeg(ra: string): number {
  if (!ra) return 0;
  const m = String(ra).trim().match(/([+-]?\d+\.?\d*)[h°:\s]\s*(\d+)?[m':\s]?\s*(\d+\.?\d*)?[s"]?/);
  if (m) {
    return 15 * (parseFloat(m[1]) + (m[2] ? parseFloat(m[2]) : 0) / 60 + (m[3] ? parseFloat(m[3]) : 0) / 3600);
  }
  const n = parseFloat(ra);
  return isNaN(n) ? 0 : n * 15;
}

export function parseDecDeg(dec: string): number {
  if (!dec) return 0;
  const str = String(dec).trim();
  const m = str.match(/([+-]?\d+\.?\d*)[°:\s]\s*(\d+)?['":\s]?\s*(\d+\.?\d*)?["]?/);
  if (m) {
    const sign = parseFloat(m[1]) < 0 || str.startsWith("-") ? -1 : 1;
    return sign * (Math.abs(parseFloat(m[1])) + (m[2] ? parseFloat(m[2]) : 0) / 60 + (m[3] ? parseFloat(m[3]) : 0) / 3600);
  }
  const n = parseFloat(str);
  return isNaN(n) ? 0 : n;
}

interface HybridSkyCanvasProps {
  focusTarget: CelestialObject | null;
  frameRequestCounter: number;
  solvedCenter?: { raDeg: number; decDeg: number; seq: number } | null;
  onSelectObject: (obj: CelestialObject) => void;
  /** Retour à la carte Stellarium (carte par défaut). */
  onShowStellarium?: () => void;
}

export function HybridSkyCanvas({
  focusTarget,
  frameRequestCounter,
  solvedCenter,
  onSelectObject,
  onShowStellarium,
}: HybridSkyCanvasProps) {
  const { ra, dec, isConnected } = useStargazerStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const aladinRef = useRef<AladinInstance | null>(null);
  const catalogRef = useRef<AladinCatalog | null>(null);
  const onSelectRef = useRef(onSelectObject);
  onSelectRef.current = onSelectObject;

  const [ready, setReady] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [survey, setSurvey] = useState<SurveyId>("P/DSS2/color");
  const [showGrid, setShowGrid] = useState(false);
  const [showCatalog, setShowCatalog] = useState(true);
  const [showFov, setShowFov] = useState(true);
  const [fovPreset, setFovPreset] = useState<FovPresetId>("canon600d");
  const [currentFov, setCurrentFov] = useState(3.2);
  const [containerSize, setContainerSize] = useState({ w: 1280, h: 800 });

  // Measure container for exact FOV rectangle rendering
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerSize({
          w: entry.contentRect.width,
          h: entry.contentRect.height,
        });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Load Aladin Lite v3 WebGL2 once
  useEffect(() => {
    let cancelled = false;

    const bootAladin = async () => {
      try {
        if (!document.getElementById("aladin-css")) {
          const link = document.createElement("link");
          link.id = "aladin-css";
          link.rel = "stylesheet";
          link.href = "/aladin.css";
          document.head.appendChild(link);
        }

        if (typeof window.A === "undefined") {
          await new Promise<void>((resolve, reject) => {
            const existing = document.getElementById("aladin-script") as HTMLScriptElement | null;
            if (existing) {
              existing.addEventListener("load", () => resolve(), { once: true });
              existing.addEventListener("error", () => reject(new Error("Échec chargement /aladin.js")), { once: true });
              // If already loaded before listener attached
              if (typeof window.A !== "undefined") resolve();
              return;
            }
            const script = document.createElement("script");
            script.id = "aladin-script";
            script.src = "/aladin.js";
            script.async = true;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error("Échec chargement /aladin.js"));
            document.head.appendChild(script);
          });
        }

        if (cancelled || !containerRef.current || typeof window.A === "undefined") return;

        if (window.A.init) {
          await window.A.init;
        }
        if (cancelled || !containerRef.current) return;

        containerRef.current.innerHTML = "";

        // Start on Orion Nebula (M42) when offline or at 0/0 for an immediate vivid view
        const mountRaDeg = parseRaDeg(ra);
        const mountDecDeg = parseDecDeg(dec);
        const hasValidMount = isConnected && (Math.abs(mountRaDeg) > 0.01 || Math.abs(mountDecDeg) > 0.01);
        const startTarget = hasValidMount ? `${mountRaDeg} ${mountDecDeg}` : "83.8221 -5.3911";

        const instance = window.A.aladin(containerRef.current, {
          survey: "P/DSS2/color",
          fov: 3.2,
          target: startTarget,
          cooFrame: "J2000",
          projection: "SIN",
          showReticle: false,
          showLayersControl: false,
          showGotoControl: false,
          showFullscreenControl: false,
          showFrame: false,
          showZoomControl: false,
          showCooGridControl: false,
          showSimbadPointerControl: false,
          showProjectionControl: false,
          showContextMenu: false,
          showShareControl: false,
          showStatusBar: false,
          showCooLocation: false,
          showFov: false,
          backgroundColor: "rgb(5, 7, 14)",
        });

        aladinRef.current = instance;

        // Add interactive Messier/NGC/Caldwell catalog
        const cat = window.A.catalog({
          name: "Stargazer Catalog",
          sourceSize: 12,
          color: "#00FFD1",
          shape: "circle",
          displayLabel: true,
          labelColumn: "id",
          labelColor: "#CBD5E1",
          labelFont: "11px 'JetBrains Mono', monospace",
          onClick: (source: { data?: { id?: string } }) => {
            const id = source?.data?.id;
            if (!id) return;
            const found = CELESTIAL_CATALOG.find((o) => o.id === id);
            if (found) onSelectRef.current(found);
          },
        });

        const sources = CELESTIAL_CATALOG.map((obj) =>
          window.A.source(obj.ra_deg, obj.dec_deg, {
            id: obj.id,
            name: obj.name,
            type: obj.type,
            mag: obj.magnitude,
          }),
        );
        cat.addSources(sources);
        instance.addCatalog(cat);
        catalogRef.current = cat;

        if (typeof instance.on === "function") {
          instance.on("zoomChanged", (fovVal: number) => {
            if (typeof fovVal === "number" && isFinite(fovVal)) {
              setCurrentFov(fovVal);
            }
          });
          instance.on("objectClicked", (obj: { data?: { id?: string } } | null) => {
            const id = obj?.data?.id;
            if (!id) return;
            const found = CELESTIAL_CATALOG.find((o) => o.id === id);
            if (found) onSelectRef.current(found);
          });
        }

        setReady(true);
      } catch (err: unknown) {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : "Erreur d'initialisation Aladin WebGL");
        }
      }
    };

    bootAladin();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switch HiPS survey
  const handleSurveyChange = useCallback((next: SurveyId) => {
    setSurvey(next);
    const inst = aladinRef.current;
    if (!inst) return;
    try {
      inst.setImageSurvey(next);
      if (next === "P/Mellinger/color" && currentFov < 20) {
        inst.setFov(55);
        setCurrentFov(55);
      } else if (next !== "P/Mellinger/color" && currentFov > 25) {
        inst.setFov(3.5);
        setCurrentFov(3.5);
      }
    } catch {
      // Ignore transient Aladin state error
    }
  }, [currentFov]);

  // Toggle grid
  useEffect(() => {
    const inst = aladinRef.current;
    if (!inst || !ready) return;
    try {
      if (typeof inst.showCooGrid === "function" && typeof inst.hideCooGrid === "function") {
        if (showGrid) inst.showCooGrid();
        else inst.hideCooGrid();
      } else if (typeof inst.setCooGrid === "function") {
        inst.setCooGrid(showGrid);
      }
    } catch {
      // Ignore
    }
  }, [showGrid, ready]);

  // Toggle catalog visibility
  useEffect(() => {
    const cat = catalogRef.current;
    if (!cat || !ready) return;
    try {
      if (showCatalog) cat.show();
      else cat.hide();
    } catch {
      // Ignore
    }
  }, [showCatalog, ready]);

  // Focus selected target
  useEffect(() => {
    const inst = aladinRef.current;
    if (!inst || !ready || !focusTarget) return;
    try {
      inst.gotoRaDec(focusTarget.ra_deg, focusTarget.dec_deg);
      const sizeMatch = focusTarget.size_arcmin.match(/([\d.]+)/);
      const sizeArcmin = sizeMatch ? parseFloat(sizeMatch[1]) : 15;
      const idealFov = Math.min(8, Math.max(0.8, (sizeArcmin / 60) * 3.2));
      inst.setFov(idealFov);
      setCurrentFov(idealFov);
    } catch {
      // Ignore
    }
  }, [focusTarget, ready]);

  // Pan to Vespera solved sky center
  useEffect(() => {
    const inst = aladinRef.current;
    if (!inst || !ready || !solvedCenter) return;
    try {
      inst.gotoRaDec(solvedCenter.raDeg, solvedCenter.decDeg);
      const preset = FOV_PRESETS[fovPreset];
      const frameFov = Math.max(preset.wDeg * 2.4, 1.4);
      inst.setFov(frameFov);
      setCurrentFov(frameFov);
      setShowFov(true);
    } catch {
      // Ignore
    }
  }, [solvedCenter, fovPreset, ready]);

  // Explicit FOV framing request from TargetInspector
  useEffect(() => {
    if (frameRequestCounter === 0 || !focusTarget) return;
    setShowFov(true);
    const inst = aladinRef.current;
    if (!inst || !ready) return;
    try {
      const preset = FOV_PRESETS[fovPreset];
      const frameFov = Math.max(preset.wDeg * 2.4, 0.7);
      inst.gotoRaDec(focusTarget.ra_deg, focusTarget.dec_deg);
      inst.setFov(frameFov);
      setCurrentFov(frameFov);
    } catch {
      // Ignore
    }
  }, [frameRequestCounter, focusTarget, fovPreset, ready]);

  const handleZoom = (factor: number) => {
    const inst = aladinRef.current;
    if (!inst) return;
    const next = Math.min(160, Math.max(0.08, currentFov * factor));
    inst.setFov(next);
    setCurrentFov(next);
  };

  const handleCenterMount = () => {
    const inst = aladinRef.current;
    if (!inst) return;
    const mountRaDeg = parseRaDeg(ra);
    const mountDecDeg = parseDecDeg(dec);
    if (isConnected && (Math.abs(mountRaDeg) > 0.01 || Math.abs(mountDecDeg) > 0.01)) {
      inst.gotoRaDec(mountRaDeg, mountDecDeg);
    } else {
      // Default showcase target: M42 Orion Nebula
      inst.gotoRaDec(83.8221, -5.3911);
      inst.setFov(3.2);
      setCurrentFov(3.2);
    }
  };

  // Compute exact FOV sensor rectangle size in pixels
  const preset = FOV_PRESETS[fovPreset];
  const pxPerDeg = containerSize.w / Math.max(currentFov, 0.01);
  const fovRectW = preset.wDeg * pxPerDeg;
  const fovRectH = preset.hDeg * pxPerDeg;
  const fovRectVisible =
    showFov &&
    ready &&
    fovRectW >= 18 &&
    fovRectW <= containerSize.w * 0.92 &&
    fovRectH <= containerSize.h * 0.92;

  return (
    <div className="relative w-full h-full bg-[#05070E] overflow-hidden select-none">
      {/* Hide any residual Aladin native chrome so our UI stays pure */}
      <style>{`
        .aladin-location, .aladin-fov, .aladin-status-bar, .aladin-logo, .aladin-box {
          display: none !important;
        }
      `}</style>

      {/* Full-bleed WebGL2 Aladin Canvas */}
      <div ref={containerRef} className="w-full h-full" />

      {/* Subtle loading veil while WebGL2 initializes */}
      {!ready && !errorMsg && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#05070E] z-10 pointer-events-none">
          <Loader2 size={24} className="animate-spin text-[--astro-teal]" />
          <span className="text-xs text-slate-400 tracking-wide">
            Initialisation de la carte du ciel WebGL2…
          </span>
        </div>
      )}

      {errorMsg && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#05070E] z-10">
          <span className="text-sm font-medium text-slate-200">Carte du ciel indisponible</span>
          <span className="text-xs text-slate-400">{errorMsg}</span>
        </div>
      )}

      {/* Center Reticle + Exact Sensor FOV Framing Overlay */}
      {ready && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-[5]">
          {/* Subtle central crosshair */}
          <div className="relative flex items-center justify-center">
            <div className="w-5 h-px bg-[--astro-teal]/55" />
            <div className="h-5 w-px bg-[--astro-teal]/55 absolute" />
            <div className="w-2 h-2 rounded-full border border-[--astro-teal]/70 absolute" />
          </div>

          {/* Real sensor FOV frame */}
          {fovRectVisible && (
            <div
              className="absolute rounded-sm transition-all duration-150"
              style={{
                width: `${fovRectW}px`,
                height: `${fovRectH}px`,
                border: "1px solid rgba(255, 179, 71, 0.78)",
                boxShadow: "0 0 0 1px rgba(0,0,0,0.45), inset 0 0 24px rgba(255, 179, 71, 0.05)",
              }}
            >
              <span
                className="absolute -top-5 left-0 px-1.5 py-0.5 rounded text-hud-2xs hud-numeric whitespace-nowrap"
                style={{
                  background: "rgba(5, 7, 14, 0.82)",
                  color: "var(--astro-gold)",
                  border: "1px solid rgba(255, 179, 71, 0.3)",
                }}
              >
                {preset.label} · {(preset.wDeg * 60).toFixed(0)}&prime;×{(preset.hDeg * 60).toFixed(0)}&prime;
              </span>
            </div>
          )}
        </div>
      )}

      {/* Floating Map Controls (Top-Center below header, never covered by side drawers) */}
      <div className="absolute top-[70px] left-1/2 -translate-x-1/2 z-20 flex items-center justify-center gap-1.5 flex-wrap max-w-[calc(100vw-24px)] pointer-events-auto">
        {onShowStellarium && (
          <button
            type="button"
            onClick={onShowStellarium}
            title="Revenir à la carte Stellarium"
            className="hud-glass flex items-center gap-1.5 px-2.5 min-h-[calc(var(--size-touch)+8px)] rounded-xl text-hud-xs text-[--astro-teal] cursor-pointer"
          >
            ← Stellarium
          </button>
        )}
        {/* Survey selector */}
        <div
          className="flex items-center gap-1 p-1 rounded-xl"
          style={{
            background: "rgba(9, 13, 24, 0.78)",
            backdropFilter: "blur(20px)",
            border: "1px solid rgba(255, 255, 255, 0.10)",
          }}
        >
          <Layers size={13} className="text-slate-400 ml-1.5 mr-0.5 shrink-0" aria-hidden />
          {SURVEYS.map((s) => {
            const active = survey === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => handleSurveyChange(s.id)}
                className="px-2 py-1 rounded-lg text-hud-2xs font-medium transition-colors cursor-pointer whitespace-nowrap"
                style={{
                  background: active ? "rgba(0, 255, 209, 0.16)" : "transparent",
                  color: active ? "var(--astro-teal)" : "#94A3B8",
                }}
              >
                {s.label}
              </button>
            );
          })}
        </div>

        {/* Layer toggles + Zoom + FOV preset */}
        <div
          className="flex items-center gap-1 p-1 rounded-xl"
          style={{
            background: "rgba(9, 13, 24, 0.78)",
            backdropFilter: "blur(20px)",
            border: "1px solid rgba(255, 255, 255, 0.10)",
          }}
        >
          <button
            type="button"
            onClick={() => setShowGrid((v) => !v)}
            title="Grille équatoriale"
            aria-pressed={showGrid}
            className="p-1.5 rounded-lg transition-colors cursor-pointer"
            style={{
              background: showGrid ? "rgba(0, 255, 209, 0.16)" : "transparent",
              color: showGrid ? "var(--astro-teal)" : "#94A3B8",
            }}
          >
            <Grid3x3 size={14} />
          </button>
          <button
            type="button"
            onClick={() => setShowCatalog((v) => !v)}
            title="Catalogue Messier / NGC"
            aria-pressed={showCatalog}
            className="p-1.5 rounded-lg transition-colors cursor-pointer"
            style={{
              background: showCatalog ? "rgba(0, 255, 209, 0.16)" : "transparent",
              color: showCatalog ? "var(--astro-teal)" : "#94A3B8",
            }}
          >
            <Sparkles size={14} />
          </button>
          <button
            type="button"
            onClick={() => setShowFov((v) => !v)}
            title="Cadre capteur FOV"
            aria-pressed={showFov}
            className="p-1.5 rounded-lg transition-colors cursor-pointer"
            style={{
              background: showFov ? "rgba(255, 179, 71, 0.16)" : "transparent",
              color: showFov ? "var(--astro-gold)" : "#94A3B8",
            }}
          >
            <Frame size={14} />
          </button>

          <div className="w-px h-4 bg-white/10 mx-0.5" />

          <button
            type="button"
            onClick={() => handleZoom(0.65)}
            title="Zoomer"
            aria-label="Zoomer"
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <ZoomIn size={14} />
          </button>
          <button
            type="button"
            onClick={() => handleZoom(1.5)}
            title="Dézoomer"
            aria-label="Dézoomer"
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <ZoomOut size={14} />
          </button>
          <button
            type="button"
            onClick={handleCenterMount}
            title={isConnected ? "Recentrer sur la monture" : "Recentrer sur M42 (Orion)"}
            aria-label="Recentrer"
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <Crosshair size={14} />
          </button>
        </div>

        {showFov && (
          <select
            value={fovPreset}
            onChange={(e) => setFovPreset(e.target.value as FovPresetId)}
            aria-label="Profil de capteur FOV"
            className="h-8 px-2.5 rounded-xl text-hud-2xs text-amber-200 outline-none cursor-pointer"
            style={{
              background: "rgba(9, 13, 24, 0.82)",
              backdropFilter: "blur(20px)",
              border: "1px solid rgba(255, 179, 71, 0.30)",
            }}
          >
            {(Object.keys(FOV_PRESETS) as FovPresetId[]).map((k) => (
              <option key={k} value={k} className="bg-slate-950 text-slate-100">
                {FOV_PRESETS[k].label}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Subtle FOV readout (Bottom-Right) */}
      <div
        className="hidden sm:flex absolute right-3 bottom-4 z-20 items-center gap-2 px-2.5 py-1 rounded-lg text-hud-2xs text-slate-400 hud-numeric pointer-events-none"
        style={{
          background: "rgba(9, 13, 24, 0.72)",
          backdropFilter: "blur(16px)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
        }}
      >
        <span>Champ {currentFov >= 1 ? `${currentFov.toFixed(1)}°` : `${(currentFov * 60).toFixed(0)}′`}</span>
      </div>
    </div>
  );
}
