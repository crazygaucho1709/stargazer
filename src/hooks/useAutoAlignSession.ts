// src/hooks/useAutoAlignSession.ts
"use client";

/**
 * useAutoAlignSession — pilotage de la session d'auto-alignement v2 (scan continu).
 *
 * Démarre/arrête la session backend et s'abonne au flux SSE d'événements
 * (state, grid, cell, pair, log, site, done). Toute la logique d'orchestration
 * (slew, scoring, capture, solve, sync) vit côté backend — ce hook ne fait
 * que refléter l'état.
 */

import { useCallback, useRef, useState } from "react";
import { notification } from "@/lib/notificationService";
import { useSSE } from "./useSSE";

export type AutoAlignState =
  | "IDLE" | "INIT" | "PLAN" | "SLEWING" | "SETTLING" | "SCORING"
  | "CAPTURING" | "SOLVING" | "SYNCING" | "DONE" | "ABORTED" | "FAILED";

export interface ScanCell {
  i: number;
  alt: number;
  az: number;
  status: "pending" | "slewing" | "scored" | "skipped" | "solving" | "solved" | "failed";
  star_count?: number;
}

export interface AlignPair {
  reported_ra_h: number;
  reported_dec: number;
  solved_ra_h: number;
  solved_dec: number;
  alt: number;
  az: number;
  offset_ra_deg: number;
  offset_dec_deg: number;
  t: number;
}

export interface SiteLocation {
  lat: number;
  lon: number;
  elev: number;
  source: "gpsd" | "mount" | "config" | "fallback";
}

export interface AutoAlignResult {
  success: boolean;
  error?: string;
  dry_run?: boolean;
  pairs?: AlignPair[];
  sync?: { ra_h: number; dec: number };
  site_source?: string;
}

export interface AutoAlignZone {
  altMin: number;
  altMax: number;
  azMin: number;
  azMax: number;
}

export interface AutoAlignStartParams {
  target_pairs?: number;
  preview_exposure?: number;
  solve_exposure?: number;
  max_duration_s?: number;
  use_ai?: boolean;
  dry_run?: boolean;
}

interface SessionEvent {
  event?: string;
  data?: unknown;
  error?: string;
}

export function useAutoAlignSession() {
  const [running, setRunning] = useState(false);
  const [state, setState] = useState<AutoAlignState>("IDLE");
  const [cells, setCells] = useState<ScanCell[]>([]);
  const [pairs, setPairs] = useState<AlignPair[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [site, setSite] = useState<SiteLocation | null>(null);
  const [result, setResult] = useState<AutoAlignResult | null>(null);
  const [streamEnabled, setStreamEnabled] = useState(false);
  const doneNotifiedRef = useRef(false);

  const handleEvent = useCallback((msg: SessionEvent) => {
    if (msg.error) return; // erreurs de transport gérées par useSSE

    switch (msg.event) {
      case "snapshot": {
        const snap = msg.data as {
          state?: AutoAlignState; cells?: ScanCell[]; pairs?: AlignPair[];
          logs?: string[]; result?: AutoAlignResult | null; site?: SiteLocation | null;
        };
        if (snap.state) setState(snap.state);
        if (snap.cells) setCells(snap.cells);
        if (snap.pairs) setPairs(snap.pairs);
        if (snap.logs) setLogs(snap.logs);
        if (snap.site) setSite(snap.site);
        if (snap.result) setResult(snap.result);
        break;
      }
      case "state":
        setState(msg.data as AutoAlignState);
        break;
      case "grid":
        setCells(msg.data as ScanCell[]);
        break;
      case "cell": {
        const cell = msg.data as ScanCell;
        setCells((prev) => prev.map((c) => (c.i === cell.i ? cell : c)));
        break;
      }
      case "pair":
        setPairs((prev) => [...prev, msg.data as AlignPair]);
        break;
      case "site":
        setSite(msg.data as SiteLocation);
        break;
      case "log":
        setLogs((prev) => [...prev.slice(-300), msg.data as string]);
        break;
      case "done": {
        const res = msg.data as AutoAlignResult;
        setResult(res);
        setRunning(false);
        if (!doneNotifiedRef.current) {
          doneNotifiedRef.current = true;
          if (res.success) {
            notification.success("Auto-alignement terminé", {
              source: "AutoAlign",
              description: res.dry_run
                ? "Dry-run terminé"
                : `${res.pairs?.length ?? 0} paires résolues — monture synchronisée`,
            });
          } else {
            notification.error("Auto-alignement échoué", {
              source: "AutoAlign",
              description: res.error ?? "Erreur inconnue",
            });
          }
        }
        break;
      }
    }
  }, []);

  const sse = useSSE<SessionEvent>({
    url: "/api/indi/autoalign/session/stream",
    onMessage: handleEvent,
    enabled: streamEnabled,
  });

  const start = useCallback(async (zone: AutoAlignZone, params: AutoAlignStartParams = {}) => {
    setCells([]);
    setPairs([]);
    setLogs([]);
    setResult(null);
    setSite(null);
    doneNotifiedRef.current = false;
    try {
      const res = await fetch("/api/indi/autoalign/session/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zone, ...params }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        notification.error("Démarrage auto-align impossible", {
          source: "AutoAlign",
          description: data.error ?? data.detail ?? `HTTP ${res.status}`,
        });
        return false;
      }
      setRunning(true);
      setStreamEnabled(true);
      return true;
    } catch (e) {
      notification.error("Démarrage auto-align impossible", {
        source: "AutoAlign",
        description: (e as Error).message,
      });
      return false;
    }
  }, []);

  const stop = useCallback(async () => {
    try {
      await fetch("/api/indi/autoalign/session/stop", { method: "POST" });
    } catch (e) {
      notification.error("Arrêt de session échoué", {
        source: "AutoAlign",
        description: (e as Error).message,
      });
    }
  }, []);

  return {
    start,
    stop,
    running,
    state,
    cells,
    pairs,
    logs,
    site,
    result,
    sseConnected: sse.isConnected,
  };
}
