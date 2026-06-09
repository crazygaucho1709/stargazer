"use client";

/**
 * /sensor — Page mobile pour le télescope
 *
 * Ouvrir sur le smartphone fixé sur le tube (haut du téléphone vers l'ouverture).
 * Streame en temps réel via WebSocket vers le backend Stargazer :
 *   alpha  → azimut (cap magnétique 0-360°, 0 = nord)
 *   beta   → inclinaison axiale (proxy altitude du tube)
 *   gamma  → roulis
 *   lat/lon/accuracy_m → GPS
 *
 * iOS 13+ : requiert HTTPS pour DeviceOrientationEvent.requestPermission().
 * Android  : fonctionne en HTTP sur réseau local.
 */

import { useEffect, useRef, useState, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SensorData {
  alpha: number | null;
  beta: number | null;
  gamma: number | null;
  lat: number | null;
  lon: number | null;
  accuracy_m: number | null;
}

type ConnState = "idle" | "connecting" | "live" | "error" | "https_required" | "monitor";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(v: number | null, decimals = 1): string {
  return v == null ? "—" : v.toFixed(decimals);
}

/** Convert beta (phone pitch) to approximate tube altitude.
 *  Mounting: top of phone toward objective, phone face up = tube horizontal.
 *  beta ≈ 0  → tube pointing up (zenith)
 *  beta ≈ 90 → tube horizontal
 *  alt ≈ 90 - |beta|
 */
function betaToAlt(beta: number | null): number | null {
  if (beta == null) return null;
  return Math.max(0, Math.min(90, 90 - Math.abs(beta)));
}

type Mode = "niveau" | "azimut" | "parking";

// ─── Session log ──────────────────────────────────────────────────────────────
interface SessionEntry {
  ts: string;
  az: number | null;
  alt: number | null;
  lat: number | null;
  lon: number | null;
  sunAlt: number | null;
  note: string;
}

// ─── Sun altitude (crépuscule) ────────────────────────────────────────────────
// Simplified USNO algorithm — accuracy ±1° sufficient for twilight indication

function sunAltitude(lat: number, lon: number, date = new Date()): number {
  const rad = Math.PI / 180;
  const D = date.getTime() / 86400000 - 10957; // days since J2000
  const g = (357.529 + 0.98560028 * D) * rad;
  const q = 280.459 + 0.98564736 * D;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
  const e = 23.439 * rad;
  const sinDec = Math.sin(e) * Math.sin(L);
  const dec = Math.asin(sinDec);
  const UT = (date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600);
  const GMST = (6.697375 + 0.0657098242 * D + UT) % 24;
  const RA = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)) / rad / 15;
  const LHA = ((GMST + lon / 15 - RA) % 24) * 15 * rad;
  const alt = Math.asin(
    Math.sin(lat * rad) * sinDec +
    Math.cos(lat * rad) * Math.cos(dec) * Math.cos(LHA)
  );
  return alt / rad;
}

