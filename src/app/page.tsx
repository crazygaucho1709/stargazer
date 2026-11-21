// src/app/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Orbit,
  Globe,
  Video,
  Compass,
  Sparkles,
  Telescope,
  Camera,
  CloudMoon,
  Radio,
  X,
  Crosshair,
  ChevronUp,
  Play,
  Sun,
  Sunrise,
  Sunset,
  MoonStar,
  Square,
} from "lucide-react";
import { TelescopeControls, TrackingModeSelector } from "@/components/telescope/TelescopeControls";
import { CameraControls } from "@/components/camera/CameraControls";
import { CaptureProgressPanel } from "@/components/camera/CaptureProgressPanel";
import { CapturePreviewModal } from "@/components/camera/CapturePreviewModal";
import { MiseEnStationWizard } from "@/components/telescope/MiseEnStationWizard";
import { MountCalibration } from "@/components/telescope/MountCalibration";
import { AIAssistant } from "@/components/ai/AIAssistant";
import ObservatoryPanel from "@/components/observatory/ObservatoryPanel";
import { HybridSkyCanvas } from "@/components/viewport/HybridSkyCanvas";
import { StellariumSkyCanvas } from "@/components/viewport/StellariumSkyCanvas";
import { LiveView } from "@/components/viewport/LiveView";
import { TargetInspector } from "@/components/observatory/TargetInspector";
import { TonightDrawer } from "@/components/observatory/TonightDrawer";
import { StationStatusPopover } from "@/components/ui/StationStatusPopover";
import { CommandOmnibox } from "@/components/ui/CommandOmnibox";
import { ConfigurationMenu } from "@/components/ui/ConfigurationMenu";
import { GlobalLoader } from "@/components/ui/GlobalLoader";
import { VisionControls } from "@/components/ui/VisionControls";
import { NotificationCenter } from "@/components/ui/NotificationCenter";
import { SessionIndicator } from "@/components/ui/SessionIndicator";
import { KeyboardShortcutsHint } from "@/components/ui/KeyboardShortcutsHint";
import { PanelErrorBoundary } from "@/components/ui/PanelErrorBoundary";
import { useStargazerStore } from "@/store/useStargazerStore";
import { canObservatoryTransition, ObservatoryEvent } from "@/lib/observatoryMachine";
import { useEnvironmentData } from "@/hooks/useEnvironmentData";
import { useMountCoords } from "@/hooks/useMountCoords";
import { useCameraAutoDetect } from "@/hooks/useCameraAutoDetect";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useSessionLogger } from "@/hooks/useSessionLogger";
import { useStationAutoInit } from "@/hooks/useStationAutoInit";
import { useStationStream } from "@/hooks/useStationStream";
import { useGoTo } from "@/hooks/useGoTo";
import { notification } from "@/lib/notificationService";
import { t } from "@/i18n/translations";
import { CelestialObject } from "@/data/celestialCatalog";

type DockPanel = "tonight" | "mount" | "camera" | "weather" | "observatory" | null;

// ── Sun altitude (crépuscule) ────────────────────────────────────────────────
function calcSunAlt(lat: number, lon: number, date: Date): number {
  const rad = Math.PI / 180;
  const D = date.getTime() / 86400000 - 10957;
  const g = (357.529 + 0.98560028 * D) * rad;
  const q = 280.459 + 0.98564736 * D;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
  const e = 23.439 * rad;
  const sinDec = Math.sin(e) * Math.sin(L);
  const dec = Math.asin(sinDec);
  const UT = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const GMST = (6.697375 + 0.0657098242 * D + UT) % 24;
  const RA = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)) / rad / 15;
  const LHA = ((GMST + lon / 15 - RA) % 24) * 15 * rad;
  return Math.asin(Math.sin(lat * rad) * sinDec + Math.cos(lat * rad) * Math.cos(dec) * Math.cos(LHA)) / rad;
}

