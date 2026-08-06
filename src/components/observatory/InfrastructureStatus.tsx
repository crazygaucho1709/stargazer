// src/components/observatory/InfrastructureStatus.tsx
"use client";

import { useState, useEffect } from "react";
import { Cpu, HardDrive, Activity, ShieldCheck, Terminal, RefreshCw } from "lucide-react";
import { useStargazerStore } from "@/store/useStargazerStore";
import { useHealthFull, refreshHealth } from "@/hooks/useHealthFull";
import React from "react";

interface StatusCardProps {
  title: string;
  icon: React.ElementType;
  status: "ok" | "warning" | "error" | "loading";
  metrics: { label: string; value: string | number; unit?: string }[];
  details?: string;
}

function Spinner({ size = 16 }: { size?: number }) {
  return (
    <div
      style={{ width: size, height: size }}
      className="rounded-full border-2 border-white/20 border-t-white animate-spin"
    />
  );
}

const STATUS_COLOR: Record<string, string> = {
  ok:      "#4ade80",
  warning: "#facc15",
  error:   "#f87171",
  loading: "rgba(255,255,255,0.3)",
};

const STATUS_BADGE_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  ok:      { color: "#4ade80", bg: "rgba(74,222,128,0.1)",   border: "rgba(74,222,128,0.3)" },
  warning: { color: "#facc15", bg: "rgba(250,204,21,0.1)",  border: "rgba(250,204,21,0.3)" },
  error:   { color: "#f87171", bg: "rgba(248,113,113,0.1)", border: "rgba(248,113,113,0.3)" },
  loading: { color: "rgba(255,255,255,0.4)", bg: "rgba(255,255,255,0.05)", border: "rgba(255,255,255,0.1)" },
};

const StatusCard = ({ title, icon: IconComp, status, metrics, details }: StatusCardProps) => {
  const [hovered, setHovered] = useState(false);
  const iconColor = STATUS_COLOR[status];
  const badge = STATUS_BADGE_STYLE[status];

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.03)",
        padding: 16,
        borderRadius: 12,
        border: `1px solid ${hovered ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.08)"}`,
        transition: "all 0.2s",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <IconComp size={18} color={iconColor} />
          <span style={{ fontSize: 13, fontWeight: "bold", letterSpacing: "0.05em", color: "rgba(255,255,255,0.9)" }}>
            {title}
          </span>
        </div>
        {status === "loading" ? (
          <Spinner size={14} />
        ) : (
          <div
            style={{
              fontSize: 9,
              color: badge.color,
              background: badge.bg,
              border: `1px solid ${badge.border}`,
              borderRadius: 4,
              padding: "2px 6px",
            }}
          >
            {status.toUpperCase()}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2">
        {metrics.map((m, i) => (
          <div key={i} className="flex items-center justify-between" style={{ fontSize: 11 }}>
            <span style={{ color: "rgba(255,255,255,0.4)" }}>{m.label}</span>
            <span style={{ color: "rgba(255,255,255,0.8)", fontWeight: 500 }}>
              {m.value}{m.unit}
            </span>
          </div>
        ))}
        {details && (
          <p
            style={{
              fontSize: 10,
              color: "rgba(255,255,255,0.3)",
              marginTop: 4,
              fontStyle: "italic",
              borderTop: "1px solid rgba(255,255,255,0.05)",
              paddingTop: 4,
              margin: "4px 0 0",
            }}
          >
            {details}
          </p>
        )}
      </div>
    </div>
  );
};

