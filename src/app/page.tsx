// src/app/page.tsx
"use client";

import { TelescopeControls, TrackingModeSelector } from "@/components/telescope/TelescopeControls";
import { CameraControls } from "@/components/camera/CameraControls";
import { CaptureProgressPanel } from "@/components/camera/CaptureProgressPanel";
import { CapturePreviewModal } from "@/components/camera/CapturePreviewModal";
import { MiseEnStationWizard } from "@/components/telescope/MiseEnStationWizard";
import { SkyMap } from "@/components/viewport/SkyMap";
import { AIAssistant } from "@/components/ai/AIAssistant";
import { MountCalibration } from "@/components/telescope/MountCalibration";
import { AstroPod } from "@/components/ui/AstroPod";
import { ConfigurationMenu } from "@/components/ui/ConfigurationMenu";
import { GlobalLoader } from "@/components/ui/GlobalLoader";
import { useStargazerStore } from "@/store/useStargazerStore";
import { t } from "@/i18n/translations";
import { useEffect, useState } from "react";
import { LiveView } from "@/components/viewport/LiveView";
import { canObservatoryTransition, ObservatoryEvent } from "@/lib/observatoryMachine";
import { useEnvironmentData } from "@/hooks/useEnvironmentData";
import { useMountCoords } from "@/hooks/useMountCoords";
import { useCameraAutoDetect } from "@/hooks/useCameraAutoDetect";
import { notification } from "@/lib/notificationService";
import { NotificationCenter } from "@/components/ui/NotificationCenter";
import { SessionIndicator } from "@/components/ui/SessionIndicator";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { KeyboardShortcutsHint } from "@/components/ui/KeyboardShortcutsHint";
import { useSessionLogger } from "@/hooks/useSessionLogger";
import { Activity, Zap, Orbit, Clock, MapPin, Compass, Thermometer, Power } from "lucide-react";
import { PanelErrorBoundary } from "@/components/ui/PanelErrorBoundary";
import { ReconnectBanner } from "@/components/ui/ReconnectBanner";
import { ConnectionLostOverlay } from "@/components/ui/ConnectionLostOverlay";

// ── Sun altitude (crépuscule) ────────────────────────────────────────────────
function calcSunAlt(latStr: string, lonStr: string): number | null {
    const lat = parseFloat(latStr), lon = parseFloat(lonStr);
    if (isNaN(lat) || isNaN(lon)) return null;
    const rad = Math.PI / 180, d = new Date();
    const D = d.getTime() / 86400000 - 10957;
    const g = (357.529 + 0.98560028 * D) * rad;
    const q = 280.459 + 0.98564736 * D;
    const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
    const e = 23.439 * rad;
    const sinDec = Math.sin(e) * Math.sin(L);
    const dec = Math.asin(sinDec);
    const UT = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
    const GMST = (6.697375 + 0.0657098242 * D + UT) % 24;
    const RA = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)) / rad / 15;
    const LHA = ((GMST + lon / 15 - RA) % 24) * 15 * rad;
    return Math.asin(Math.sin(lat * rad) * sinDec + Math.cos(lat * rad) * Math.cos(dec) * Math.cos(LHA)) / rad;
}

function TwilightBadge({ lat, lon }: { lat: string; lon: string }) {
    const [sunAlt, setSunAlt] = useState<number | null>(null);
    useEffect(() => {
        const tick = () => setSunAlt(calcSunAlt(lat, lon));
        tick();
        const id = setInterval(tick, 60_000);
        return () => clearInterval(id);
    }, [lat, lon]);
    if (sunAlt == null) return null;
    const { label, color } = sunAlt > 0    ? { label: "☀ JOUR",       color: "#ffd700" }
        : sunAlt > -6  ? { label: "🌅 CIVIL",      color: "#ff9944" }
        : sunAlt > -12 ? { label: "🌆 NAUTIQUE",   color: "#cc88ff" }
        : sunAlt > -18 ? { label: "🌌 ASTRO",      color: "#8888ff" }
        : { label: "🔭 NUIT NOIRE", color: "#00ffb4" };
    return (
        <div className="flex items-center gap-2">
            <div className="flex flex-col gap-0">
                <span className="text-[8px] text-[--astro-starlight] opacity-60 hud-font">CRÉPUSCULE</span>
                <span className="text-[11px] hud-font font-bold" style={{ color }}>{label}</span>
            </div>
            <span className="text-[9px] opacity-60" style={{ color }}>{sunAlt.toFixed(1)}°</span>
        </div>
    );
}

