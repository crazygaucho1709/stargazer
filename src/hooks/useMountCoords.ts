// src/hooks/useMountCoords.ts
"use client";

/**
 * useMountCoords — abonnement SSE aux coordonnées de la monture.
 *
 * Remplace le polling HTTP /health pour RA/DEC :
 *  - Connexion SSE persistante sur /api/indi/coords/stream
 *  - Reconnexion auto avec backoff exponentiel (via useSSE)
 *  - Met à jour le store Zustand (setPosition) à chaque push backend (500ms)
 *  - Expose mount_slew_state pour le tracking de slew
 *  - Expose isConnected, reconnectCount, latencyMs pour le status bar
 *
 * Usage : appeler une seule fois dans page.tsx — le hook gère son propre cycle de vie.
 */

import { useCallback } from "react";
import { useStargazerStore } from "@/store/useStargazerStore";
import { clientApiUrl } from "@/lib/clientApi";
import { useSSE, SSEState } from "@/hooks/useSSE";

interface CoordsPayload {
  ra: string;
  dec: string;
  ra_deg: number;
  dec_deg: number;
  mount_slew_state: string;
  error?: string;
}

export function useMountCoords(): SSEState {
  const { setPosition, isConnected } = useStargazerStore();

  const handleMessage = useCallback(
    (data: CoordsPayload) => {
      if (data.error) return; // backend temporairement indispo — ignorer
      if (data.ra && data.dec) {
        setPosition(data.ra, data.dec);
      }
      if (data.mount_slew_state) {
        const store = useStargazerStore.getState();
        const nowSlewing = data.mount_slew_state === "Busy";
        if (store.isSlewing !== nowSlewing) {
          store.setSlewing?.(nowSlewing);
        }
      }
    },
    [setPosition]
  );

  return useSSE<CoordsPayload>({
    url: clientApiUrl("/api/indi/coords/stream"),
    onMessage: handleMessage,
    enabled: isConnected,
    reconnectDelay: 2_000,
    maxReconnectDelay: 30_000,
  });
}