function TwilightSummary({ lat, lon, date }: { lat: number; lon: number; date: Date }) {
  const sunAlt = calcSunAlt(lat, lon, date);
  const phase =
    sunAlt > 0    ? { label: "Jour",               color: "#FBBF24", Icon: Sun }
  : sunAlt > -6   ? { label: "Crépuscule civil",   color: "#FB923C", Icon: Sunrise }
  : sunAlt > -12  ? { label: "Crépuscule nautique", color: "#C084FC", Icon: Sunset }
  : sunAlt > -18  ? { label: "Crépuscule astro",   color: "#818CF8", Icon: Sparkles }
  :                 { label: "Nuit astronomique",  color: "var(--astro-teal)", Icon: MoonStar };

  const Icon = phase.Icon;
  return (
    <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.07]">
      <div className="flex items-center gap-2.5">
        <Icon size={16} style={{ color: phase.color }} aria-hidden />
        <div>
          <span className="text-xs font-semibold block" style={{ color: phase.color }}>
            {phase.label}
          </span>
          <span className="text-hud-2xs text-slate-400">Hauteur solaire actuelle</span>
        </div>
      </div>
      <span className="text-xs font-semibold hud-numeric text-slate-200">
        {sunAlt.toFixed(1)}°
      </span>
    </div>
  );
}

const DOCK_ITEMS: { id: Exclude<DockPanel, null>; label: string; icon: React.ElementType }[] = [
  { id: "tonight",     label: "Ce soir",     icon: Sparkles },
  { id: "mount",       label: "Monture",     icon: Telescope },
  { id: "camera",      label: "Caméra",      icon: Camera },
  { id: "weather",     label: "Météo",       icon: CloudMoon },
  { id: "observatory", label: "Observatoire", icon: Radio },
];