export const InfrastructureStatus = () => {
  // Source unique partagée : `raw` = payload backend complet
  const { raw: data, backendOffline, loading } = useHealthFull();
  const error = backendOffline;

  useEffect(() => {
    if (data?.camera?.device && data?.mount?.device) {
      useStargazerStore.getState().setDetectedDevices(data.camera.device, data.mount.device);
    }
  }, [data]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center gap-3 w-full p-10">
        <Spinner size={16} />
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Loading infrastructure data...</span>
      </div>
    );
  }

  const mac = data?.mac_mini || {};
  const astro = data?.astroberry || {};
  const indi = data?.indi_bridge || {};
  const mount = data?.mount || {};

  // Find backend app by name rather than assuming index 0
  const backendApp = (mac.pm2_apps || []).find((a: any) => a.name === "stargazer-backend");
  const backendRestarts = backendApp?.restarts ?? 0;

  // Backend sends RA in DEGREES (0–360). Convert to hours (÷15) → HHhMMmSSs
  const formatRa = (ra: any): string => {
    if (ra == null || ra === "") return "N/A";
    const deg = typeof ra === "number" ? ra : parseFloat(ra);
    if (isNaN(deg)) return String(ra);
    const h = deg / 15;
    const hh = Math.floor(h);
    const mm = Math.floor((h - hh) * 60);
    const ss = Math.round(((h - hh) * 60 - mm) * 60);
    return `${String(hh).padStart(2, "0")}h${String(mm).padStart(2, "0")}m${String(ss).padStart(2, "0")}s`;
  };

  // Format raw DEC float (decimal degrees) → ±DD°MM'SS"
  const formatDec = (dec: any): string => {
    if (dec == null || dec === "") return "N/A";
    const d = typeof dec === "number" ? dec : parseFloat(dec);
    if (isNaN(d)) return String(dec);
    const sign = d >= 0 ? "+" : "-";
    const abs = Math.abs(d);
    const dd = Math.floor(abs);
    const mm = Math.floor((abs - dd) * 60);
    const ss = Math.round(((abs - dd) * 60 - mm) * 60);
    return `${sign}${String(dd).padStart(2, "0")}°${String(mm).padStart(2, "0")}'${String(ss).padStart(2, "0")}"`;
  };

  // Astroberry metrics: show "N/A" when not connected instead of 0
  const astroCpu = astro.reachable ? (astro.cpu_percent ?? "N/A") : "N/A";
  // temperature may arrive as "62.3'C" / "62.3" — extract the number, append °C once
  const astroTempNum = (() => {
    if (!astro.reachable || astro.temperature == null || astro.temperature === "N/A") return null;
    const m = String(astro.temperature).match(/-?\d+(\.\d+)?/);
    return m ? m[0] : null;
  })();
  const astroTemp = astroTempNum ?? "N/A";

  // INDI devices: the SSH-polled list (astro.indi_devices) is flaky. Fall back to
  // the authoritative bridge-level device connections when it's empty.
  const polledDevices = (astro.indi_devices || "").split(/\s+/).filter(Boolean);
  const bridgeDevices: string[] = [];
  if (mount.connected) bridgeDevices.push(mount.device || "Mount");
  if (data?.camera?.connected) bridgeDevices.push(data.camera.device || "Camera");
  const indiDeviceList = polledDevices.length > 0 ? polledDevices : bridgeDevices;

  // Mount details: only say "In Motion" when actually connected and not parked/idle
  const mountDetails = !mount.connected
    ? "Not connected"
    : mount.parked
    ? "Secure • Home Position"
    : mount.tracking
    ? "Tracking • Sidereal"
    : "Idle";

  return (
    <div className="flex flex-col gap-4 w-full">
      <div className="flex items-center justify-between w-full">
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em" }}>STATUS OVERVIEW</span>
        <button
          onClick={() => refreshHealth()}
          style={{
            background: "transparent",
            border: "none",
            color: "#22d3ee",
            fontSize: 10,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <RefreshCw size={12} />
          REFRESH
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}
        className="max-lg:grid-cols-2 max-md:grid-cols-1"
      >
        <StatusCard
          title="Mac Mini M4"
          icon={Cpu}
          status={error ? "error" : "ok"}
          metrics={[
            { label: "CPU",     value: mac.cpu_percent ?? 0,     unit: "%" },
            { label: "RAM",     value: mac.memory_used_gb ?? 0,  unit: " GB" },
            { label: "Storage", value: mac.disk_percent ?? 0,    unit: "%" },
          ]}
          details={`Backend UP • ${backendRestarts} restarts`}
        />

        <StatusCard
          title="Astroberry RPi"
          icon={Activity}
          status={astro.reachable ? "ok" : "error"}
          metrics={[
            { label: "Ping", value: astro.reachable ? (astro.ping_ms || "< 1") : "—", unit: astro.reachable ? "ms" : "" },
            { label: "CPU",  value: astroCpu,  unit: astroCpu  !== "N/A" ? "%" : "" },
            { label: "Temp", value: astroTemp, unit: astroTemp !== "N/A" ? "°C" : "" },
          ]}
          details={astro.reachable ? `SSH Connected • ${astro.uptime || "N/A"}` : "Unreachable via SSH"}
        />

        <StatusCard
          title="INDI Server"
          icon={Terminal}
          status={indi.connected ? "ok" : "error"}
          metrics={[
            { label: "PID",     value: astro.indi_pid || "N/A" },
            { label: "Devices", value: indiDeviceList.length },
            { label: "Uptime",  value: astro.uptime || "N/A" },
          ]}
          details={indiDeviceList.length > 0 ? indiDeviceList.join(", ") : "No devices"}
        />

        <StatusCard
          title="NexStar 4SE"
          icon={ShieldCheck}
          status={mount.connected ? "ok" : "error"}
          metrics={[
            { label: "RA",     value: formatRa(mount.ra) },
            { label: "DEC",    value: formatDec(mount.dec) },
            { label: "Status", value: mount.parked ? "PARKED" : mount.tracking ? "TRACKING" : "IDLE" },
          ]}
          details={mountDetails}
        />

        <StatusCard
          title="Canon EOS"
          icon={HardDrive}
          status={data?.camera?.connected ? "ok" : "warning"}
          metrics={[
            { label: "Model",   value: data?.camera?.device  || "None" },
            { label: "Battery", value: data?.camera?.battery || "N/A" },
            { label: "Storage", value: data?.camera?.space   || "N/A" },
          ]}
          details={data?.camera?.connected ? "Ready for capture" : "Camera disconnected"}
        />

        <StatusCard
          title="KStars + Ekos"
          icon={ShieldCheck}
          // Optionnel : le contrôle passe par le bridge INDI, KStars n'est pas requis.
          status={data?.kstars?.running ? "ok" : "warning"}
          metrics={[
            { label: "Status",  value: data?.kstars?.running ? "RUNNING" : "STOPPED" },
            { label: "Profile", value: data?.kstars?.ekos_profile || "Nexstar4SE" },
            { label: "PID",     value: data?.kstars?.pid || "N/A" },
          ]}
          details={data?.kstars?.running ? "GUI active sur le Mac Mini" : "Optionnel — contrôle direct via bridge INDI"}
        />
      </div>
    </div>
  );
};
