// src/components/observatory/PhoneSensorWidget.tsx
"use client";

/**
 * PhoneSensorWidget — affiche l'état du capteur smartphone en temps réel.
 * Polling toutes les 2 secondes vers /api/phone-sensor.
 * Lorsque connecté, propose de synchroniser le GPS dans le store Stargazer.
 */

import { useState, useEffect, useCallback } from "react";
import { Smartphone, Compass, Navigation, MapPin, RotateCcw, Wifi, WifiOff } from "lucide-react";
import { useStargazerStore } from "@/store/useStargazerStore";

interface PhoneSensorState {
  connected: boolean;
  alpha: number | null;   // azimut compas 0-360°
  beta: number | null;    // pitch
  gamma: number | null;   // roll
  lat: number | null;
  lon: number | null;
  accuracy_m: number | null;
  timestamp: string | null;
}

function betaToAlt(beta: number | null): number | null {
  if (beta == null) return null;
  return Math.max(0, Math.min(90, 90 - Math.abs(beta)));
}

function fmt(v: number | null, dec = 1): string {
  return v == null ? "—" : v.toFixed(dec);
}

function deltaAz(current: number, target: number): number {
  let d = current - target;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

export function PhoneSensorWidget() {
  const [data, setData] = useState<PhoneSensorState | null>(null);
  const [parkTarget, setParkTarget] = useState<{ az: number; alt: number } | null>(null);
  const { updateConfig, language } = useStargazerStore();

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch("/api/phone-sensor", { cache: "no-store" });
      if (res.ok) setData(await res.json());
    } catch {
      // backend offline
    }
  }, []);

  useEffect(() => {
    fetchState();
    const id = setInterval(fetchState, 2000);
    return () => clearInterval(id);
  }, [fetchState]);

  const syncGps = () => {
    if (data?.lat != null && data?.lon != null) {
      updateConfig({
        latitude: data.lat.toFixed(6),
        longitude: data.lon.toFixed(6),
      });
    }
  };

  const alt = betaToAlt(data?.beta ?? null);

  const azDelta =
    parkTarget != null && data?.alpha != null ? deltaAz(data.alpha, parkTarget.az) : null;
  const altDelta =
    parkTarget != null && alt != null ? alt - parkTarget.alt : null;

  const isConnected = data?.connected === true;

  const sensorUrl =
    typeof window !== "undefined" ? `http://${window.location.hostname}:3001/sensor` : "/sensor";

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.02)",
        border: `1px solid ${isConnected ? "rgba(0,255,180,0.25)" : "rgba(255,255,255,0.08)"}`,
        borderRadius: 12,
        padding: 16,
        width: "100%",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Smartphone
            size={16}
            color={isConnected ? "var(--astro-teal)" : "rgba(255,255,255,0.3)"}
          />
          <span
            style={{
              fontSize: 12,
              fontWeight: "bold",
              letterSpacing: "0.08em",
              color: "rgba(255,255,255,0.9)",
            }}
          >
            {language === "fr" ? "CAPTEUR SMARTPHONE" : "PHONE SENSOR"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isConnected ? (
            <div
              style={{
                fontSize: 8,
                color: "#4ade80",
                background: "rgba(74,222,128,0.1)",
                border: "1px solid rgba(74,222,128,0.3)",
                borderRadius: 4,
                padding: "2px 6px",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Wifi size={10} />
              LIVE
            </div>
          ) : (
            <div
              style={{
                fontSize: 8,
                color: "rgba(255,255,255,0.4)",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 4,
                padding: "2px 6px",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <WifiOff size={10} />
              {language === "fr" ? "DÉCONNECTÉ" : "OFFLINE"}
            </div>
          )}
        </div>
      </div>

      {/* Not connected: show URL */}
      {!isConnected && (
        <div className="flex flex-col gap-2">
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
            {language === "fr"
              ? "Ouvre cette URL sur ton smartphone fixé sur le tube :"
              : "Open this URL on the phone mounted on the tube:"}
          </span>
          <div
            style={{
              background: "rgba(0,255,180,0.06)",
              border: "1px solid rgba(0,255,180,0.2)",
              borderRadius: 6,
              padding: "8px 12px",
              width: "100%",
            }}
          >
            <span
              style={{
                fontSize: 11,
                color: "var(--astro-teal)",
                fontFamily: "monospace",
                wordBreak: "break-all",
              }}
            >
              {sensorUrl}
            </span>
          </div>
          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", fontStyle: "italic" }}>
            {language === "fr"
              ? "iOS 13+ requiert HTTPS — Android fonctionne en HTTP local."
              : "iOS 13+ requires HTTPS — Android works over local HTTP."}
          </span>
        </div>
      )}

      {/* Connected: show sensor data */}
      {isConnected && data && (
        <div className="flex flex-col gap-3">

          {/* Compass + altitude */}
          <div className="flex items-center gap-2">
            <div
              style={{
                flex: 1,
                background: "rgba(0,0,0,0.3)",
                borderRadius: 10,
                padding: 12,
                textAlign: "center",
              }}
            >
              <div className="flex items-center justify-center gap-1 mb-1">
                <Compass size={12} color="var(--astro-teal)" />
                <span style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em" }}>
                  AZIMUT
                </span>
              </div>
              <span
                style={{ fontSize: 22, color: "var(--astro-teal)" }}
                className="hud-font"
              >
                {fmt(data.alpha)}°
              </span>
            </div>
            <div
              style={{
                flex: 1,
                background: "rgba(0,0,0,0.3)",
                borderRadius: 10,
                padding: 12,
                textAlign: "center",
              }}
            >
              <div className="flex items-center justify-center gap-1 mb-1">
                <Navigation size={12} color="var(--astro-gold)" />
                <span style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em" }}>
                  ALTITUDE TUBE
                </span>
              </div>
              <span
                style={{ fontSize: 22, color: "var(--astro-gold)" }}
                className="hud-font"
              >
                {fmt(alt)}°
              </span>
            </div>
          </div>

          {/* Level indicator */}
          <LevelIndicator beta={data.beta} gamma={data.gamma} />

          {/* GPS */}
          {data.lat != null && (
            <div
              style={{
                background: "rgba(0,0,0,0.3)",
                borderRadius: 10,
                padding: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div className="flex items-center gap-2">
                <MapPin size={12} color="var(--astro-teal)" />
                <div className="flex flex-col gap-0">
                  <span
                    style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", letterSpacing: "0.1em" }}
                  >
                    GPS
                  </span>
                  <span style={{ fontSize: 11, color: "white" }} className="hud-font">
                    {data.lat.toFixed(5)}°, {data.lon?.toFixed(5)}°
                  </span>
                  {data.accuracy_m != null && (
                    <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>
                      ±{fmt(data.accuracy_m, 0)} m
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={syncGps}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--astro-teal)",
                  fontSize: 9,
                  letterSpacing: "0.05em",
                  cursor: "pointer",
                }}
              >
                SYNC →
              </button>
            </div>
          )}

          {/* Parking guidance */}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 12 }}>
            <p
              style={{
                fontSize: 9,
                color: "var(--astro-gold)",
                letterSpacing: "0.15em",
                marginBottom: 8,
                margin: "0 0 8px",
              }}
            >
              {language === "fr" ? "GUIDAGE PARKING" : "PARKING GUIDANCE"}
            </p>

            {parkTarget == null ? (
              <button
                onClick={() => setParkTarget({ az: data.alpha ?? 0, alt: alt ?? 0 })}
                style={{
                  width: "100%",
                  background: "rgba(255,215,0,0.1)",
                  border: "1px solid rgba(255,215,0,0.3)",
                  color: "var(--astro-gold)",
                  fontSize: 10,
                  borderRadius: 8,
                  padding: "8px 0",
                  cursor: "pointer",
                }}
              >
                📍 {language === "fr" ? "DÉFINIR POSITION ACTUELLE COMME PARKING" : "SET CURRENT AS PARK POSITION"}
              </button>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <GuidanceTile
                    label="AZIMUT"
                    delta={azDelta}
                    leftLabel="← GAUCHE"
                    rightLabel="DROITE →"
                  />
                  <GuidanceTile
                    label="ALTITUDE"
                    delta={altDelta}
                    leftLabel="↓ BAS"
                    rightLabel="HAUT ↑"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setParkTarget({ az: data.alpha ?? 0, alt: alt ?? 0 })}
                    style={{
                      flex: 1,
                      background: "transparent",
                      border: "none",
                      color: "var(--astro-gold)",
                      fontSize: 9,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 4,
                    }}
                  >
                    <RotateCcw size={12} />
                    {language === "fr" ? "RECALIBRER" : "RECALIBRATE"}
                  </button>
                  <button
                    onClick={() => setParkTarget(null)}
                    style={{
                      flex: 1,
                      background: "transparent",
                      border: "none",
                      color: "rgba(255,255,255,0.3)",
                      fontSize: 9,
                      cursor: "pointer",
                    }}
                  >
                    {language === "fr" ? "EFFACER" : "CLEAR"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Level indicator (compact) ────────────────────────────────────────────────

function LevelIndicator({ beta, gamma }: { beta: number | null; gamma: number | null }) {
  const tilt =
    beta != null && gamma != null ? Math.sqrt(beta * beta + gamma * gamma) : null;
  const ok   = tilt != null && tilt < 1.5;
  const warn = tilt != null && tilt >= 1.5 && tilt < 4;
  const bad  = tilt != null && tilt >= 4;
  const color = ok ? "var(--astro-teal)" : warn ? "var(--astro-gold)" : bad ? "#ff6b6b" : "rgba(255,255,255,0.2)";
  const label = ok ? "✓ NIVEAU" : warn ? "⚠ AJUSTE" : bad ? "✗ PAS NIVEAU" : "—";

  const MAX_TILT = 15;
  const R = 24;
  const br = 7;
  const bx = gamma != null ? Math.max(-1, Math.min(1, gamma / MAX_TILT)) * (R - br - 2) : 0;
  const by = beta  != null ? Math.max(-1, Math.min(1, beta  / MAX_TILT)) * (R - br - 2) : 0;
  const bubbleColor = ok ? "#00ffb4" : warn ? "#ffd700" : bad ? "#ff6b6b" : "#334";

  return (
    <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 10, padding: 12 }}>
      <div className="flex items-center gap-3">
        {/* Mini bubble */}
        <div
          style={{
            position: "relative",
            width: R * 2,
            height: R * 2,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              border: "1px solid rgba(255,255,255,0.1)",
              background: "rgba(0,10,20,0.8)",
            }}
          />
          {/* crosshair */}
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: 0,
              right: 0,
              height: 1,
              background: "rgba(255,255,255,0.08)",
              transform: "translateY(-50%)",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: 0,
              bottom: 0,
              width: 1,
              background: "rgba(255,255,255,0.08)",
              transform: "translateX(-50%)",
            }}
          />
          {/* bubble */}
          <div
            style={{
              position: "absolute",
              width: br * 2,
              height: br * 2,
              borderRadius: "50%",
              background: bubbleColor,
              opacity: 0.85,
              boxShadow: `0 0 6px ${bubbleColor}`,
              top: "50%",
              left: "50%",
              transform: `translate(calc(-50% + ${bx}px), calc(-50% + ${by}px))`,
              transition: "transform 0.2s ease-out",
            }}
          />
        </div>

        <div className="flex flex-col gap-0 flex-1">
          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", letterSpacing: "0.12em" }}>
            NIVEAU TRÉPIED
          </span>
          <span style={{ fontSize: 12, fontWeight: "bold", color }}>{label}</span>
          {tilt != null && (
            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", fontFamily: "monospace" }}>
              β {beta?.toFixed(1)}° γ {gamma?.toFixed(1)}° · écart {tilt.toFixed(1)}°
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Guidance tile ─────────────────────────────────────────────────────────────

function GuidanceTile({
  label,
  delta,
  leftLabel,
  rightLabel,
}: {
  label: string;
  delta: number | null;
  leftLabel: string;
  rightLabel: string;
}) {
  if (delta == null) return null;
  const abs = Math.abs(delta);
  const ok = abs < 1.5;
  const color = ok
    ? "var(--astro-teal)"
    : abs < 5
    ? "var(--astro-gold)"
    : "var(--astro-error, #ff6b6b)";
  const arrow = ok ? "✓" : delta < 0 ? leftLabel : rightLabel;

  return (
    <div
      style={{
        flex: 1,
        background: "rgba(0,0,0,0.4)",
        borderRadius: 6,
        padding: 12,
        textAlign: "center",
      }}
    >
      <p style={{ fontSize: 8, color: "rgba(255,255,255,0.3)", letterSpacing: "0.1em", marginBottom: 4, margin: "0 0 4px" }}>
        {label}
      </p>
      <p style={{ fontSize: 13, color, fontWeight: "bold", marginBottom: 4, margin: "0 0 4px" }}>
        {arrow}
      </p>
      <p style={{ fontSize: 16, color, margin: 0 }} className="hud-font">
        {ok ? "OK" : `${Math.abs(delta).toFixed(1)}°`}
      </p>
    </div>
  );
}
