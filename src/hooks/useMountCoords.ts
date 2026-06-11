"use client";

/**
 * useMountCoords — abonnement SSE aux coordonnées de la monture.
 *
 * Remplace le polling HTTP /health pour RA/DEC :
 *  - Connexion SSE persistante sur /api/indi/coords/stream
 *  - Reconnexion auto après 3s si le stream se coupe
 *  - Met à jour le store Zustand (setPosition) à chaque push backend (500ms)
 *  - Expose mount_slew_state pour le tracking de slew
 *
 * Usage : appeler une seule fois dans page.tsx — le hook gère son propre cycle de vie.
 */

import { useEffect, useRef } from "react";
import { useStargazerStore } from "@/store/useStargazerStore";
import { clientApiUrl } from "@/lib/clientApi";

interface CoordsPayload {
  ra: string;
  dec: string;
  ra_deg: number;
  dec_deg: number;
  mount_slew_state: string;
  error?: string;
}

export function useMountCoords() {
  const { setPosition, isConnected } = useStargazerStore();
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Ne pas ouvrir le stream si on n'est pas connecté au backend
    if (!isConnected) return;

    const connect = () => {
      if (esRef.current) return; // déjà connecté

      const es = new EventSource(clientApiUrl("/api/indi/coords/stream"));
      esRef.current = es;

      es.onmessage = (evt) => {
        try {
          const data: CoordsPayload = JSON.parse(evt.data);
          if (data.error) return; // backend temporairement indispo — ignorer
          if (data.ra && data.dec) {
            setPosition(data.ra, data.dec);
          }
          // Sync l'état de slew dans le store si disponible
          if (data.mount_slew_state) {
            const store = useStargazerStore.getState();
            const nowSlewing = data.mount_slew_state === "Busy";
            if (store.isSlewing !== nowSlewing) {
              store.setSlewing?.(nowSlewing);
            }
          }
        } catch {
          // Donnée SSE malformée — ignorer
        }
      };

      es.onerror = () => {
        es.close();
        esRef.current = null;
        // Reconnexion dans 3s
        reconnectTimer.current = setTimeout(connect, 3_000);
      };
    };

    connect();

    return () => {
      esRef.current?.close();
      esRef.current = null;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, [isConnected, setPosition]);
}
