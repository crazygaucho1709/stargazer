// src/hooks/useHealthFull.ts
"use client";

/**
 * useHealthFull — état santé de l'infrastructure.
 *
 * Les données arrivent par le flux partagé useStationStream : plus aucune
 * interrogation périodique ici. `refreshHealth()` reste disponible pour forcer
 * un rapport immédiat (boutons REFRESH, après un correctif / Reset All).
 */

import { useEffect, useState } from "react";
import { applyHealth, useStationStream } from "@/hooks/useStationStream";
import type { NormalizedHealth } from "@/lib/healthNormalize";
import { notification } from "@/lib/notificationService";

export interface HealthSnapshot {
  /** Rapport mis en forme : { bridge, ssh, mount, camera, _raw } */
  data: NormalizedHealth | null;
  /** Rapport backend brut (mac_mini, astroberry, indi_bridge, mount, camera, kstars).
   *  Laissé non typé, comme avant : ses consommateurs (diagnostic, panneau
   *  d'infrastructure) lisent des dizaines de champs que rien ne décrit encore. */
  raw: any | null;
  backendOffline: boolean;
  /** Durée du dernier rapport demandé à la main ; null tant qu'aucun ne l'a été. */
  latencyMs: number | null;
  loading: boolean;
}

let lastRefreshMs: number | null = null;
const latencyListeners = new Set<() => void>();
let inFlight = false;

/** Demande un rapport immédiat, partagé par tous les abonnés. */
export async function refreshHealth() {
  if (inFlight) return;
  inFlight = true;
  const t0 = Date.now();
  try {
    const res = await fetch("/api/indi/health-full", { cache: "no-store", signal: AbortSignal.timeout(6000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    applyHealth((await res.json()) as NormalizedHealth);
    lastRefreshMs = Date.now() - t0;
    latencyListeners.forEach((fn) => fn());
  } catch (err: unknown) {
    notification.error("Rapport d'infrastructure indisponible", {
      description: err instanceof Error ? err.message : "Backend injoignable",
      source: "Station",
    });
  } finally {
    inFlight = false;
  }
}

export function useHealthFull(): HealthSnapshot {
  const stream = useStationStream();
  const [, force] = useState(0);

  useEffect(() => {
    const cb = () => force((n) => n + 1);
    latencyListeners.add(cb);
    return () => { latencyListeners.delete(cb); };
  }, []);

  return {
    data: stream.health,
    raw: stream.health?._raw ?? null,
    backendOffline: !stream.loading && !stream.online,
    latencyMs: stream.online ? lastRefreshMs : null,
    // « Chargement » couvre aussi l'attente du premier rapport, ~2 s après la connexion.
    loading: stream.loading || (stream.online && stream.health === null),
  };
}
