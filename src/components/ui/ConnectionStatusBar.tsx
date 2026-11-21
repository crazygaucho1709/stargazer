// src/components/ui/ConnectionStatusBar.tsx
"use client";

import { useState, type ReactNode } from "react";
import { Network, Terminal, Telescope, Camera, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { useHealthFull } from "@/hooks/useHealthFull";
import { useRecovery } from "@/hooks/useRecovery";
import { useStargazerStore } from "@/store/useStargazerStore";
import { notification } from "@/lib/notificationService";

type StatusColor = "ok" | "degraded" | "error" | "offline";

const STATUS_STYLE: Record<StatusColor, { dot: string; border: string; text: string }> = {
  ok:       { dot: "#34D399", border: "rgba(52, 211, 153, 0.25)", text: "#CBD5E1" },
  degraded: { dot: "#FBBF24", border: "rgba(251, 191, 36, 0.28)", text: "#FDE68A" },
  error:    { dot: "#F87171", border: "rgba(248, 113, 113, 0.28)", text: "#FCA5A5" },
  offline:  { dot: "#64748B", border: "rgba(148, 163, 184, 0.12)", text: "#94A3B8" },
};

function resolveColor(status: string | undefined, backendOffline: boolean): StatusColor {
  if (backendOffline) return "offline";
  if (!status) return "offline";
  if (status === "ok") return "ok";
  if (status === "missing") return "degraded";
  return "error";
}

interface PillProps {
  icon: ReactNode;
  name: string;
  subtitle?: string;
  color: StatusColor;
  latency?: number;
}

function StatusPill({ icon, name, subtitle, color, latency }: PillProps) {
  const palette = STATUS_STYLE[color];
  const isOnline = color === "ok";
  const shortSub = subtitle
    ? subtitle.replace(/^Canon\s+DSLR\s+/i, "").replace(/^Celestron\s+/i, "").split(" ").slice(0, 2).join(" ")
    : undefined;

  return (
    <div
      className="flex items-center gap-1.5 px-2.5 h-[22px] rounded-full shrink-0 max-w-[175px] overflow-hidden transition-colors duration-200"
      style={{
        background: "rgba(15, 23, 42, 0.72)",
        border: `1px solid ${palette.border}`,
        opacity: color === "offline" ? 0.65 : 1,
      }}
      title={subtitle ? `${name} — ${subtitle}` : name}
    >
      <span className="flex items-center shrink-0 opacity-75" aria-hidden>{icon}</span>
      <span
        className="text-hud-2xs font-medium tracking-[0.02em] whitespace-nowrap overflow-hidden text-ellipsis"
        style={{ color: palette.text }}
      >
        {name}
        {shortSub && <span className="text-slate-400 ml-1 font-normal">{shortSub}</span>}
      </span>
      {latency !== undefined && (
        <span className="text-hud-2xs text-slate-400 hud-numeric whitespace-nowrap shrink-0">
          {latency}ms
        </span>
      )}
      <span
        className={isOnline ? "status-dot-pulse" : undefined}
        style={{
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          background: palette.dot,
          boxShadow: isOnline ? `0 0 6px ${palette.dot}` : "none",
          flexShrink: 0,
        }}
      />
    </div>
  );
}

function ConnectActionButton({ backendOffline }: { backendOffline: boolean }) {
  const { recovering, diagnose, recover } = useRecovery();
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    if (busy || recovering) return;
    setBusy(true);
    try {
      if (backendOffline) {
        const diag = await diagnose();
        if (diag && !diag.recoverable) {
          notification.error("Station injoignable", {
            description: `SSH ${diag.pi_ssh ? "OK" : "KO"} · INDI ${diag.pi_indi ? "OK" : "KO"} — mode navigation libre actif`,
            source: "Station",
          });
          return;
        }
        await recover();
      } else {
        const res = await fetch("/api/indi/connect", { method: "POST" });
        if (!res.ok) {
          notification.warning("Reconnexion en attente", {
            description: "Aucun équipement détecté pour le moment. Navigation libre active.",
            source: "Station",
          });
        } else {
          notification.info("Connexion demandée", {
            description: "Tentative de liaison avec la monture et la caméra…",
            source: "Station",
          });
        }
      }
    } catch (err: unknown) {
      notification.error("Échec de connexion station", {
        description: err instanceof Error ? err.message : "Erreur réseau",
        source: "Station",
      });
    } finally {
      setBusy(false);
    }
  };

  const active = busy || recovering;
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={active}
      className="inline-flex items-center gap-1.5 px-2.5 h-[22px] rounded-full text-hud-2xs font-semibold tracking-[0.06em] uppercase transition-colors duration-150 cursor-pointer shrink-0"
      style={{
        background: active ? "color-mix(in srgb, var(--astro-teal) 8%, transparent)" : "color-mix(in srgb, var(--astro-teal) 12%, transparent)",
        border: "1px solid color-mix(in srgb, var(--astro-teal) 35%, transparent)",
        color: "var(--astro-teal)",
        cursor: active ? "wait" : "pointer",
      }}
      title="Tenter de connecter la station physique sans quitter la page"
    >
      <RefreshCw size={11} className={active ? "animate-spin" : ""} aria-hidden />
      <span>{active ? "Connexion…" : "Connecter"}</span>
    </button>
  );
}

