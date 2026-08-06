// src/components/observatory/ObservatoryPanel.tsx
"use client";

import { Radio, Activity, Terminal, ShieldCheck, AlertTriangle, Power, RefreshCw, Rocket, Cpu, BatteryWarning, Sun, Telescope, Camera } from "lucide-react";
import { useEffect, useState } from "react";
import { InfrastructureStatus } from "./InfrastructureStatus";
import { DiagnosticsPanel } from "./DiagnosticsPanel";
import { ActionButtons } from "./ActionButtons";
import { LogStream } from "./LogStream";
import { PhoneSensorWidget } from "./PhoneSensorWidget";
import { TelescopeControls } from "@/components/telescope/TelescopeControls";
import { useStargazerStore } from "@/store/useStargazerStore";
import { useHealthFull } from "@/hooks/useHealthFull";
import { OBSERVATORY_LABELS, OBSERVATORY_COLORS, SubsystemHealth, SubsystemId, canObservatoryTransition, ObservatoryEvent } from "@/lib/observatoryMachine";
import { SkeletonCard } from "@/components/ui/Skeleton";

const SUBSYSTEM_ICONS: Record<SubsystemId, React.ElementType> = {
  mount: Telescope,
  ccd: Camera,
  indi_bridge: Cpu,
  astroberry: Radio,
  weather: Sun,
  power: BatteryWarning,
};

const STATUS_BADGE: Record<string, { color: string; bg: string; border: string; label: string }> = {
  nominal:    { color: "#4ade80", bg: "rgba(74,222,128,0.1)",  border: "rgba(74,222,128,0.4)",  label: "OK" },
  degraded:   { color: "#facc15", bg: "rgba(250,204,21,0.1)", border: "rgba(250,204,21,0.4)", label: "DÉGRADÉ" },
  failed:     { color: "#f87171", bg: "rgba(248,113,113,0.1)",border: "rgba(248,113,113,0.4)",label: "PANNE" },
  recovering: { color: "#22d3ee", bg: "rgba(34,211,238,0.1)", border: "rgba(34,211,238,0.4)", label: "RECOVERY" },
  offline:    { color: "rgba(255,255,255,0.3)", bg: "rgba(255,255,255,0.05)", border: "rgba(255,255,255,0.15)", label: "OFFLINE" },
};

function Spinner({ size = 16, color = "white" }: { size?: number; color?: string }) {
  return (
    <div
      style={{ width: size, height: size, borderColor: `${color}33`, borderTopColor: color }}
      className="rounded-full border-2 animate-spin"
    />
  );
}

function iconColor(status: string): string {
  switch (status) {
    case "failed":    return "#f87171";
    case "recovering":return "#22d3ee";
    case "offline":   return "rgba(255,255,255,0.3)";
    case "degraded":  return "#facc15";
    default:          return "#4ade80";
  }
}

