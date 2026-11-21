// src/components/ui/StationStatusPopover.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Wifi,
  WifiOff,
  Network,
  Terminal,
  Telescope,
  Camera,
  RefreshCw,
  ChevronDown,
} from "lucide-react";
import { useHealthFull } from "@/hooks/useHealthFull";
import { useRecovery } from "@/hooks/useRecovery";
import { StationStatusData } from "@/hooks/useStationAutoInit";
import { useStargazerStore } from "@/store/useStargazerStore";
import { notification } from "@/lib/notificationService";
import { useStationReadiness } from "@/hooks/useStationReadiness";
import type { ReadinessLevel } from "@/lib/stationReadiness";

const TONES: Record<ReadinessLevel, { bg: string; border: string; text: string; dot: string }> = {
  ready:    { bg: "rgba(16, 185, 129, 0.12)",  border: "rgba(52, 211, 153, 0.32)",  text: "#6EE7B7", dot: "#34D399" },
  degraded: { bg: "rgba(251, 191, 36, 0.12)",  border: "rgba(251, 191, 36, 0.36)",  text: "#FCD34D", dot: "#FBBF24" },
  blocked:  { bg: "rgba(248, 113, 113, 0.14)", border: "rgba(248, 113, 113, 0.40)", text: "#FCA5A5", dot: "#F87171" },
  offline:  { bg: "rgba(255, 255, 255, 0.05)", border: "rgba(255, 255, 255, 0.10)", text: "#CBD5E1", dot: "#64748B" },
};

type StatusKind = "ok" | "degraded" | "error" | "offline";

const STATUS_META: Record<StatusKind, { dot: string; label: string; text: string }> = {
  ok:       { dot: "#34D399", label: "En ligne",  text: "text-emerald-300" },
  degraded: { dot: "#FBBF24", label: "Partiel",   text: "text-amber-300" },
  error:    { dot: "#F87171", label: "Erreur",    text: "text-red-300" },
  offline:  { dot: "#64748B", label: "Hors ligne", text: "text-slate-400" },
};

function resolveStatus(status: string | undefined, backendOffline: boolean): StatusKind {
  if (backendOffline || !status) return "offline";
  if (status === "ok") return "ok";
  if (status === "missing") return "degraded";
  return "error";
}

