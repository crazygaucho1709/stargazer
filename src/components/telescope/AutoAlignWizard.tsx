"use client";

/**
 * AutoAlignWizard — Alignement 100% autonome
 *
 * Phase 0: L'utilisateur pointe physiquement le télescope vers chaque limite
 *          (basse, haute, gauche, droite) et appuie sur "Enregistrer".
 *          Stargazer lit la position réelle depuis INDI.
 *
 * Phase 1-3: 3 GoTo aléatoires dans la zone définie → capture 3s → plate solve
 *
 * Phase sync: Sync sur le dernier solve réussi + activation suivi sidéral
 */

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Box, VStack, HStack, Text, Button, Badge, Grid, Icon, Spinner
} from "@chakra-ui/react";
import {
  Satellite, Zap, Square, RotateCcw, CheckCircle2, AlertTriangle,
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight, MapPin, Navigation,
  Camera, Play, Crosshair
} from "lucide-react";
import { useStargazerStore } from "@/store/useStargazerStore";
import { plateSolve, SolvedPosition } from "@/services/plateSolve";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Une position limite enregistrée depuis le télescope */
interface LimitPoint {
  alt: number; // degrés au-dessus de l'horizon
  az:  number; // azimut en degrés (N=0, E=90)
  ra:  number; // heures décimales (pour info)
  dec: number; // degrés décimaux
}

/** Les 4 limites physiques définies par l'utilisateur */
interface TelescopeLimits {
  low?:   LimitPoint; // altitude minimale
  high?:  LimitPoint; // altitude maximale
  left?:  LimitPoint; // azimut minimum (limite Est/gauche)
  right?: LimitPoint; // azimut maximum (limite Ouest/droite)
}

/** Zone d'observation calculée depuis les 4 limites */
interface Zone {
  altMin: number;
  altMax: number;
  azMin:  number;
  azMax:  number;
}

interface CycleResult {
  index:     number;
  targetAlt: number;
  targetAz:  number;
  targetRa?: number;
  targetDec?: number;
  solvedRa?:  number;
  solvedDec?: number;
  source?:    string;
  success:    boolean;
  state: 'pending' | 'slewing' | 'capturing' | 'solving' | 'done' | 'failed';
}

interface LogEntry {
  time: string;
  msg:  string;
  type: 'info' | 'success' | 'error' | 'warn';
}

type AlignPhase =
  | 'limits-setup'             // étape 0 : l'user enseigne les limites
  | 'zone-confirm'             // étape de confirmation de la zone
  | 'preflight'
  | 'cycle-1' | 'cycle-2' | 'cycle-3'
  | 'syncing'
  | 'complete'
  | 'failed';

const PHASE_PROGRESS: Record<AlignPhase, number> = {
  'limits-setup':  0,
  'zone-confirm':  5,
  'preflight':     8,
  'cycle-1':      18,
  'cycle-2':      45,
  'cycle-3':      72,
  'syncing':      92,
  'complete':    100,
  'failed':        0,
};

const LIMIT_KEYS = ['low', 'high', 'left', 'right'] as const;
type LimitKey = typeof LIMIT_KEYS[number];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const rand = (a: number, b: number) => a + Math.random() * (b - a);

function fmtRA(h: number): string {
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  const ss = Math.round(((h - hh) * 60 - mm) * 60);
  return `${String(hh).padStart(2,'0')}h ${String(mm).padStart(2,'0')}m ${String(ss).padStart(2,'0')}s`;
}

function fmtDEC(d: number): string {
  const sign = d >= 0 ? '+' : '-';
  const abs  = Math.abs(d);
  const deg  = Math.floor(abs);
  const min  = Math.floor((abs - deg) * 60);
  const sec  = Math.round(((abs - deg) * 60 - min) * 60);
  return `${sign}${String(deg).padStart(2,'0')}° ${String(min).padStart(2,'0')}' ${String(sec).padStart(2,'0')}"`;
}

