// src/components/telescope/MiseEnStationWizard.tsx
"use client";

/**
 * MiseEnStationWizard — 4-étape wizard pour initialiser la NexStar 4SE
 * Étape 0: Validation GPS (nouvelle)
 * Étape 1: Mise à niveau & cap
 * Étape 2: Initialisation NexStar
 * Étape 3: Alignement stellaire
 */

import { useState, useEffect, useRef, useCallback } from "react";
import {
    CheckCircle2, AlertTriangle, Navigation,
    Wifi, WifiOff, Crosshair, Star,
    ChevronRight, RotateCcw, MapPin, Clock, Smartphone
} from "lucide-react";
import { useStargazerStore } from "@/store/useStargazerStore";
import { plateSolve } from "@/services/plateSolve";
import { notification } from "@/lib/notificationService";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SensorData {
    beta: number | null;
    gamma: number | null;
    alpha: number | null;
    lat: number | null;
    lon: number | null;
    alt_gps: number | null;
    compassAccuracy: number | null;
}

// 4 steps now: 0=GPS validation, 1=level/heading, 2=init NexStar, 3=plate solve
type Step = 0 | 1 | 2 | 3;

const STEP_LABELS = [
    "Validation GPS",
    "Mise à niveau & cap",
    "Initialisation NexStar",
    "Alignement stellaire",
];

const NORTH_TOLERANCE = 5;
const LEVEL_TOLERANCE = 3;

// ─── GPS validation helpers ───────────────────────────────────────────────────

const DEFAULT_LAT = -17.6333;
const DEFAULT_LON = -149.6000;
const COORD_EPSILON = 0.001;

function isDefaultCoords(lat: number, lon: number): boolean {
    return Math.abs(lat - DEFAULT_LAT) < COORD_EPSILON && Math.abs(lon - DEFAULT_LON) < COORD_EPSILON;
}