export const ConnectionStatusBar = () => {
  const { data: health, backendOffline, latencyMs: globalLatency } = useHealthFull();
  const isConnected = useStargazerStore((s) => s.isConnected);

  const bc = resolveColor(health?.bridge?.status, backendOffline);
  const sc = resolveColor(health?.ssh?.status, backendOffline);
  const mc = resolveColor(health?.mount?.status, backendOffline);
  const cc = resolveColor(health?.camera?.status, backendOffline);

  const isLive = !backendOffline && health !== null && isConnected;
  const anyOffline = backendOffline || bc !== "ok" || mc !== "ok" || cc !== "ok";

  return (
    <>
      <style>{`
        @keyframes statusPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.45; transform: scale(0.85); }
        }
        .status-dot-pulse { animation: statusPulse 2.4s ease-in-out infinite; }
      `}</style>

      <div
        role="region"
        aria-label="État matériel de la station"
        className="fixed top-0 left-0 right-0 z-[var(--z-banner)] h-[34px] flex items-center gap-2 px-3 backdrop-blur-xl select-none"
        style={{
          background: "rgba(3, 6, 14, 0.92)",
          borderBottom: "1px solid rgba(148, 163, 184, 0.10)",
        }}
      >
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar min-w-0">
          <StatusPill icon={<Network size={12} />} name="INDI" color={bc} latency={health?.bridge?.latency_ms} />
          <StatusPill icon={<Terminal size={12} />} name="SSH" color={sc} latency={health?.ssh?.latency_ms} />
          <StatusPill
            icon={<Telescope size={12} />}
            name="Mount"
            subtitle={health?.mount?.driver ? `${health.mount.driver}` : undefined}
            color={mc}
          />
          <StatusPill
            icon={<Camera size={12} />}
            name="Camera"
            subtitle={health?.camera?.type}
            color={cc}
          />
        </div>

        <div className="flex-1 min-w-[8px]" />

        {anyOffline && <ConnectActionButton backendOffline={backendOffline} />}

        {globalLatency !== null && (
          <span className="hidden sm:inline text-hud-2xs text-slate-500 hud-numeric">
            {globalLatency}ms
          </span>
        )}

        <div
          className="flex items-center gap-1.5 px-2.5 h-[22px] rounded-full shrink-0"
          style={{
            background: isLive ? "rgba(52, 211, 153, 0.12)" : "rgba(148, 163, 184, 0.10)",
            border: `1px solid ${isLive ? "rgba(52, 211, 153, 0.35)" : "rgba(148, 163, 184, 0.22)"}`,
          }}
          title={isLive ? "Station connectée et opérationnelle" : "Station hors ligne — navigation et configuration libres"}
        >
          {isLive ? (
            <Wifi size={11} color="#34D399" aria-hidden />
          ) : (
            <WifiOff size={11} color="#94A3B8" aria-hidden />
          )}
          <span
            className="text-hud-2xs font-bold tracking-[0.08em] uppercase hud-numeric"
            style={{ color: isLive ? "#34D399" : "#CBD5E1" }}
          >
            {isLive ? "LIVE" : "HORS LIGNE"}
          </span>
        </div>
      </div>

      <div className="h-[34px] shrink-0" />
    </>
  );
};
