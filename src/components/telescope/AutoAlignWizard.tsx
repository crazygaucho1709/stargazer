// src/components/telescope/AutoAlignWizard.tsx
"use client";

/**
 * AutoAlignWizard — Alignement 100% autonome
 */

import { useState, useRef, useCallback, useEffect } from "react";
import {
    Satellite, Zap, Square, RotateCcw, CheckCircle2, AlertTriangle,
    MapPin, Navigation, Camera, Play, Crosshair, Smartphone
} from "lucide-react";
import { useStargazerStore } from "@/store/useStargazerStore";
import { useAutoAlignSession, ScanCell, AutoAlignState } from "@/hooks/useAutoAlignSession";
import { clientApiUrl } from "@/lib/clientApi";
import { notification } from "@/lib/notificationService";
import { useJog } from "@/hooks/useJog";
import { JogPad } from "./JogPad";
import { useLiveView } from "@/hooks/useLiveView";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LimitPoint { alt: number; az: number; ra: number; dec: number; }
interface TelescopeLimits { low?: LimitPoint; high?: LimitPoint; left?: LimitPoint; right?: LimitPoint; }
interface Zone { altMin: number; altMax: number; azMin: number; azMax: number; }

interface LogEntry { time: string; msg: string; type: 'info' | 'success' | 'error' | 'warn'; }

type AlignPhase =
    | 'limits-setup' | 'zone-confirm' | 'iphone-coarse'
    | 'scanning' | 'complete' | 'failed';

const STATE_LABELS: Record<AutoAlignState, { fr: string; en: string }> = {
    IDLE: { fr: 'INACTIF', en: 'IDLE' },
    INIT: { fr: 'INITIALISATION', en: 'INITIALIZING' },
    PLAN: { fr: 'PLANIFICATION', en: 'PLANNING' },
    SLEWING: { fr: 'DÉPLACEMENT', en: 'SLEWING' },
    SETTLING: { fr: 'STABILISATION', en: 'SETTLING' },
    SCORING: { fr: 'ANALYSE DU CHAMP', en: 'SCORING FIELD' },
    CAPTURING: { fr: 'CAPTURE', en: 'CAPTURING' },
    SOLVING: { fr: 'PLATE SOLVE', en: 'SOLVING' },
    SYNCING: { fr: 'SYNCHRONISATION', en: 'SYNCING' },
    DONE: { fr: 'TERMINÉ', en: 'DONE' },
    ABORTED: { fr: 'ANNULÉ', en: 'ABORTED' },
    FAILED: { fr: 'ÉCHEC', en: 'FAILED' },
};

const LIMIT_KEYS = ['low', 'high', 'left', 'right'] as const;
type LimitKey = typeof LIMIT_KEYS[number];

interface PhoneSensorState {
    alpha: number | null; beta: number | null; gamma: number | null;
    lat: number | null; lon: number | null; accuracy_m: number | null; connected: boolean;
}

function betaToAlt(beta: number | null): number | null {
    if (beta == null) return null;
    return Math.max(0, Math.min(90, 90 - Math.abs(beta)));
}

function fmtRA(h: number): string {
    const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
    const ss = Math.round(((h - hh) * 60 - mm) * 60);
    return `${String(hh).padStart(2, '0')}h ${String(mm).padStart(2, '0')}m ${String(ss).padStart(2, '0')}s`;
}

function fmtDEC(d: number): string {
    const sign = d >= 0 ? '+' : '-', abs = Math.abs(d);
    const deg = Math.floor(abs), min = Math.floor((abs - deg) * 60);
    const sec = Math.round(((abs - deg) * 60 - min) * 60);
    return `${sign}${String(deg).padStart(2, '0')}° ${String(min).padStart(2, '0')}' ${String(sec).padStart(2, '0')}"`;
}