function isValidLatLon(lat: number, lon: number): boolean {
    return isFinite(lat) && isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

function formatCoord(lat: number, lon: number): string {
    const latDir = lat >= 0 ? "N" : "S";
    const lonDir = lon >= 0 ? "E" : "O";
    return `${Math.abs(lat).toFixed(4)}°${latDir}, ${Math.abs(lon).toFixed(4)}°${lonDir}`;
}

// ─── Bubble level ─────────────────────────────────────────────────────────────

function LevelBubble({ beta, gamma }: { beta: number | null; gamma: number | null }) {
    const size = 120;
    const maxOffset = 32;

    let bx = 0, by = 0;
    if (beta !== null && gamma !== null) {
        bx = Math.max(-maxOffset, Math.min(maxOffset, (gamma / 15) * maxOffset));
        by = Math.max(-maxOffset, Math.min(maxOffset, (beta / 15) * maxOffset));
    }

    const isLevel =
        beta !== null && gamma !== null &&
        Math.abs(beta) < LEVEL_TOLERANCE && Math.abs(gamma) < LEVEL_TOLERANCE;

    const color = isLevel ? "#48BB78" : (Math.abs(bx) > 20 || Math.abs(by) > 20 ? "#FC8181" : "#F6AD55");
    const tolerance = LEVEL_TOLERANCE * 2 * maxOffset / 15;

    return (
        <div className="relative" style={{ width: size, height: size }}>
            <div className="absolute inset-0 rounded-full border-2 border-white/20 bg-black/40" />
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-px bg-white/20"
                style={{ height: size * 0.6 }} />
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-px bg-white/20"
                style={{ width: size * 0.6 }} />
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-green-500"
                style={{ width: tolerance, height: tolerance }} />
            <div className="absolute w-6 h-6 rounded-full"
                style={{
                    background: color,
                    boxShadow: `0 0 12px ${color}`,
                    left: `calc(50% + ${bx}px)`,
                    top: `calc(50% + ${by}px)`,
                    transform: "translate(-50%, -50%)",
                    transition: "left 0.15s, top 0.15s",
                }} />
        </div>
    );
}

// ─── Compass ──────────────────────────────────────────────────────────────────

function CompassNeedle({ heading }: { heading: number | null }) {
    const diff = heading !== null ? Math.abs(((heading + 180) % 360) - 180) : 999;
    const isNorth = diff < NORTH_TOLERANCE;
    const color = isNorth ? "#48BB78" : "#F6AD55";

    return (
        <div className="relative w-[100px] h-[100px]">
            <div className="absolute inset-0 rounded-full border-2 border-white/20 bg-black/40" />
            <span className="absolute top-1 left-1/2 -translate-x-1/2 text-xs text-white/70 font-mono">N</span>
            {heading !== null && (
                <div className="absolute inset-0" style={{ transform: `rotate(${heading}deg)`, transition: "transform 0.2s" }}>
                    <div className="absolute left-1/2 top-1/2" style={{
                        transform: "translateX(-50%)",
                        width: 3,
                        height: 40,
                        background: `linear-gradient(to top, ${color}, transparent)`,
                        borderRadius: 9999,
                        marginTop: -40,
                    }} />
                </div>
            )}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-white" />
        </div>
    );
}

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepIndicator({ current, total }: { current: number; total: number }) {
    return (
        <div className="flex items-center gap-2 justify-center">
            {Array.from({ length: total }).map((_, i) => (
                <div key={i} className="flex items-center gap-2">
                    <div className={[
                        "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold",
                        i < current ? "bg-teal-500 text-gray-900" :
                            i === current ? "bg-teal-300 text-gray-900 border-2 border-teal-200" :
                                "bg-white/10 text-white/50",
                    ].join(" ")}>
                        {i < current ? <CheckCircle2 size={14} /> : i + 1}
                    </div>
                    {i < total - 1 && (
                        <div className={`w-6 h-px ${i < current ? "bg-teal-500" : "bg-white/20"}`} />
                    )}
                </div>
            ))}
        </div>
    );
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

function Spinner({ size = "sm", color = "var(--astro-teal)" }: { size?: "xs" | "sm"; color?: string }) {
    const cls = size === "xs" ? "w-3 h-3 border" : "w-4 h-4 border-2";
    return <div className={`${cls} border-white/20 rounded-full animate-spin`} style={{ borderTopColor: color }} />;
}

// ─── Main component ───────────────────────────────────────────────────────────

interface MiseEnStationWizardProps {
    onClose?: () => void;
}

export const MiseEnStationWizard = ({ onClose }: MiseEnStationWizardProps) => {
    const { config, updateConfig } = useStargazerStore();
    const wsRef = useRef<WebSocket | null>(null);
    const [wsConnected, setWsConnected] = useState(false);
    const [sensor, setSensor] = useState<SensorData>({
        beta: null, gamma: null, alpha: null,
        lat: null, lon: null, alt_gps: null, compassAccuracy: null,
    });

    const [step, setStep] = useState<Step>(0);
    const [initResult, setInitResult] = useState<string | null>(null);
    const [initError, setInitError] = useState<string | null>(null);
    const [initLoading, setInitLoading] = useState(false);

    const [solveStatus, setSolveStatus] = useState<"idle" | "capturing" | "solving" | "done" | "failed">("idle");
    const [solveMsg, setSolveMsg] = useState("");

    // GPS validation state
    const [gpsLoading, setGpsLoading] = useState(false);
    // Resolved coords for the wizard (from phone sensor or config)
    const [resolvedLat, setResolvedLat] = useState<number | null>(null);
    const [resolvedLon, setResolvedLon] = useState<number | null>(null);
    const [resolvedAccuracy, setResolvedAccuracy] = useState<number | null>(null);
    const [gpsSource, setGpsSource] = useState<"phone" | "config" | null>(null);

    // ─── Initialise resolved coords from config ───────────────────────────────

    useEffect(() => {
        const lat = parseFloat(config.latitude);
        const lon = parseFloat(config.longitude);
        if (isValidLatLon(lat, lon) && !isDefaultCoords(lat, lon)) {
            setResolvedLat(lat);
            setResolvedLon(lon);
            setGpsSource("config");
        }
    }, [config.latitude, config.longitude]);

    // ─── WebSocket phone sensor ──────────────────────────────────────────────

    const connectWs = useCallback(() => {
        const host = (config.astroberryUrl || "localhost").replace(/^https?:\/\//, "").replace(/:\d+$/, "");
        const protocol = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss" : "ws";
        const port = protocol === "wss" ? "8443" : "5005";
        const url = `${protocol}://${host}:${port}/ws/phone-sensor`;

        const ws = new WebSocket(url);
        wsRef.current = ws;
        ws.onopen = () => setWsConnected(true);
        ws.onclose = () => {
            setWsConnected(false);
            setTimeout(connectWs, 3000);
        };
        ws.onerror = () => ws.close();
        ws.onmessage = (evt) => {
            try {
                const d = JSON.parse(evt.data);
                setSensor({
                    beta: d.beta ?? null, gamma: d.gamma ?? null, alpha: d.alpha ?? null,
                    lat: d.lat ?? null, lon: d.lon ?? null, alt_gps: d.alt ?? null,
                    compassAccuracy: d.compassAccuracy ?? null,
                });
            } catch (_) {}
        };
    }, [config.astroberryUrl]);

    useEffect(() => {
        connectWs();
        return () => { wsRef.current?.close(); };
    }, [connectWs]);

    // ─── Fetch GPS from phone orientation API ─────────────────────────────────

    const handleUsePhoneGps = async () => {
        setGpsLoading(true);
        try {
            const res = await fetch("/api/hardware/orientation");
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json() as { latitude?: number; longitude?: number; accuracy_m?: number };
            const lat = data.latitude;
            const lon = data.longitude;
            const accuracy = data.accuracy_m ?? null;
            if (lat == null || lon == null || !isValidLatLon(lat, lon)) {
                throw new Error("Coordonnées invalides retournées par le téléphone");
            }
            setResolvedLat(lat);
            setResolvedLon(lon);
            setResolvedAccuracy(accuracy);
            setGpsSource("phone");
            // Persist to config
            updateConfig({ latitude: String(lat), longitude: String(lon) }, true);
        } catch (e: unknown) {
            notification.error("GPS téléphone indisponible", {
                source: "MiseEnStation",
                description: e instanceof Error ? e.message : "Erreur inconnue",
            });
        } finally {
            setGpsLoading(false);
        }
    };

    // ─── Derived state ───────────────────────────────────────────────────────

    const isLevel =
        sensor.beta !== null && sensor.gamma !== null &&
        Math.abs(sensor.beta) < LEVEL_TOLERANCE && Math.abs(sensor.gamma) < LEVEL_TOLERANCE;

    const headingDiff = sensor.alpha !== null ? Math.abs(((sensor.alpha + 180) % 360) - 180) : 999;
    const isNorth = headingDiff < NORTH_TOLERANCE;
    const hasGps = sensor.lat !== null && sensor.lon !== null;
    const step1Ready = isLevel && isNorth && hasGps;

    // GPS step validation
    const configLat = parseFloat(config.latitude);
    const configLon = parseFloat(config.longitude);
    const configCoordsValid = isValidLatLon(configLat, configLon);
    const configCoordsAreDefault = configCoordsValid && isDefaultCoords(configLat, configLon);
    const gpsStepReady = resolvedLat !== null && resolvedLon !== null && gpsSource !== null;

    // Effective coords for NexStar init (phone sensor preferred over config)
    const effectiveLat = sensor.lat ?? resolvedLat;
    const effectiveLon = sensor.lon ?? resolvedLon;

    // ─── Step 3: init NexStar ────────────────────────────────────────────────

    const handleInitStation = async () => {
        if (!effectiveLat || !effectiveLon) return;
        setInitLoading(true);
        setInitError(null);
        try {
            const res = await fetch("/api/mount/init-station", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ lat: effectiveLat, lon: effectiveLon, elevation: sensor.alt_gps ?? 0 }),
            });
            const data = await res.json();
            if (data.success) {
                setInitResult(data.message ?? "Initialisé");
                setTimeout(() => setStep(3), 1000);
            } else {
                setInitError(data.error ?? "Erreur inconnue");
            }
        } catch (e: unknown) {
            setInitError(e instanceof Error ? e.message : "Connexion échouée");
        } finally {
            setInitLoading(false);
        }
    };

    // ─── Step 4: plate solve ─────────────────────────────────────────────────

    const handlePlateSolve = async () => {
        if (!effectiveLat || !effectiveLon) return;
        setSolveStatus("capturing");
        setSolveMsg("Capture en cours…");
        try {
            setSolveStatus("solving");
            setSolveMsg("Plate-solving…");
            const solved = await plateSolve({ exposure: 5, lat: effectiveLat, lon: effectiveLon } as never);
            if (solved) {
                setSolveMsg(`Résolu: RA ${(solved as { ra?: number }).ra?.toFixed(3)}h  Dec ${(solved as { dec?: number }).dec?.toFixed(2)}°`);
                setSolveStatus("done");
            } else {
                setSolveMsg("Plate-solve échoué — réessayez");
                setSolveStatus("failed");
            }
        } catch (e: unknown) {
            setSolveMsg(e instanceof Error ? e.message : "Erreur plate-solve");
            setSolveStatus("failed");
        }
    };

    // ─── Render ──────────────────────────────────────────────────────────────

    return (
        <div className="w-full max-w-[440px] flex flex-col gap-0 rounded-xl p-5"
            style={{ background: "rgba(2, 8, 23, 0.95)", border: "1px solid rgba(255,255,255,0.2)", backdropFilter: "blur(12px)" }}>

            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Crosshair size={16} className="text-teal-300" />
                    <span className="text-[16px] font-bold text-white">Mise en Station</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className={[
                        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium",
                        wsConnected ? "bg-green-500/20 text-green-300" : "bg-red-500/20 text-red-300",
                    ].join(" ")}>
                        {wsConnected ? <Wifi size={10} /> : <WifiOff size={10} />}
                        <span>iPhone</span>
                    </span>
                    {onClose && (
                        <button className="text-white/40 hover:text-white/70 transition-colors text-xs px-1" onClick={onClose}>✕</button>
                    )}
                </div>
            </div>

            <StepIndicator current={step} total={4} />
            <p className="text-[14px] text-teal-200 text-center mt-2 mb-4 font-medium">{STEP_LABELS[step]}</p>

            <div className="h-px bg-white/10 mb-4" />

            {/* ── STEP 0: GPS Validation ── */}
            {step === 0 && (
                <div className="flex flex-col gap-4">
                    <p className="text-xs text-white/50">
                        Vérifiez votre position géographique avant de lancer la séquence. Une position exacte est
                        indispensable pour que la NexStar calcule correctement sa mise en station.
                    </p>

                    {/* Config coords status */}
                    {configCoordsValid && !configCoordsAreDefault && gpsSource === "config" && (
                        <div className="flex items-center gap-2 p-2.5 rounded-md border border-green-600 bg-green-900/40">
                            <CheckCircle2 size={14} className="text-green-300 shrink-0" />
                            <div className="flex flex-col gap-0.5">
                                <span className="text-[12px] text-green-200 font-medium">
                                    GPS config : {formatCoord(configLat, configLon)}
                                </span>
                                <span className="text-[10px] text-green-400/70">Coordonnées enregistrées dans la configuration</span>
                            </div>
                        </div>
                    )}

                    {/* Default / missing coords warning */}
                    {(!configCoordsValid || configCoordsAreDefault) && gpsSource !== "phone" && (
                        <div className="flex items-center gap-2 p-2.5 rounded-md border border-amber-600 bg-amber-900/40">
                            <AlertTriangle size={14} className="text-amber-300 shrink-0" />
                            <div className="flex flex-col gap-0.5">
                                <span className="text-[12px] text-amber-200 font-medium">
                                    Coordonnées par défaut détectées
                                </span>
                                <span className="text-[10px] text-amber-400/70">
                                    Veuillez confirmer votre position avant de continuer
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Phone GPS result */}
                    {gpsSource === "phone" && resolvedLat !== null && resolvedLon !== null && (
                        <div className="flex items-center gap-2 p-2.5 rounded-md border border-green-600 bg-green-900/40">
                            <CheckCircle2 size={14} className="text-green-300 shrink-0" />
                            <div className="flex flex-col gap-0.5">
                                <span className="text-[12px] text-green-200 font-medium">
                                    GPS téléphone : {formatCoord(resolvedLat, resolvedLon)}
                                    {resolvedAccuracy !== null && (
                                        <span className="text-green-400 ml-1">— Précision : {resolvedAccuracy.toFixed(0)} m</span>
                                    )}
                                </span>
                                <span className="text-[10px] text-green-400/70">Position importée depuis le capteur téléphone</span>
                            </div>
                        </div>
                    )}

                    {/* Use phone button */}
                    <button
                        onClick={handleUsePhoneGps}
                        disabled={gpsLoading}
                        className="flex items-center justify-center gap-2 h-8 rounded-md bg-white/[0.06] border border-white/15 text-white/70 text-sm font-medium transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                        {gpsLoading ? <Spinner size="xs" /> : <Smartphone size={13} />}
                        <span>{gpsLoading ? "Acquisition GPS…" : "Utiliser la position du téléphone"}</span>
                    </button>

                    {/* Live WS GPS (from sensor stream) */}
                    {sensor.lat !== null && sensor.lon !== null && (
                        <div className="flex items-center gap-2">
                            <MapPin size={11} className="text-teal-300" />
                            <span className="text-[11px] text-teal-200">
                                Capteur live : {formatCoord(sensor.lat, sensor.lon)}
                                {sensor.alt_gps !== null && <span className="text-teal-400/60 ml-1">· alt {sensor.alt_gps.toFixed(0)} m</span>}
                            </span>
                        </div>
                    )}

                    <button
                        disabled={!gpsStepReady}
                        onClick={() => setStep(1)}
                        className="flex items-center justify-center gap-2 h-8 rounded-md bg-teal-600 text-white text-sm font-medium transition-colors hover:bg-teal-500 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                        <span>Position confirmée — Suivant</span>
                        <ChevronRight size={12} />
                    </button>

                    {!gpsStepReady && (
                        <p className="text-xs text-white/40 text-center">
                            Importez la position du téléphone ou configurez vos coordonnées dans les réglages
                        </p>
                    )}
                </div>
            )}

            {/* ── STEP 1 ── */}
            {step === 1 && (
                <div className="flex flex-col gap-4">
                    <div className="flex items-start justify-center gap-6">
                        <div className="flex flex-col items-center gap-1">
                            <span className="text-xs text-white/60 uppercase tracking-wider">Niveau</span>
                            <LevelBubble beta={sensor.beta} gamma={sensor.gamma} />
                            <span className={[
                                "inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium",
                                isLevel ? "bg-green-500/20 text-green-300" : "bg-orange-500/20 text-orange-300",
                            ].join(" ")}>
                                {isLevel ? "OK" : sensor.beta !== null ? `β${sensor.beta?.toFixed(1)}° γ${sensor.gamma?.toFixed(1)}°` : "—"}
                            </span>
                        </div>
                        <div className="flex flex-col items-center gap-1">
                            <span className="text-xs text-white/60 uppercase tracking-wider">Azimut</span>
                            <CompassNeedle heading={sensor.alpha} />
                            <span className={[
                                "inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium",
                                isNorth ? "bg-green-500/20 text-green-300" : "bg-orange-500/20 text-orange-300",
                            ].join(" ")}>
                                {isNorth ? "Nord OK" : sensor.alpha !== null ? `${sensor.alpha?.toFixed(1)}°` : "—"}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center justify-center gap-2">
                        <MapPin size={12} className={hasGps ? "text-teal-300" : "text-white/40"} />
                        <span className={`text-xs ${hasGps ? "text-teal-200" : "text-white/50"}`}>
                            {hasGps ? `GPS: ${sensor.lat?.toFixed(4)}°, ${sensor.lon?.toFixed(4)}°` : "En attente du GPS iPhone…"}
                        </span>
                    </div>

                    {sensor.compassAccuracy !== null && sensor.compassAccuracy > 20 && (
                        <div className="flex items-center gap-2 p-2 rounded-md border border-orange-600 bg-orange-900/50">
                            <AlertTriangle size={12} className="text-orange-300 shrink-0" />
                            <span className="text-xs text-orange-200">
                                Précision boussole faible ({sensor.compassAccuracy}°) — éloignez-vous du métal
                            </span>
                        </div>
                    )}

                    <p className="text-xs text-white/50 text-center">
                        Ajustez la monture jusqu&apos;à ce que la bulle soit centrée et l&apos;aiguille pointe le Nord
                    </p>

                    <div className="flex items-center gap-2">
                        <button
                            className="h-8 px-3 text-sm text-white/50 hover:text-white/70 transition-colors cursor-pointer"
                            onClick={() => setStep(0)}
                        >
                            ← Retour
                        </button>
                        <button
                            disabled={!step1Ready}
                            onClick={() => setStep(2)}
                            className="flex-1 flex items-center justify-center gap-2 h-8 rounded-md bg-teal-600 text-white text-sm font-medium transition-colors hover:bg-teal-500 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                        >
                            <span>Physique OK — Suivant</span>
                            <ChevronRight size={12} />
                        </button>
                    </div>

                    {!step1Ready && (
                        <p className="text-xs text-white/40 text-center">
                            {!hasGps ? "GPS requis" : !isLevel ? "Niveler la monture" : "Orienter vers le Nord"}
                        </p>
                    )}
                </div>
            )}

            {/* ── STEP 2 ── */}
            {step === 2 && (
                <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2 rounded-lg p-3 bg-white/[0.03]">
                        <div className="flex items-center gap-2">
                            <MapPin size={12} className="text-teal-300" />
                            <span className="text-[14px] text-white">
                                Lat: <span className="text-teal-200">{(effectiveLat ?? 0).toFixed(5)}°</span>
                                {" "}Lon: <span className="text-teal-200">{(effectiveLon ?? 0).toFixed(5)}°</span>
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Navigation size={12} className="text-teal-300" />
                            <span className="text-[14px] text-white">
                                Altitude GPS: <span className="text-teal-200">{sensor.alt_gps?.toFixed(0) ?? "—"} m</span>
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Clock size={12} className="text-teal-300" />
                            <span className="text-[14px] text-white">
                                UTC: <span className="text-teal-200">{new Date().toUTCString().slice(0, 25)}</span>
                            </span>
                        </div>
                    </div>

                    <p className="text-xs text-white/50">
                        Ces coordonnées et l&apos;heure UTC seront envoyées au contrôleur NexStar via INDI,
                        puis le suivi sidéral sera activé.
                    </p>

                    {initResult && (
                        <div className="flex items-center gap-2 p-2 rounded-md border border-green-600 bg-green-900/50">
                            <CheckCircle2 size={12} className="text-green-300" />
                            <span className="text-[14px] text-green-200">{initResult}</span>
                        </div>
                    )}
                    {initError && (
                        <div className="flex items-center gap-2 p-2 rounded-md border border-red-600 bg-red-900/50">
                            <AlertTriangle size={12} className="text-red-300" />
                            <span className="text-[14px] text-red-200">{initError}</span>
                        </div>
                    )}

                    <div className="flex items-center gap-2">
                        <button
                            className="h-8 px-3 text-sm text-white/50 hover:text-white/70 transition-colors cursor-pointer"
                            onClick={() => setStep(1)}
                        >
                            ← Retour
                        </button>
                        <button
                            disabled={initLoading}
                            onClick={handleInitStation}
                            className="flex-1 flex items-center justify-center gap-2 h-8 rounded-md bg-teal-600 text-white text-sm font-medium transition-colors hover:bg-teal-500 disabled:opacity-60 cursor-pointer"
                        >
                            {initLoading && <Spinner size="xs" color="white" />}
                            {initLoading ? "Envoi en cours…" : "Envoyer GPS + Heure → NexStar"}
                        </button>
                    </div>
                </div>
            )}

            {/* ── STEP 3 ── */}
            {step === 3 && (
                <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2 rounded-lg p-3 bg-white/[0.03]">
                        <span className="text-xs text-white/60 uppercase tracking-wider">Alignement stellaire</span>
                        <p className="text-[14px] text-white">
                            Le wizard va capturer une image courte (5s) et résoudre sa position par plate-solving
                            pour synchroniser précisément les coordonnées du télescope.
                        </p>
                    </div>

                    {solveStatus === "idle" && (
                        <p className="text-xs text-white/50">
                            Pointez le télescope vers une zone du ciel bien étoilée, loin de la Lune et des nuages.
                        </p>
                    )}

                    {(solveStatus === "capturing" || solveStatus === "solving") && (
                        <div className="flex items-center justify-center gap-2">
                            <Spinner size="sm" color="#5eead4" />
                            <span className="text-[14px] text-teal-200">{solveMsg}</span>
                        </div>
                    )}

                    {solveStatus === "done" && (
                        <div className="flex items-center gap-2 p-2 rounded-md border border-green-600 bg-green-900/50">
                            <CheckCircle2 size={12} className="text-green-300" />
                            <span className="text-[14px] text-green-200 font-mono">{solveMsg}</span>
                        </div>
                    )}

                    {solveStatus === "failed" && (
                        <div className="flex items-center gap-2 p-2 rounded-md border border-red-600 bg-red-900/50">
                            <AlertTriangle size={12} className="text-red-300" />
                            <span className="text-[14px] text-red-200">{solveMsg}</span>
                        </div>
                    )}

                    <div className="flex items-center gap-2">
                        <button
                            className="h-8 px-3 text-sm text-white/50 hover:text-white/70 transition-colors cursor-pointer"
                            onClick={() => setStep(2)}
                        >
                            ← Retour
                        </button>
                        {solveStatus !== "done" ? (
                            <button
                                disabled={solveStatus === "capturing" || solveStatus === "solving"}
                                onClick={handlePlateSolve}
                                className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-md bg-purple-600 text-white text-sm font-medium transition-colors hover:bg-purple-500 disabled:opacity-60 cursor-pointer"
                            >
                                {(solveStatus === "capturing" || solveStatus === "solving")
                                    ? <Spinner size="xs" color="white" />
                                    : <Star size={12} />}
                                <span>Lancer plate-solving</span>
                            </button>
                        ) : (
                            <button
                                onClick={onClose}
                                className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-md bg-teal-600 text-white text-sm font-medium transition-colors hover:bg-teal-500 cursor-pointer"
                            >
                                <CheckCircle2 size={12} />
                                <span>Mise en station terminée</span>
                            </button>
                        )}
                    </div>

                    {solveStatus === "failed" && (
                        <button
                            className="flex items-center justify-center gap-1 text-xs text-white/40 hover:text-white/70 transition-colors cursor-pointer"
                            onClick={() => setSolveStatus("idle")}
                        >
                            <RotateCcw size={12} />
                            <span>Réessayer</span>
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

export default MiseEnStationWizard;
