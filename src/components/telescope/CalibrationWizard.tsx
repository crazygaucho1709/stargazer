// src/components/telescope/CalibrationWizard.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import {
    Telescope, Target, Settings2, Activity, MapPin, CheckCircle2, AlertTriangle, X
} from "lucide-react";
import { useStargazerStore } from "@/store/useStargazerStore";
import { useAstroAction } from "@/hooks/useAstroAction";
import { notification } from "@/lib/notificationService";
import { useJog } from "@/hooks/useJog";
import { JogPad } from "./JogPad";
import { useLiveView } from "@/hooks/useLiveView";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PhoneSensorData {
    alpha: number | null; beta: number | null; gamma: number | null;
    lat: number | null; lon: number | null; accuracy_m: number | null; connected: boolean;
}

function betaToAlt(beta: number | null): number | null {
    if (beta == null) return null;
    return Math.max(0, Math.min(90, 90 - Math.abs(beta)));
}

type CalibrationStep =
    | 'idle' | 'connection' | 'init-mount' | 'park'
    | 'limits-alt-max' | 'limits-alt-min' | 'limits-az-max' | 'limits-az-min'
    | 'camera-test' | 'alignment' | 'complete';

interface StepStatus { step: CalibrationStep; isWaitingUser: boolean; message: string; instruction: string; }

const BRIGHT_STARS = [
    { name: "Sirius",         ra: "06h 45m 08s", dec: "-16° 42' 58\"" },
    { name: "Canopus",        ra: "06h 23m 57s", dec: "-52° 41' 44\"" },
    { name: "Arcturus",       ra: "14h 15m 39s", dec: "+19° 10' 56\"" },
    { name: "Rigel Kentaurus",ra: "14h 39m 36s", dec: "-60° 50' 02\"" },
    { name: "Vega",           ra: "18h 36m 56s", dec: "+38° 47' 01\"" },
    { name: "Capella",        ra: "05h 16m 41s", dec: "+45° 59' 52\"" },
    { name: "Rigel",          ra: "05h 14m 32s", dec: "-08° 12' 06\"" },
    { name: "Procyon",        ra: "07h 39m 18s", dec: "+05° 13' 29\"" },
    { name: "Achernar",       ra: "01h 37m 42s", dec: "-57° 14' 12\"" },
    { name: "Betelgeuse",     ra: "05h 55m 10s", dec: "+07° 24' 25\"" },
];

// ─── Spinner ──────────────────────────────────────────────────────────────────

