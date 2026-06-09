"use client";

/**
 * useCapture — source unique de vérité pour les séquences capture + stacking.
 *
 * Règles :
 *  - SSE sur /capture/progress — reconnexion auto en cas d'erreur (3s)
 *  - start() / stop() appellent le backend et exposent le statut intermédiaire
 *  - Toutes les erreurs via notification (zéro silence)
 *  - Un seul SSE quelle que soit la vue (le hook est instancié dans un Provider)
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useStargazerStore } from "@/store/useStargazerStore";
import { notification } from "@/lib/notificationService";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CaptureState {
  running: boolean;
  phase: "idle" | "capturing" | "stacking" | "complete" | "error";
  current_frame: number;
  total_frames: number;
  elapsed_s: number;
  eta_s: number;
  hfr: number | null;
  snr: number | null;
  stack_count: number;
  last_thumbnail: string | null;
  log: { time: string; msg: string; type: "info" | "success" | "error" | "warn" }[];
  error: string | null;
}

export interface StartParams {
  exposure: number;
  count: number;
  gain: number;
  device?: string | null;
}

export interface UseCaptureReturn {
  state: CaptureState;
  start: (params: StartParams) => Promise<void>;
  stop: () => Promise<void>;
  /** true pendant le POST /capture/sequence/start */
  starting: boolean;
  /** Message d'erreur si le démarrage a échoué */
  startError: string | null;
}

const INITIAL_STATE: CaptureState = {
  running: false,
  phase: "idle",
  current_frame: 0,
  total_frames: 0,
  elapsed_s: 0,
  eta_s: 0,
  hfr: null,
  snr: null,
  stack_count: 0,
  last_thumbnail: null,
  log: [],
  error: null,
};

export function useCapture(): UseCaptureReturn {
  const { config } = useStargazerStore();
  const baseUrl = (config.astroberryUrl || "http://localhost:5005").replace(/\/+$/, "");

  const [state, setState] = useState<CaptureState>(INITIAL_STATE);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const sseRef = useRef<EventSource | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── SSE ──────────────────────────────────────────────────────────────────

  const connectSSE = useCallback(() => {
    if (sseRef.current) return; // déjà connecté

    const es = new EventSource(`${baseUrl}/capture/progress`);
    sseRef.current = es;

    es.onmessage = (evt) => {
      try {
        setState(JSON.parse(evt.data));
      } catch {
        notification.error("SSE capture: donnée invalide", {
          description: evt.data?.slice(0, 80),
          source: "Capture",
        });
      }
    };

    es.onerror = () => {
      es.close();
      sseRef.current = null;
      // Reconnexion automatique dans 3s
      reconnectTimer.current = setTimeout(connectSSE, 3_000);
    };
  }, [baseUrl]);

  useEffect(() => {
    connectSSE();
    return () => {
      sseRef.current?.close();
      sseRef.current = null;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, [connectSSE]);

  // ─── Actions ──────────────────────────────────────────────────────────────

  const start = useCallback(async (params: StartParams) => {
    setStarting(true);
    setStartError(null);
    try {
      const res = await fetch(`${baseUrl}/capture/sequence/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exposure: params.exposure,
          count: params.count,
          gain: params.gain,
          device: params.device ?? null,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        const msg = data.error ?? "Erreur de démarrage";
        setStartError(msg);
        notification.error("Démarrage séquence échoué", { description: msg, source: "Capture" });
      }
    } catch (e: any) {
      const msg = e.message ?? "Connexion échouée";
      setStartError(msg);
      notification.error("Démarrage séquence échoué", { description: msg, source: "Capture" });
    } finally {
      setStarting(false);
    }
  }, [baseUrl]);

  const stop = useCallback(async () => {
    try {
      const res = await fetch(`${baseUrl}/capture/sequence/stop`, { method: "POST" });
      if (!res.ok) {
        const msg = `HTTP ${res.status}`;
        notification.error("Arrêt séquence échoué", { description: msg, source: "Capture" });
      }
    } catch (e: any) {
      notification.error("Arrêt séquence échoué", {
        description: e.message ?? "Connexion échouée",
        source: "Capture",
      });
    }
  }, [baseUrl]);

  return { state, start, stop, starting, startError };
}