export function StationStatusPopover({ stationStatus }: { stationStatus?: StationStatusData | null }) {
  const { data: health, backendOffline, latencyMs } = useHealthFull();
  const { recovering, diagnose, recover } = useRecovery();
  const isConnected = useStargazerStore((s) => s.isConnected);
  const readiness = useStationReadiness();
  const tone = TONES[readiness.level];
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        popRef.current && !popRef.current.contains(target) &&
        btnRef.current && !btnRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const bc = resolveStatus(health?.bridge?.status, backendOffline);
  const sc = resolveStatus(health?.ssh?.status, backendOffline);
  const mc = resolveStatus(health?.mount?.status, backendOffline);
  const cc = resolveStatus(health?.camera?.status, backendOffline);

  const isLive = !backendOffline && health !== null && isConnected;
  const active = busy || recovering;

  const handleConnect = async () => {
    if (active) return;
    setBusy(true);
    try {
      if (backendOffline) {
        const diag = await diagnose();
        if (diag && !diag.recoverable) {
          notification.error("Station injoignable", {
            description: `SSH ${diag.pi_ssh ? "OK" : "KO"} · INDI ${diag.pi_indi ? "OK" : "KO"} — navigation libre maintenue`,
            source: "Station",
          });
          return;
        }
        await recover();
      } else {
        const res = await fetch("/api/indi/connect", { method: "POST" });
        if (!res.ok) {
          notification.warning("Équipements non détectés", {
            description: "Vérifiez l'alimentation de l'Astroberry. Vous pouvez continuer à naviguer librement.",
            source: "Station",
          });
        } else {
          notification.info("Connexion en cours", {
            description: "Synchronisation avec la monture et la caméra…",
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

  const rows = [
    { icon: Network,   name: "Bridge INDI", status: bc, detail: health?.bridge?.latency_ms ? `${health.bridge.latency_ms} ms` : undefined },
    { icon: Terminal,  name: "Tunnel SSH",  status: sc, detail: health?.ssh?.latency_ms ? `${health.ssh.latency_ms} ms` : undefined },
    { icon: Telescope, name: "Monture",     status: mc, detail: health?.mount?.driver },
    { icon: Camera,    name: "Caméra",      status: cc, detail: health?.camera?.type },
  ];

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`État de la station : ${readiness.label}. ${readiness.summary}`}
        className="inline-flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 h-8 rounded-xl text-xs font-medium transition-colors duration-150 cursor-pointer shrink-0"
        style={{
          background: tone.bg,
          border: `1px solid ${tone.border}`,
          color: tone.text,
        }}
      >
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{
            background: tone.dot,
            boxShadow: readiness.level === "offline" ? "none" : `0 0 8px ${tone.dot}`,
          }}
          aria-hidden
        />
        {isLive ? <Wifi size={13} aria-hidden /> : <WifiOff size={13} className="text-slate-400" aria-hidden />}
        <span className="hidden sm:inline">{readiness.label}</span>
        {latencyMs !== null && isLive && (
          <span className="hidden lg:inline text-hud-2xs text-emerald-300/70 hud-numeric">
            {latencyMs}ms
          </span>
        )}
        <ChevronDown
          size={13}
          className="max-sm:hidden text-slate-400 transition-transform duration-150"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
          aria-hidden
        />
      </button>

      {mounted && open && createPortal(
        <div
          ref={popRef}
          role="dialog"
          aria-label="Détails de la station"
          className="fixed z-[var(--z-popover)] w-[300px] rounded-2xl p-4 flex flex-col gap-3 text-slate-100"
          style={{
            top: "68px",
            right: "16px",
            background: "rgba(9, 13, 24, 0.94)",
            backdropFilter: "blur(24px)",
            border: "1px solid rgba(255, 255, 255, 0.10)",
            boxShadow: "0 24px 64px rgba(0, 0, 0, 0.75), inset 0 1px 0 rgba(255,255,255,0.06)",
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-white">État de l&apos;observatoire</p>
              <p className="text-hud-2xs text-slate-400 mt-0.5">
                {readiness.summary}
              </p>
            </div>
            {latencyMs !== null && (
              <span className="text-hud-2xs hud-numeric text-slate-400 px-2 py-0.5 rounded-md bg-white/[0.04]">
                {latencyMs} ms
              </span>
            )}
          </div>

          {readiness.issues.length > 0 && (
            <ul className="flex flex-col gap-1" aria-label="Points à régler">
              {readiness.issues.map((issue) => (
                <li
                  key={issue.text}
                  className={`flex items-start gap-2 text-hud-xs ${issue.level === "blocked" ? "text-red-300" : "text-amber-300"}`}
                >
                  <span
                    className="mt-1 w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: issue.level === "blocked" ? "#F87171" : "#FBBF24" }}
                    aria-hidden
                  />
                  {issue.text}
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-col gap-1.5">
            {rows.map(({ icon: Icon, name, status, detail }) => {
              const meta = STATUS_META[status];
              return (
                <div
                  key={name}
                  className="flex items-center justify-between px-2.5 py-2 rounded-xl bg-white/[0.03] border border-white/[0.05]"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon size={14} className="text-slate-400 shrink-0" aria-hidden />
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-medium text-slate-200 leading-tight">{name}</span>
                      {detail && (
                        <span className="text-hud-2xs text-slate-400 truncate hud-numeric">{detail}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`text-hud-2xs font-medium ${meta.text}`}>{meta.label}</span>
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: meta.dot }}
                      aria-hidden
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {stationStatus && (
            <div className="rounded-xl px-3 py-2.5 bg-white/[0.025] border border-white/[0.06] flex flex-col gap-1.5 text-hud-2xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Encodeurs monture</span>
                {stationStatus.encoder_age_s !== null ? (
                  <span
                    className={`hud-numeric font-medium ${
                      stationStatus.encoder_age_s < 2
                        ? "text-emerald-300"
                        : stationStatus.encoder_age_s < stationStatus.encoder_stale_s
                        ? "text-amber-300"
                        : "text-red-300"
                    }`}
                  >
                    {stationStatus.encoder_age_s.toFixed(1)}s / {stationStatus.encoder_stale_s}s
                  </span>
                ) : (
                  <span className="text-slate-500">—</span>
                )}
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-400">Lieu &amp; Heure</span>
                <span className="text-slate-200 hud-numeric">
                  {stationStatus.location_source
                    ? `${stationStatus.location_source.toUpperCase()} · ${stationStatus.auto_init_done ? "Sync" : "En attente"}`
                    : "Non défini"}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-400">Ciel (Plate-Solve)</span>
                <span className={stationStatus.sky_synced ? "text-emerald-300 font-medium" : "text-slate-400"}>
                  {stationStatus.sky_synced ? "Synchronisé" : "Non calibré"}
                </span>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={handleConnect}
            disabled={active}
            className="w-full h-9 rounded-xl inline-flex items-center justify-center gap-2 text-xs font-semibold transition-colors cursor-pointer"
            style={{
              background: isLive ? "rgba(255, 255, 255, 0.06)" : "color-mix(in srgb, var(--astro-teal) 14%, transparent)",
              border: `1px solid ${isLive ? "rgba(255, 255, 255, 0.12)" : "color-mix(in srgb, var(--astro-teal) 40%, transparent)"}`,
              color: isLive ? "#E2E8F0" : "var(--astro-teal)",
              cursor: active ? "wait" : "pointer",
            }}
          >
            <RefreshCw size={13} className={active ? "animate-spin" : ""} aria-hidden />
            <span>{active ? "Connexion en cours…" : isLive ? "Actualiser la liaison" : "Connecter la station"}</span>
          </button>
        </div>,
        document.body
      )}
    </div>
  );
}