export default function Home() {
  const {
    setConnected,
    ra,
    dec,
    language,
    liveViewMode,
    setLiveViewMode,
    config,
    isSlewing,
  } = useStargazerStore();
  const { abort } = useGoTo();

  const envData = useEnvironmentData();
  const { stationStatus, identifying, identifySky } = useStationAutoInit();
  const stream = useStationStream();
  const mountLinkDown = !!(stream.station?.serial_error || stream.station?.link_suspect);
  // Tant qu'aucune synchronisation sur le ciel n'a eu lieu depuis le démarrage
  // du backend, le pilote convertit ses angles moteurs avec un modèle vide : la
  // position céleste qu'il annonce peut être n'importe où, jusque sous l'horizon.
  const mountAligned = !!stream.station?.sky_synced;
  const coordsStream = useMountCoords();
  useKeyboardShortcuts();
  useCameraAutoDetect();
  useSessionLogger();

  const [mounted, setMounted] = useState(false);
  const [activePanel, setActivePanel] = useState<DockPanel>(null);
  const [selectedTarget, setSelectedTarget] = useState<CelestialObject | null>(null);
  const [solvedCenter, setSolvedCenter] = useState<{ raDeg: number; decDeg: number; seq: number } | null>(null);
  const [frameRequestCounter, setFrameRequestCounter] = useState(0);
  const [timeOffsetHours, setTimeOffsetHours] = useState(0);
  // Carte par défaut : Stellarium (local, hors ligne). "dss" = vue photo Aladin.
  const [skyEngine, setSkyEngine] = useState<"stellarium" | "dss">("stellarium");
  const [showMiseEnStation, setShowMiseEnStation] = useState(false);
  const [showCapturePanel, setShowCapturePanel] = useState(false);
  const wasConnectedRef = useRef(false);

  const observerLat = useMemo(() => {
    if (envData.latitude !== null) return envData.latitude;
    const parsed = parseFloat(config.latitude);
    return isNaN(parsed) ? -17.6797 : parsed;
  }, [envData.latitude, config.latitude]);

  const observerLon = useMemo(() => {
    if (envData.longitude !== null) return envData.longitude;
    const parsed = parseFloat(config.longitude);
    return isNaN(parsed) ? -149.4068 : parsed;
  }, [envData.longitude, config.longitude]);

  const planDate = useMemo(
    () => new Date(Date.now() + timeOffsetHours * 3600_000),
    [timeOffsetHours],
  );

  // Load server config non-blockingly
  useEffect(() => {
    setMounted(true);
    const loadServerConfig = async () => {
      try {
        const res = await fetch("/api/indi/config");
        if (res.ok) {
          const serverConfig = await res.json();
          if (serverConfig && Object.keys(serverConfig).length > 0) {
            useStargazerStore.getState().updateConfig(serverConfig, false);
          }
        }
      } catch {
        // Hors ligne au démarrage : on garde la config locale persistée
      }
    };
    loadServerConfig();
  }, [language]);

  // État de liaison, poussé par le backend (flux partagé useStationStream).
  // Remplace l'interrogation de /health toutes les 2 s (0,5 s en pointage).
  useEffect(() => {
    if (!mounted || stream.loading) return;

    if (!stream.online) {
      setConnected(false);
      if (wasConnectedRef.current) {
        wasConnectedRef.current = false;
        notification.warning(t("LINK_OFFLINE", language), {
          description: "Liaison perdue — navigation libre maintenue",
          source: "Système",
        });
      }
      return;
    }

    setConnected(true);
    wasConnectedRef.current = true;
    const store = useStargazerStore.getState();
    if (stream.indiConnected)  store.updateSubsystem("indi_bridge", { status: "nominal" });
    if (stream.mountConnected) store.updateSubsystem("mount",       { status: "nominal" });
    if (stream.ccdConnected)   store.updateSubsystem("ccd",         { status: "nominal" });
    if (store.observatoryState === "OFFLINE") store.sendObservatoryEvent("START");
    const events: { check: boolean; event: ObservatoryEvent }[] = [
      { check: stream.indiConnected,  event: "INDI_READY" },
      { check: stream.mountConnected, event: "MOUNT_CONNECTED" },
      { check: stream.ccdConnected,   event: "CCD_CONNECTED" },
      { check: stream.indiConnected && stream.mountConnected && stream.ccdConnected, event: "WEATHER_CONNECTED" },
    ];
    for (const { check, event } of events) {
      if (check) {
        const st = useStargazerStore.getState();
        if (canObservatoryTransition(st.observatoryState, event)) st.sendObservatoryEvent(event);
      }
    }
  }, [
    mounted, language, setConnected,
    stream.loading, stream.online, stream.indiConnected, stream.mountConnected, stream.ccdConnected,
  ]);

  const handleSelectObject = (obj: CelestialObject) => {
    setSelectedTarget(obj);
    if (liveViewMode === "CANON") {
      setLiveViewMode("NASA");
    }
  };

  const handleFrameFov = (obj: CelestialObject) => {
    setSelectedTarget(obj);
    if (liveViewMode === "CANON") setLiveViewMode("NASA");
    setFrameRequestCounter((c) => c + 1);
  };

  const handleIdentifySky = async () => {
    const res = await identifySky(4.0);
    if (res.success && res.raDeg !== undefined && res.decDeg !== undefined) {
      if (liveViewMode === "CANON") setLiveViewMode("NASA");
      setSolvedCenter((prev) => ({
        raDeg: res.raDeg!,
        decDeg: res.decDeg!,
        seq: (prev?.seq ?? 0) + 1,
      }));
      if (res.matchedObject) {
        setSelectedTarget(res.matchedObject);
      }
    }
  };

  const togglePanel = (panel: Exclude<DockPanel, null>) => {
    setActivePanel((cur) => (cur === panel ? null : panel));
  };

  if (!mounted) {
    return <div className="h-full w-full bg-[#05070E]" />;
  }

  return (
    <div
      style={{ height: "100%", width: "100%", paddingTop: "env(safe-area-inset-top)" }}
      className="relative overflow-hidden bg-[#05070E]"
    >
      <GlobalLoader />

      {/* ── FULL-BLEED CANVAS LAYER (100% viewport) ───────────────────────── */}
      <div className="absolute inset-0 z-0">
        {/* Stellarium reste monté en permanence : son moteur WASM ne se
            détruit pas proprement, on le masque au lieu de le démonter. */}
        <PanelErrorBoundary name="StellariumSkyCanvas">
          <StellariumSkyCanvas
            lat={observerLat}
            lon={observerLon}
            date={planDate}
            realtime={timeOffsetHours === 0}
            hidden={liveViewMode === "CANON" || skyEngine !== "stellarium"}
            mountAligned={mountAligned}
            focusTarget={selectedTarget}
            frameRequestCounter={frameRequestCounter}
            solvedCenter={solvedCenter}
            onSelectObject={handleSelectObject}
            onShowPhotoView={() => setSkyEngine("dss")}
          />
        </PanelErrorBoundary>
        {liveViewMode === "CANON" ? (
          <LiveView />
        ) : skyEngine === "dss" ? (
          <PanelErrorBoundary name="HybridSkyCanvas">
            <HybridSkyCanvas
              focusTarget={selectedTarget}
              frameRequestCounter={frameRequestCounter}
              solvedCenter={solvedCenter}
              onSelectObject={handleSelectObject}
              onShowStellarium={() => setSkyEngine("stellarium")}
            />
          </PanelErrorBoundary>
        ) : null}
      </div>

      {/* ── FLOATING TOP BAR (Single unified 48px glass bar) ─────────────── */}
      <header
        className="hud-glass fixed top-3 inset-x-3 z-[var(--z-hud)] h-12 px-2 sm:px-3 rounded-2xl flex items-center justify-between gap-1.5 sm:gap-2.5"
      >
        {/* Left: Brand + View mode switch */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="hidden sm:flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{
                background: "color-mix(in srgb, var(--astro-teal) 12%, transparent)",
                border: "1px solid color-mix(in srgb, var(--astro-teal) 30%, transparent)",
              }}
            >
              <Orbit size={16} color="var(--astro-teal)" aria-hidden />
            </div>
            <span className="hidden sm:inline text-sm font-semibold tracking-tight text-white">
              Stargazer
            </span>
          </div>

          <div
            className="flex items-center gap-0.5 p-0.5 rounded-xl"
            style={{
              background: "rgba(255, 255, 255, 0.04)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
            }}
          >
            <button
              type="button"
              onClick={() => setLiveViewMode("NASA")}
              className="inline-flex items-center gap-1.5 px-2.5 h-7 rounded-lg text-xs font-medium transition-colors cursor-pointer"
              style={{
                background: liveViewMode !== "CANON" ? "color-mix(in srgb, var(--astro-teal) 16%, transparent)" : "transparent",
                color: liveViewMode !== "CANON" ? "var(--astro-teal)" : "#94A3B8",
              }}
            >
              <Globe size={13} aria-hidden />
              <span className="hidden md:inline">Ciel</span>
            </button>
            <button
              type="button"
              onClick={() => setLiveViewMode("CANON")}
              className="inline-flex items-center gap-1.5 px-2.5 h-7 rounded-lg text-xs font-medium transition-colors cursor-pointer"
              style={{
                background: liveViewMode === "CANON" ? "rgba(255, 179, 71, 0.16)" : "transparent",
                color: liveViewMode === "CANON" ? "var(--astro-gold)" : "#94A3B8",
              }}
            >
              <Video size={13} aria-hidden />
              <span className="hidden md:inline">Live</span>
            </button>
          </div>
        </div>

        {/* Center: Cmd+K Search Omnibox */}
        {/* Pendant un pointage, sous 640px, la loupe cède sa place au bouton STOP. */}
        <div className={isSlewing ? "max-sm:hidden sm:contents" : "contents"}>
          <CommandOmnibox
            lat={observerLat}
            lon={observerLon}
            planDate={planDate}
            onSelectObject={handleSelectObject}
          />
        </div>

        {/* Right: Coordinates + Unified Station Popover + Comfort + Settings */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {isSlewing && (
            <button
              type="button"
              onClick={abort}
              aria-label="Arrêter le pointage"
              title="Arrêter le pointage (Échap)"
              className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-xl text-xs font-bold bg-(--color-danger) text-black hover:brightness-110 transition-[filter] cursor-pointer shrink-0"
            >
              <Square size={11} fill="currentColor" aria-hidden />
              <span>STOP</span>
            </button>
          )}

          {/* Position de la monture, telle que le backend la pousse. La puce
              affichait 45,2° / 180,5° : des valeurs par défaut que rien ne
              mettait jamais à jour. Elle n'apparaît plus que lorsque le flux
              de coordonnées est réellement ouvert. */}
          {coordsStream.isConnected && (
            <div
              className={`hidden xl:flex items-center gap-1.5 px-2.5 h-8 rounded-xl text-hud-xs hud-numeric ${mountAligned ? "text-amber-200/90" : "text-slate-500"}`}
              style={{
                background: "rgba(255, 255, 255, 0.04)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
              }}
              title={mountAligned
                ? "Position de la monture (ascension droite / déclinaison)"
                : "Monture non alignée : cette position n'est pas fiable. Pointez des étoiles puis cliquez sur Identifier."}
            >
              <Compass size={13} className="text-[--astro-gold]" aria-hidden />
              <span>{ra}</span>
              <span className="text-slate-500">/</span>
              <span>{dec}</span>
              {!mountAligned && (
                <span className="ml-1 px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-300 font-sans font-medium">
                  non alignée
                </span>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={handleIdentifySky}
            disabled={identifying}
            title="Identifier le ciel et synchroniser la monture (capture + IA + solve-field)"
            className={`${isSlewing ? "max-sm:hidden" : ""} inline-flex items-center gap-1.5 px-2.5 h-8 rounded-xl text-xs font-semibold transition-colors cursor-pointer shrink-0`}
            style={{
              background: identifying ? "color-mix(in srgb, var(--astro-teal) 22%, transparent)" : "color-mix(in srgb, var(--astro-teal) 12%, transparent)",
              border: "1px solid color-mix(in srgb, var(--astro-teal) 36%, transparent)",
              color: "var(--astro-teal)",
              cursor: identifying ? "wait" : "pointer",
            }}
          >
            <Crosshair size={13} className={identifying ? "animate-spin" : ""} aria-hidden />
            <span className="hidden lg:inline">{identifying ? "Analyse…" : "Identifier"}</span>
          </button>

          <StationStatusPopover stationStatus={stationStatus} />
          <VisionControls />
          <NotificationCenter />
          <ConfigurationMenu />
        </div>
      </header>

      {/* Panne de liaison monture : visible partout, quel que soit le panneau ouvert */}
      {mountLinkDown && (
        <div
          role="alert"
          className="fixed top-[66px] left-1/2 -translate-x-1/2 z-[var(--z-banner)] max-w-[calc(100vw-24px)] flex items-center gap-2 px-3 py-2 rounded-xl text-hud-xs font-medium text-red-100 bg-red-950/90 border border-red-400/50"
        >
          <Radio size={14} className="shrink-0 text-red-300" aria-hidden />
          <span>
            {stream.station?.serial_error
              ? "Liaison série de la monture en panne : les ordres ne lui parviennent plus. GoTo et jog refusés."
              : "Liaison monture présumée morte : un mouvement est resté sans effet. GoTo et jog refusés."}
          </span>
        </div>
      )}

      {/* ── FLOATING LEFT CONTEXTUAL DRAWER (1 panel at a time) ──────────── */}
      <AnimatePresence>
        {activePanel && (
          <motion.aside
            key={activePanel}
            initial={{ opacity: 0, x: -24, scale: 0.98 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -24, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className={[
              "hud-glass fixed left-3 top-[72px] bottom-[76px] z-[var(--z-hud)] rounded-2xl flex flex-col overflow-hidden text-slate-100",
              activePanel === "observatory"
                ? "w-[min(560px,calc(100vw-24px))]"
                : "w-[min(360px,calc(100vw-24px))]",
            ].join(" ")}
          >
            {/* Panel header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.08] shrink-0">
              <div className="flex items-center gap-2">
                {(() => {
                  const meta = DOCK_ITEMS.find((d) => d.id === activePanel);
                  const Icon = meta?.icon ?? Sparkles;
                  return (
                    <>
                      <Icon size={15} className="text-[--astro-teal]" aria-hidden />
                      <h2 className="text-sm font-semibold text-white">
                        {meta?.label}
                      </h2>
                    </>
                  );
                })()}
              </div>
              <button
                type="button"
                onClick={() => setActivePanel(null)}
                aria-label="Fermer le panneau"
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>

            {/* Panel body */}
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden hud-scroll p-3.5">
              {activePanel === "tonight" && (
                <TonightDrawer
                  lat={observerLat}
                  lon={observerLon}
                  timeOffsetHours={timeOffsetHours}
                  onTimeOffsetChange={setTimeOffsetHours}
                  selectedId={selectedTarget?.id}
                  onSelectObject={handleSelectObject}
                />
              )}

              {activePanel === "mount" && (
                <PanelErrorBoundary name="Telescope">
                  <div className="flex flex-col gap-4">
                    <TelescopeControls variant="pad" />
                    <TrackingModeSelector />
                    <div className="flex items-center justify-end pt-2 border-t border-white/[0.08]">
                      <button
                        type="button"
                        onClick={() => setShowMiseEnStation((v) => !v)}
                        className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-medium border border-[--astro-teal]/35 bg-[--astro-teal]/10 text-[--astro-teal] hover:bg-[--astro-teal]/20 transition-colors cursor-pointer"
                      >
                        {showMiseEnStation ? (
                          <><ChevronUp size={13} aria-hidden /> Fermer wizard</>
                        ) : (
                          <><Crosshair size={13} aria-hidden /> Mise en station</>
                        )}
                      </button>
                    </div>
                    {showMiseEnStation && (
                      <MiseEnStationWizard onClose={() => setShowMiseEnStation(false)} />
                    )}
                    <div className="pt-3 border-t border-white/[0.08]">
                      <MountCalibration />
                    </div>
                  </div>
                </PanelErrorBoundary>
              )}

              {activePanel === "camera" && (
                <PanelErrorBoundary name="Camera">
                  <div className="flex flex-col gap-3.5">
                    <CameraControls variant="circular" />
                    <button
                      type="button"
                      onClick={() => setShowCapturePanel((v) => !v)}
                      className="w-full h-9 inline-flex items-center justify-center gap-2 text-xs font-medium rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.09] text-slate-200 transition-colors cursor-pointer"
                    >
                      {showCapturePanel ? (
                        <><ChevronUp size={14} aria-hidden /> Masquer la séquence</>
                      ) : (
                        <><Play size={14} aria-hidden /> Séquence de capture</>
                      )}
                    </button>
                    {showCapturePanel && (
                      <CaptureProgressPanel onClose={() => setShowCapturePanel(false)} />
                    )}
                  </div>
                </PanelErrorBoundary>
              )}

              {activePanel === "weather" && (
                <PanelErrorBoundary name="Weather">
                  <div className="flex flex-col gap-3.5">
                    <TwilightSummary lat={observerLat} lon={observerLon} date={planDate} />
                    <AIAssistant />
                  </div>
                </PanelErrorBoundary>
              )}

              {activePanel === "observatory" && (
                <PanelErrorBoundary name="Observatory">
                  <ObservatoryPanel />
                </PanelErrorBoundary>
              )}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* ── FLOATING RIGHT TARGET INSPECTOR CARD ─────────────────────────── */}
      <div className="fixed right-3 top-[72px] bottom-[76px] z-[var(--z-hud)] flex items-start pointer-events-none overflow-y-auto hud-scroll">
        <AnimatePresence>
          {selectedTarget && (
            <TargetInspector
              key={selectedTarget.id}
              target={selectedTarget}
              lat={observerLat}
              lon={observerLon}
              planDate={planDate}
              onClose={() => setSelectedTarget(null)}
              onFrameFov={handleFrameFov}
            />
          )}
        </AnimatePresence>
      </div>

      {/* ── FLOATING BOTTOM SPATIAL DOCK ─────────────────────────────────── */}
      <nav
        aria-label="Barre d'outils de l'observatoire"
        className="hud-glass fixed bottom-3 left-1/2 -translate-x-1/2 z-[var(--z-hud)] flex items-center gap-1 p-1.5 rounded-2xl max-w-[calc(100vw-24px)]"
      >
        {DOCK_ITEMS.map(({ id, label, icon: Icon }) => {
          const active = activePanel === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => togglePanel(id)}
              aria-pressed={active}
              className="relative inline-flex items-center gap-2 px-3 sm:px-3.5 h-10 rounded-xl text-xs font-medium transition-all duration-150 cursor-pointer whitespace-nowrap"
              style={{
                background: active ? "color-mix(in srgb, var(--astro-teal) 14%, transparent)" : "transparent",
                color: active ? "var(--astro-teal)" : "#CBD5E1",
                border: active ? "1px solid color-mix(in srgb, var(--astro-teal) 35%, transparent)" : "1px solid transparent",
              }}
            >
              <Icon size={16} aria-hidden />
              <span className="hidden sm:inline">{label}</span>
              {active && (
                <span
                  aria-hidden
                  className="absolute bottom-1 left-1/2 -translate-x-1/2 w-4 h-[2px] rounded-full bg-[--astro-teal]"
                />
              )}
            </button>
          );
        })}

        <div className="hidden md:block w-px h-6 bg-white/10 mx-1" />
        <div className="hidden md:block pr-1">
          <SessionIndicator />
        </div>
      </nav>

      <KeyboardShortcutsHint />
      <CapturePreviewModal />
    </div>
  );
}