function nowStr(): string {
  return new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ─── Sky Dome ────────────────────────────────────────────────────────────────

const SkyDome = ({
  zone, limits, results, liveAlt, liveAz
}: {
  zone?: Zone;
  limits: TelescopeLimits;
  results: (CycleResult | null)[];
  liveAlt?: number;
  liveAz?:  number;
}) => {
  const W = 200, H = 100, CX = W / 2, CY = H * 0.92, R = H * 0.86;

  const toXY = (alt: number, az: number) => {
    const r = R * (1 - alt / 90);
    const theta = ((az - 90) * Math.PI) / 180;
    return { x: CX + r * Math.cos(theta), y: CY - r * Math.sin(theta) };
  };

  // Zone polygon (if zone is defined)
  let zonePath = '';
  if (zone) {
    const pts = [
      ...Array.from({ length: 12 }, (_, i) => toXY(zone.altMin, zone.azMin + (i / 11) * (zone.azMax - zone.azMin))),
      ...Array.from({ length: 12 }, (_, i) => toXY(zone.altMax, zone.azMax - (i / 11) * (zone.azMax - zone.azMin))),
    ];
    zonePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + ' Z';
  }

  // Live position point
  const livePos = liveAlt !== undefined && liveAz !== undefined ? toXY(liveAlt, liveAz) : null;

  return (
    <Box bg="rgba(0,0,0,0.5)" borderRadius="8px" border="1px solid rgba(255,255,255,0.06)" p={2}>
      <Text fontSize="8px" color="whiteAlpha.400" mb={1} letterSpacing="0.08em">CARTE CIEL</Text>
      <svg width={W} height={H} style={{ display: 'block', margin: '0 auto' }}>
        {/* Horizon */}
        <path d={`M ${CX-R} ${CY} A ${R} ${R} 0 0 1 ${CX+R} ${CY}`}
          fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
        {/* Altitude rings */}
        {[30, 60].map(alt => {
          const r = R * (1 - alt / 90);
          return <ellipse key={alt} cx={CX} cy={CY} rx={r} ry={r * 0.38}
            fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" strokeDasharray="3,3" />;
        })}
        {/* Zone fill */}
        {zonePath && <path d={zonePath} fill="rgba(0,255,209,0.08)" stroke="rgba(0,255,209,0.3)" strokeWidth="1" />}
        {/* Recorded limits */}
        {LIMIT_KEYS.map(key => {
          const lp = limits[key];
          if (!lp) return null;
          const p = toXY(lp.alt, lp.az);
          const colors: Record<LimitKey, string> = { low: '#f6ad55', high: '#63b3ed', left: '#68d391', right: '#fc8181' };
          const labels: Record<LimitKey, string> = { low: 'B', high: 'H', left: 'G', right: 'D' };
          return (
            <g key={key}>
              <circle cx={p.x} cy={p.y} r={5} fill={colors[key]} opacity={0.9} />
              <text x={p.x} y={p.y + 3.5} textAnchor="middle" fontSize="7" fill="black" fontWeight="bold">{labels[key]}</text>
            </g>
          );
        })}
        {/* Solve results */}
        {results.map((r, i) => {
          if (!r || r.state === 'pending') return null;
          const p = toXY(r.targetAlt, r.targetAz);
          const color = r.success ? '#68d391' : r.state === 'failed' ? '#fc8181' : 'var(--astro-teal)';
          return (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r={3} fill={color} opacity={0.85} />
              <text x={p.x + 4} y={p.y + 2} fontSize="6" fill={color}>#{i+1}</text>
            </g>
          );
        })}
        {/* Live position */}
        {livePos && (
          <g>
            <circle cx={livePos.x} cy={livePos.y} r={5} fill="none" stroke="white" strokeWidth="1.5" opacity={0.8} />
            <circle cx={livePos.x} cy={livePos.y} r={2} fill="white" opacity={0.9} />
          </g>
        )}
        {/* Cardinal labels */}
        <text x={CX} y={7} textAnchor="middle" fontSize="6" fill="rgba(255,255,255,0.25)">N</text>
        <text x={CX} y={H-1} textAnchor="middle" fontSize="6" fill="rgba(255,255,255,0.25)">S</text>
        <text x={2} y={CY+3} textAnchor="start" fontSize="6" fill="rgba(255,255,255,0.25)">E</text>
        <text x={W-2} y={CY+3} textAnchor="end" fontSize="6" fill="rgba(255,255,255,0.25)">O</text>
      </svg>
    </Box>
  );
};

// ─── Jog Pad compact ─────────────────────────────────────────────────────────

const JogPad = ({ onJog }: { onJog: (dir: string) => void }) => {
  const btn = (dir: string, icon: React.ReactNode) => (
    <Button
      size="xs" w="28px" h="28px" p={0} minW={0}
      bg="rgba(255,255,255,0.06)" _hover={{ bg: 'rgba(255,255,255,0.12)' }}
      borderRadius="5px" border="1px solid rgba(255,255,255,0.08)"
      onClick={() => onJog(dir)}
    >
      {icon}
    </Button>
  );
  return (
    <Grid templateColumns="repeat(3, 28px)" templateRows="repeat(3, 28px)" gap="2px">
      <Box />
      {btn('up',    <Icon as={ArrowUp}    boxSize={3} color="whiteAlpha.700" />)}
      <Box />
      {btn('left',  <Icon as={ArrowLeft}  boxSize={3} color="whiteAlpha.700" />)}
      <Box bg="rgba(255,255,255,0.03)" borderRadius="4px" />
      {btn('right', <Icon as={ArrowRight} boxSize={3} color="whiteAlpha.700" />)}
      <Box />
      {btn('down',  <Icon as={ArrowDown}  boxSize={3} color="whiteAlpha.700" />)}
      <Box />
    </Grid>
  );
};

// ─── Limit record card ───────────────────────────────────────────────────────

const LIMIT_META: Record<LimitKey, { fr: string; en: string; frDesc: string; enDesc: string; color: string }> = {
  low:   { fr: 'LIMITE BASSE',   en: 'LOW LIMIT',   frDesc: "Pointez la position la plus basse souhaitée (horizon + garde de sécurité)", enDesc: "Aim at the lowest observable position (horizon + safety margin)", color: '#f6ad55' },
  high:  { fr: 'LIMITE HAUTE',   en: 'HIGH LIMIT',  frDesc: "Pointez la position la plus haute (évitez le zénith strict ±5°)",            enDesc: "Aim at the highest observable position (avoid strict zenith ±5°)", color: '#63b3ed' },
  left:  { fr: 'LIMITE GAUCHE',  en: 'LEFT LIMIT',  frDesc: "Pointez la limite Est (câbles / obstacle à gauche)",                         enDesc: "Aim at the East/left limit (cables or physical obstruction)", color: '#68d391' },
  right: { fr: 'LIMITE DROITE',  en: 'RIGHT LIMIT', frDesc: "Pointez la limite Ouest (câbles / obstacle à droite)",                        enDesc: "Aim at the West/right limit (cables or physical obstruction)", color: '#fc8181' },
};

// ─── Main Component ───────────────────────────────────────────────────────────

export const AutoAlignWizard = () => {
  const { language, config, setPosition } = useStargazerStore();
  const L = (fr: string, en: string) => language === 'fr' ? fr : en;

  const bridgeIp = (() => {
    try { return new URL(config.astroberryUrl).hostname + ':5005'; }
    catch { return (config.astroberryUrl || '127.0.0.1:5005').replace(/^https?:\/\//, ''); }
  })();

  // ── State ──
  const [phase,   setPhase]   = useState<AlignPhase>('limits-setup');
  const [limits,  setLimits]  = useState<TelescopeLimits>({});
  const [zone,    setZone]    = useState<Zone | null>(null);
  const [logs,    setLogs]    = useState<LogEntry[]>([]);
  const [results, setResults] = useState<(CycleResult | null)[]>([null, null, null]);
  const [finalRa,  setFinalRa]  = useState<number | null>(null);
  const [finalDec, setFinalDec] = useState<number | null>(null);

  // Live position from INDI (for limit-setup UI)
  const [liveAlt, setLiveAlt] = useState<number | undefined>();
  const [liveAz,  setLiveAz]  = useState<number | undefined>();
  const [liveRa,  setLiveRa]  = useState<number | undefined>(); // hours
  const [liveDec, setLiveDec] = useState<number | undefined>(); // degrees
  const [recording, setRecording] = useState<LimitKey | null>(null);
  const [isMountConnected, setIsMountConnected] = useState<boolean>(true);
  const [isConnectingMount, setIsConnectingMount] = useState<boolean>(false);

  // Camera live view stream state
  const [isLiveStreaming, setIsLiveStreaming] = useState(false);
  const [ccdImage, setCcdImage] = useState<string | null>(null);
  const [ccdError, setCcdError] = useState(false);
  const [streamStatus, setStreamStatus] = useState<string>("");

  const abortRef  = useRef(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  // ── Logger ──
  const log = useCallback((msg: string, type: LogEntry['type'] = 'info') => {
    setLogs(prev => [...prev, { time: nowStr(), msg, type }]);
    setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
  }, []);

  // ── Poll live mount position (only during limits-setup) ──
  useEffect(() => {
    if (phase !== 'limits-setup' && phase !== 'zone-confirm') return;
    let active = true;

    const poll = async () => {
      try {
        const res = await fetch('/api/indi/mount/status', { cache: 'no-store' });
        if (!res.ok) {
          setIsMountConnected(false);
          return;
        }
        const data = await res.json();
        setIsMountConnected(!!data.connected);
        if (!data.connected) return;
        // ra from INDI is in degrees, dec in degrees
        const raHours = (data.ra ?? 0) / 15;
        const decDeg  = data.dec ?? 0;
        setLiveRa(raHours);
        setLiveDec(decDeg);

        const latVal = parseFloat(config.latitude);
        const lonVal = parseFloat(config.longitude);
        const safeLat = isNaN(latVal) ? -17.6333 : latVal;
        const safeLon = isNaN(lonVal) ? -149.6000 : lonVal;

        // Convert to Alt/Az via backend
        const convRes = await fetch('/api/indi/astro/coords', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ra: raHours, dec: decDeg, lat: safeLat, lon: safeLon })
        });
        if (convRes.ok) {
          const conv = await convRes.json();
          if (conv.success) {
            setLiveAlt(conv.alt);
            setLiveAz(conv.az);
          } else {
            console.warn("Coords conversion returned success: false", conv.error);
            setLiveAlt(0.0);
            setLiveAz(0.0);
          }
        } else {
          console.warn("Coords API returned non-ok status:", convRes.status);
          setLiveAlt(0.0);
          setLiveAz(0.0);
        }
      } catch {}
    };

    poll();
    const interval = setInterval(() => { if (active) poll(); }, 2500);
    return () => { active = false; clearInterval(interval); };
  }, [phase, config.latitude, config.longitude]);

  // ── Camera live stream controls ──
  const startLiveView = async () => {
    try {
      setStreamStatus(L("Démarrage...", "Starting..."));
      const res = await fetch('/api/indi/liveview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' })
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
          const j = await res.json();
          if (j.error) msg = j.error;
        } catch {}
        setStreamStatus(msg);
        return;
      }
      const streamUrl = `/api/indi/stream?t=${Date.now()}`;
      setCcdImage(streamUrl);
      setIsLiveStreaming(true);
      setStreamStatus("LIVE");
      setCcdError(false);
    } catch (e) {
      setStreamStatus(L("Erreur", "Error"));
    }
  };

  const stopLiveView = async () => {
    try {
      await fetch('/api/indi/liveview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' })
      });
      setIsLiveStreaming(false);
      setCcdImage(null);
      setStreamStatus("");
    } catch (e) {
      console.error(e);
    }
  };

  // Cleanup live view on unmount
  useEffect(() => {
    return () => {
      fetch('/api/indi/liveview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' })
      }).catch(() => {});
    };
  }, []);

  const connectHardware = async () => {
    setIsConnectingMount(true);
    try {
      await fetch('/api/hardware/connect', { method: 'POST' });
      await new Promise(r => setTimeout(r, 2000));
    } catch {}
    setIsConnectingMount(false);
  };

  // ── Record current position as a limit ──
  const recordLimit = async (key: LimitKey) => {
    if (liveAlt === undefined || liveAz === undefined || liveRa === undefined || liveDec === undefined) {
      alert(L('Position non disponible. Vérifiez la connexion INDI.', 'Position unavailable. Check INDI connection.'));
      return;
    }
    setRecording(key);
    await new Promise(r => setTimeout(r, 400)); // visual feedback delay
    setLimits(prev => ({
      ...prev,
      [key]: { alt: liveAlt, az: liveAz, ra: liveRa, dec: liveDec }
    }));
    setRecording(null);
  };

  // ── Jog mount ──
  const jog = async (direction: string) => {
    await fetch('/api/indi/mount', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'jog', direction, state: 'start', duration: 0.5, device: config.driverInstance, ip: bridgeIp })
    }).catch(() => {});
    await new Promise(r => setTimeout(r, 600));
    await fetch('/api/indi/mount', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'jog', direction, state: 'stop', device: config.driverInstance, ip: bridgeIp })
    }).catch(() => {});
  };

  // ── Confirm zone from limits ──
  const confirmZone = () => {
    const { low, high, left, right } = limits;
    if (!low || !high || !left || !right) return;
    // Stop live view since we are leaving the limit setup
    stopLiveView();
    // Build zone — ensure min < max
    const azMin = Math.min(left.az, right.az);
    const azMax = Math.max(left.az, right.az);
    setZone({
      altMin: Math.min(low.alt, high.alt),
      altMax: Math.max(low.alt, high.alt),
      azMin,
      azMax: azMax - azMin > 180 ? azMin + 360 : azMax, // handle wrap-around
    });
    setPhase('zone-confirm');
  };

  // ── Fetch current position as Alt/Az directly ──
  const altazFromRaDec = async (ra: number, dec: number): Promise<{ alt: number; az: number } | null> => {
    try {
      const latVal = parseFloat(config.latitude);
      const lonVal = parseFloat(config.longitude);
      const safeLat = isNaN(latVal) ? -17.6333 : latVal;
      const safeLon = isNaN(lonVal) ? -149.6000 : lonVal;
      const res = await fetch('/api/indi/astro/coords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ra, dec, lat: safeLat, lon: safeLon })
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.success ? { alt: data.alt, az: data.az } : null;
    } catch { return null; }
  };

  const altazToRaDec = async (alt: number, az: number): Promise<{ ra: number; dec: number } | null> => {
    try {
      const latVal = parseFloat(config.latitude);
      const lonVal = parseFloat(config.longitude);
      const safeLat = isNaN(latVal) ? -17.6333 : latVal;
      const safeLon = isNaN(lonVal) ? -149.6000 : lonVal;
      const res = await fetch('/api/indi/astro/altaz_to_radec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alt, az, lat: safeLat, lon: safeLon })
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.success ? { ra: data.ra, dec: data.dec } : null;
    } catch { return null; }
  };

  const gotoRaDec = async (ra: number, dec: number): Promise<boolean> => {
    try {
      const res = await fetch('/api/indi/mount', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'slew', device: config.driverInstance, ip: bridgeIp, ra, dec })
      });
      return (await res.json()).success === true;
    } catch { return false; }
  };

  const waitForSlew = async (timeoutSec = 90): Promise<boolean> => {
    await new Promise(r => setTimeout(r, 2000));
    const deadline = Date.now() + timeoutSec * 1000;
    while (Date.now() < deadline) {
      if (abortRef.current) return false;
      try {
        const res = await fetch('/api/indi?endpoint=status', { cache: 'no-store' });
        if (res.ok) {
          const s = (await res.json()).mount_slew_state;
          if (s === 'Idle' || s === 'Ok' || s === 'Not Aligned') return true;
          if (s === 'Error') return false;
        }
      } catch {}
      await new Promise(r => setTimeout(r, 2000));
    }
    return true;
  };

  const updateCycle = (i: number, patch: Partial<CycleResult>) =>
    setResults(prev => {
      const next = [...prev];
      next[i] = { ...(next[i] ?? { index: i, targetAlt: 0, targetAz: 0, success: false, state: 'pending' }), ...patch } as CycleResult;
      return next;
    });

  const captureAndSolve = async (i: number): Promise<SolvedPosition | null> => {
    const EXPOSURE = 3;
    updateCycle(i, { state: 'capturing' });
    log(L(`  📷 Capture ${EXPOSURE}s ISO 800...`, `  📷 Capturing ${EXPOSURE}s ISO 800...`));

    const captureRes = await fetch('/api/indi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'capture', iso: 800, exposure: EXPOSURE, endpoint: 'ccd/capture' })
    });
    if (!captureRes.ok) {
      log(L(`  ❌ Capture HTTP ${captureRes.status}`, `  ❌ Capture HTTP ${captureRes.status}`), 'error');
      return null;
    }

    await new Promise(r => setTimeout(r, EXPOSURE * 1000 + 1500));
    const imageUrl = `/api/indi?endpoint=ccd/latest&t=${Date.now()}`;
    const checkRes = await fetch(imageUrl, { cache: 'no-store' });
    if (checkRes.status === 204 || !checkRes.ok) {
      log(L('  ❌ Aucune image (204). Caméra connectée?', '  ❌ No image (204). Camera connected?'), 'error');
      return null;
    }
    updateCycle(i, { state: 'solving' });
    log(L('  🔍 Plate solving...', '  🔍 Plate solving...'));
    return await plateSolve(imageUrl, config.aiKey || undefined);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // MAIN AUTO-ALIGN ROUTINE
  // ─────────────────────────────────────────────────────────────────────────
  const runAutoAlign = async () => {
    if (!zone) return;
    abortRef.current = false;
    setLogs([]);
    setResults([null, null, null]);
    setFinalRa(null); setFinalDec(null);

    // Preflight
    setPhase('preflight');
    log(L('🚀 Démarrage Auto-Align autonome...', '🚀 Starting autonomous Auto-Align...'));
    log(L(
      `📍 Zone: Alt ${zone.altMin.toFixed(1)}°–${zone.altMax.toFixed(1)}° | Az ${zone.azMin.toFixed(1)}°–${zone.azMax.toFixed(1)}°`,
      `📍 Zone: Alt ${zone.altMin.toFixed(1)}°–${zone.altMax.toFixed(1)}° | Az ${zone.azMin.toFixed(1)}°–${zone.azMax.toFixed(1)}°`
    ));

    const health = await fetch(`/api/indi?endpoint=health&ip=${bridgeIp}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null).catch(() => null);
    if (!(Array.isArray(health) && health.length > 0 && health[0]?.status === 'True')) {
      log(L('❌ Hardware non joignable. Vérifiez INDI.', '❌ Hardware unreachable. Check INDI.'), 'error');
      setPhase('failed'); return;
    }
    log(L('✅ Monture et caméra en ligne.', '✅ Mount and camera online.'), 'success');

    // 3 solve cycles
    let lastSolved: SolvedPosition | null = null;
    const cyclePhases: AlignPhase[] = ['cycle-1', 'cycle-2', 'cycle-3'];

    for (let i = 0; i < 3; i++) {
      if (abortRef.current) { setPhase('failed'); return; }
      setPhase(cyclePhases[i]);

      const targetAlt = rand(zone.altMin, zone.altMax);
      const targetAz  = rand(zone.azMin,  zone.azMax);

      log(L(
        `\n🎯 Cible ${i+1}/3 — Alt ${targetAlt.toFixed(1)}° Az ${targetAz.toFixed(1)}°`,
        `\n🎯 Target ${i+1}/3 — Alt ${targetAlt.toFixed(1)}° Az ${targetAz.toFixed(1)}°`
      ));
      updateCycle(i, { index: i, targetAlt, targetAz, success: false, state: 'slewing' });

      const radec = await altazToRaDec(targetAlt, targetAz);
      if (!radec) {
        log(L('  ⚠️ Conversion Alt/Az→RA/Dec échouée.', '  ⚠️ Alt/Az→RA/Dec failed.'), 'warn');
        updateCycle(i, { state: 'failed' }); continue;
      }
      updateCycle(i, { targetRa: radec.ra, targetDec: radec.dec });
      log(L(`  → RA ${fmtRA(radec.ra)}  DEC ${fmtDEC(radec.dec)}`,
            `  → RA ${fmtRA(radec.ra)}  DEC ${fmtDEC(radec.dec)}`));

      log(L('  🔭 GoTo en cours...', '  🔭 Slewing...'));
      if (!await gotoRaDec(radec.ra, radec.dec)) {
        log(L('  ⚠️ GoTo échoué.', '  ⚠️ GoTo failed.'), 'warn');
        updateCycle(i, { state: 'failed' }); continue;
      }

      log(L('  ⏳ Attente fin de déplacement...', '  ⏳ Waiting for slew...'));
      await waitForSlew(90);
      log(L('  ⚙️ Stabilisation 3s...', '  ⚙️ Settling 3s...'));
      await new Promise(r => setTimeout(r, 3000));
      if (abortRef.current) { setPhase('failed'); return; }

      const solved = await captureAndSolve(i);
      if (solved) {
        lastSolved = solved;
        const srcLabel = solved.source === 'local' ? 'solve-field (local)'
          : solved.source === 'astrometry_net' ? 'Astrometry.net' : 'IA Vision';
        log(L(`  ✅ Résolu via ${srcLabel}: RA ${fmtRA(solved.ra)}  DEC ${fmtDEC(solved.dec)}`,
              `  ✅ Solved via ${srcLabel}: RA ${fmtRA(solved.ra)}  DEC ${fmtDEC(solved.dec)}`), 'success');
        updateCycle(i, { solvedRa: solved.ra, solvedDec: solved.dec, source: srcLabel, success: true, state: 'done' });
      } else {
        log(L(`  ⚠️ Solve ${i+1} échoué.`, `  ⚠️ Solve ${i+1} failed.`), 'warn');
        updateCycle(i, { state: 'failed' });
      }
    }

    if (!lastSolved) {
      log(L('\n❌ Aucun solve réussi — alignement impossible.', '\n❌ No solve succeeded — alignment failed.'), 'error');
      setPhase('failed'); return;
    }

    // Sync
    setPhase('syncing');
    log(L(`\n🔄 Sync → RA ${fmtRA(lastSolved.ra)}  DEC ${fmtDEC(lastSolved.dec)}`,
          `\n🔄 Sync → RA ${fmtRA(lastSolved.ra)}  DEC ${fmtDEC(lastSolved.dec)}`));
    const syncRes = await fetch('/api/indi/mount', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'sync', device: config.driverInstance, ip: bridgeIp, ra: lastSolved.ra, dec: lastSolved.dec })
    }).then(r => r.json()).catch(e => ({ success: false, error: e.message }));

    if (syncRes.success) log(L('✅ Monture synchronisée!', '✅ Mount synced!'), 'success');
    else log(L(`⚠️ Sync: ${syncRes.error}`, `⚠️ Sync: ${syncRes.error}`), 'warn');

    // Tracking
    log(L('▶️ Activation suivi sidéral...', '▶️ Enabling sidereal tracking...'));
    await fetch('/api/indi/mount', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'track', device: config.driverInstance, ip: bridgeIp, enabled: true })
    }).catch(() => {});
    await new Promise(r => setTimeout(r, 800));
    log(L('✅ Suivi sidéral actif.', '✅ Sidereal tracking active.'), 'success');

    setFinalRa(lastSolved.ra);
    setFinalDec(lastSolved.dec);
    setPosition(fmtRA(lastSolved.ra), fmtDEC(lastSolved.dec));
    setPhase('complete');
    log(L('\n🎉 Télescope aligné! GoTo • Tracking • Astrophoto.', '\n🎉 Telescope aligned! GoTo • Tracking • Astrophoto.'), 'success');
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  const isRunning = !['limits-setup', 'zone-confirm', 'complete', 'failed'].includes(phase);
  const allLimitsDefined = LIMIT_KEYS.every(k => !!limits[k]);
  const progress = PHASE_PROGRESS[phase];

  const logColors: Record<LogEntry['type'], string> = {
    info: 'rgba(255,255,255,0.55)', success: '#68d391', error: '#fc8181', warn: '#f6ad55'
  };

  return (
    <VStack align="stretch" gap={4} w="full">

      {/* ── Header ── */}
      <HStack justify="space-between" align="start">
        <HStack gap={2}>
          <Box p={1.5} bg="rgba(0,255,209,0.1)" borderRadius="6px">
            <Icon as={Satellite} boxSize={4} color="var(--astro-teal)" />
          </Box>
          <VStack align="start" gap={0}>
            <Text fontSize="12px" fontWeight="bold" letterSpacing="0.15em" color="white">
              {L("AUTO-ALIGN AUTONOME", "AUTONOMOUS AUTO-ALIGN")}
            </Text>
            <Text fontSize="8px" color="whiteAlpha.400" letterSpacing="0.04em">
              {phase === 'limits-setup'
                ? L("ÉTAPE 1/2 — DÉFINIR LES LIMITES PHYSIQUES", "STEP 1/2 — DEFINE PHYSICAL LIMITS")
                : L("ÉTAPE 2/2 — SOLVE → SYNC → TRACKING", "STEP 2/2 — SOLVE → SYNC → TRACKING")}
            </Text>
          </VStack>
        </HStack>
        <Badge
          fontSize="8px" px={2} py={1} borderRadius="4px"
          bg={phase === 'complete' ? 'rgba(72,187,120,0.18)' : phase === 'failed' ? 'rgba(245,101,101,0.18)' : isRunning ? 'rgba(0,255,209,0.12)' : 'rgba(255,255,255,0.06)'}
          color={phase === 'complete' ? 'green.300' : phase === 'failed' ? 'red.400' : isRunning ? 'var(--astro-teal)' : 'whiteAlpha.500'}
          border="1px solid"
          borderColor={phase === 'complete' ? 'green.800' : phase === 'failed' ? 'red.900' : isRunning ? 'rgba(0,255,209,0.25)' : 'rgba(255,255,255,0.08)'}
        >
          {phase.replace(/-/g, ' ').toUpperCase()}
        </Badge>
      </HStack>

      {/* ══════════════════════════════════════════════════════════════════
          PHASE : LIMITS SETUP — L'user enseigne les limites physiques
      ══════════════════════════════════════════════════════════════════ */}
      {phase === 'limits-setup' && (
        <VStack align="stretch" gap={3}>

          {/* Instructions */}
          <Box bg="rgba(255,195,0,0.05)" border="1px solid rgba(255,195,0,0.2)" borderRadius="8px" p={3}>
            <HStack gap={2} mb={1}>
              <Text fontSize="14px">🎯</Text>
              <Text fontSize="10px" fontWeight="bold" color="yellow.200" letterSpacing="0.06em">
                {L("APPRENEZ AU TÉLESCOPE SES LIMITES", "TEACH THE TELESCOPE ITS LIMITS")}
              </Text>
            </HStack>
            <Text fontSize="8px" color="whiteAlpha.600" lineHeight="1.6">
              {L(
                "Déplacez le télescope vers chaque position limite avec la raquette ou les flèches ci-dessous, puis appuyez sur 📍 Enregistrer. Stargazer lit la position réelle depuis INDI.",
                "Move the telescope to each limit position with the handset or the arrows below, then press 📍 Record. Stargazer reads the actual position from INDI."
              )}
            </Text>
          </Box>

          <Grid templateColumns={{ base: "1fr", md: "1.1fr 0.9fr" }} gap={4} alignItems="start">
            
            {/* Left Column: Controls and limits */}
            <VStack align="stretch" gap={3}>
              {/* Live position + jog pad */}
              <HStack gap={3} align="center" justify="space-between"
                bg="rgba(255,255,255,0.02)" borderRadius="8px" p={2.5}
                border="1px solid rgba(255,255,255,0.06)">
                <VStack align="start" gap={0.5}>
                  <Text fontSize="8px" color="whiteAlpha.400" letterSpacing="0.06em">
                    {L("POSITION ACTUELLE", "CURRENT POSITION")}
                  </Text>
                  {!isMountConnected ? (
                    <VStack align="start" gap={1}>
                      <Text fontSize="8px" color="red.400" fontWeight="bold">
                        {L("⚠️ TÉLESCOPE DÉCONNECTÉ", "⚠️ MOUNT DISCONNECTED")}
                      </Text>
                      <Button
                        size="2xs"
                        h="22px"
                        bg="red.500"
                        color="white"
                        _hover={{ bg: "red.400" }}
                        onClick={connectHardware}
                        loading={isConnectingMount}
                        fontSize="8px"
                        fontWeight="bold"
                      >
                        {L("CONNECTER", "CONNECT MOUNT")}
                      </Button>
                    </VStack>
                  ) : liveAlt !== undefined ? (
                    <>
                      <HStack gap={3}>
                        <VStack align="start" gap={0}>
                          <Text fontSize="7px" color="whiteAlpha.400">ALT</Text>
                          <Text fontSize="13px" fontWeight="bold" color="white" fontFamily="monospace" lineHeight="1">{liveAlt.toFixed(1)}°</Text>
                        </VStack>
                        <VStack align="start" gap={0}>
                          <Text fontSize="7px" color="whiteAlpha.400">AZ</Text>
                          <Text fontSize="13px" fontWeight="bold" color="white" fontFamily="monospace" lineHeight="1">{liveAz!.toFixed(1)}°</Text>
                        </VStack>
                      </HStack>
                      <Text fontSize="7px" color="whiteAlpha.300" fontFamily="monospace">
                        RA {liveRa !== undefined ? fmtRA(liveRa) : '—'}
                      </Text>
                    </>
                  ) : (
                    <HStack gap={1}>
                      <Spinner size="xs" color="whiteAlpha.400" />
                      <Text fontSize="8px" color="whiteAlpha.400">{L("Lecture INDI...", "Reading INDI...")}</Text>
                    </HStack>
                  )}
                </VStack>
                <VStack align="center" gap={1}>
                  <Text fontSize="7px" color="whiteAlpha.400" letterSpacing="0.06em">{L("DÉPLACEMENT FIN", "FINE JOG")}</Text>
                  <JogPad onJog={jog} />
                </VStack>
              </HStack>

              {/* 4 limit rows */}
              <VStack align="stretch" gap={2}>
                {LIMIT_KEYS.map(key => {
                  const meta    = LIMIT_META[key];
                  const defined = !!limits[key];
                  const lp      = limits[key];
                  const isRec   = recording === key;
                  return (
                    <Box key={key}
                      bg={defined ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.2)'}
                      border="1px solid"
                      borderColor={defined ? `${meta.color}33` : 'rgba(255,255,255,0.05)'}
                      borderRadius="8px" p={2.5}
                    >
                      <HStack justify="space-between" align="center">
                        <VStack align="start" gap={0.5} flex={1}>
                          <HStack gap={1.5}>
                            <Box w="6px" h="6px" borderRadius="full" bg={meta.color} flexShrink={0} />
                            <Text fontSize="9px" fontWeight="bold" color="whiteAlpha.700" letterSpacing="0.1em">
                              {L(meta.fr, meta.en)}
                            </Text>
                            {defined && <Text fontSize="8px">✅</Text>}
                          </HStack>
                          {defined && lp ? (
                            <Text fontSize="8px" color="white" fontFamily="monospace">
                              Alt {lp.alt.toFixed(1)}° / Az {lp.az.toFixed(1)}°
                            </Text>
                          ) : (
                            <Text fontSize="7px" color="whiteAlpha.400">{L(meta.frDesc, meta.enDesc)}</Text>
                          )}
                        </VStack>
                        <Button
                          size="xs" h="28px" px={3} ml={2} flexShrink={0}
                          bg={defined ? 'rgba(255,255,255,0.06)' : `${meta.color}22`}
                          color={defined ? 'whiteAlpha.600' : meta.color}
                          border="1px solid"
                          borderColor={defined ? 'rgba(255,255,255,0.1)' : `${meta.color}55`}
                          fontWeight="bold" fontSize="9px" letterSpacing="0.06em"
                          _hover={{ bg: `${meta.color}33` }}
                          loading={isRec}
                          onClick={() => recordLimit(key)}
                          disabled={liveAlt === undefined}
                        >
                          {defined ? L('RÉENREGISTRER', 'RE-RECORD') : <><Icon as={MapPin} boxSize={3} mr={1} />{L('ENREGISTRER', 'RECORD')}</>}
                        </Button>
                      </HStack>
                    </Box>
                  );
                })}
              </VStack>

              {/* Confirm button */}
              <Button
                disabled={!allLimitsDefined}
                bg="rgba(0,255,209,0.1)" color="var(--astro-teal)"
                border="1px solid rgba(0,255,209,0.3)"
                fontWeight="bold" fontSize="11px" letterSpacing="0.1em"
                _hover={{ bg: 'rgba(0,255,209,0.2)' }} _disabled={{ opacity: 0.3, cursor: 'not-allowed' }}
                onClick={confirmZone}
                w="full"
              >
                <Icon as={Navigation} boxSize={3} mr={1} />
                {L("CONFIRMER LA ZONE ET LANCER", "CONFIRM ZONE AND START")}
                {!allLimitsDefined && (
                  <Text fontSize="8px" color="whiteAlpha.400" ml={2}>
                    ({LIMIT_KEYS.filter(k => !limits[k]).length} {L("manquante(s)", "missing")})
                  </Text>
                )}
              </Button>
            </VStack>

            {/* Right Column: Camera live stream + sky map */}
            <VStack align="stretch" gap={3}>
              {/* Camera Live View Panel */}
              <Box
                bg="rgba(0,0,0,0.3)"
                border="1px solid rgba(255,255,255,0.08)"
                borderRadius="8px"
                overflow="hidden"
                p={2.5}
                position="relative"
              >
                <HStack justify="space-between" mb={2}>
                  <HStack gap={1.5}>
                    <Icon as={Camera} boxSize={3.5} color="var(--astro-gold)" />
                    <Text fontSize="9px" fontWeight="bold" color="whiteAlpha.800" letterSpacing="0.08em">
                      {L("RETOUR IMAGE EN DIRECT", "CAMERA LIVE FEED")}
                    </Text>
                  </HStack>
                  <Button
                    size="2xs"
                    h="20px"
                    px={2.5}
                    fontSize="8px"
                    fontWeight="bold"
                    borderRadius="4px"
                    bg={isLiveStreaming ? "red.500" : "green.500"}
                    color="white"
                    _hover={{ bg: isLiveStreaming ? "red.400" : "green.400" }}
                    onClick={isLiveStreaming ? stopLiveView : startLiveView}
                  >
                    {isLiveStreaming ? (
                      <HStack gap={1}>
                        <Box w="6px" h="6px" borderRadius="full" bg="white" style={{ animation: "pulse 1s infinite alternate" }} />
                        <Text>STOP</Text>
                      </HStack>
                    ) : (
                      <HStack gap={1}>
                        <Icon as={Play} boxSize={2} fill="currentColor" />
                        <Text>LIVE</Text>
                      </HStack>
                    )}
                  </Button>
                </HStack>

                <Box
                  position="relative"
                  w="full"
                  h="160px"
                  bg="black"
                  borderRadius="6px"
                  border="1px solid rgba(255,255,255,0.04)"
                  overflow="hidden"
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                >
                  {isLiveStreaming ? (
                    ccdError ? (
                      <VStack gap={1} p={3} textAlign="center">
                        <Icon as={AlertTriangle} boxSize={6} color="var(--astro-gold)" />
                        <Text fontSize="9px" color="var(--astro-gold)" fontWeight="bold">
                          {L("ERREUR DE FLUX", "STREAM ERROR")}
                        </Text>
                        <Text fontSize="7px" color="whiteAlpha.500">
                          {L("Échec du chargement de l'image", "Failed to load camera frame")}
                        </Text>
                      </VStack>
                    ) : ccdImage ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={ccdImage}
                          alt="Live Feed"
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "contain",
                            background: "#000",
                          }}
                          onError={() => setCcdError(true)}
                          onLoad={() => setCcdError(false)}
                        />
                        {/* Reticle / Crosshair overlay */}
                        <Box
                          position="absolute"
                          top="50%"
                          left="50%"
                          transform="translate(-50%, -50%)"
                          color="rgba(255, 179, 71, 0.4)"
                          pointerEvents="none"
                        >
                          <Icon as={Crosshair} boxSize="80px" strokeWidth={1} />
                        </Box>
                        {/* LIVE Badge */}
                        <Badge
                          position="absolute"
                          top={2}
                          left={2}
                          colorScheme="red"
                          fontSize="7px"
                          px={1.5}
                          py={0.5}
                          borderRadius="3px"
                        >
                          LIVE
                        </Badge>
                      </>
                    ) : (
                      <Spinner size="sm" color="var(--astro-teal)" />
                    )
                  ) : (
                    <VStack gap={2} p={4} textAlign="center">
                      <Icon as={Camera} boxSize={8} color="whiteAlpha.200" />
                      <Text fontSize="9px" color="whiteAlpha.400">
                        {L("FLUX VIDÉO EN VEILLE", "CAMERA FEED STANDBY")}
                      </Text>
                      <Text fontSize="7px" color="whiteAlpha.300">
                        {L("Activez le LIVE pour voir le viseur", "Start LIVE to show camera view")}
                      </Text>
                    </VStack>
                  )}
                </Box>
              </Box>

              {/* Sky dome live preview */}
              <SkyDome zone={undefined} limits={limits} results={[null, null, null]} liveAlt={liveAlt} liveAz={liveAz} />
            </VStack>
          </Grid>
        </VStack>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          PHASE : ZONE CONFIRM
      ══════════════════════════════════════════════════════════════════ */}
      {phase === 'zone-confirm' && zone && (
        <VStack align="stretch" gap={3}>
          <Box bg="rgba(0,255,209,0.04)" border="1px solid rgba(0,255,209,0.15)" borderRadius="8px" p={3}>
            <Text fontSize="9px" fontWeight="bold" color="var(--astro-teal)" letterSpacing="0.1em" mb={2}>
              {L("✅ ZONE ENREGISTRÉE — RÉCAPITULATIF", "✅ ZONE RECORDED — SUMMARY")}
            </Text>
            <Grid templateColumns="1fr 1fr" gap={2}>
              {LIMIT_KEYS.map(key => {
                const meta = LIMIT_META[key];
                const lp   = limits[key]!;
                return (
                  <Box key={key} bg="rgba(0,0,0,0.2)" borderRadius="6px" p={2}>
                    <HStack gap={1} mb={0.5}>
                      <Box w="5px" h="5px" borderRadius="full" bg={meta.color} />
                      <Text fontSize="7px" color="whiteAlpha.500">{L(meta.fr, meta.en)}</Text>
                    </HStack>
                    <Text fontSize="9px" fontWeight="bold" color="white" fontFamily="monospace">
                      Alt {lp.alt.toFixed(1)}° Az {lp.az.toFixed(1)}°
                    </Text>
                  </Box>
                );
              })}
            </Grid>
            <Box mt={2} pt={2} borderTop="1px solid rgba(255,255,255,0.05)">
              <HStack gap={4} justify="center">
                <VStack gap={0} align="center">
                  <Text fontSize="7px" color="whiteAlpha.400">PLAGE ALTITUDE</Text>
                  <Text fontSize="10px" fontWeight="bold" color="white" fontFamily="monospace">
                    {zone.altMin.toFixed(1)}° → {zone.altMax.toFixed(1)}°
                  </Text>
                </VStack>
                <VStack gap={0} align="center">
                  <Text fontSize="7px" color="whiteAlpha.400">PLAGE AZIMUT</Text>
                  <Text fontSize="10px" fontWeight="bold" color="white" fontFamily="monospace">
                    {zone.azMin.toFixed(1)}° → {zone.azMax.toFixed(1)}°
                  </Text>
                </VStack>
              </HStack>
            </Box>
          </Box>
          <SkyDome zone={zone} limits={limits} results={[null, null, null]} />
          <HStack gap={2}>
            <Button flex={1} variant="outline" borderColor="whiteAlpha.200" color="whiteAlpha.500"
              fontSize="10px" onClick={() => setPhase('limits-setup')}>
              {L("← MODIFIER", "← MODIFY")}
            </Button>
            <Button flex={2} bg="rgba(0,255,209,0.12)" color="var(--astro-teal)"
              border="1px solid rgba(0,255,209,0.35)" fontWeight="bold" fontSize="11px" letterSpacing="0.1em"
              _hover={{ bg: 'rgba(0,255,209,0.22)' }} onClick={runAutoAlign}>
              <Icon as={Zap} boxSize={3} mr={1} />
              {L("LANCER L'ALIGNEMENT AUTO", "START AUTO-ALIGNMENT")}
            </Button>
          </HStack>
        </VStack>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          PHASES D'EXÉCUTION
      ══════════════════════════════════════════════════════════════════ */}
      {(isRunning || phase === 'complete' || phase === 'failed') && (
        <VStack align="stretch" gap={3}>

          {/* Progress bar */}
          <Box>
            <HStack justify="space-between" mb={1}>
              <HStack gap={2}>
                {isRunning && <Spinner size="xs" color="var(--astro-teal)" />}
                <Text fontSize="9px" color="whiteAlpha.500" letterSpacing="0.06em">
                  {phase.replace(/-/g, ' ').toUpperCase()}
                </Text>
              </HStack>
              <Text fontSize="9px" fontWeight="bold"
                color={phase === 'complete' ? 'green.300' : 'whiteAlpha.600'}>
                {progress}%
              </Text>
            </HStack>
            <Box w="full" h="2px" bg="rgba(255,255,255,0.06)" borderRadius="full" overflow="hidden">
              <Box h="full"
                style={{ width: `${progress}%`, transition: 'width 0.8s ease-out' }}
                bg={phase === 'failed' ? '#fc8181' : phase === 'complete' ? '#68d391' : 'var(--astro-teal)'}
                boxShadow={phase === 'complete' ? '0 0 8px #68d391' : '0 0 6px var(--astro-teal)'} />
            </Box>
          </Box>

          {/* Sky dome + cycle cards */}
          {zone && <SkyDome zone={zone} limits={limits} results={results} />}
          <Grid templateColumns="repeat(3, 1fr)" gap={2}>
            {results.map((r, i) => (
              <Box key={i}
                bg={r ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.2)'}
                border="1px solid"
                borderColor={r?.success ? 'green.900' : r?.state === 'failed' ? 'red.900' : 'rgba(255,255,255,0.05)'}
                borderRadius="8px" p={2} minH="70px"
              >
                <HStack justify="space-between" mb={1}>
                  <Text fontSize="8px" fontWeight="bold" color="whiteAlpha.400" letterSpacing="0.1em">
                    {L(`CIBLE ${i+1}`, `TARGET ${i+1}`)}
                  </Text>
                  <Text fontSize="10px">
                    {!r ? '○' : r.state === 'done' && r.success ? '✅' : r.state === 'failed' ? '❌'
                      : r.state === 'slewing' ? '🔭' : r.state === 'capturing' ? '📷'
                      : r.state === 'solving' ? '🔍' : '⏳'}
                  </Text>
                </HStack>
                {r && r.solvedRa !== undefined ? (
                  <VStack align="start" gap={0.5}>
                    <Text fontSize="8px" fontFamily="monospace" color="white">{fmtRA(r.solvedRa!)}</Text>
                    <Text fontSize="8px" fontFamily="monospace" color="white">{fmtDEC(r.solvedDec!)}</Text>
                    {r.source && <Text fontSize="6px" color="whiteAlpha.400">{r.source}</Text>}
                  </VStack>
                ) : r ? (
                  <VStack align="start" gap={0.5}>
                    <Text fontSize="7px" color="whiteAlpha.500">Alt {r.targetAlt.toFixed(1)}° Az {r.targetAz.toFixed(1)}°</Text>
                    {['slewing','capturing','solving'].includes(r.state) && (
                      <HStack gap={1}><Spinner size="xs" color="var(--astro-teal)" />
                        <Text fontSize="7px" color="var(--astro-teal)">{r.state}</Text>
                      </HStack>
                    )}
                  </VStack>
                ) : (
                  <Text fontSize="7px" color="whiteAlpha.300">{L('En attente…', 'Waiting…')}</Text>
                )}
              </Box>
            ))}
          </Grid>

          {/* Log */}
          {logs.length > 0 && (
            <Box bg="rgba(0,0,0,0.45)" borderRadius="6px" border="1px solid rgba(255,255,255,0.05)"
              p={2.5} maxH="150px" overflowY="auto">
              <VStack align="stretch" gap={0.5}>
                {logs.map((entry, i) => (
                  <HStack key={i} gap={2} align="start">
                    <Text fontSize="8px" color="rgba(255,255,255,0.18)" flexShrink={0} fontFamily="monospace">{entry.time}</Text>
                    <Text fontSize="8px" lineHeight="1.5" style={{ color: logColors[entry.type], whiteSpace: 'pre-wrap' }}>{entry.msg}</Text>
                  </HStack>
                ))}
                <div ref={logEndRef} />
              </VStack>
            </Box>
          )}

          {/* Complete */}
          {phase === 'complete' && finalRa !== null && finalDec !== null && (
            <Box bg="rgba(72,187,120,0.06)" border="1px solid rgba(72,187,120,0.25)" borderRadius="8px" p={3}>
              <HStack gap={2} mb={2}>
                <Icon as={CheckCircle2} boxSize={5} color="green.400" />
                <Text fontSize="11px" fontWeight="bold" color="green.300" letterSpacing="0.05em">
                  {L("🎉 TÉLESCOPE ALIGNÉ ET PRÊT", "🎉 TELESCOPE ALIGNED AND READY")}
                </Text>
              </HStack>
              <Grid templateColumns="1fr 1fr" gap={2} mb={2}>
                <Box bg="rgba(0,0,0,0.2)" borderRadius="6px" p={2}>
                  <Text fontSize="7px" color="whiteAlpha.400" mb={0.5}>RA</Text>
                  <Text fontSize="11px" fontWeight="bold" color="white" fontFamily="monospace">{fmtRA(finalRa)}</Text>
                </Box>
                <Box bg="rgba(0,0,0,0.2)" borderRadius="6px" p={2}>
                  <Text fontSize="7px" color="whiteAlpha.400" mb={0.5}>DEC</Text>
                  <Text fontSize="11px" fontWeight="bold" color="white" fontFamily="monospace">{fmtDEC(finalDec)}</Text>
                </Box>
              </Grid>
              <Text fontSize="8px" color="green.600">✅ GoTo précis • Suivi sidéral actif • Astrophoto disponible</Text>
            </Box>
          )}

          {/* Failed */}
          {phase === 'failed' && (
            <Box bg="rgba(245,101,101,0.06)" border="1px solid rgba(245,101,101,0.2)" borderRadius="8px" p={2.5}>
              <HStack gap={2}>
                <Icon as={AlertTriangle} boxSize={4} color="red.400" />
                <Text fontSize="9px" color="red.300">
                  {L("Alignement échoué. Vérifiez la caméra, INDI et les catalogues solve-field.",
                     "Alignment failed. Check camera, INDI connection and solve-field index files.")}
                </Text>
              </HStack>
            </Box>
          )}

          {/* Controls */}
          <HStack gap={2}>
            {!isRunning && (
              <Button flex={1}
                bg={phase === 'complete' ? 'rgba(72,187,120,0.12)' : 'rgba(0,255,209,0.08)'}
                color={phase === 'complete' ? 'green.300' : 'var(--astro-teal)'}
                border="1px solid"
                borderColor={phase === 'complete' ? 'rgba(72,187,120,0.3)' : 'rgba(0,255,209,0.25)'}
                fontWeight="bold" fontSize="11px" letterSpacing="0.1em"
                _hover={{ bg: phase === 'complete' ? 'rgba(72,187,120,0.2)' : 'rgba(0,255,209,0.15)' }}
                onClick={() => {
                  setPhase('limits-setup');
                  setLogs([]);
                  setResults([null, null, null]);
                  setFinalRa(null); setFinalDec(null);
                }}>
                <Icon as={RotateCcw} boxSize={3} mr={1} />
                {phase === 'complete' ? L("REFAIRE L'ALIGNEMENT", "RE-ALIGN") : L("RECOMMENCER", "RESTART")}
              </Button>
            )}
            {isRunning && (
              <Button flex={1}
                bg="rgba(245,101,101,0.08)" color="red.400"
                border="1px solid rgba(245,101,101,0.25)"
                fontWeight="bold" fontSize="11px" letterSpacing="0.1em"
                _hover={{ bg: 'rgba(245,101,101,0.15)' }}
                onClick={() => {
                  abortRef.current = true;
                  setPhase('failed');
                  log(L('⛔ Interrompu.', '⛔ Aborted.'), 'warn');
                }}>
                <Icon as={Square} boxSize={3} mr={1} />
                {L("INTERROMPRE", "ABORT")}
              </Button>
            )}
          </HStack>
        </VStack>
      )}
    </VStack>
  );
};