function nowStr(): string {
    return new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

function Spinner({ size = "sm", color = "var(--astro-teal)" }: { size?: "xs" | "sm"; color?: string }) {
    const cls = size === "xs" ? "w-3 h-3 border" : "w-4 h-4 border-2";
    return <div className={`${cls} border-white/20 rounded-full animate-spin`} style={{ borderTopColor: color }} />;
}

// ─── Sky Dome ────────────────────────────────────────────────────────────────

const LIMIT_META: Record<LimitKey, { fr: string; en: string; frDesc: string; enDesc: string; color: string }> = {
    low:   { fr: 'LIMITE BASSE',  en: 'LOW LIMIT',   frDesc: "Pointez la position la plus basse souhaitée (horizon + garde de sécurité)", enDesc: "Aim at the lowest observable position (horizon + safety margin)", color: '#f6ad55' },
    high:  { fr: 'LIMITE HAUTE',  en: 'HIGH LIMIT',  frDesc: "Pointez la position la plus haute (évitez le zénith strict ±5°)",           enDesc: "Aim at the highest observable position (avoid strict zenith ±5°)", color: '#63b3ed' },
    left:  { fr: 'LIMITE GAUCHE', en: 'LEFT LIMIT',  frDesc: "Pointez la limite Est (câbles / obstacle à gauche)",                        enDesc: "Aim at the East/left limit (cables or physical obstruction)", color: '#68d391' },
    right: { fr: 'LIMITE DROITE', en: 'RIGHT LIMIT', frDesc: "Pointez la limite Ouest (câbles / obstacle à droite)",                      enDesc: "Aim at the West/right limit (cables or physical obstruction)", color: '#fc8181' },
};

const CELL_COLORS: Record<ScanCell['status'], string> = {
    pending: 'rgba(255,255,255,0.15)',
    slewing: 'var(--astro-teal)',
    scored: '#63b3ed',
    skipped: 'rgba(255,255,255,0.3)',
    solving: '#f6ad55',
    solved: '#68d391',
    failed: '#fc8181',
};

const SkyDome = ({ zone, limits, cells = [], liveAlt, liveAz }: {
    zone?: Zone; limits: TelescopeLimits; cells?: ScanCell[]; liveAlt?: number; liveAz?: number;
}) => {
    const W = 200, H = 100, CX = W / 2, CY = H * 0.92, R = H * 0.86;
    const toXY = (alt: number, az: number) => {
        const r = R * (1 - alt / 90), theta = ((az - 90) * Math.PI) / 180;
        return { x: CX + r * Math.cos(theta), y: CY - r * Math.sin(theta) };
    };
    let zonePath = '';
    if (zone) {
        const pts = [
            ...Array.from({ length: 12 }, (_, i) => toXY(zone.altMin, zone.azMin + (i / 11) * (zone.azMax - zone.azMin))),
            ...Array.from({ length: 12 }, (_, i) => toXY(zone.altMax, zone.azMax - (i / 11) * (zone.azMax - zone.azMin))),
        ];
        zonePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + ' Z';
    }
    const livePos = liveAlt !== undefined && liveAz !== undefined ? toXY(liveAlt, liveAz) : null;
    return (
        <div className="rounded-lg p-2" style={{ background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <p className="text-[8px] mb-1 tracking-[0.08em]" style={{ color: "rgba(255,255,255,0.4)" }}>CARTE CIEL</p>
            <svg width={W} height={H} style={{ display: 'block', margin: '0 auto' }}>
                <path d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
                {[30, 60].map(alt => {
                    const r = R * (1 - alt / 90);
                    return <ellipse key={alt} cx={CX} cy={CY} rx={r} ry={r * 0.38} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" strokeDasharray="3,3" />;
                })}
                {zonePath && <path d={zonePath} fill="rgba(0,255,209,0.08)" stroke="rgba(0,255,209,0.3)" strokeWidth="1" />}
                {LIMIT_KEYS.map(key => {
                    const lp = limits[key]; if (!lp) return null;
                    const p = toXY(lp.alt, lp.az);
                    const colors: Record<LimitKey, string> = { low: '#f6ad55', high: '#63b3ed', left: '#68d391', right: '#fc8181' };
                    const labels: Record<LimitKey, string> = { low: 'B', high: 'H', left: 'G', right: 'D' };
                    return <g key={key}><circle cx={p.x} cy={p.y} r={5} fill={colors[key]} opacity={0.9} /><text x={p.x} y={p.y + 3.5} textAnchor="middle" fontSize="7" fill="black" fontWeight="bold">{labels[key]}</text></g>;
                })}
                {cells.map((c) => {
                    const p = toXY(c.alt, c.az);
                    const active = c.status === 'slewing' || c.status === 'solving';
                    return <circle key={c.i} cx={p.x} cy={p.y}
                        r={c.status === 'solved' ? 2.5 : active ? 2.2 : 1.2}
                        fill={CELL_COLORS[c.status]}
                        opacity={c.status === 'pending' ? 0.5 : 0.95} />;
                })}
                {livePos && <g><circle cx={livePos.x} cy={livePos.y} r={5} fill="none" stroke="white" strokeWidth="1.5" opacity={0.8} /><circle cx={livePos.x} cy={livePos.y} r={2} fill="white" opacity={0.9} /></g>}
                <text x={CX} y={7} textAnchor="middle" fontSize="6" fill="rgba(255,255,255,0.25)">N</text>
                <text x={CX} y={H - 1} textAnchor="middle" fontSize="6" fill="rgba(255,255,255,0.25)">S</text>
                <text x={2} y={CY + 3} textAnchor="start" fontSize="6" fill="rgba(255,255,255,0.25)">E</text>
                <text x={W - 2} y={CY + 3} textAnchor="end" fontSize="6" fill="rgba(255,255,255,0.25)">O</text>
            </svg>
        </div>
    );
};

// ─── Main Component ───────────────────────────────────────────────────────────

export const AutoAlignWizard = () => {
    const { language, config, setPosition, detectedMount, mountLimits, setMountLimits } = useStargazerStore();
    const jog = useJog();
    const liveView = useLiveView();
    const L = (fr: string, en: string) => language === 'fr' ? fr : en;

    const bridgeIp = (() => {
        try { return new URL(config.astroberryUrl).hostname + ':5005'; }
        catch { return (config.astroberryUrl || '127.0.0.1:5005').replace(/^https?:\/\//, ''); }
    })();

    const [phase, setPhase] = useState<AlignPhase>('limits-setup');
    const [limits, setLimits] = useState<TelescopeLimits>({});
    const [zone, setZone] = useState<Zone | null>(null);
    const [logs, setLogs] = useState<LogEntry[]>([]);

    useEffect(() => {
        if (mountLimits) {
            setLimits({
                low:   { alt: mountLimits.minAlt, az: 180, ra: 0, dec: 0 },
                high:  { alt: mountLimits.maxAlt, az: 180, ra: 0, dec: 0 },
                left:  { alt: 45, az: mountLimits.minAz, ra: 0, dec: 0 },
                right: { alt: 45, az: mountLimits.maxAz, ra: 0, dec: 0 },
            });
        }
    }, [mountLimits]);

    const session = useAutoAlignSession();
    const finalRa  = session.result?.sync?.ra_h ?? null;
    const finalDec = session.result?.sync?.dec ?? null;

    const [phoneSensor, setPhoneSensor] = useState<PhoneSensorState>({
        alpha: null, beta: null, gamma: null, lat: null, lon: null, accuracy_m: null, connected: false,
    });
    const phoneSensorRef = useRef<PhoneSensorState>(phoneSensor);
    const [phoneRaDec, setPhoneRaDec] = useState<{ ra: number; dec: number } | null>(null);
    const [isSyncing,      setIsSyncing]      = useState(false);
    const [iphoneSyncDone, setIphoneSyncDone] = useState(false);

    const [liveAlt, setLiveAlt] = useState<number | undefined>();
    const [liveAz,  setLiveAz]  = useState<number | undefined>();
    const [liveRa,  setLiveRa]  = useState<number | undefined>();
    const [liveDec, setLiveDec] = useState<number | undefined>();
    const [recording, setRecording] = useState<LimitKey | null>(null);
    const [isMountConnected, setIsMountConnected] = useState<boolean>(true);
    const [isConnectingMount, setIsConnectingMount] = useState<boolean>(false);

    const isLiveStreaming = liveView.isLive;
    const ccdImage        = liveView.streamUrl;
    const streamStatus    = liveView.status;

    const [isPolling, setIsPolling] = useState(false);
    const [ccdError,  setCcdError]  = useState(false);

    const abortRef  = useRef(false);
    const logEndRef = useRef<HTMLDivElement>(null);

    const log = useCallback((msg: string, type: LogEntry['type'] = 'info') => {
        setLogs(prev => [...prev, { time: nowStr(), msg, type }]);
        setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
    }, []);

    useEffect(() => {
        if (phase !== 'limits-setup' && phase !== 'zone-confirm') return;
        let active = true, timerId: NodeJS.Timeout | null = null;
        const poll = async () => {
            if (!active) return;
            setIsPolling(true);
            try {
                const ac = new AbortController();
                const t = setTimeout(() => ac.abort(), 5000);
                const res = await fetch(clientApiUrl('/api/indi/mount/status'), { cache: 'no-store', signal: ac.signal });
                clearTimeout(t);
                if (!res.ok) { if (active) setIsMountConnected(false); return; }
                const data = await res.json();
                if (active) setIsMountConnected(!!data.connected);
                if (!data.connected || !active) return;
                const raHours = (data.ra ?? 0) / 15, decDeg = data.dec ?? 0;
                if (active) { setLiveRa(raHours); setLiveDec(decDeg); }
                // lat/lon omis : le backend résout le site (gpsd → monture → fallback)
                const convRes = await fetch(clientApiUrl('/api/indi/astro/coords'), {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ra: raHours, dec: decDeg }), signal: ac.signal
                });
                if (convRes.ok) {
                    const conv = await convRes.json();
                    if (conv.success && active) { setLiveAlt(conv.alt); setLiveAz(conv.az); }
                    else if (active) { setLiveAlt(0.0); setLiveAz(0.0); }
                } else if (active) { setLiveAlt(0.0); setLiveAz(0.0); }
            } catch { /* background poll — silent */ }
            finally {
                if (active) { setIsPolling(false); timerId = setTimeout(poll, 2500); }
            }
        };
        poll();
        return () => { active = false; if (timerId) clearTimeout(timerId); };
    }, [phase]);

    const startLiveView = liveView.start;
    const stopLiveView  = liveView.stop;

    useEffect(() => { phoneSensorRef.current = phoneSensor; }, [phoneSensor]);

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
                } catch { /* ignore malformed */ }
            };
            ws.onopen  = () => setPhoneSensor(p => ({ ...p, connected: true }));
            ws.onclose = () => { setPhoneSensor(p => ({ ...p, connected: false })); if (active) timerId = setTimeout(connect, 3000); };
            ws.onerror = () => ws?.close();
        };
        connect();
        return () => { active = false; if (timerId) clearTimeout(timerId); ws?.close(); };
    }, []);

    useEffect(() => {
        if (phase !== 'iphone-coarse') return;
        let active = true;
        const update = async () => {
            const s = phoneSensorRef.current, az = s.alpha, alt = betaToAlt(s.beta);
            if (az == null || alt == null) return;
            const radec = await altazToRaDec(alt, az);
            if (active && radec) setPhoneRaDec(radec);
        };
        update();
        const id = setInterval(update, 2000);
        return () => { active = false; clearInterval(id); };
    }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        return () => {
            abortRef.current = true;
            fetch(clientApiUrl('/api/indi/mount'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'abort', device: detectedMount || config.driverInstance || 'Celestron GPS', ip: bridgeIp }) }).catch(() => {});
            fetch(clientApiUrl('/api/indi/mount'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'jog', direction: 'up', state: 'stop', device: detectedMount || config.driverInstance || 'Celestron GPS', ip: bridgeIp, timestamp: Date.now() }) }).catch(() => {});
            fetch(clientApiUrl('/api/indi/liveview'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'stop' }) }).catch(() => {});
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const connectHardware = async () => {
        setIsConnectingMount(true);
        try { await fetch(clientApiUrl('/api/hardware/connect'), { method: 'POST' }); await new Promise(r => setTimeout(r, 2000)); }
        catch { /* silent retry */ }
        setIsConnectingMount(false);
    };

    const [isReconnectingCamera, setIsReconnectingCamera] = useState(false);

    const reconnectCamera = async () => {
        setIsReconnectingCamera(true); setCcdError(false);
        const ac = new AbortController(); const timeoutId = setTimeout(() => ac.abort(), 25_000);
        try {
            const res = await fetch(clientApiUrl('/api/indi/liveview'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reconnect-camera' }), signal: ac.signal });
            clearTimeout(timeoutId);
            const data = await res.json().catch(() => ({}));
            if (!data.success) { notification.error("Reconnexion caméra échouée", { description: data.error || "Vérifiez le câble USB et le mode PTP sur la Canon", source: "Caméra" }); return; }
            await liveView.start();
        } catch (err: unknown) {
            clearTimeout(timeoutId);
            const isTimeout = (err as { name?: string })?.name === "AbortError";
            notification.error("Reconnexion caméra échouée", { description: isTimeout ? "Timeout (>25s) — SSH vers Pi inaccessible ou opération bloquée" : (err instanceof Error ? err.message : "Impossible de contacter le backend"), source: "Caméra" });
        } finally { setIsReconnectingCamera(false); }
    };

    const syncFromPhone = async () => {
        const s = phoneSensorRef.current, az = s.alpha, alt = betaToAlt(s.beta);
        if (az == null || alt == null) { notification.error("Capteurs iPhone non disponibles", { description: "Aucune donnée de cap/inclinaison reçue du téléphone", source: "iPhone" }); return; }
        setIsSyncing(true);
        try {
            const radec = await altazToRaDec(alt, az);
            if (!radec) { notification.error("Conversion Alt/Az échouée", { description: "Vérifiez la latitude/longitude dans les paramètres", source: "iPhone" }); return; }
            const res = await fetch(clientApiUrl('/api/indi/mount'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'sync', ra: radec.ra * 15.0, dec: radec.dec, device: detectedMount || config.driverInstance || 'Celestron GPS', ip: bridgeIp }) });
            const data = await res.json().catch(() => ({}));
            if (!data.success) { notification.error("Sync INDI échoué", { description: data.error || "La monture n'a pas accepté le SYNC", source: "Monture" }); return; }
            setPhoneRaDec(radec); setIphoneSyncDone(true);
            log(L(`📱 Sync iPhone : Alt=${alt.toFixed(1)}° Az=${az.toFixed(1)}° → RA=${radec.ra.toFixed(4)}h Dec=${radec.dec.toFixed(2)}°`, `📱 iPhone sync : Alt=${alt.toFixed(1)}° Az=${az.toFixed(1)}° → RA=${radec.ra.toFixed(4)}h Dec=${radec.dec.toFixed(2)}°`), 'success');
        } finally { setIsSyncing(false); }
    };

    const recordLimit = async (key: LimitKey) => {
        if (liveAlt === undefined || liveAz === undefined || liveRa === undefined || liveDec === undefined) {
            alert(L('Position non disponible. Vérifiez la connexion INDI.', 'Position unavailable. Check INDI connection.')); return;
        }
        setRecording(key); await new Promise(r => setTimeout(r, 400));
        const storeKeyMap: Record<LimitKey, keyof typeof mountLimits> = { low: 'minAlt', high: 'maxAlt', left: 'minAz', right: 'maxAz' };
        const val = key.includes('left') || key.includes('right') ? liveAz : liveAlt;
        setMountLimits({ [storeKeyMap[key]]: val });
        setLimits(prev => ({ ...prev, [key]: { alt: liveAlt, az: liveAz, ra: liveRa, dec: liveDec } }));
        setRecording(null);
    };

    const confirmZone = () => {
        const { low, high, left, right } = limits; if (!low || !high || !left || !right) return;
        stopLiveView();
        const azMin = Math.min(left.az, right.az), azMax = Math.max(left.az, right.az);
        setZone({ altMin: Math.min(low.alt, high.alt), altMax: Math.max(low.alt, high.alt), azMin, azMax: azMax - azMin > 180 ? azMin + 360 : azMax });
        setPhase('zone-confirm');
    };

    const altazToRaDec = async (alt: number, az: number): Promise<{ ra: number; dec: number } | null> => {
        try {
            // lat/lon omis : le backend résout le site (gpsd → monture → fallback)
            const res = await fetch(clientApiUrl('/api/indi/astro/altaz_to_radec'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ alt, az }) });
            if (!res.ok) return null;
            const data = await res.json();
            return data.success ? { ra: data.ra, dec: data.dec } : null;
        } catch { return null; }
    };

    const runAutoAlign = async () => {
        if (!zone) return;
        setLogs([]);
        stopLiveView(); // le backend gère lui-même le live view pendant le scan
        const ok = await session.start(zone, { target_pairs: 3, solve_exposure: 4 });
        if (ok) setPhase('scanning');
    };

    // Suivre l'état de la session backend → phases UI
    useEffect(() => {
        if (phase !== 'scanning') return;
        if (session.state === 'DONE' && session.result?.success) {
            if (session.result.sync) {
                setPosition(fmtRA(session.result.sync.ra_h), fmtDEC(session.result.sync.dec));
            }
            setPhase('complete');
        } else if (session.state === 'FAILED' || session.state === 'ABORTED') {
            setPhase('failed');
        }
    }, [phase, session.state, session.result, setPosition]);

    // ─── Render ───────────────────────────────────────────────────────────────

    const isRunning = phase === 'scanning';
    const allLimitsDefined = LIMIT_KEYS.every(k => !!limits[k]);
    const cellsVisited = session.cells.filter(c => c.status !== 'pending').length;
    const progress = phase === 'complete' ? 100
        : phase === 'failed' ? 0
        : phase !== 'scanning' ? (phase === 'limits-setup' ? 0 : 5)
        : session.state === 'INIT' ? 5
        : session.state === 'PLAN' ? 10
        : session.state === 'SYNCING' ? 95
        : session.cells.length > 0 ? Math.min(90, 10 + Math.round((cellsVisited / session.cells.length) * 80))
        : 10;
    const stateLabel = STATE_LABELS[session.state] ?? STATE_LABELS.IDLE;
    const logColors: Record<LogEntry['type'], string> = { info: 'rgba(255,255,255,0.55)', success: '#68d391', error: '#fc8181', warn: '#f6ad55' };

    return (
        <div className="flex flex-col gap-4 w-full">

            {/* Header */}
            <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-md" style={{ background: "rgba(0,255,209,0.1)" }}>
                        <Satellite size={16} style={{ color: "var(--astro-teal)" }} />
                    </div>
                    <div className="flex flex-col gap-0">
                        <span className="text-[12px] font-bold tracking-[0.15em] text-white">
                            {L("AUTO-ALIGN AUTONOME", "AUTONOMOUS AUTO-ALIGN")}
                        </span>
                        <span className="text-[8px] tracking-[0.04em]" style={{ color: "rgba(255,255,255,0.4)" }}>
                            {phase === 'limits-setup'
                                ? L("ÉTAPE 1/2 — DÉFINIR LES LIMITES PHYSIQUES", "STEP 1/2 — DEFINE PHYSICAL LIMITS")
                                : L("ÉTAPE 2/2 — SOLVE → SYNC → TRACKING", "STEP 2/2 — SOLVE → SYNC → TRACKING")}
                        </span>
                    </div>
                </div>
                <span className="inline-flex items-center px-2 py-1 rounded text-[8px] border"
                    style={{
                        background: phase === 'complete' ? 'rgba(72,187,120,0.18)' : phase === 'failed' ? 'rgba(245,101,101,0.18)' : isRunning ? 'rgba(0,255,209,0.12)' : 'rgba(255,255,255,0.06)',
                        color: phase === 'complete' ? '#68d391' : phase === 'failed' ? '#fc8181' : isRunning ? 'var(--astro-teal)' : 'rgba(255,255,255,0.5)',
                        borderColor: phase === 'complete' ? 'rgba(72,187,120,0.3)' : phase === 'failed' ? 'rgba(245,101,101,0.3)' : isRunning ? 'rgba(0,255,209,0.25)' : 'rgba(255,255,255,0.08)',
                    }}>
                    {phase.replace(/-/g, ' ').toUpperCase()}
                </span>
            </div>

            {/* PHASE : LIMITS SETUP */}
            {phase === 'limits-setup' && (
                <div className="flex flex-col gap-3">
                    <div className="p-3 rounded-lg" style={{ background: "rgba(255,195,0,0.05)", border: "1px solid rgba(255,195,0,0.2)" }}>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-[14px]">🎯</span>
                            <span className="text-[10px] font-bold tracking-[0.06em]" style={{ color: "#fefcbf" }}>
                                {L("APPRENEZ AU TÉLESCOPE SES LIMITES", "TEACH THE TELESCOPE ITS LIMITS")}
                            </span>
                        </div>
                        <p className="text-[8px] leading-[1.6]" style={{ color: "rgba(255,255,255,0.6)" }}>
                            {L("Déplacez le télescope vers chaque position limite avec la raquette ou les flèches ci-dessous, puis appuyez sur 📍 Enregistrer. Stargazer lit la position réelle depuis INDI.", "Move the telescope to each limit position with the handset or the arrows below, then press 📍 Record. Stargazer reads the actual position from INDI.")}
                        </p>
                    </div>

                    <div className="grid gap-4 items-start" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                        {/* Left column */}
                        <div className="flex flex-col gap-3">
                            {/* Live position + jog pad */}
                            <div className="flex items-center justify-between gap-3 p-2.5 rounded-lg" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                                <div className="flex flex-col gap-0.5">
                                    <div className="flex items-center gap-1">
                                        <span className="text-[8px] tracking-[0.06em]" style={{ color: "rgba(255,255,255,0.4)" }}>
                                            {L("POSITION ACTUELLE", "CURRENT POSITION")}
                                        </span>
                                        {isPolling && <Spinner size="xs" color="rgba(255,255,255,0.3)" />}
                                    </div>
                                    {!isMountConnected ? (
                                        <div className="flex flex-col gap-1">
                                            <span className="text-[8px] font-bold text-red-400">
                                                {L("⚠️ TÉLESCOPE DÉCONNECTÉ", "⚠️ MOUNT DISCONNECTED")}
                                            </span>
                                            <button
                                                disabled={isConnectingMount}
                                                onClick={connectHardware}
                                                className="flex items-center justify-center gap-1 h-[22px] px-2 rounded text-[8px] font-bold text-white bg-red-600 hover:bg-red-500 disabled:opacity-60 cursor-pointer"
                                            >
                                                {isConnectingMount && <Spinner size="xs" color="white" />}
                                                {L("CONNECTER", "CONNECT MOUNT")}
                                            </button>
                                        </div>
                                    ) : liveAlt !== undefined ? (
                                        <>
                                            <div className="flex items-end gap-3">
                                                <div className="flex flex-col gap-0">
                                                    <span className="text-[7px]" style={{ color: "rgba(255,255,255,0.4)" }}>ALT</span>
                                                    <span className="text-[13px] font-bold text-white font-mono leading-none">{liveAlt.toFixed(1)}°</span>
                                                </div>
                                                <div className="flex flex-col gap-0">
                                                    <span className="text-[7px]" style={{ color: "rgba(255,255,255,0.4)" }}>AZ</span>
                                                    <span className="text-[13px] font-bold text-white font-mono leading-none">{liveAz!.toFixed(1)}°</span>
                                                </div>
                                            </div>
                                            <span className="text-[7px] font-mono" style={{ color: "rgba(255,255,255,0.3)" }}>RA {liveRa !== undefined ? fmtRA(liveRa) : '—'}</span>
                                        </>
                                    ) : (
                                        <div className="flex items-center gap-1">
                                            <Spinner size="xs" color="rgba(255,255,255,0.4)" />
                                            <span className="text-[8px]" style={{ color: "rgba(255,255,255,0.4)" }}>{L("Lecture INDI...", "Reading INDI...")}</span>
                                        </div>
                                    )}
                                </div>
                                <div className="flex flex-col items-center gap-1">
                                    <div className="flex items-center gap-1">
                                        <span className="text-[7px] tracking-[0.06em]" style={{ color: "rgba(255,255,255,0.4)" }}>{L("DÉPLACEMENT FIN", "FINE JOG")}</span>
                                        {jog.activeDir && (
                                            <span className="text-[6px] font-bold tracking-[0.05em]" style={{ color: "var(--astro-teal)", animation: 'pulse 0.6s infinite alternate' }}>
                                                ▶ {jog.activeDir.toUpperCase()}
                                            </span>
                                        )}
                                    </div>
                                    <JogPad jog={jog} />
                                </div>
                            </div>

                            {/* 4 limit rows */}
                            <div className="flex flex-col gap-2">
                                {LIMIT_KEYS.map(key => {
                                    const meta = LIMIT_META[key], defined = !!limits[key], lp = limits[key], isRec = recording === key;
                                    return (
                                        <div key={key} className="p-2.5 rounded-lg"
                                            style={{ background: defined ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.2)', border: `1px solid ${defined ? `${meta.color}33` : 'rgba(255,255,255,0.05)'}` }}>
                                            <div className="flex items-center justify-between">
                                                <div className="flex flex-col gap-0.5 flex-1">
                                                    <div className="flex items-center gap-1.5">
                                                        <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: meta.color }} />
                                                        <span className="text-[9px] font-bold tracking-[0.1em]" style={{ color: "rgba(255,255,255,0.7)" }}>{L(meta.fr, meta.en)}</span>
                                                        {defined && <span className="text-[8px]">✅</span>}
                                                    </div>
                                                    {defined && lp ? (
                                                        <span className="text-[8px] text-white font-mono">Alt {lp.alt.toFixed(1)}° / Az {lp.az.toFixed(1)}°</span>
                                                    ) : (
                                                        <span className="text-[7px]" style={{ color: "rgba(255,255,255,0.4)" }}>{L(meta.frDesc, meta.enDesc)}</span>
                                                    )}
                                                </div>
                                                <button
                                                    disabled={isRec || liveAlt === undefined}
                                                    onClick={() => recordLimit(key)}
                                                    className="flex items-center justify-center gap-1 h-7 px-3 ml-2 shrink-0 rounded-lg text-[9px] font-bold tracking-[0.06em] border transition-colors cursor-pointer disabled:opacity-40"
                                                    style={{
                                                        background: defined ? 'rgba(255,255,255,0.06)' : `${meta.color}22`,
                                                        color: defined ? 'rgba(255,255,255,0.6)' : meta.color,
                                                        borderColor: defined ? 'rgba(255,255,255,0.1)' : `${meta.color}55`,
                                                    }}
                                                >
                                                    {isRec ? <Spinner size="xs" color={meta.color} /> : !defined && <MapPin size={12} />}
                                                    {defined ? L('RÉENREGISTRER', 'RE-RECORD') : L('ENREGISTRER', 'RECORD')}
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Confirm button */}
                            <button
                                disabled={!allLimitsDefined}
                                onClick={confirmZone}
                                className="w-full flex items-center justify-center gap-1 h-10 rounded-lg text-[11px] font-bold tracking-[0.1em] border transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                                style={{ background: "rgba(0,255,209,0.1)", color: "var(--astro-teal)", borderColor: "rgba(0,255,209,0.3)" }}
                            >
                                <Navigation size={12} />
                                {L("CONFIRMER LA ZONE ET LANCER", "CONFIRM ZONE AND START")}
                                {!allLimitsDefined && (
                                    <span className="text-[8px] ml-2" style={{ color: "rgba(255,255,255,0.4)" }}>
                                        ({LIMIT_KEYS.filter(k => !limits[k]).length} {L("manquante(s)", "missing")})
                                    </span>
                                )}
                            </button>
                        </div>

                        {/* Right column: camera + sky map */}
                        <div className="flex flex-col gap-3">
                            <div className="p-2.5 rounded-lg overflow-hidden relative" style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.08)" }}>
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-1.5">
                                        <Camera size={14} style={{ color: "var(--astro-gold)" }} />
                                        <span className="text-[9px] font-bold tracking-[0.08em]" style={{ color: "rgba(255,255,255,0.8)" }}>{L("RETOUR IMAGE EN DIRECT", "CAMERA LIVE FEED")}</span>
                                    </div>
                                    <button
                                        onClick={isLiveStreaming ? stopLiveView : startLiveView}
                                        className="flex items-center gap-1 h-5 px-2.5 rounded text-[8px] font-bold text-white cursor-pointer"
                                        style={{ background: isLiveStreaming ? "#e53e3e" : "#38a169" }}
                                    >
                                        {isLiveStreaming ? (
                                            <><div className="w-1.5 h-1.5 rounded-full bg-white" style={{ animation: "pulse 1s infinite alternate" }} /><span>STOP</span></>
                                        ) : (
                                            <><Play size={8} fill="currentColor" /><span>LIVE</span></>
                                        )}
                                    </button>
                                </div>
                                <div className="relative w-full h-[160px] bg-black rounded-md overflow-hidden flex items-center justify-center" style={{ border: "1px solid rgba(255,255,255,0.04)" }}>
                                    {isLiveStreaming ? (
                                        ccdError ? (
                                            <div className="flex flex-col items-center gap-1 p-3 text-center">
                                                <AlertTriangle size={24} style={{ color: "var(--astro-gold)" }} />
                                                <span className="text-[9px] font-bold" style={{ color: "var(--astro-gold)" }}>{L("ERREUR DE FLUX", "STREAM ERROR")}</span>
                                                <span className="text-[7px]" style={{ color: "rgba(255,255,255,0.5)" }}>{L("Échec du chargement de l'image", "Failed to load camera frame")}</span>
                                            </div>
                                        ) : ccdImage ? (
                                            <>
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img src={ccdImage} alt="Live Feed" crossOrigin="anonymous" referrerPolicy="no-referrer"
                                                    style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000" }}
                                                    onError={() => { setCcdError(true); liveView.stop(); notification.error("Flux caméra perdu", { description: L("Le flux MJPEG s'est interrompu. Vérifiez que la Canon est connectée à INDI et en mode live view.", "MJPEG stream interrupted. Check that the Canon is connected to INDI and in live view mode."), source: "Caméra" }); }}
                                                    onLoad={() => setCcdError(false)}
                                                />
                                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "rgba(255,179,71,0.4)" }}>
                                                    <Crosshair size={80} strokeWidth={1} />
                                                </div>
                                                <span className="absolute top-2 left-2 text-[7px] px-1.5 py-0.5 rounded font-bold" style={{ background: "rgba(229,57,53,0.9)", color: "white" }}>LIVE</span>
                                            </>
                                        ) : (
                                            <Spinner size="sm" />
                                        )
                                    ) : (
                                        <div className="flex flex-col items-center gap-2 p-4 text-center">
                                            <Camera size={32} style={{ color: "rgba(255,255,255,0.2)" }} />
                                            <span className="text-[9px]" style={{ color: "rgba(255,255,255,0.4)" }}>{L("FLUX VIDÉO EN VEILLE", "CAMERA FEED STANDBY")}</span>
                                            <span className="text-[7px]" style={{ color: "rgba(255,255,255,0.3)" }}>{L("Activez le LIVE pour voir le viseur", "Start LIVE to show camera view")}</span>
                                        </div>
                                    )}
                                </div>
                                {streamStatus && streamStatus !== "LIVE" && (
                                    <div className="flex flex-col gap-1 mt-1">
                                        <span className="text-[8px] text-center" style={{ color: streamStatus.startsWith("❌") ? "#fc8181" : "rgba(255,255,255,0.5)" }}>{streamStatus}</span>
                                        {streamStatus.startsWith("❌") && (
                                            <button disabled={isReconnectingCamera} onClick={reconnectCamera}
                                                className="flex items-center justify-center gap-1 h-5 px-2.5 rounded text-[8px] font-bold w-full cursor-pointer disabled:opacity-60"
                                                style={{ background: "rgba(246,173,85,0.15)", color: "#f6ad55", border: "1px solid rgba(246,173,85,0.3)" }}>
                                                {isReconnectingCamera && <Spinner size="xs" color="#f6ad55" />}
                                                🔌 {L("RECONNECTER CAMÉRA", "RECONNECT CAMERA")}
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                            <SkyDome zone={undefined} limits={limits} liveAlt={liveAlt} liveAz={liveAz} />
                        </div>
                    </div>
                </div>
            )}

            {/* PHASE : ZONE CONFIRM */}
            {phase === 'zone-confirm' && zone && (
                <div className="flex flex-col gap-3">
                    <div className="p-3 rounded-lg" style={{ background: "rgba(0,255,209,0.04)", border: "1px solid rgba(0,255,209,0.15)" }}>
                        <span className="text-[9px] font-bold tracking-[0.1em] block mb-2" style={{ color: "var(--astro-teal)" }}>
                            {L("✅ ZONE ENREGISTRÉE — RÉCAPITULATIF", "✅ ZONE RECORDED — SUMMARY")}
                        </span>
                        <div className="grid grid-cols-2 gap-2">
                            {LIMIT_KEYS.map(key => {
                                const meta = LIMIT_META[key], lp = limits[key]!;
                                return (
                                    <div key={key} className="p-2 rounded-md" style={{ background: "rgba(0,0,0,0.2)" }}>
                                        <div className="flex items-center gap-1 mb-0.5">
                                            <div className="w-[5px] h-[5px] rounded-full" style={{ background: meta.color }} />
                                            <span className="text-[7px]" style={{ color: "rgba(255,255,255,0.5)" }}>{L(meta.fr, meta.en)}</span>
                                        </div>
                                        <span className="text-[9px] font-bold text-white font-mono">Alt {lp.alt.toFixed(1)}° Az {lp.az.toFixed(1)}°</span>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="mt-2 pt-2 border-t border-white/5">
                            <div className="flex items-center justify-center gap-8">
                                <div className="flex flex-col items-center gap-0">
                                    <span className="text-[7px]" style={{ color: "rgba(255,255,255,0.4)" }}>PLAGE ALTITUDE</span>
                                    <span className="text-[10px] font-bold text-white font-mono">{zone.altMin.toFixed(1)}° → {zone.altMax.toFixed(1)}°</span>
                                </div>
                                <div className="flex flex-col items-center gap-0">
                                    <span className="text-[7px]" style={{ color: "rgba(255,255,255,0.4)" }}>PLAGE AZIMUT</span>
                                    <span className="text-[10px] font-bold text-white font-mono">{zone.azMin.toFixed(1)}° → {zone.azMax.toFixed(1)}°</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <SkyDome zone={zone} limits={limits} />
                    <div className="p-3 rounded-lg" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
                        <span className="text-[8px] block text-center mb-2 tracking-[0.08em]" style={{ color: "rgba(255,255,255,0.4)" }}>
                            {L("CHOISIR LA MÉTHODE D'ALIGNEMENT INITIAL", "CHOOSE INITIAL ALIGNMENT METHOD")}
                        </span>
                        <div className="flex flex-col gap-2">
                            <button onClick={() => setPhase('iphone-coarse')}
                                className="w-full flex items-center justify-center gap-1.5 h-9 rounded-lg text-[10px] font-bold tracking-[0.08em] border transition-colors cursor-pointer"
                                style={{ background: "rgba(147,112,219,0.12)", color: "#b39ddb", borderColor: "rgba(147,112,219,0.35)" }}>
                                <Smartphone size={12} />{L("SYNC VIA TÉLÉPHONE (JOUR / TEST)", "SYNC VIA PHONE (DAY / TEST)")}
                            </button>
                            <button onClick={runAutoAlign}
                                className="w-full flex items-center justify-center gap-1.5 h-9 rounded-lg text-[10px] font-bold tracking-[0.08em] border transition-colors cursor-pointer"
                                style={{ background: "rgba(0,255,209,0.08)", color: "var(--astro-teal)", borderColor: "rgba(0,255,209,0.25)" }}>
                                <Zap size={12} />{L("ASTROMÉTRIE DIRECTE (NUIT)", "DIRECT ASTROMETRY (NIGHT)")}
                            </button>
                        </div>
                    </div>
                    <button className="text-[9px] cursor-pointer" style={{ color: "rgba(255,255,255,0.4)" }} onClick={() => setPhase('limits-setup')}>
                        {L("← MODIFIER LA ZONE", "← MODIFY ZONE")}
                    </button>
                </div>
            )}

            {/* PHASE : PHONE COARSE SYNC */}
            {phase === 'iphone-coarse' && (
                <div className="flex flex-col gap-3">
                    <div className="p-3 rounded-lg"
                        style={{ background: phoneSensor.connected ? "rgba(147,112,219,0.06)" : "rgba(255,107,107,0.06)", border: `1px solid ${phoneSensor.connected ? "rgba(147,112,219,0.3)" : "rgba(255,107,107,0.3)"}` }}>
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <Smartphone size={14} style={{ color: phoneSensor.connected ? "#b39ddb" : "#fc8181" }} />
                                <span className="text-[9px] font-bold tracking-[0.08em]" style={{ color: phoneSensor.connected ? "#b39ddb" : "#fc8181" }}>
                                    {phoneSensor.connected ? L("TÉLÉPHONE CONNECTÉ", "PHONE CONNECTED") : L("EN ATTENTE DU TÉLÉPHONE…", "WAITING FOR PHONE…")}
                                </span>
                            </div>
                            {!phoneSensor.connected && <Spinner size="xs" color="#9f7aea" />}
                        </div>
                        {!phoneSensor.connected && (
                            <p className="text-[8px]" style={{ color: "rgba(255,255,255,0.5)" }}>
                                {L("Ouvrez stargazer sur votre téléphone et activez l'envoi des capteurs.", "Open stargazer on your phone and enable sensor streaming.")}
                            </p>
                        )}
                        {phoneSensor.connected && (
                            <div className="grid grid-cols-3 gap-2 mt-1">
                                {[
                                    { label: "CAP (Az)", val: phoneSensor.alpha != null ? `${phoneSensor.alpha.toFixed(1)}°` : '—' },
                                    { label: "ALT",      val: phoneSensor.beta  != null ? `${betaToAlt(phoneSensor.beta)!.toFixed(1)}°` : '—' },
                                    { label: "ROULIS",   val: phoneSensor.gamma != null ? `${phoneSensor.gamma.toFixed(1)}°` : '—' },
                                ].map(({ label, val }) => (
                                    <div key={label} className="flex flex-col items-center gap-0">
                                        <span className="text-[7px]" style={{ color: "rgba(255,255,255,0.4)" }}>{label}</span>
                                        <span className="text-[11px] font-bold text-white font-mono">{val}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {phoneRaDec && (
                        <div className="p-3 rounded-lg" style={{ background: "rgba(0,255,209,0.04)", border: "1px solid rgba(0,255,209,0.15)" }}>
                            <span className="text-[8px] block mb-2 tracking-[0.08em]" style={{ color: "rgba(255,255,255,0.4)" }}>
                                {L("COORDONNÉES CALCULÉES (MàJ ~2s)", "CALCULATED COORDINATES (updated ~2s)")}
                            </span>
                            <div className="flex items-center justify-around">
                                {[{ label: "RA", val: `${phoneRaDec.ra.toFixed(4)}h` }, { label: "DEC", val: `${phoneRaDec.dec.toFixed(2)}°` }].map(({ label, val }) => (
                                    <div key={label} className="flex flex-col items-center gap-0">
                                        <span className="text-[7px]" style={{ color: "rgba(255,255,255,0.4)" }}>{label}</span>
                                        <span className="text-[12px] font-bold font-mono" style={{ color: "var(--astro-teal)" }}>{val}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {iphoneSyncDone && (
                        <div className="p-2 rounded-lg text-center" style={{ background: "rgba(104,211,145,0.06)", border: "1px solid rgba(104,211,145,0.3)" }}>
                            <span className="text-[9px] font-bold text-green-300">
                                {L("✅ SYNC EFFECTUÉ — monture calée sur les coordonnées iPhone", "✅ SYNC DONE — mount aligned to iPhone coordinates")}
                            </span>
                        </div>
                    )}

                    <div className="flex flex-col gap-2">
                        <button
                            disabled={isSyncing || !phoneSensor.connected || phoneSensor.alpha == null}
                            onClick={syncFromPhone}
                            className="w-full flex items-center justify-center gap-1.5 h-10 rounded-lg text-[11px] font-bold tracking-[0.1em] border transition-colors cursor-pointer disabled:opacity-40"
                            style={{ background: iphoneSyncDone ? "rgba(104,211,145,0.1)" : "rgba(147,112,219,0.12)", color: iphoneSyncDone ? "#68d391" : "#b39ddb", borderColor: iphoneSyncDone ? "rgba(104,211,145,0.3)" : "rgba(147,112,219,0.35)" }}
                        >
                            {isSyncing ? <Spinner size="xs" color="currentColor" /> : <Smartphone size={12} />}
                            {iphoneSyncDone ? L("RE-SYNC TÉLÉPHONE", "RE-SYNC PHONE") : L("SYNC DEPUIS LE TÉLÉPHONE", "SYNC FROM PHONE")}
                        </button>

                        {iphoneSyncDone && (
                            <div className="flex gap-2">
                                <button onClick={() => setPhase('complete')}
                                    className="flex-1 h-8 rounded-lg text-[10px] border border-white/20 text-white/60 hover:text-white transition-colors cursor-pointer">
                                    {L("TERMINER", "FINISH")}
                                </button>
                                <button onClick={runAutoAlign}
                                    className="flex-[2] flex items-center justify-center gap-1 h-8 rounded-lg text-[10px] font-bold tracking-[0.08em] border transition-colors cursor-pointer"
                                    style={{ background: "rgba(0,255,209,0.12)", color: "var(--astro-teal)", borderColor: "rgba(0,255,209,0.35)" }}>
                                    <Zap size={12} />{L("AFFINER PAR ASTROMÉTRIE", "REFINE WITH ASTROMETRY")}
                                </button>
                            </div>
                        )}

                        <button className="text-[9px] cursor-pointer" style={{ color: "rgba(255,255,255,0.4)" }}
                            onClick={() => { setIphoneSyncDone(false); setPhoneRaDec(null); setPhase('zone-confirm'); }}>
                            {L("← RETOUR", "← BACK")}
                        </button>
                    </div>
                </div>
            )}

            {/* PHASES D'EXÉCUTION */}
            {(isRunning || phase === 'complete' || phase === 'failed') && (
                <div className="flex flex-col gap-3">
                    {/* Progress bar */}
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                                {isRunning && <Spinner size="xs" />}
                                <span className="text-[9px] tracking-[0.06em]" style={{ color: "rgba(255,255,255,0.5)" }}>
                                    {isRunning ? L(stateLabel.fr, stateLabel.en) : phase.replace(/-/g, ' ').toUpperCase()}
                                </span>
                                {isRunning && session.site && (
                                    <span className="text-[7px] font-mono" style={{ color: "rgba(255,255,255,0.3)" }}>
                                        📍 {session.site.lat.toFixed(4)}°/{session.site.lon.toFixed(4)}° ({session.site.source})
                                    </span>
                                )}
                            </div>
                            <span className="text-[9px] font-bold" style={{ color: phase === 'complete' ? '#68d391' : 'rgba(255,255,255,0.6)' }}>{progress}%</span>
                        </div>
                        <div className="w-full h-[2px] rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                            <div className="h-full rounded-full" style={{
                                width: `${progress}%`, transition: 'width 0.8s ease-out',
                                background: phase === 'failed' ? '#fc8181' : phase === 'complete' ? '#68d391' : 'var(--astro-teal)',
                                boxShadow: phase === 'complete' ? '0 0 8px #68d391' : '0 0 6px var(--astro-teal)',
                            }} />
                        </div>
                    </div>

                    {zone && <SkyDome zone={zone} limits={limits} cells={session.cells} />}

                    {/* Statistiques de scan */}
                    <div className="grid grid-cols-4 gap-2">
                        {[
                            { label: L('CELLULES', 'CELLS'), val: `${cellsVisited}/${session.cells.length}`, color: 'rgba(255,255,255,0.7)' },
                            { label: L('IGNORÉES', 'SKIPPED'), val: String(session.cells.filter(c => c.status === 'skipped').length), color: 'rgba(255,255,255,0.5)' },
                            { label: L('ÉCHECS', 'FAILED'), val: String(session.cells.filter(c => c.status === 'failed').length), color: '#fc8181' },
                            { label: L('PAIRES', 'PAIRS'), val: `${session.pairs.length}/3`, color: '#68d391' },
                        ].map(({ label, val, color }) => (
                            <div key={label} className="p-2 rounded-lg text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <span className="text-[7px] block tracking-[0.08em]" style={{ color: 'rgba(255,255,255,0.4)' }}>{label}</span>
                                <span className="text-[13px] font-bold font-mono" style={{ color }}>{val}</span>
                            </div>
                        ))}
                    </div>

                    {/* Paires résolues */}
                    {session.pairs.length > 0 && (
                        <div className="flex flex-col gap-1">
                            {session.pairs.map((p, i) => (
                                <div key={i} className="flex items-center justify-between p-2 rounded-md" style={{ background: 'rgba(104,211,145,0.05)', border: '1px solid rgba(104,211,145,0.2)' }}>
                                    <span className="text-[8px] font-bold" style={{ color: '#68d391' }}>✅ {L(`PAIRE ${i + 1}`, `PAIR ${i + 1}`)}</span>
                                    <span className="text-[8px] font-mono text-white">{fmtRA(p.solved_ra_h)} / {fmtDEC(p.solved_dec)}</span>
                                    <span className="text-[7px] font-mono" style={{ color: 'rgba(255,255,255,0.4)' }}>Δ {p.offset_ra_deg.toFixed(2)}° / {p.offset_dec_deg.toFixed(2)}°</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {session.logs.length > 0 && (
                        <div className="p-2.5 rounded-md max-h-[150px] overflow-y-auto" style={{ background: "rgba(0,0,0,0.45)", border: "1px solid rgba(255,255,255,0.05)" }}>
                            <div className="flex flex-col gap-0.5">
                                {session.logs.map((msg, i) => (
                                    <span key={i} className="text-[8px] leading-[1.5] whitespace-pre-wrap"
                                        style={{ color: msg.includes('✅') ? '#68d391' : msg.includes('❌') ? '#fc8181' : msg.includes('⚠️') ? '#f6ad55' : 'rgba(255,255,255,0.55)' }}>
                                        {msg}
                                    </span>
                                ))}
                                <div ref={logEndRef} />
                            </div>
                        </div>
                    )}

                    {phase === 'complete' && finalRa !== null && finalDec !== null && (
                        <div className="p-3 rounded-lg" style={{ background: "rgba(72,187,120,0.06)", border: "1px solid rgba(72,187,120,0.25)" }}>
                            <div className="flex items-center gap-2 mb-2">
                                <CheckCircle2 size={20} className="text-green-400" />
                                <span className="text-[11px] font-bold tracking-[0.05em] text-green-300">{L("🎉 TÉLESCOPE ALIGNÉ ET PRÊT", "🎉 TELESCOPE ALIGNED AND READY")}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 mb-2">
                                {[{ label: "RA", val: fmtRA(finalRa) }, { label: "DEC", val: fmtDEC(finalDec) }].map(({ label, val }) => (
                                    <div key={label} className="p-2 rounded-md" style={{ background: "rgba(0,0,0,0.2)" }}>
                                        <span className="text-[7px] block mb-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>{label}</span>
                                        <span className="text-[11px] font-bold text-white font-mono">{val}</span>
                                    </div>
                                ))}
                            </div>
                            <span className="text-[8px] text-green-700">✅ GoTo précis • Suivi sidéral actif • Astrophoto disponible</span>
                        </div>
                    )}

                    {phase === 'failed' && (
                        <div className="p-2.5 rounded-lg flex items-center gap-2" style={{ background: "rgba(245,101,101,0.06)", border: "1px solid rgba(245,101,101,0.2)" }}>
                            <AlertTriangle size={16} className="text-red-400 shrink-0" />
                            <span className="text-[9px] text-red-300">{L("Alignement échoué. Vérifiez la caméra, INDI et les catalogues solve-field.", "Alignment failed. Check camera, INDI connection and solve-field index files.")}</span>
                        </div>
                    )}

                    <div className="flex gap-2">
                        {!isRunning && (
                            <button
                                onClick={() => { setPhase('limits-setup'); setLogs([]); }}
                                className="flex-1 flex items-center justify-center gap-1 h-10 rounded-lg text-[11px] font-bold tracking-[0.1em] border transition-colors cursor-pointer"
                                style={{ background: phase === 'complete' ? 'rgba(72,187,120,0.12)' : 'rgba(0,255,209,0.08)', color: phase === 'complete' ? '#68d391' : 'var(--astro-teal)', borderColor: phase === 'complete' ? 'rgba(72,187,120,0.3)' : 'rgba(0,255,209,0.25)' }}>
                                <RotateCcw size={12} />{phase === 'complete' ? L("REFAIRE L'ALIGNEMENT", "RE-ALIGN") : L("RECOMMENCER", "RESTART")}
                            </button>
                        )}
                        {isRunning && (
                            <button
                                onClick={() => { session.stop(); }}
                                className="flex-1 flex items-center justify-center gap-1 h-10 rounded-lg text-[11px] font-bold tracking-[0.1em] border transition-colors cursor-pointer"
                                style={{ background: "rgba(245,101,101,0.08)", color: "#fc8181", borderColor: "rgba(245,101,101,0.25)" }}>
                                <Square size={12} />{L("INTERROMPRE", "ABORT")}
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
