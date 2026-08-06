// src/hooks/useAutoReconnect.ts
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useStargazerStore } from "@/store/useStargazerStore";
import { notification } from "@/lib/notificationService";

export interface ReconnectState {
  attempt: number;
  nextRetryIn: number;
  isReconnecting: boolean;
  lastError: string | null;
}

// Backoff schedule in seconds: 5, 10, 20, 40, 60 (capped)
const BACKOFF = [5, 10, 20, 40, 60];
const HEALTH_INTERVAL_MS = 5000;
// 3 échecs consécutifs (~15 s) avant de déclarer la connexion perdue : un
// health-full ralenti par une capture ou un redémarrage de déploiement ne doit
// pas déclencher de reconnexion forcée (elle coupe réellement INDI).
const FAILURE_THRESHOLD = 3;
const HEALTH_TIMEOUT_MS = 8000;

function getBackoffSeconds(attempt: number): number {
  return BACKOFF[Math.min(attempt, BACKOFF.length - 1)];
}

export function useAutoReconnect(): ReconnectState {
  const { isConnected, setConnected } = useStargazerStore();

  const [state, setState] = useState<ReconnectState>({
    attempt: 0,
    nextRetryIn: 0,
    isReconnecting: false,
    lastError: null,
  });

  // Refs to avoid stale closures in timers
  const isConnectedRef = useRef(isConnected);
  const isReconnectingRef = useRef(false);
  const attemptRef = useRef(0);
  const consecutiveFailuresRef = useRef(0);

  // Timer refs for cleanup
  const healthIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    isConnectedRef.current = isConnected;
  }, [isConnected]);

  const clearAllTimers = useCallback(() => {
    if (healthIntervalRef.current) {
      clearInterval(healthIntervalRef.current);
      healthIntervalRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  }, []);

  const startCountdown = useCallback((seconds: number) => {
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    setState((s) => ({ ...s, nextRetryIn: seconds }));
    let remaining = seconds;
    countdownIntervalRef.current = setInterval(() => {
      remaining -= 1;
      setState((s) => ({ ...s, nextRetryIn: Math.max(0, remaining) }));
      if (remaining <= 0) {
        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    }, 1000);
  }, []);

  // Forward-declared via ref so reconnectLoop can call scheduleReconnect without
  // creating a circular dependency between the two useCallbacks.
  const scheduleReconnectRef = useRef<(attempt: number) => void>(() => {});

  const reconnectLoop = useCallback(async () => {
    if (isConnectedRef.current) return;

    const attempt = attemptRef.current;
    isReconnectingRef.current = true;
    setState((s) => ({ ...s, isReconnecting: true, nextRetryIn: 0 }));

    try {
      // 1. Vérifier d'abord si la santé est simplement revenue (backend redémarré
      // après un déploiement, lenteur passagère) — dans ce cas, NE PAS forcer de
      // reconnexion INDI : elle coupe la connexion existante et entretient la panne.
      try {
        const probe = await fetch("/api/indi/health-full", { cache: "no-store", signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
        if (probe.ok) {
          const h = await probe.json();
          if (h.bridge?.status === "ok" || h.mount?.status === "ok") {
            setConnected(true);
            isConnectedRef.current = true;
            isReconnectingRef.current = false;
            attemptRef.current = 0;
            consecutiveFailuresRef.current = 0;
            setState({ attempt: 0, nextRetryIn: 0, isReconnecting: false, lastError: null });
            notification.info("Connexion INDI rétablie", { source: "AutoReconnect" });
            startHealthPolling();
            return;
          }
        }
      } catch {
        // Santé toujours KO — on tente la reconnexion forcée ci-dessous
      }

      const res = await fetch("/api/indi/reconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reconnect" }),
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });

      // 500/503 = backend FastAPI complètement éteint — silencieux, backoff max direct
      if (res.status >= 500) {
        const nextAttempt = attempt + 1;
        attemptRef.current = nextAttempt;
        setState((s) => ({ ...s, attempt: nextAttempt, lastError: "Backend hors ligne", isReconnecting: false }));
        // Jump straight to 60s — no notification spam
        scheduleReconnectRef.current(BACKOFF.length - 1);
        return;
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || data.message || "Reconnexion refusée par le bridge");

      // Verify health after reconnect
      const healthRes = await fetch("/api/indi/health-full", { cache: "no-store", signal: AbortSignal.timeout(4000) });
      if (!healthRes.ok) throw new Error(`Health check HTTP ${healthRes.status}`);
      const healthData = await healthRes.json();
      const isOk = healthData.bridge?.status === "ok" || healthData.mount?.status === "ok";
      if (!isOk) throw new Error("Bridge reconnecté mais santé toujours KO");

      // Success
      setConnected(true);
      isConnectedRef.current = true;
      isReconnectingRef.current = false;
      attemptRef.current = 0;
      consecutiveFailuresRef.current = 0;
      setState({ attempt: 0, nextRetryIn: 0, isReconnecting: false, lastError: null });
      notification.info("Connexion INDI rétablie", { source: "AutoReconnect" });
      startHealthPolling();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erreur inconnue";
      const nextAttempt = attempt + 1;
      attemptRef.current = nextAttempt;

      setState((s) => ({ ...s, attempt: nextAttempt, lastError: msg, isReconnecting: false }));

      // Notify only for genuine INDI errors (not backend-offline silences)
      if (nextAttempt <= 5) {
        notification.warning(`Reconnexion INDI échouée (tentative ${nextAttempt})`, {
          source: "AutoReconnect", description: msg,
        });
      }
      if (nextAttempt === 5) {
        notification.error("Connexion INDI impossible", {
          source: "AutoReconnect",
          description: "Vérifiez qu'Astroberry est allumé et connecté au réseau",
          persistent: true,
        });
      }

      scheduleReconnectRef.current(nextAttempt);
    }
  }, [setConnected, startCountdown]); // eslint-disable-line react-hooks/exhaustive-deps

  const scheduleReconnect = useCallback(
    (attempt: number) => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      const delaySec = getBackoffSeconds(attempt);
      startCountdown(delaySec);
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        reconnectLoop();
      }, delaySec * 1000);
    },
    [reconnectLoop, startCountdown]
  );

  // Keep ref current so reconnectLoop can call it
  useEffect(() => {
    scheduleReconnectRef.current = scheduleReconnect;
  }, [scheduleReconnect]);

  const triggerDisconnect = useCallback(() => {
    setConnected(false);
    isConnectedRef.current = false;

    // Stop health polling
    if (healthIntervalRef.current) {
      clearInterval(healthIntervalRef.current);
      healthIntervalRef.current = null;
    }

    // Start reconnect immediately (attempt 0)
    attemptRef.current = 0;
    isReconnectingRef.current = false;
    setState({ attempt: 0, nextRetryIn: 0, isReconnecting: true, lastError: null });
    reconnectLoop();
  }, [setConnected, reconnectLoop]);

  // Health polling logic extracted so it can be restarted after success
  const startHealthPolling = useCallback(() => {
    if (healthIntervalRef.current) clearInterval(healthIntervalRef.current);

    healthIntervalRef.current = setInterval(async () => {
      if (!isConnectedRef.current || isReconnectingRef.current) return;

      try {
        const res = await fetch("/api/indi/health-full", {
          cache: "no-store",
          signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
        });
        if (res.status >= 500) {
          // Backend offline — ne pas compter comme failure INDI
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const isOk = data.bridge?.status === "ok" || data.mount?.status === "ok";

        if (isOk) {
          consecutiveFailuresRef.current = 0;
        } else {
          consecutiveFailuresRef.current += 1;
        }
      } catch {
        consecutiveFailuresRef.current += 1;
      }

      if (consecutiveFailuresRef.current >= FAILURE_THRESHOLD) {
        consecutiveFailuresRef.current = 0;
        notification.warning("Connexion INDI perdue — tentative de reconnexion", {
          source: "AutoReconnect",
        });
        triggerDisconnect();
      }
    }, HEALTH_INTERVAL_MS);
  }, [triggerDisconnect]);

  // Bootstrap: check health first, then decide to poll or reconnect
  useEffect(() => {
    const bootstrap = async () => {
      try {
        const res = await fetch("/api/indi/health-full", { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
          const data = await res.json();
          const allOk = data.bridge?.status === "ok" || data.mount?.status === "ok";
          if (allOk) {
            // Backend + INDI sont up — on est connecté
            setConnected(true);
            isConnectedRef.current = true;
            consecutiveFailuresRef.current = 0;
            setState({ attempt: 0, nextRetryIn: 0, isReconnecting: false, lastError: null });
            startHealthPolling();
            return;
          }
        }
      } catch {
        // Backend offline — silencieux
      }

      // Pas connecté : si le store dit déjà connecté, laisser le polling gérer
      if (isConnectedRef.current) {
        startHealthPolling();
      }
      // Sinon on reste en attente — ReconnectBanner gère le retry manuel
    };

    bootstrap();
    return () => { clearAllTimers(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // React to isConnected transitions driven by external code (e.g. page.tsx setConnected)
  useEffect(() => {
    if (isConnected && !isReconnectingRef.current) {
      consecutiveFailuresRef.current = 0;
      // Restart health polling if it was stopped
      if (!healthIntervalRef.current) {
        startHealthPolling();
      }
    }
  }, [isConnected, startHealthPolling]);

  return state;
}
