// src/hooks/useHealthFull.ts
"use client";

/**
 * useHealthFull — source unique de vérité pour l'état santé de l'infrastructure.
 *
 * Un SEUL poller au niveau module, partagé par tous les composants abonnés
 * (ref-counté). N composants montés = 1 seule requête /api/indi/health-full
 * toutes les 5 s, au lieu d'un poller par composant. Réduit drastiquement la
 * charge backend + SSH vers le Pi.
 *
 * - `refreshHealth()` force un rafraîchissement immédiat (boutons REFRESH,
 *   après un correctif / Reset All).
 * - Le poller démarre au premier abonné et s'arrête au dernier démonté.
 */

import { useEffect, useState } from "react";

export interface HealthSnapshot {
  /** Payload normalisé complet : { bridge, ssh, mount, camera, _raw } */
  data: any | null;
  /** Payload backend brut (mac_mini, astroberry, indi_bridge, mount, camera, kstars) */
  raw: any | null;
  backendOffline: boolean;
  latencyMs: number | null;
  loading: boolean;
}

let snapshot: HealthSnapshot = {
  data: null,
  raw: null,
  backendOffline: false,
  latencyMs: null,
  loading: true,
};

const subscribers = new Set<() => void>();
let intervalId: ReturnType<typeof setInterval> | null = null;
let inFlight = false;
const POLL_MS = 5000;

function notify() {
  subscribers.forEach((fn) => fn());
}

async function poll() {
  if (inFlight) return;
  inFlight = true;
  const t0 = Date.now();
  try {
    const res = await fetch("/api/indi/health-full", { cache: "no-store", signal: AbortSignal.timeout(6000) });
    const latency = Date.now() - t0;
    if (res.status === 503 || res.status === 502) {
      snapshot = { data: null, raw: null, backendOffline: true, latencyMs: null, loading: false };
    } else if (!res.ok) {
      snapshot = { ...snapshot, backendOffline: false, latencyMs: latency, loading: false };
    } else {
      const json = await res.json();
      snapshot = { data: json, raw: json._raw ?? null, backendOffline: false, latencyMs: latency, loading: false };
    }
  } catch {
    snapshot = { data: null, raw: null, backendOffline: true, latencyMs: null, loading: false };
  } finally {
    inFlight = false;
    notify();
  }
}

function startPolling() {
  if (intervalId) return;
  poll();
  intervalId = setInterval(poll, POLL_MS);
}

function stopPolling() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

/** Force an immediate refresh (shared across all subscribers). */
export function refreshHealth() {
  poll();
}

export function useHealthFull(): HealthSnapshot {
  const [, force] = useState(0);

  useEffect(() => {
    const cb = () => force((n) => n + 1);
    subscribers.add(cb);
    startPolling();
    return () => {
      subscribers.delete(cb);
      if (subscribers.size === 0) stopPolling();
    };
  }, []);

  return snapshot;
}