export default function Home() {
    const { isConnected: connected, setConnected, isExposing, alt, az, language, liveViewMode, config } = useStargazerStore();
    const [statusText, setStatusText] = useState("");
    const envData = useEnvironmentData();
    useMountCoords();
    useKeyboardShortcuts();
    useCameraAutoDetect();
    useSessionLogger();
    const [mounted, setMounted] = useState(false);
    const [showMiseEnStation, setShowMiseEnStation] = useState(false);
    const [showCapturePanel, setShowCapturePanel] = useState(false);
    const [wasConnected, setWasConnected] = useState(false);

    useEffect(() => {
        setMounted(true);
        setStatusText(t("ESTABLISHING_LINK", language));

        const loadServerConfig = async () => {
            try {
                const res = await fetch('/api/indi/config');
                if (res.ok) {
                    const serverConfig = await res.json();
                    if (serverConfig && Object.keys(serverConfig).length > 0) {
                        useStargazerStore.getState().updateConfig(serverConfig, false);
                    }
                }
            } catch (e: unknown) {
                notification.error("Échec du chargement de la configuration", {
                    source: "Config",
                    description: e instanceof Error ? e.message : "Erreur inconnue",
                });
            }
        };
        loadServerConfig();
    }, [language]);

    useEffect(() => {
        if (!mounted) return;

        const checkConnection = async () => {
            try {
                const res = await fetch(`/api/indi?endpoint=health`, { cache: 'no-store' });
                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data) && data.length > 0) {
                        const health = data[0];
                        const isOk = health.status === "True";
                        setConnected(isOk);
                        if (isOk) {
                            setStatusText(t("SYSTEM_ONLINE", language));
                            setWasConnected(true);
                            const store = useStargazerStore.getState();
                            if (health.indi_connected)  store.updateSubsystem("indi_bridge", { status: "nominal" });
                            if (health.mount_connected) store.updateSubsystem("mount",       { status: "nominal" });
                            if (health.ccd_connected)   store.updateSubsystem("ccd",         { status: "nominal" });
                            if (store.observatoryState === "OFFLINE") store.sendObservatoryEvent("START");
                            const events: { check: boolean; event: ObservatoryEvent }[] = [
                                { check: health.indi_connected,  event: "INDI_READY"        },
                                { check: health.mount_connected, event: "MOUNT_CONNECTED"   },
                                { check: health.ccd_connected,   event: "CCD_CONNECTED"     },
                                { check: !!(health.indi_connected && health.mount_connected && health.ccd_connected), event: "WEATHER_CONNECTED" },
                            ];
                            for (const { check, event } of events) {
                                if (check) {
                                    const s = useStargazerStore.getState();
                                    if (canObservatoryTransition(s.observatoryState, event)) s.sendObservatoryEvent(event);
                                }
                            }
                        } else {
                            setStatusText(t("LINK_OFFLINE", language));
                            setWasConnected(false);
                        }
                    }
                }
            } catch (err: unknown) {
                setConnected(false);
                setStatusText(t("LINK_OFFLINE", language));
                notification.warning(t("LINK_OFFLINE", language), {
                    description: err instanceof Error ? err.message : "Vérifie que le serveur backend est allumé",
                    source: "Système",
                });
                setWasConnected(false);
            }
        };

        checkConnection();
        let interval = setInterval(checkConnection, 2000);
        const slewInterval = setInterval(() => {
            const { isSlewing } = useStargazerStore.getState();
            clearInterval(interval);
            interval = setInterval(checkConnection, isSlewing ? 500 : 2000);
        }, 1000);
        return () => { clearInterval(interval); clearInterval(slewInterval); };
    }, [setConnected, language, mounted]);

    if (!mounted) {
        return <div className="h-screen w-screen bg-[#030509]" />;
    }

    return (
        <div
            style={{ height: '100dvh', width: '100dvw', paddingTop: 'env(safe-area-inset-top)' }}
            className="relative overflow-hidden bg-[#030509]"
        >
            <GlobalLoader />
            <LiveView />

            {/* Vignette */}
            <div className="absolute inset-0 pointer-events-none z-[1] bg-[radial-gradient(circle_at_center,transparent_60%,rgba(3,5,9,0.25)_100%)]" />

            <div className="flex flex-col h-full w-full relative z-20 pointer-events-none">

                {/* ── Navbar ──────────────────────────────────────────────── */}
                <div className="flex w-full h-14 px-6 items-center justify-between border-b border-white/5 bg-[rgba(3,5,9,0.85)] backdrop-blur-xl pointer-events-auto">

                    {/* Logo */}
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-3">
                            <Orbit size={22} color="var(--astro-teal)" className="pulse-glow" />
                            <div className="flex flex-col gap-0">
                                <span className="text-[15px] hud-font text-[--astro-starlight] leading-none">{t("APP_TITLE", language)}</span>
                                <span className="text-[8px] tracking-[0.2em] text-[--astro-teal] opacity-80">{t("APP_SUBTITLE", language)}</span>
                            </div>
                        </div>
                    </div>

                    {/* HUD metrics */}
                    <div className="flex items-center gap-6 opacity-90">

                        {/* Heure */}
                        <div className="flex items-center gap-3">
                            <Clock size={16} color="var(--astro-starlight)" opacity={0.6} />
                            <div className="flex flex-col gap-0">
                                <span className="text-[8px] text-[--astro-starlight] opacity-60">{t("SYS_TIME", language)}</span>
                                <div className="flex items-center gap-2">
                                    <span className="text-[11px] hud-font text-white">{envData.date || "---"}</span>
                                    <span className="text-[11px] hud-font text-[--astro-teal]">{envData.time || t("SYNCING", language)}</span>
                                </div>
                            </div>
                        </div>
                        <div className="h-6 w-px bg-white/10" />

                        {/* GPS */}
                        <div className="flex items-center gap-3">
                            <MapPin size={16} color="var(--astro-starlight)" opacity={0.6} />
                            <div className="flex flex-col gap-0">
                                <span className="text-[8px] text-[--astro-starlight] opacity-60">{t("GPS_COORD", language)}</span>
                                <span className="text-[11px] hud-font text-[--astro-teal]">
                                    {envData.latitude !== null
                                        ? `${envData.latitude.toFixed(4)}°, ${envData.longitude?.toFixed(4)}°`
                                        : t("ACQUIRING", language)}
                                </span>
                            </div>
                        </div>
                        <div className="h-6 w-px bg-white/10" />

                        {/* Alt/Az */}
                        <div className="flex items-center gap-3">
                            <Compass size={16} color="var(--astro-gold)" />
                            <div className="flex flex-col gap-0">
                                <span className="text-[8px] text-[--astro-starlight] opacity-60">{t("POSITION", language)}</span>
                                <span className="text-[11px] hud-font text-[--astro-gold]">
                                    {alt.toFixed(2)}° / {az.toFixed(2)}°
                                </span>
                            </div>
                        </div>
                        <div className="h-6 w-px bg-white/10" />

                        <TwilightBadge lat={config.latitude} lon={config.longitude} />
                        <div className="h-6 w-px bg-white/10" />

                        {/* Status dot */}
                        <div className="flex items-center gap-3">
                            <div
                                className="w-2 h-2 rounded-full"
                                style={{
                                    background: connected ? "var(--astro-teal)" : "var(--astro-error, #f87171)",
                                    boxShadow: connected
                                        ? "0 0 8px var(--astro-teal)"
                                        : "0 0 8px var(--astro-error, #f87171)",
                                }}
                            />
                            <span
                                className="text-[11px] hud-font tracking-[0.1em]"
                                style={{ color: connected ? "var(--astro-teal)" : "var(--astro-error, #f87171)" }}
                            >
                                {connected ? "SYS_STABLE" : "SYS_OFFLINE"}
                            </span>
                        </div>
                        <div className="h-6 w-px bg-white/10" />

                        {/* Météo */}
                        <div className="flex items-center gap-3">
                            <Thermometer size={16} color="var(--astro-starlight)" opacity={0.6} />
                            <div className="flex flex-col gap-0">
                                <span className="text-[8px] text-[--astro-starlight] opacity-60">{t("EXT_WEATHER", language)}</span>
                                <span className="text-[11px] hud-font text-white">
                                    {envData.weather
                                        ? `${envData.weather.temperature}°C, ${envData.weather.description}`
                                        : t("SCANNING", language)}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Right controls */}
                    <div className="flex items-center gap-8">
                        <div className="flex flex-col items-end gap-2">
                            <div className="flex items-center gap-4">
                                <div className="flex flex-col items-end gap-0">
                                    <span className="text-[10px] font-bold tracking-[0.1em]" style={{ color: connected ? "var(--astro-teal)" : "var(--astro-gold)" }}>
                                        {connected ? t("ACTIVE_LINK", language) : t("LINK_ERROR", language)}
                                    </span>
                                    <span className="text-[8px] opacity-60">{statusText}</span>
                                </div>
                                <div
                                    className="p-1 rounded-full border"
                                    style={{ borderColor: connected ? "var(--astro-teal)" : "var(--astro-gold)" }}
                                >
                                    <Zap size={14} color={connected ? "var(--astro-teal)" : "var(--astro-gold)"} />
                                </div>
                            </div>
                            <SessionIndicator />
                            <NotificationCenter />
                            <ConfigurationMenu />
                        </div>
                    </div>
                </div>

                {/* ── Main content ─────────────────────────────────────────── */}
                <div className="flex flex-1 justify-between items-stretch px-5 pt-3 pb-3 min-h-0">

                    {/* Left column */}
                    <div className="flex flex-col w-[340px] gap-3 h-full pointer-events-auto overflow-y-auto overflow-x-hidden pr-1 hud-scroll">
                        <PanelErrorBoundary name="Telescope">
                            <AstroPod title={t("MOUNT_NAVIGATOR", language)} glowColor="teal">
                                <div className="flex flex-col gap-3">
                                    <TelescopeControls variant="pad" />
                                    <TrackingModeSelector />
                                    <div className="flex justify-between items-center w-full mt-1 text-[10px] text-[--astro-starlight] opacity-80">
                                        <span>{t("ERR", language)} 0.04&quot;</span>
                                        <button
                                            className="text-[9px] text-teal-300 hover:text-teal-100 transition-colors duration-150 cursor-pointer"
                                            onClick={() => setShowMiseEnStation(!showMiseEnStation)}
                                        >
                                            {showMiseEnStation ? "▲ Fermer wizard" : "⊕ Mise en station"}
                                        </button>
                                    </div>
                                </div>
                            </AstroPod>

                            {showMiseEnStation && (
                                <MiseEnStationWizard onClose={() => setShowMiseEnStation(false)} />
                            )}

                            <AstroPod title={t("LIMITS_CONFIG", language)} glowColor="gold">
                                <MountCalibration />
                            </AstroPod>
                        </PanelErrorBoundary>
                    </div>

                    {/* Center: Sky Map */}
                    <div
                        className="flex-1 relative rounded-lg overflow-hidden mx-2"
                        style={{ contain: 'paint', pointerEvents: liveViewMode === "CANON" ? "none" : "auto" }}
                    >
                        <PanelErrorBoundary name="SkyMap">
                            {liveViewMode !== "CANON" && <SkyMap />}
                        </PanelErrorBoundary>
                    </div>

                    {/* Right column */}
                    <div className="flex flex-col w-[340px] gap-3 h-full pointer-events-auto overflow-y-auto overflow-x-hidden pl-1 hud-scroll">
                        <PanelErrorBoundary name="Camera">
                            <AstroPod title={t("IMAGING_SENSOR", language)} glowColor="teal">
                                <div className="flex flex-col gap-3 w-full">
                                    <CameraControls variant="circular" />
                                    <div className="w-full bg-black/30 p-2 rounded-lg border-l-2 border-[--astro-teal]">
                                        <div className="flex justify-between text-[10px] text-[--astro-starlight]">
                                            <span>{t("SENSOR_TEMP", language)} -15°C</span>
                                            <span>{t("COOLER", language)} 85%</span>
                                        </div>
                                    </div>
                                    <button
                                        className={[
                                            "w-full text-[9px] rounded-md py-1 px-2 text-center cursor-pointer border transition-colors duration-150",
                                            showCapturePanel
                                                ? "text-blue-300 bg-blue-400/10 border-blue-700 hover:text-blue-200 hover:border-blue-600"
                                                : "text-white/50 bg-white/[0.03] border-white/10 hover:text-blue-200 hover:border-blue-600",
                                        ].join(" ")}
                                        onClick={() => setShowCapturePanel(!showCapturePanel)}
                                    >
                                        {showCapturePanel ? "▲ Fermer séquence" : "▶ Séquence de capture"}
                                    </button>
                                </div>
                            </AstroPod>

                            {showCapturePanel && (
                                <CaptureProgressPanel onClose={() => setShowCapturePanel(false)} />
                            )}

                            <AstroPod title={t("METEO_ORACLE", language)} glowColor="cobalt">
                                <AIAssistant />
                            </AstroPod>
                        </PanelErrorBoundary>
                    </div>
                </div>
            </div>

            {/* ── Bottom status pill ────────────────────────────────────────── */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 pointer-events-auto">
                <div className="astro-panel flex items-center gap-6 px-6 py-2 rounded-full bg-[rgba(10,20,40,0.85)] border border-white/10">
                    <div className="flex items-center gap-3">
                        <div className={connected ? "pulse-glow" : ""} style={{ color: connected ? "var(--astro-teal)" : "rgba(255,255,255,0.25)" }}>
                            <Power size={14} />
                        </div>
                        <span className="text-[10px]" style={{ color: connected ? "var(--astro-starlight)" : "rgba(255,255,255,0.25)" }}>
                            {connected ? "BRIDGE_UP" : "BRIDGE_DOWN"}
                        </span>
                    </div>
                    <div className="h-[14px] w-px bg-white/10" />
                    <div className="flex items-center gap-3">
                        <Activity size={14} color={isExposing ? "var(--astro-gold)" : "var(--astro-teal)"} />
                        <div className="flex flex-col gap-0">
                            <span className="text-[8px] text-[--astro-starlight] opacity-60">{t("SEQUENCE", language)}</span>
                            <span
                                className="text-[11px] hud-font"
                                style={{ color: isExposing ? "var(--astro-gold)" : "white" }}
                            >
                                {isExposing ? t("CAPTURING", language) : t("STANDBY", language)}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
            <KeyboardShortcutsHint />
            <ReconnectBanner />
            <ConnectionLostOverlay />
            <CapturePreviewModal />
        </div>
    );
}
