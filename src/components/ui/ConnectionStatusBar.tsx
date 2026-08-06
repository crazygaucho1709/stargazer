// src/components/ui/ConnectionStatusBar.tsx
"use client";

import { useState } from "react";
import { useHealthFull } from "@/hooks/useHealthFull";
import { useRecovery } from "@/hooks/useRecovery";
import { notification } from "@/lib/notificationService";

interface DeviceHealth {
  status: "ok" | "error" | "missing";
  latency_ms?: number;
  driver?: string;
  type?: string;
}

interface HealthFull {
  bridge: DeviceHealth;
  ssh: DeviceHealth;
  mount: DeviceHealth;
  camera: DeviceHealth;
}

type StatusColor = "ok" | "degraded" | "error" | "offline";

const COLOR_MAP: Record<StatusColor, string> = {
  ok:      "#48BB78",
  degraded:"#ECC94B",
  error:   "#FC8181",
  offline: "#4A5568",
};

function resolveColor(status: string | undefined, backendOffline: boolean): StatusColor {
  if (backendOffline) return "offline";
  if (!status) return "offline";
  if (status === "ok") return "ok";
  if (status === "missing") return "degraded";
  return "error";
}

interface PillProps {
  icon: string;
  name: string;
  subtitle?: string;
  color: StatusColor;
  latency?: number;
}

function StatusPill({ icon, name, subtitle, color, latency }: PillProps) {
  const dotColor = COLOR_MAP[color];
  const isOnline = color === "ok";
  // Tronquer le subtitle au premier mot significatif (ex: "Celestron GPS" → "Celestron", "Canon DSLR EOS 600D" → "EOS 600D")
  const shortSub = subtitle
    ? subtitle.replace(/^Canon\s+DSLR\s+/i, "").replace(/^Celestron\s+/i, "").split(" ").slice(0, 2).join(" ")
    : undefined;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "5px",
      padding: "0 8px", height: "22px", borderRadius: "11px",
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.08)",
      flexShrink: 0, opacity: color === "offline" ? 0.45 : 1,
      maxWidth: "160px", overflow: "hidden",
    }}>
      <span style={{ fontSize: "11px", lineHeight: 1, flexShrink: 0 }}>{icon}</span>
      <span style={{
        fontSize: "11px", fontWeight: 500, color: "#CBD5E0", letterSpacing: "0.02em",
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      }}>
        {name}
        {shortSub && <span style={{ color: "#718096", marginLeft: "4px", fontWeight: 400 }}>{shortSub}</span>}
      </span>
      {latency !== undefined && (
        <span style={{ fontSize: "10px", color: "#718096", fontFamily: "monospace", whiteSpace: "nowrap", flexShrink: 0 }}>
          {latency}ms
        </span>
      )}
      <span
        className={isOnline ? "status-dot-pulse" : undefined}
        style={{ width: "6px", height: "6px", borderRadius: "50%", background: dotColor, flexShrink: 0 }}
      />
    </div>
  );
}

function RecoveryButton() {
  const { recovering, diagnose, recover } = useRecovery();
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    if (busy || recovering) return;
    setBusy(true);
    try {
      const diag = await diagnose();
      if (diag && !diag.recoverable) {
        notification.error("Reprise impossible : Raspberry Pi injoignable", {
          description: `SSH ${diag.pi_ssh ? "OK" : "KO"} · INDI ${diag.pi_indi ? "OK" : "KO"} — vérifiez l'alimentation/réseau du Pi`,
          source: "Recovery",
        });
        return;
      }
      await recover();
    } finally {
      setBusy(false);
    }
  };

  const active = busy || recovering;
  return (
    <button
      onClick={handleClick}
      disabled={active}
      style={{
        display: "flex", alignItems: "center", gap: "4px",
        padding: "0 10px", height: "20px", borderRadius: "10px",
        background: active ? "rgba(236,201,75,0.10)" : "rgba(236,201,75,0.15)",
        border: "1px solid rgba(236,201,75,0.4)",
        color: "#ECC94B", fontSize: "10px", fontWeight: 600,
        letterSpacing: "0.05em", cursor: active ? "wait" : "pointer",
        fontFamily: "monospace",
      }}
    >
      <span style={{
        display: "inline-block",
        animation: active ? "spin 1s linear infinite" : undefined,
      }}>⟳</span>
      {active ? "REPRISE..." : "REPRISE"}
    </button>
  );
}

export const ConnectionStatusBar = () => {
  // Source unique partagée — un seul poller pour toute l'app (voir useHealthFull)
  const { data: health, backendOffline, latencyMs: globalLatency } = useHealthFull();

  const bc = resolveColor(health?.bridge?.status, backendOffline);
  const sc = resolveColor(health?.ssh?.status, backendOffline);
  const mc = resolveColor(health?.mount?.status, backendOffline);
  const cc = resolveColor(health?.camera?.status, backendOffline);
  const isLive = !backendOffline && health !== null;

  return (
    <>
      <style>{`
        @keyframes statusPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.85); }
        }
        .status-dot-pulse { animation: statusPulse 2s ease-in-out infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 9999,
        height: "32px",
        background: "rgba(5, 5, 10, 0.98)",
        borderBottom: `1px solid ${backendOffline ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.06)"}`,
        display: "flex", alignItems: "center",
        paddingLeft: "12px", paddingRight: "12px", gap: "8px",
      }}>
        {backendOffline && (
          <>
            <span style={{ fontSize: "10px", color: "#4A5568", fontFamily: "monospace", letterSpacing: "0.05em", marginRight: 4 }}>
              BACKEND OFFLINE
            </span>
            <RecoveryButton />
          </>
        )}

        <StatusPill icon="⬡" name="INDI" color={bc} latency={health?.bridge?.latency_ms} />
        <StatusPill icon="⌁" name="SSH"  color={sc} latency={health?.ssh?.latency_ms} />
        <StatusPill icon="◎" name="Mount" subtitle={health?.mount?.driver ? `${health.mount.driver}` : undefined} color={mc} />
        <StatusPill icon="▣" name="Camera" subtitle={health?.camera?.type} color={cc} />

        <div style={{ flex: 1 }} />

        {globalLatency !== null && (
          <span style={{ fontSize: "10px", color: "#4A5568", fontFamily: "monospace" }}>
            {globalLatency}ms
          </span>
        )}

        <div style={{
          display: "flex", alignItems: "center", gap: "5px",
          padding: "0 8px", height: "18px", borderRadius: "9px",
          background: isLive ? "rgba(72,187,120,0.12)" : "rgba(74,85,104,0.12)",
          border: `1px solid ${isLive ? "rgba(72,187,120,0.3)" : "rgba(74,85,104,0.2)"}`,
        }}>
          <span
            className={isLive ? "status-dot-pulse" : undefined}
            style={{ width: "5px", height: "5px", borderRadius: "50%", background: isLive ? "#48BB78" : "#4A5568" }}
          />
          <span style={{
            fontSize: "9px", fontWeight: 700, letterSpacing: "0.08em",
            color: isLive ? "#48BB78" : "#4A5568", fontFamily: "monospace",
          }}>
            {isLive ? "LIVE" : "OFFLINE"}
          </span>
        </div>
      </div>

      <div style={{ height: "32px", flexShrink: 0 }} />
    </>
  );
};