function Spinner({ size = "sm", color = "var(--astro-teal)" }: { size?: "xs" | "sm"; color?: string }) {
    const cls = size === "xs" ? "w-3 h-3 border" : "w-4 h-4 border-2";
    return <div className={`${cls} border-white/20 rounded-full animate-spin`} style={{ borderTopColor: color }} />;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export const CalibrationWizard = () => {
    const { language, config, setMountLimits, mountLimits, setSlewing } = useStargazerStore();
    const bridgeIp = config.astroberryUrl.includes('http')
        ? new URL(config.astroberryUrl).hostname
        : config.astroberryUrl.split(':')[0];

    const [step, setStep] = useState<StepStatus>({ step: 'idle', isWaitingUser: false, message: '', instruction: '' });
    const [videoActive, setVideoActive] = useState(false);
    const [selectedStar, setSelectedStar] = useState(BRIGHT_STARS[0]);
    const [imageTime, setImageTime] = useState(Date.now());
    const [starAltAz, setStarAltAz] = useState<{ alt: number; az: number } | null>(null);
    const [recordedInSession, setRecordedInSession] = useState<Set<string>>(new Set());

    const { execute: performAction, isPending, error: actionError } = useAstroAction();
    const jog = useJog();
    const liveView = useLiveView();

    const [phoneSensor, setPhoneSensor] = useState<PhoneSensorData>({
        alpha: null, beta: null, gamma: null, lat: null, lon: null, accuracy_m: null, connected: false,
    });

    useEffect(() => {
        let ws: WebSocket | null = null, timerId: NodeJS.Timeout | null = null, active = true;
        const connect = () => {
            if (!active) return;
            const host = window.location.hostname, isHttps = window.location.protocol === "https:";
            const wsUrl = isHttps ? `wss://${host}:${window.location.port}/ws/phone-sensor` : `ws://${host}:5005/ws/phone-sensor`;
            ws = new WebSocket(wsUrl);
            ws.onmessage = (evt) => {
                try {
                    const d = JSON.parse(evt.data);
                    setPhoneSensor({ alpha: d.alpha ?? null, beta: d.beta ?? null, gamma: d.gamma ?? null, lat: d.lat ?? null, lon: d.lon ?? null, accuracy_m: d.accuracy_m ?? null, connected: !!d.connected });
                } catch (_) {}
            };
            ws.onopen  = () => setPhoneSensor(prev => ({ ...prev, connected: true }));
            ws.onclose = () => { setPhoneSensor(prev => ({ ...prev, connected: false })); if (active) timerId = setTimeout(connect, 3000); };
            ws.onerror = () => ws?.close();
        };
        connect();
        return () => { active = false; if (timerId) clearTimeout(timerId); ws?.close(); };
    }, []);

    const getStepProgress = () => {
        const steps: CalibrationStep[] = ['connection', 'init-mount', 'park', 'limits-alt-max', 'limits-alt-min', 'limits-az-max', 'limits-az-min', 'camera-test', 'alignment', 'complete'];
        const idx = steps.indexOf(step.step);
        return idx === -1 ? 0 : ((idx + 1) / steps.length) * 100;
    };

    useEffect(() => {
        if (step.step !== 'alignment') return;
        const updatePos = async () => {
            try {
                const res = await fetch(`/api/indi?endpoint=coords&ra=${selectedStar.ra}&dec=${selectedStar.dec}`);
                const data = await res.json();
                if (data.success && data.alt !== undefined && data.az !== undefined) setStarAltAz({ alt: data.alt, az: data.az });
            } catch { /* silent */ }
        };
        updatePos();
        const interval = setInterval(updatePos, 10000);
        return () => clearInterval(interval);
    }, [selectedStar, step.step]);

    useEffect(() => {
        if (step.step !== 'idle' && step.step !== 'complete') { setVideoActive(true); liveView.start(); }
        else { setVideoActive(false); liveView.stop(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [step.step]);

    useEffect(() => {
        if (!videoActive) return;
        const interval = setInterval(() => setImageTime(Date.now()), 1000);
        return () => clearInterval(interval);
    }, [videoActive]);

    const startCalibration = async () => {
        await performAction(async () => {
            setStep({ step: 'connection', isWaitingUser: false, message: language === 'fr' ? 'Vérification connexion...' : 'Checking connection...', instruction: '' });
            const res = await fetch('/api/indi/health-full');
            const ping = await res.json();
            if (!ping) throw new Error(language === 'fr' ? 'Connexion échouée.' : 'Connection failed.');
            setStep({ step: 'init-mount', isWaitingUser: false, message: language === 'fr' ? 'Initialisation NexStar...' : 'Initializing NexStar...', instruction: language === 'fr' ? 'Écrasement raquette : Envoi Heure (UTC), GPS et Limites...' : 'Overriding Hand Controller: Pushing Time, GPS & Limits...' });
            await fetch('/api/indi/mount', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'sync_master', lat: parseFloat(config.latitude), lon: parseFloat(config.longitude), utcTime: new Date().toISOString(), limits: mountLimits, ip: bridgeIp }) });
            await new Promise(r => setTimeout(r, 1500));
            const isSouth = parseFloat(config.latitude) < 0;
            setStep({ step: 'park', isWaitingUser: true, message: language === 'fr' ? 'Mise en station' : 'Parking', instruction: language === 'fr' ? `Garez la monture: tube horizontal, pointé vers le ${isSouth ? 'Sud' : 'Nord'}.` : `Park the mount: tube horizontal, pointing ${isSouth ? 'South' : 'North'}.` });
        }, "CALIBRATION WIZARD START");
    };

    const syncParkPosition = async () => {
        await performAction(async () => {
            const isSouth = parseFloat(config.latitude) < 0;
            await fetch('/api/indi/mount', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'sync_master', lat: parseFloat(config.latitude), lon: parseFloat(config.longitude), alt: 0, az: isSouth ? 180 : 0, ip: bridgeIp }) });
            setStep({ step: 'limits-alt-max', isWaitingUser: true, message: language === 'fr' ? 'Altitude Max' : 'Max Altitude', instruction: language === 'fr' ? 'Montez au maximum sécurisé.' : 'Raise to max safe position.' });
        }, "SYNC PARK POSITION");
    };

    const getCurrentAlt = async (): Promise<number> => {
        try {
            const res = await fetch('/api/mount/status', { cache: 'no-store' });
            if (res.ok) { const data = await res.json(); if (typeof data.alt === 'number') return data.alt; }
        } catch { /* fallback */ }
        return useStargazerStore.getState().alt;
    };

    const getCurrentAz = async (): Promise<number> => {
        try {
            const res = await fetch('/api/mount/status', { cache: 'no-store' });
            if (res.ok) { const data = await res.json(); if (typeof data.az === 'number') return data.az; }
        } catch { /* fallback */ }
        return useStargazerStore.getState().az;
    };

    const saveMaxAlt = async () => { const v = await getCurrentAlt(); setMountLimits({ ...mountLimits, maxAlt: v }); setRecordedInSession(p => new Set(p).add('maxAlt')); setStep({ step: 'limits-alt-min', isWaitingUser: true, message: language === 'fr' ? 'Altitude Min' : 'Min Altitude', instruction: language === 'fr' ? 'Descendez au minimum.' : 'Lower to minimum.' }); };
    const saveMinAlt = async () => { const v = await getCurrentAlt(); setMountLimits({ ...mountLimits, minAlt: v }); setRecordedInSession(p => new Set(p).add('minAlt')); setStep({ step: 'limits-az-max', isWaitingUser: true, message: language === 'fr' ? 'Azimut Max' : 'Max Azimuth', instruction: language === 'fr' ? 'Tournez vers l\'Est.' : 'Rotate East.' }); };
    const saveMaxAz  = async () => { const v = await getCurrentAz(); setMountLimits({ ...mountLimits, maxAz: v });  setRecordedInSession(p => new Set(p).add('maxAz'));  setStep({ step: 'limits-az-min', isWaitingUser: true, message: language === 'fr' ? 'Azimut Min' : 'Min Azimuth', instruction: language === 'fr' ? 'Tournez vers l\'Ouest.' : 'Rotate West.' }); };
    const saveMinAz  = async () => {
        const v = await getCurrentAz(); const finalLimits = { ...mountLimits, minAz: v };
        setMountLimits(finalLimits); setRecordedInSession(p => new Set(p).add('minAz'));
        fetch('/api/indi/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mountLimits: finalLimits }) }).catch((err: Error) => notification.error("Sauvegarde limites échouée", { description: err?.message || "Impossible d'écrire config.json", source: "Calibration" }));
        setStep({ step: 'camera-test', isWaitingUser: true, message: language === 'fr' ? 'Test caméra' : 'Camera test', instruction: 'Testez la capture.' });
    };

    const startStarGoto = async () => {
        await performAction(async () => {
            setSlewing(true);
            await fetch('/api/indi/mount', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'slew', device: config.driverInstance, ra: selectedStar.ra, dec: selectedStar.dec, ip: bridgeIp }) });
            setSlewing(false);
        }, "STAR GOTO");
    };

    const syncStar = async () => {
        await performAction(async () => {
            await fetch('/api/indi/mount', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'sync', ra: selectedStar.ra, dec: selectedStar.dec, ip: bridgeIp }) });
            setStep({ step: 'complete', isWaitingUser: false, message: 'Terminé', instruction: 'Alignement réussi.' });
        }, "SYNC STAR");
    };

    const reset = () => { setStep({ step: 'idle', isWaitingUser: false, message: '', instruction: '' }); setRecordedInSession(new Set()); };

    const LIMIT_STEPS: CalibrationStep[] = ['limits-alt-max', 'limits-alt-min', 'limits-az-max', 'limits-az-min'];
    const LIMIT_DASHBOARD_STEPS: CalibrationStep[] = [...LIMIT_STEPS, 'camera-test', 'alignment', 'complete'];

    // ─── Idle screen ──────────────────────────────────────────────────────────

    if (step.step === 'idle') {
        return (
            <div className="flex flex-col gap-4 w-full">
                <div className="astro-panel p-6 w-full text-center" style={{ border: "1px solid rgba(0, 255, 209, 0.2)" }}>
                    <Settings2 size={32} style={{ color: "var(--astro-teal)", margin: "0 auto 16px" }} className="ping-slow" />
                    <p className="text-[14px] font-bold tracking-[0.2em] text-white mb-2">
                        {language === 'fr' ? 'CALIBRATION SYSTÈME' : 'SYSTEM CALIBRATION'}
                    </p>
                    <p className="text-[11px] mb-6" style={{ color: "rgba(255,255,255,0.6)" }}>
                        {language === 'fr' ? 'Initialisez votre observatoire: connexion, limites et alignement céleste.' : 'Initialize your observatory: connection, limits, and celestial alignment.'}
                    </p>
                    <button
                        onClick={startCalibration}
                        className="w-full h-10 rounded-lg text-black font-bold transition-all duration-300 cursor-pointer hover:scale-[1.02]"
                        style={{ background: "var(--astro-teal)" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "white")}
                        onMouseLeave={e => (e.currentTarget.style.background = "var(--astro-teal)")}
                    >
                        {language === 'fr' ? 'LANCER LE WIZARD' : 'LAUNCH WIZARD'}
                    </button>
                </div>
            </div>
        );
    }

    // ─── Active wizard ────────────────────────────────────────────────────────

    return (
        <div className="astro-panel flex flex-col gap-4 w-full p-4" style={{ border: "1px solid rgba(0, 255, 209, 0.1)" }}>
            {/* Header & Progress */}
            <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Activity size={16} style={{ color: "var(--astro-teal)" }} className="scanning" />
                        <span className="text-[10px] font-bold tracking-[0.1em]" style={{ color: "var(--astro-teal)" }}>
                            {step.step.toUpperCase().replace('-', ' ')}
                        </span>
                    </div>
                    <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.5)" }}>{Math.round(getStepProgress())}%</span>
                </div>
                <div className="w-full h-[2px] rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                    <div className="h-full transition-all duration-500 ease-out rounded-full" style={{ width: `${getStepProgress()}%`, background: "var(--astro-teal)", boxShadow: "0 0 10px var(--astro-teal)" }} />
                </div>
            </div>

            {/* Message Area */}
            <div className="relative p-3 rounded overflow-hidden" style={{ background: "rgba(0,240,255,0.05)", borderLeft: "2px solid var(--astro-teal)" }}>
                <div className="absolute inset-0 scanline opacity-10 pointer-events-none" />
                <p className="text-[12px] font-bold text-white mb-1">{step.message}</p>
                <p className="text-[10px] leading-[1.4]" style={{ color: "rgba(255,255,255,0.7)" }}>{step.instruction}</p>
            </div>

            {/* Limits Dashboard */}
            {LIMIT_DASHBOARD_STEPS.includes(step.step) && (
                <div className="p-3 rounded" style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(0,255,209,0.12)" }}>
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[9px] font-bold tracking-[0.12em]" style={{ color: "rgba(255,255,255,0.4)" }}>SLEW LIMITS</span>
                        <span className="text-[9px]" style={{ color: "rgba(255,255,255,0.3)" }}>{recordedInSession.size}/4 enregistrées</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                        {([
                            { key: 'maxAlt', limitStep: 'limits-alt-max', label: 'ALT MAX', value: mountLimits.maxAlt },
                            { key: 'minAlt', limitStep: 'limits-alt-min', label: 'ALT MIN',  value: mountLimits.minAlt },
                            { key: 'maxAz',  limitStep: 'limits-az-max',  label: 'AZ MAX',   value: mountLimits.maxAz },
                            { key: 'minAz',  limitStep: 'limits-az-min',  label: 'AZ MIN',   value: mountLimits.minAz },
                        ] as { key: string; limitStep: string; label: string; value: number }[]).map(({ key, limitStep, label, value }) => {
                            const isCurrent = step.step === limitStep, isDone = recordedInSession.has(key);
                            return (
                                <div key={key} className="flex items-center gap-1.5 p-2 rounded"
                                    style={{ background: isCurrent ? 'rgba(0,255,209,0.08)' : 'rgba(255,255,255,0.02)', border: `1px solid ${isCurrent ? 'rgba(0,255,209,0.35)' : isDone ? 'rgba(72,199,142,0.3)' : 'rgba(255,255,255,0.05)'}` }}>
                                    {isDone ? <CheckCircle2 size={12} className="text-green-400" /> : isCurrent ? <Target size={12} style={{ color: "var(--astro-teal)" }} /> : <MapPin size={12} style={{ color: "rgba(255,255,255,0.2)" }} />}
                                    <div className="flex flex-col gap-0 flex-1 min-w-0">
                                        <span className="text-[8px] tracking-[0.06em]" style={{ color: "rgba(255,255,255,0.4)" }}>{label}</span>
                                        <span className="text-[11px] font-bold font-mono" style={{ color: isDone ? '#68d391' : isCurrent ? 'var(--astro-teal)' : 'rgba(255,255,255,0.4)' }}>
                                            {`${value.toFixed(1)}°`}
                                        </span>
                                    </div>
                                    <span className="inline-flex items-center px-1 rounded text-[7px]"
                                        style={{ background: isDone ? 'rgba(72,187,120,0.25)' : 'rgba(255,255,255,0.05)', color: isDone ? '#68d391' : 'rgba(255,255,255,0.4)' }}>
                                        {isDone ? 'NEW' : 'SAVED'}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Live View HUD */}
            {videoActive && (
                <div className="bg-black rounded overflow-hidden relative h-[180px]" style={{ border: "1px solid rgba(0, 255, 209, 0.3)" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/indi/latest-image?ip=${bridgeIp}&t=${imageTime}`} style={{ width: '100%', height: '100%', objectFit: 'contain' }} alt="Live" />
                    {/* HUD Overlays */}
                    <div className="absolute inset-0 pointer-events-none">
                        {/* Reticle */}
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10">
                            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-2.5" style={{ background: "var(--astro-teal)" }} />
                            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-px h-2.5" style={{ background: "var(--astro-teal)" }} />
                            <div className="absolute left-0 top-1/2 -translate-y-1/2 h-px w-2.5" style={{ background: "var(--astro-teal)" }} />
                            <div className="absolute right-0 top-1/2 -translate-y-1/2 h-px w-2.5" style={{ background: "var(--astro-teal)" }} />
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full" style={{ border: "1px solid rgba(0,255,209,0.3)" }} />
                        </div>
                        {/* Corner accents */}
                        {[["top-[10px] left-[10px] border-t border-l", ""], ["top-[10px] right-[10px] border-t border-r", ""], ["bottom-[10px] left-[10px] border-b border-l", ""], ["bottom-[10px] right-[10px] border-b border-r", ""]].map(([cls], i) => (
                            <div key={i} className={`absolute w-2.5 h-2.5 ${cls}`} style={{ borderColor: "var(--astro-teal)" }} />
                        ))}
                    </div>
                    <span className="absolute bottom-2 right-2 text-[8px] px-1 py-0.5 rounded" style={{ background: "rgba(0,0,0,0.6)", color: "var(--astro-teal)" }}>
                        LIVE_FEED_STABLE
                    </span>
                </div>
            )}

            {/* Phone Sensor HUD */}
            {videoActive && (
                <div className="p-3.5 rounded-lg" style={{ background: "rgba(10,25,50,0.4)", border: "1px solid rgba(0,180,255,0.25)" }}>
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5">
                            <Telescope size={14} style={{ color: "#00b4ff" }} />
                            <span className="text-[9px] font-bold tracking-[0.08em]" style={{ color: "rgba(255,255,255,0.8)" }}>
                                {language === 'fr' ? "CAPTEURS IPHONE EMBARQUÉ" : "EMBEDDED IPHONE SENSORS"}
                            </span>
                        </div>
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-medium"
                            style={{ background: phoneSensor.connected ? "rgba(72,187,120,0.3)" : "rgba(245,101,101,0.3)", color: "white" }}>
                            {phoneSensor.connected ? "LIVE" : "DÉCONNECTÉ"}
                        </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        {[
                            { label: language === 'fr' ? "AZIMUT (CAP)" : "AZIMUTH", val: phoneSensor.alpha != null ? `${phoneSensor.alpha.toFixed(1)}°` : "—", color: "#00ffb4" },
                            { label: language === 'fr' ? "ALTITUDE (TANGAGE)" : "ALTITUDE", val: phoneSensor.beta != null ? `${betaToAlt(phoneSensor.beta)?.toFixed(1)}°` : "—", color: "#ffd700" },
                            { label: language === 'fr' ? "ROULIS" : "ROLL", val: phoneSensor.gamma != null ? `${phoneSensor.gamma.toFixed(1)}°` : "—", color: "#aaaaff" },
                        ].map(({ label, val, color }) => (
                            <div key={label} className="flex flex-col items-center gap-0.5 p-2 rounded" style={{ background: "rgba(0,0,0,0.3)" }}>
                                <span className="text-[8px] tracking-[0.05em]" style={{ color: "rgba(255,255,255,0.4)" }}>{label}</span>
                                <span className="text-[13px] font-bold font-mono" style={{ color }}>{val}</span>
                            </div>
                        ))}
                    </div>
                    {phoneSensor.lat != null && phoneSensor.lon != null && (
                        <div className="flex items-center justify-between mt-2 px-1 text-[8px]" style={{ color: "rgba(255,255,255,0.5)" }}>
                            <span>GPS: {phoneSensor.lat.toFixed(5)}, {phoneSensor.lon.toFixed(5)}</span>
                            <span>ACCURACY: ±{phoneSensor.accuracy_m?.toFixed(0)}m</span>
                        </div>
                    )}
                </div>
            )}

            {/* Manual Controls */}
            {step.isWaitingUser && step.step !== 'complete' && (
                <div className="flex flex-col items-center gap-3 p-4 rounded" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                    <span className="text-[10px] font-bold tracking-[0.1em]" style={{ color: "rgba(255,255,255,0.4)" }}>MANUAL JOG CONTROL</span>
                    <JogPad jog={jog} size="md" />
                </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col gap-3">
                {step.step === 'park' && (
                    <button disabled={isPending} onClick={syncParkPosition}
                        className="w-full flex items-center justify-center gap-2 h-10 rounded-lg text-black font-bold cursor-pointer disabled:opacity-60"
                        style={{ background: "var(--astro-gold)" }}>
                        {isPending && <Spinner size="sm" color="black" />}
                        CONFIRMER POSITION REPOS (0°, 0°)
                    </button>
                )}

                {LIMIT_STEPS.includes(step.step) && (
                    <button disabled={isPending} onClick={() => {
                        if (step.step === 'limits-alt-max') saveMaxAlt();
                        else if (step.step === 'limits-alt-min') saveMinAlt();
                        else if (step.step === 'limits-az-max') saveMaxAz();
                        else if (step.step === 'limits-az-min') saveMinAz();
                    }}
                        className="w-full flex items-center justify-center h-10 rounded-lg text-black font-bold cursor-pointer disabled:opacity-60"
                        style={{ background: "var(--astro-teal)" }}>
                        VALIDER POSITION ACTUELLE
                    </button>
                )}

                {step.step === 'camera-test' && (
                    <button onClick={() => setStep({ step: 'alignment', isWaitingUser: true, message: language === 'fr' ? 'Alignement Stellaire' : 'Stellar Alignment', instruction: language === 'fr' ? 'Choisissez une étoile brillante et centrez-la.' : 'Pick a bright star and center it.' })}
                        className="w-full h-10 rounded-lg text-black font-bold cursor-pointer"
                        style={{ background: "var(--astro-teal)" }}>
                        PASSER À L&apos;ALIGNEMENT
                    </button>
                )}

                {step.step === 'alignment' && (
                    <div className="flex flex-col gap-3 p-3 rounded" style={{ background: "rgba(0,0,0,0.2)" }}>
                        <select
                            className="w-full p-2 rounded text-xs border cursor-pointer"
                            style={{ background: "black", color: "var(--astro-teal)", border: "1px solid rgba(0,255,209,0.2)" }}
                            onChange={e => setSelectedStar(BRIGHT_STARS.find(s => s.name === e.target.value) || BRIGHT_STARS[0])}
                        >
                            {BRIGHT_STARS.map(s => <option key={s.name} value={s.name}>{s.name.toUpperCase()}</option>)}
                        </select>

                        {starAltAz ? (
                            <div className="flex items-center justify-between px-1">
                                <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.6)" }}>TARGET POSITION:</span>
                                <span className="text-[10px] font-bold" style={{ color: "var(--astro-gold)" }}>ALT {starAltAz.alt.toFixed(1)}° / AZ {starAltAz.az.toFixed(0)}°</span>
                            </div>
                        ) : selectedStar && (
                            <p className="text-[10px] text-orange-300">
                                ⚠ {language === 'fr' ? 'Alt/Az non calculable — backend hors ligne ou étoile sous l\'horizon' : 'Cannot compute Alt/Az — backend offline or star below horizon'}
                            </p>
                        )}

                        <div className="flex items-center gap-2">
                            <button disabled={isPending} onClick={startStarGoto}
                                className="flex-1 flex items-center justify-center gap-1 h-8 rounded-md text-sm border cursor-pointer disabled:opacity-60 transition-colors"
                                style={{ borderColor: "var(--astro-gold)", color: "var(--astro-gold)" }}>
                                {isPending && <Spinner size="xs" color="var(--astro-gold)" />}GOTO
                            </button>
                            <button disabled={isPending} onClick={syncStar}
                                className="flex-1 flex items-center justify-center gap-1 h-8 rounded-md text-sm text-white bg-green-700 hover:bg-green-600 cursor-pointer disabled:opacity-60 transition-colors">
                                {isPending && <Spinner size="xs" color="white" />}SYNC
                            </button>
                        </div>
                    </div>
                )}

                {step.step === 'complete' && (
                    <div className="flex flex-col items-center gap-4 w-full">
                        <CheckCircle2 size={40} className="text-green-400" />
                        <p className="text-[14px] font-bold text-white">CALIBRATION RÉUSSIE</p>
                        <button onClick={reset}
                            className="w-full h-10 rounded-lg text-white bg-green-700 hover:bg-green-600 font-bold cursor-pointer transition-colors">
                            FERMER LE WIZARD
                        </button>
                    </div>
                )}

                {actionError && (
                    <div className="flex items-center gap-2 p-2 rounded w-full" style={{ background: "rgba(245,101,101,0.1)", border: "1px solid rgba(245,101,101,0.3)" }}>
                        <AlertTriangle size={12} className="text-red-400" />
                        <span className="text-[9px] text-red-400">{actionError}</span>
                    </div>
                )}

                <button onClick={reset}
                    className="flex items-center justify-center gap-1 text-xs cursor-pointer transition-colors"
                    style={{ color: "rgba(255,255,255,0.4)" }}
                    onMouseEnter={e => (e.currentTarget.style.color = "#fc8181")}
                    onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.4)")}>
                    <X size={12} />
                    {language === 'fr' ? 'ANNULER' : 'CANCEL'}
                </button>
            </div>
        </div>
    );
};