const SubsystemCard = ({ sub }: { sub: SubsystemHealth }) => {
  const IconComp = SUBSYSTEM_ICONS[sub.id];
  const unequipped = sub.id === "weather" || sub.id === "power";
  const badge = unequipped
    ? { color: "rgba(255,255,255,0.3)", bg: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.1)", label: "N/A" }
    : STATUS_BADGE[sub.status] ?? STATUS_BADGE.offline;
  const borderColor = sub.status === "failed" ? "rgba(248,113,113,0.4)" : sub.status === "recovering" ? "rgba(34,211,238,0.4)" : "rgba(255,255,255,0.08)";

  return (
    <div
      style={{
        background: "rgba(0,0,0,0.3)",
        border: `1px solid ${borderColor}`,
        borderRadius: 8,
        padding: 12,
        opacity: sub.status === "offline" ? 0.65 : 1,
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <IconComp size={16} color={iconColor(sub.status)} />
          <span style={{ fontSize: 11, fontWeight: "bold", color: "white" }}>{sub.label}</span>
        </div>
        <div
          style={{
            fontSize: 8,
            color: badge.color,
            background: badge.bg,
            border: `1px solid ${badge.border}`,
            borderRadius: 4,
            padding: "2px 6px",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          {sub.status === "recovering" && <Spinner size={8} color={badge.color} />}
          {badge.label}
        </div>
      </div>
      {sub.errorCount > 0 && (
        <p style={{ fontSize: 9, color: "#fca5a5", fontFamily: "monospace", margin: 0 }}>
          {sub.errorCount} erreur{sub.errorCount > 1 ? "s" : ""}
          {sub.lastError ? `: ${sub.lastError.slice(0, 60)}` : ""}
        </p>
      )}
      {sub.status === "recovering" && (
        <div className="flex items-center gap-1 mt-1">
          <RefreshCw size={12} color="#22d3ee" className="animate-spin" />
          <span style={{ fontSize: 9, color: "#22d3ee" }}>Tentative {sub.recoveryAttempts + 1}/3</span>
        </div>
      )}
      {sub.status === "failed" && (
        <p style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", marginTop: 4, fontStyle: "italic" }}>
          Actions: {sub.recoveryActions.join(", ")}
        </p>
      )}
    </div>
  );
};

// Capteurs non équipés sur cette installation — exclus du calcul de santé
// pour ne pas plafonner artificiellement le pourcentage.
const UNEQUIPPED: SubsystemId[] = ["weather", "power"];

function getHealthPct(subsystems: Record<SubsystemId, SubsystemHealth>): number {
  const core = (Object.values(subsystems) as SubsystemHealth[]).filter((s) => !UNEQUIPPED.includes(s.id));
  if (core.length === 0) return 0;
  const nom = core.filter((s) => s.status === "nominal").length;
  return Math.round((nom / core.length) * 100);
}

export default function ObservatoryPanel() {
  const language = useStargazerStore((s) => s.language);
  const obsState = useStargazerStore((s) => s.observatoryState);
  const subsystems = useStargazerStore((s) => s.subsystems);
  const sendObservatoryEvent = useStargazerStore((s) => s.sendObservatoryEvent);
  const lang = language === "fr" ? "fr" : "en";
  const label = OBSERVATORY_LABELS[obsState][lang];
  const color = OBSERVATORY_COLORS[obsState];
  const healthPct = getHealthPct(subsystems);
  const isOnline = obsState === "ONLINE";
  const isStarting = obsState === "STARTING" || obsState.includes("CONNECTING");
  const isCritical = obsState === "CRITICAL";

  const healthColor = healthPct > 80 ? "#4ade80" : healthPct > 50 ? "#facc15" : "#f87171";

  const [initializing, setInitializing] = useState(true);

  // Réagit au snapshot santé partagé (un seul poller pour toute l'app)
  const { raw: healthRaw, loading: healthLoading } = useHealthFull();
  useEffect(() => {
    if (healthLoading) return;
    setInitializing(false);
    const raw = healthRaw ?? {};
    const indiOk = !!raw.indi_bridge?.connected;
    const mountOk = !!raw.mount?.connected;
    const ccdOk = !!raw.camera?.connected;
    const astroOk = !!raw.astroberry?.reachable;

    const store = useStargazerStore.getState();
    store.updateSubsystem("indi_bridge", { status: indiOk ? "nominal" : "failed" });
    store.updateSubsystem("mount", { status: mountOk ? "nominal" : "failed" });
    store.updateSubsystem("ccd", { status: ccdOk ? "nominal" : "failed" });
    store.updateSubsystem("astroberry", { status: astroOk ? "nominal" : "failed" });

    if (store.observatoryState === "OFFLINE" && (indiOk || astroOk)) store.sendObservatoryEvent("START");
    const events: { check: boolean; event: ObservatoryEvent }[] = [
      { check: indiOk, event: "INDI_READY" },
      { check: mountOk, event: "MOUNT_CONNECTED" },
      { check: ccdOk, event: "CCD_CONNECTED" },
      { check: !!(indiOk && mountOk && ccdOk), event: "WEATHER_CONNECTED" },
    ];
    for (const { check, event } of events) {
      if (check) {
        const s = useStargazerStore.getState();
        if (canObservatoryTransition(s.observatoryState, event)) s.sendObservatoryEvent(event);
      }
    }
  }, [healthRaw, healthLoading]);

  if (initializing) {
    return (
      <div className="flex flex-col gap-6 h-full w-full max-w-[1200px] mx-auto pb-10">
        <SkeletonCard height="200px" />
        <SkeletonCard height="120px" />
        <SkeletonCard height="160px" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 h-full w-full max-w-[1200px] mx-auto pb-10">
      {/* Header with Observatory State */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <Radio size={24} style={{ color }} />
            <h2 style={{ fontSize: 16, fontWeight: "bold", color: "white", letterSpacing: "0.1em", margin: 0 }}>
              REMOTE OBSERVATORY CENTER
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <div
              style={{
                padding: "4px 12px",
                borderRadius: 9999,
                background: `${color}15`,
                border: `1px solid ${color}`,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: color,
                }}
                className={isStarting || isCritical ? "animate-ping" : ""}
              />
              <span style={{ fontSize: 11, fontWeight: "bold", color }} className="hud-font">
                {label}
              </span>
            </div>
            <div
              style={{
                fontSize: 13,
                color: healthColor,
                background: `${healthColor}15`,
                border: `1px solid ${healthColor}`,
                borderRadius: 6,
                padding: "3px 10px",
              }}
            >
              {healthPct}% HEALTH
            </div>
          </div>
        </div>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", margin: 0 }}>
          {language === "fr"
            ? "Contrôle complet de l'infrastructure : Mac Mini M4, Astroberry Pi, NexStar 4SE."
            : "Full control of Stargazer infrastructure: Mac Mini M4, Astroberry Pi, and NexStar 4SE."}
        </p>
      </div>

      <div style={{ height: 1, background: "rgba(255,255,255,0.1)", width: "100%" }} />

      {/* Startup Sequence */}
      {isStarting && (
        <div style={{ padding: 16, borderRadius: 12, background: "rgba(255,179,71,0.08)", border: "1px solid rgba(255,179,71,0.3)" }}>
          <div className="flex items-center gap-3 mb-3">
            <Rocket size={20} color="var(--astro-gold)" className="animate-ping" />
            <span style={{ fontSize: 13, fontWeight: "bold", color: "var(--astro-gold)" }}>
              {language === "fr" ? "SÉQUENCE DE DÉMARRAGE" : "STARTUP SEQUENCE"}
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {(["indi_bridge", "mount", "ccd", "weather"] as SubsystemId[]).map((id) => {
              const sub = subsystems[id];
              const isDone = sub.status === "nominal";
              const isActive = sub.status === "recovering" || (sub.status === "offline" && id === getActiveId(subsystems));
              return (
                <div key={id} className="flex items-center gap-3" style={{ opacity: isDone ? 0.7 : 1 }}>
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      background: isDone ? "#22c55e" : isActive ? "var(--astro-gold)" : "#374151",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {isDone ? (
                      <ShieldCheck size={12} color="black" />
                    ) : isActive ? (
                      <Spinner size={10} color="black" />
                    ) : (
                      <span style={{ fontSize: 9, color: "rgba(255,255,255,0.4)" }}>{getIndex(id)}</span>
                    )}
                  </div>
                  <span style={{ fontSize: 11, color: isDone ? "rgba(255,255,255,0.4)" : isActive ? "var(--astro-gold)" : "rgba(255,255,255,0.3)" }}>
                    {sub.label}
                  </span>
                  {isActive && (
                    <span style={{ fontSize: 9, color: "var(--astro-gold)", fontStyle: "italic" }}>
                      {language === "fr" ? "Connexion..." : "Connecting..."}
                    </span>
                  )}
                  {isDone && <ShieldCheck size={12} color="#4ade80" />}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Critical Warning */}
      {isCritical && (
        <div style={{ padding: 16, borderRadius: 12, background: "rgba(255,0,0,0.1)", border: "1px solid rgba(248,113,113,0.6)" }}>
          <div className="flex items-center gap-3">
            <AlertTriangle size={24} color="#f87171" className="animate-ping" />
            <div className="flex flex-col gap-0 flex-1">
              <span style={{ fontSize: 13, fontWeight: "bold", color: "#f87171" }}>
                {language === "fr" ? "ÉTAT CRITIQUE" : "CRITICAL STATE"}
              </span>
              <span style={{ fontSize: 10, color: "#fca5a5" }}>
                {language === "fr"
                  ? "Un ou plusieurs sous-systèmes critiques sont en panne. Intervention requise."
                  : "One or more critical subsystems have failed. Intervention required."}
              </span>
            </div>
            <button
              onClick={() => sendObservatoryEvent("RESET")}
              style={{
                background: "#dc2626",
                color: "white",
                border: "none",
                borderRadius: 6,
                padding: "6px 12px",
                fontSize: 12,
                fontWeight: "bold",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Power size={12} />
              RESET
            </button>
          </div>
        </div>
      )}

      {/* Subsystems Grid */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Activity size={16} color="#4ade80" />
            <span style={{ fontSize: 12, fontWeight: "bold", letterSpacing: "0.1em", color: "rgba(255,255,255,0.8)" }}>
              {language === "fr" ? "SOUS-SYSTÈMES" : "SUBSYSTEMS"}
            </span>
          </div>
          {isOnline && (
            <button
              onClick={() => sendObservatoryEvent("SHUTDOWN")}
              style={{
                background: "transparent",
                border: "none",
                color: "#22d3ee",
                fontSize: 11,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Power size={12} />
              SHUTDOWN
            </button>
          )}
          {!isOnline && !isStarting && !isCritical && (
            <button
              onClick={() => sendObservatoryEvent("START")}
              style={{
                background: "transparent",
                border: "none",
                color: "#4ade80",
                fontSize: 11,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Rocket size={12} />
              START
            </button>
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {(Object.values(subsystems) as SubsystemHealth[]).map((sub) => (
            <SubsystemCard key={sub.id} sub={sub} />
          ))}
        </div>
      </div>

      {/* Diagnostic précis + Reset All */}
      <DiagnosticsPanel />

      {/* Health Section */}
      <div>
        <InfrastructureStatus />
      </div>

      {/* Phone Sensor + Mount control side by side */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 200px", gap: 16, alignItems: "start" }}
        className="max-md:grid-cols-1"
      >
        <PhoneSensorWidget />
        <div
          style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 12,
            padding: 16,
          }}
        >
          <p style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", letterSpacing: "0.15em", marginBottom: 12, margin: "0 0 12px" }}>RAQUETTE</p>
          <TelescopeControls variant="pad" />
        </div>
      </div>

      {/* Main Content: Actions & Logs */}
      <div style={{ display: "grid", gridTemplateColumns: "350px 1fr", gap: 32, alignItems: "start" }}
        className="max-xl:grid-cols-1"
      >
        <div style={{ background: "rgba(255,255,255,0.02)", padding: 24, borderRadius: 16, border: "1px solid rgba(255,255,255,0.05)" }}>
          <ActionButtons />
        </div>
        <div className="h-full">
          <LogStream />
        </div>
      </div>

      {/* Safety Footer */}
      <div
        style={{
          background: "rgba(127,29,29,0.8)",
          padding: 12,
          borderRadius: 10,
          border: "1px solid rgba(185,28,28,0.7)",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <Terminal size={16} color="#fecaca" />
        <span style={{ fontSize: 11, color: "#fee2e2", fontWeight: "bold" }}>
          SAFETY NOTE: Always ensure the telescope is balanced and cables are free before remote slewing. In case of emergency, use &quot;ABORT ALL&quot;.
        </span>
      </div>
    </div>
  );
}

function getActiveId(subsystems: Record<string, SubsystemHealth>): SubsystemId | "weather" {
  const order: SubsystemId[] = ["indi_bridge", "mount", "ccd", "weather"];
  for (const id of order) {
    if (subsystems[id]?.status === "offline") return id;
  }
  return "weather";
}

function getIndex(id: SubsystemId): number {
  const order: SubsystemId[] = ["indi_bridge", "mount", "ccd", "weather"];
  return order.indexOf(id) + 1;
}