function twilightLabel(alt: number): { label: string; color: string } {
  if (alt > 0) return { label: "☀ JOUR", color: "#ffd700" };
  if (alt > -6) return { label: "🌅 CIVIL", color: "#ff9944" };
  if (alt > -12) return { label: "🌆 NAUTIQUE", color: "#cc88ff" };
  if (alt > -18) return { label: "🌌 ASTRONOMIQUE", color: "#8888ff" };
  return { label: "🔭 NUIT", color: "#00ffb4" };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function httpsUrl(): string {
  if (typeof window === "undefined") return "";
  return `https://${window.location.hostname}:8443${window.location.pathname}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SensorPage() {
  const [state, setState] = useState<ConnState>("idle");
  const [mode, setMode] = useState<Mode>("niveau");
  const [sensor, setSensor] = useState<SensorData>({
    alpha: null, beta: null, gamma: null,
    lat: null, lon: null, accuracy_m: null,
  });
  const [parkRef, setParkRef] = useState<{ az: number; alt: number } | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [compassAccuracy, setCompassAccuracy] = useState<number | null>(null);
  const [sunAlt, setSunAlt] = useState<number | null>(null);
  const [sessionLog, setSessionLog] = useState<SessionEntry[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const latestRef = useRef<SensorData>(sensor);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  
  const [isSending, setIsSending] = useState(false);
  const isSendingRef = useRef(false);

  latestRef.current = sensor;

  // ── Wake Lock — prevent screen sleep ─────────────────────────────────────

  const acquireWakeLock = useCallback(async () => {
    if (!("wakeLock" in navigator)) return;
    try {
      wakeLockRef.current = await (navigator as any).wakeLock.request("screen");
      wakeLockRef.current.addEventListener("release", () => {
        // Re-acquire on visibility change (iOS releases on backgrounding)
        if (document.visibilityState === "visible") acquireWakeLock();
      });
    } catch {
      // Wake lock not critical — ignore silently
    }
  }, []);

  useEffect(() => {
    const onVisible = () => { if (state === "live") acquireWakeLock(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [state, acquireWakeLock]);

  // ── Sun altitude ticker ───────────────────────────────────────────────────

  useEffect(() => {
    if (sensor.lat == null || sensor.lon == null) return;
    const tick = () => setSunAlt(sunAltitude(sensor.lat!, sensor.lon!));
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [sensor.lat, sensor.lon]);

  // ── WebSocket with auto-reconnect (exponential backoff) ───────────────────

  const connectWs = useCallback(() => {
    if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = null; }
    const host = window.location.hostname;
    const isHttps = window.location.protocol === "https:";
    const wsUrl = isHttps
      ? `wss://${host}:${window.location.port}/ws/phone-sensor`
      : `ws://${host}:5005/ws/phone-sensor`;
    setState("connecting");

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setState(isSendingRef.current ? "live" : "monitor");
      retryCountRef.current = 0;
    };
    ws.onmessage = (evt) => {
      try {
        const d = JSON.parse(evt.data);
        // Only consume updates if we are NOT actively transmitting local sensor data
        if (!isSendingRef.current) {
          setSensor({
            alpha: d.alpha ?? null,
            beta: d.beta ?? null,
            gamma: d.gamma ?? null,
            lat: d.lat ?? null,
            lon: d.lon ?? null,
            accuracy_m: d.accuracy_m ?? null,
          });
          if (d.compassAccuracy != null) setCompassAccuracy(d.compassAccuracy);
          setState("monitor");
        }
      } catch (_) {}
    };
    ws.onerror = () => { /* onclose handles retry */ };
    ws.onclose = () => {
      if (wsRef.current !== ws) return;
      setState("connecting");
      // Exponential backoff: 1s, 2s, 4s, 8s … capped at 30s
      const delay = Math.min(1000 * 2 ** retryCountRef.current, 30_000);
      retryCountRef.current++;
      retryRef.current = setTimeout(connectWs, delay);
    };
  }, []);

  // ── Send sensor data every 200 ms ─────────────────────────────────────────

  useEffect(() => {
    if (state !== "live" && state !== "connecting") return;
    const id = setInterval(() => {
      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN && isSendingRef.current) {
        ws.send(JSON.stringify(latestRef.current));
      }
    }, 200);
    return () => clearInterval(id);
  }, [state]);

  // ── DeviceOrientation listener ────────────────────────────────────────────

  const startOrientation = useCallback(() => {
    const handler = (e: DeviceOrientationEvent) => {
      const ios = e as DeviceOrientationEvent & {
        webkitCompassHeading?: number;
        webkitCompassAccuracy?: number;
      };
      const az = ios.webkitCompassHeading ?? e.alpha;
      if (ios.webkitCompassAccuracy != null) setCompassAccuracy(ios.webkitCompassAccuracy);
      setSensor(prev => ({ ...prev, alpha: az, beta: e.beta, gamma: e.gamma }));
    };
    (window as Window).addEventListener("deviceorientation", handler, true);
    return () => (window as Window).removeEventListener("deviceorientation", handler, true);
  }, []);

  // ── Geolocation watcher ───────────────────────────────────────────────────

  const startGps = useCallback(() => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => setSensor(prev => ({
        ...prev,
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        accuracy_m: pos.coords.accuracy,
      })),
      null,
      { enableHighAccuracy: true, maximumAge: 2000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // ── Request permissions (iOS) then start ─────────────────────────────────

  const handleStart = useCallback(async () => {
    const DOE = DeviceOrientationEvent as any;
    if (typeof DOE.requestPermission === "function") {
      try {
        const res = await DOE.requestPermission();
        if (res !== "granted") {
          setState("https_required");
          setErrorMsg("Permission refusée. Autorise l'accès au mouvement dans Réglages > Safari.");
          return;
        }
      } catch {
        setState("https_required");
        setErrorMsg("iOS requiert HTTPS pour les capteurs. Ouvre cette page via https://");
        return;
      }
    }
    await acquireWakeLock();
    isSendingRef.current = true;
    setIsSending(true);
    startOrientation();
    startGps();
    setState("live");
  }, [startOrientation, startGps, acquireWakeLock]);

  // On iOS + HTTP: redirect to HTTPS immediately — requestPermission() throws otherwise
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.protocol !== "https:" && isIos()) {
      window.location.replace(httpsUrl());
    }
  }, []);

  // Connect WebSocket on mount
  useEffect(() => {
    connectWs();
  }, [connectWs]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (retryRef.current) clearTimeout(retryRef.current);
      wsRef.current?.close();
      wakeLockRef.current?.release();
    };
  }, []);

  // ── Park reference ────────────────────────────────────────────────────────

  const setPark = () => {
    const az = sensor.alpha ?? 0;
    const alt = betaToAlt(sensor.beta) ?? 0;
    setParkRef({ az, alt });
  };

  const deltaAz = parkRef != null && sensor.alpha != null
    ? (() => { let d = sensor.alpha - parkRef.az; if (d > 180) d -= 360; if (d < -180) d += 360; return d; })()
    : null;
  const deltaAlt = parkRef != null ? (betaToAlt(sensor.beta) ?? 0) - parkRef.alt : null;
  const alt = betaToAlt(sensor.beta);
  const twilight = sunAlt != null && sensor.lat != null ? twilightLabel(sunAlt) : null;
  const compassWarn = compassAccuracy != null && compassAccuracy > 20;

  const logEntry = (note = "Point observé") => {
    setSessionLog(prev => [...prev, {
      ts: new Date().toISOString(),
      az: sensor.alpha, alt: betaToAlt(sensor.beta),
      lat: sensor.lat, lon: sensor.lon,
      sunAlt, note,
    }]);
  };

  const exportLog = () => {
    const csv = [
      "timestamp,azimut,altitude,lat,lon,sun_alt,note",
      ...sessionLog.map(e =>
        `${e.ts},${e.az?.toFixed(2) ?? ""},${e.alt?.toFixed(2) ?? ""},${e.lat?.toFixed(6) ?? ""},${e.lon?.toFixed(6) ?? ""},${e.sunAlt?.toFixed(1) ?? ""},${e.note}`
      )
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stargazer-session-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={styles.root}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.dot(state)} />
        <span style={styles.title}>STARGAZER · SCOPE SENSOR</span>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {twilight && (
            <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 99,
              background: "rgba(255,255,255,0.06)", color: twilight.color,
              letterSpacing: "0.08em", fontWeight: "bold" }}>
              {twilight.label}
            </span>
          )}
          {compassWarn && (
            <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 99,
              background: "rgba(255,100,0,0.15)", color: "#ff9944", letterSpacing: "0.08em" }}
              title={`Précision boussole: ±${compassAccuracy?.toFixed(0)}°`}>
              ⚠ BOUSSOLE ±{compassAccuracy?.toFixed(0)}°
            </span>
          )}
          <span style={styles.badge(state)}>{STATE_LABELS[state]}</span>
        </div>
      </div>

      {/* Broadcast Promotion Banner */}
      {state === "monitor" && !isSending && (
        <div style={{
          padding: "10px 18px",
          background: "rgba(0, 180, 255, 0.12)",
          borderBottom: "1px solid rgba(0, 180, 255, 0.3)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          animation: "fadeIn 0.3s ease-out"
        }}>
          <span style={{ fontSize: 11, color: "#00b4ff", letterSpacing: "0.05em" }}>
            📱 Ce terminal fonctionne en mode écoute (lectures de l&apos;iPhone de la monture).
          </span>
          <button
            style={{
              background: "rgba(0, 255, 180, 0.15)",
              border: "1px solid rgba(0, 255, 180, 0.4)",
              color: "#00ffb4",
              padding: "6px 12px",
              borderRadius: 8,
              fontSize: 10,
              cursor: "pointer",
              fontFamily: "inherit",
              whiteSpace: "nowrap"
            }}
            onClick={handleStart}
          >
            ÉMETTRE DEPUIS CE TERMINAL
          </button>
        </div>
      )}

      {/* Start screen */}
      {state === "idle" && (
        <div style={styles.center}>
          <div style={styles.icon}>🔭</div>
          <p style={styles.hint}>
            Fixe ce téléphone sur le tube,<br />
            <b>haut du téléphone vers l&apos;objectif</b>.
          </p>
          <button style={styles.btn} onClick={handleStart}>
            ACTIVER LES CAPTEURS
          </button>
          {/* Remind iOS users to use HTTPS if on HTTP */}
          {typeof window !== "undefined" && window.location.protocol !== "https:" && (
            <div style={{ marginTop: 20, padding: "12px 16px", borderRadius: 10,
              background: "rgba(255,215,0,0.08)", border: "1px solid rgba(255,215,0,0.3)",
              maxWidth: 300, textAlign: "center" }}>
              <p style={{ fontSize: 11, color: "#ffd700", marginBottom: 8, lineHeight: 1.5 }}>
                📱 iPhone : les capteurs requièrent HTTPS
              </p>
              <a href={httpsUrl()} style={{
                fontSize: 11, color: "#00ffb4", textDecoration: "underline",
                wordBreak: "break-all", fontFamily: "monospace"
              }}>
                {httpsUrl()}
              </a>
            </div>
          )}
        </div>
      )}

      {/* HTTPS error */}
      {(state === "https_required" || state === "error") && (
        <div style={styles.center}>
          <div style={styles.icon}>🔒</div>
          <p style={styles.errorText}>{errorMsg}</p>
          <a
            href={httpsUrl()}
            style={{ ...styles.btn, textDecoration: "none", display: "block", textAlign: "center" }}
          >
            OUVRIR EN HTTPS →
          </a>
          <button style={{ ...styles.btn, background: "rgba(255,255,255,0.06)", color: "#667788", marginTop: 4 }} onClick={() => setState("idle")}>
            RETOUR
          </button>
        </div>
      )}

      {/* Connecting / auto-reconnect */}
      {state === "connecting" && (
        <div style={styles.center}>
          <div style={{ ...styles.icon, animation: "spin 1s linear infinite" }}>⟳</div>
          <p style={styles.hint}>
            {retryCountRef.current > 0
              ? `Reconnexion… (tentative ${retryCountRef.current})`
              : "Connexion au backend…"}
          </p>
        </div>
      )}

      {/* Live / Monitor */}
      {(state === "live" || state === "monitor") && (
        <div style={styles.live}>

          {/* Mode tabs */}
          <div style={styles.tabs}>
            {(["niveau", "azimut", "parking"] as Mode[]).map(m => (
              <button key={m} style={styles.tab(m === mode)} onClick={() => setMode(m)}>
                {m === "niveau" ? "⚖ NIVEAU" : m === "azimut" ? "🧭 AZIMUT" : "📍 PARKING"}
              </button>
            ))}
          </div>

          {/* ── NIVEAU ──────────────────────────────────────────────── */}
          {mode === "niveau" && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
              <BubbleLevel beta={sensor.beta} gamma={sensor.gamma} />
              <div style={styles.grid}>
                <Metric label="TANGAGE (β)" value={sensor.beta != null ? `${fmt(sensor.beta)}°` : "—"} color="#ffd700" />
                <Metric label="ROULIS (γ)" value={sensor.gamma != null ? `${fmt(sensor.gamma)}°` : "—"} color="#aaaaff" />
              </div>
              <div style={{ fontSize: 10, color: "#445566", textAlign: "center", lineHeight: 1.6 }}>
                Pose le téléphone à plat sur la tête du trépied.<br/>
                β = tangage avant/arrière · γ = roulis gauche/droite
              </div>
            </div>
          )}

          {/* ── AZIMUT ──────────────────────────────────────────────── */}
          {mode === "azimut" && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
              <div style={styles.compassWrap}>
                <div style={{ ...styles.compassRing, transform: `rotate(${-(sensor.alpha ?? 0)}deg)` }}>
                  {["N","NE","E","SE","S","SO","O","NO"].map((l, i) => (
                    <span key={l} style={styles.compassLabel(i * 45)}>{l}</span>
                  ))}
                </div>
                <div style={styles.compassNeedle} />
                <div style={styles.compassCenter}>
                  {sensor.alpha != null ? (
                    <>
                      <span style={{ fontSize: 22, fontWeight: "bold", color: "#00ffb4" }}>
                        {fmt(sensor.alpha, 1)}°
                      </span>
                      <span style={{ fontSize: 11, color: "#8899aa" }}>AZIMUT</span>
                    </>
                  ) : (
                    <span style={{ fontSize: 10, color: "#556677", textAlign: "center", padding: "0 20px" }}>
                      Bougez<br/>le téléphone
                    </span>
                  )}
                </div>
              </div>
              <div style={styles.grid}>
                <Metric label="ALTITUDE TUBE" value={`${fmt(alt)}°`} color="#ffd700" />
                <Metric label="GPS LAT" value={fmt(sensor.lat, 5)} color="#00ffb4" />
                <Metric label="GPS LON" value={fmt(sensor.lon, 5)} color="#00ffb4" />
                <Metric label="PRÉCISION GPS" value={sensor.accuracy_m != null ? `±${fmt(sensor.accuracy_m, 0)}m` : "—"} color="#aaaaff" />
              </div>
              {/* Session log */}
              <div style={{ display: "flex", gap: 8 }}>
                <button style={{ ...styles.btn, flex: 1, fontSize: 11 }} onClick={() => logEntry()}>
                  📝 ENREGISTRER POINT ({sessionLog.length})
                </button>
                {sessionLog.length > 0 && (
                  <button style={{ ...styles.btn, flex: 1, fontSize: 11, background: "rgba(0,100,60,0.2)" }} onClick={exportLog}>
                    ⬇ EXPORT CSV
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── PARKING ─────────────────────────────────────────────── */}
          {mode === "parking" && (
            <div style={styles.parkBox}>
              <div style={styles.parkTitle}>POSITION DE PARKING</div>
              {parkRef == null ? (
                <>
                  <p style={{ fontSize: 12, color: "#8899aa", marginBottom: 16, lineHeight: 1.6 }}>
                    Amène le tube en position home, puis définis la position de référence.
                  </p>
                  <button style={styles.btn} onClick={setPark}>
                    📍 DÉFINIR ICI COMME PARKING
                  </button>
                </>
              ) : (
                <>
                  <div style={styles.parkRow}>
                    <GuidanceArrow label="AZIMUT" delta={deltaAz} unit="°" />
                    <GuidanceArrow label="ALTITUDE" delta={deltaAlt} unit="°" />
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button style={{ ...styles.btn, flex: 1 }} onClick={setPark}>
                      ↻ RECALIBRER
                    </button>
                    <button style={{ ...styles.btn, flex: 1, background: "#1a3a2a" }} onClick={() => setParkRef(null)}>
                      ✕ EFFACER
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
      `}</style>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

// ─── Bubble Level ─────────────────────────────────────────────────────────────

const LEVEL_RADIUS = 110; // px outer circle
const BUBBLE_RADIUS = 22; // px bubble
const LEVEL_TOLERANCE = 1.5; // ° → green
const LEVEL_WARN = 4;       // ° → yellow

function BubbleLevel({ beta, gamma }: { beta: number | null; gamma: number | null }) {
  const MAX_TILT = 20; // ° = edge of circle
  const bx = gamma != null ? Math.max(-1, Math.min(1, gamma / MAX_TILT)) : 0;
  const by = beta  != null ? Math.max(-1, Math.min(1, beta  / MAX_TILT)) : 0;
  const cx = bx * (LEVEL_RADIUS - BUBBLE_RADIUS - 4);
  const cy = by * (LEVEL_RADIUS - BUBBLE_RADIUS - 4);
  const tilt = beta != null && gamma != null
    ? Math.sqrt(beta * beta + gamma * gamma)
    : null;
  const ok    = tilt != null && tilt < LEVEL_TOLERANCE;
  const warn  = tilt != null && tilt >= LEVEL_TOLERANCE && tilt < LEVEL_WARN;
  const bad   = tilt != null && tilt >= LEVEL_WARN;
  const bubbleColor = ok ? "#00ffb4" : warn ? "#ffd700" : bad ? "#ff6b6b" : "#334455";
  const statusColor = ok ? "#00ffb4" : warn ? "#ffd700" : bad ? "#ff6b6b" : "#556677";
  const statusLabel = ok ? "✓ NIVEAU" : warn ? "⚠ AJUSTE" : bad ? "✗ PAS NIVEAU" : "—";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
      {/* Outer circle */}
      <div style={{
        position: "relative",
        width: LEVEL_RADIUS * 2,
        height: LEVEL_RADIUS * 2,
        borderRadius: "50%",
        border: `2px solid rgba(255,255,255,0.1)`,
        background: "radial-gradient(circle, rgba(0,30,50,0.9) 0%, rgba(0,10,20,0.95) 100%)",
        boxShadow: ok ? `0 0 20px rgba(0,255,180,0.2)` : "none",
      }}>
        {/* Crosshair */}
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "absolute", width: "100%", height: 1, background: "rgba(255,255,255,0.06)" }} />
          <div style={{ position: "absolute", width: 1, height: "100%", background: "rgba(255,255,255,0.06)" }} />
        </div>
        {/* Green zone (center tolerance circle) */}
        <div style={{
          position: "absolute",
          width: (LEVEL_TOLERANCE / MAX_TILT) * LEVEL_RADIUS * 2 * 2,
          height: (LEVEL_TOLERANCE / MAX_TILT) * LEVEL_RADIUS * 2 * 2,
          borderRadius: "50%",
          border: "1px solid rgba(0,255,180,0.25)",
          top: "50%", left: "50%",
          transform: "translate(-50%,-50%)",
        }} />
        {/* Bubble */}
        <div style={{
          position: "absolute",
          width: BUBBLE_RADIUS * 2,
          height: BUBBLE_RADIUS * 2,
          borderRadius: "50%",
          background: `radial-gradient(circle at 35% 35%, ${bubbleColor}cc, ${bubbleColor}55)`,
          border: `2px solid ${bubbleColor}`,
          boxShadow: `0 0 12px ${bubbleColor}88`,
          top: "50%", left: "50%",
          transform: `translate(calc(-50% + ${cx}px), calc(-50% + ${cy}px))`,
          transition: "transform 0.15s ease-out, background 0.3s, border-color 0.3s, box-shadow 0.3s",
        }} />
        {/* Tilt value center */}
        {tilt != null && (
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            pointerEvents: "none",
          }}>
            <span style={{ fontSize: 13, fontWeight: "bold", color: statusColor, fontFamily: "monospace" }}>
              {tilt.toFixed(1)}°
            </span>
          </div>
        )}
      </div>
      {/* Status badge */}
      <div style={{
        padding: "6px 20px",
        borderRadius: 99,
        background: ok ? "rgba(0,255,180,0.12)" : warn ? "rgba(255,215,0,0.12)" : bad ? "rgba(255,107,107,0.12)" : "rgba(255,255,255,0.05)",
        border: `1px solid ${statusColor}44`,
        fontSize: 13, fontWeight: "bold", letterSpacing: "0.1em",
        color: statusColor,
      }}>
        {statusLabel}
        {tilt != null && !ok && (
          <span style={{ fontSize: 10, fontWeight: "normal", marginLeft: 8, color: statusColor + "99" }}>
            β {fmt(beta)}° γ {fmt(gamma)}°
          </span>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "10px 14px" }}>
      <div style={{ fontSize: 9, color: "#556677", letterSpacing: "0.15em", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: "bold", color, fontFamily: "monospace" }}>{value}</div>
    </div>
  );
}

function GuidanceArrow({ label, delta, unit }: { label: string; delta: number | null; unit: string }) {
  if (delta == null) return null;
  const abs = Math.abs(delta);
  const ok = abs < 1.5;
  const arrow = ok ? "✓" : delta > 0 ? "→" : "←";
  const color = ok ? "#00ffb4" : abs < 5 ? "#ffd700" : "#ff6b6b";
  return (
    <div style={{ flex: 1, textAlign: "center", background: "rgba(0,0,0,0.3)", borderRadius: 10, padding: "10px 6px" }}>
      <div style={{ fontSize: 9, color: "#556677", letterSpacing: "0.1em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, color }}>{arrow}</div>
      <div style={{ fontSize: 14, color, fontFamily: "monospace", marginTop: 4 }}>
        {ok ? "OK" : `${delta > 0 ? "+" : ""}${delta.toFixed(1)}${unit}`}
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const STATE_LABELS: Record<ConnState, string> = {
  idle: "EN ATTENTE",
  connecting: "CONNEXION…",
  live: "LIVE",
  error: "ERREUR",
  https_required: "HTTPS REQUIS",
  monitor: "MONITEUR",
};

const styles: Record<string, any> = {
  root: {
    minHeight: "100dvh",
    background: "#020817",
    color: "white",
    fontFamily: "'Courier New', monospace",
    display: "flex",
    flexDirection: "column",
    userSelect: "none",
    WebkitUserSelect: "none",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "14px 18px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(3,5,9,0.9)",
    backdropFilter: "blur(10px)",
    position: "sticky" as const,
    top: 0,
    zIndex: 10,
  },
  title: { fontSize: 12, letterSpacing: "0.15em", color: "#8899aa", flex: 1 },
  dot: (s: ConnState) => ({
    width: 8, height: 8, borderRadius: "50%",
    background: s === "live" ? "#00ffb4" : s === "monitor" ? "#00b4ff" : s === "error" || s === "https_required" ? "#ff6b6b" : s === "connecting" ? "#ffd700" : "#334",
    boxShadow: s === "live" || s === "monitor" ? `0 0 8px ${s === "live" ? "#00ffb4" : "#00b4ff"}` : "none",
  }),
  badge: (s: ConnState) => ({
    fontSize: 9,
    padding: "2px 8px",
    borderRadius: 99,
    background: s === "live" ? "rgba(0,255,180,0.15)" : s === "monitor" ? "rgba(0,180,255,0.15)" : "rgba(255,255,255,0.06)",
    color: s === "live" ? "#00ffb4" : s === "monitor" ? "#00b4ff" : "#889",
    letterSpacing: "0.1em",
  }),
  center: {
    flex: 1, display: "flex", flexDirection: "column" as const,
    alignItems: "center", justifyContent: "center", padding: 32, gap: 18,
    textAlign: "center" as const,
  },
  icon: { fontSize: 56 },
  hint: { color: "#8899aa", fontSize: 14, lineHeight: 1.6 },
  errorText: { color: "#ff8888", fontSize: 13, lineHeight: 1.6, maxWidth: 300 },
  btn: {
    background: "rgba(0,255,180,0.15)",
    border: "1px solid rgba(0,255,180,0.4)",
    color: "#00ffb4",
    padding: "14px 28px",
    borderRadius: 12,
    fontSize: 13,
    letterSpacing: "0.1em",
    fontFamily: "'Courier New', monospace",
    cursor: "pointer",
    width: "100%",
    maxWidth: 300,
  },
  live: { flex: 1, display: "flex", flexDirection: "column" as const, padding: "16px 16px 32px", gap: 16 },
  tabs: {
    display: "flex", gap: 6,
    background: "rgba(255,255,255,0.04)",
    borderRadius: 12, padding: 4,
    border: "1px solid rgba(255,255,255,0.06)",
  },
  tab: (active: boolean) => ({
    flex: 1, padding: "8px 4px", borderRadius: 8,
    border: "none", cursor: "pointer",
    fontSize: 11, fontWeight: "bold", letterSpacing: "0.08em",
    fontFamily: "'Courier New', monospace",
    background: active ? "rgba(0,255,180,0.15)" : "transparent",
    color: active ? "#00ffb4" : "#556677",
    borderBottom: active ? "2px solid #00ffb4" : "2px solid transparent",
    transition: "all 0.2s",
  }),
  compassWrap: {
    position: "relative" as const,
    width: 200, height: 200,
    alignSelf: "center",
    margin: "8px 0",
  },
  compassRing: {
    position: "absolute" as const, inset: 0,
    borderRadius: "50%",
    border: "2px solid rgba(0,255,180,0.2)",
    transition: "transform 0.2s ease-out",
  },
  compassLabel: (deg: number) => ({
    position: "absolute" as const,
    fontSize: 11, fontWeight: "bold",
    color: deg === 0 ? "#ff6b6b" : "#556677",
    left: "50%", top: "50%",
    transform: `rotate(${deg}deg) translateY(-88px) rotate(${-deg}deg) translate(-50%, -50%)`,
  }),
  compassNeedle: {
    position: "absolute" as const,
    left: "50%", top: 10,
    width: 2, height: 80,
    background: "linear-gradient(to bottom, #ff6b6b, transparent)",
    transform: "translateX(-50%)",
    borderRadius: 2,
  },
  compassCenter: {
    position: "absolute" as const,
    inset: 0, display: "flex", flexDirection: "column" as const,
    alignItems: "center", justifyContent: "center",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },
  parkBox: {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,215,0,0.2)",
    borderRadius: 14,
    padding: 16,
  },
  parkTitle: {
    fontSize: 10, letterSpacing: "0.15em",
    color: "#ffd700", marginBottom: 12,
  },
  parkRow: { display: "flex", gap: 10 },
};
