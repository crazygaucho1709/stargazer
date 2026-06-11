"use client";

/**
 * useGoTo — source unique de vérité pour toute opération GoTo/Slew.
 *
 * Règles :
 *  - Un seul GoTo actif à la fois : abort() annule le précédent avant d'en démarrer un nouveau
 *  - RA transmis en degrés (la route Next.js convertit automatiquement en heures)
 *  - Toutes les erreurs sont affichées via notification (zéro silence)
 *  - isSlewing reflété dans le store Zustand global
 *  - waitForSlew s'abonne au SSE /coords/stream — zéro polling HTTP
 */

import { useRef, useState, useCallback } from "react";
import { useStargazerStore } from "@/store/useStargazerStore";
import { notification } from "@/lib/notificationService";
import { clientApiUrl } from "@/lib/clientApi";

export interface UseGoToReturn {
  /** Lance un GoTo. Retourne true si la commande a été acceptée par le backend. */
  goto: (ra: number, dec: number) => Promise<boolean>;
  /** Annule le slew en cours. */
  abort: () => Promise<void>;
  /**
   * Attend la fin du slew via SSE /coords/stream.
   * Retourne true si IDLE avant le timeout, false si timeout ou abort.
   */
  waitForSlew: (timeoutSec?: number) => Promise<boolean>;
  isSlewing: boolean;
}

export function useGoTo(): UseGoToReturn {
  const { config, detectedMount, setSlewing } = useStargazerStore();
  const [isSlewing, setIsSlewing] = useState(false);
  const abortRef = useRef(false);
  const gotoAbortRef = useRef<AbortController | null>(null);

  const getDevice = useCallback(
    () => detectedMount || config.driverInstance || "Celestron GPS",
    [detectedMount, config.driverInstance]
  );

  const goto = useCallback(
    async (ra: number, dec: number): Promise<boolean> => {
      // Annuler un éventuel GoTo en cours
      gotoAbortRef.current?.abort();
      abortRef.current = false;

      const controller = new AbortController();
      gotoAbortRef.current = controller;

      setIsSlewing(true);
      setSlewing(true);

      try {
        const res = await fetch(clientApiUrl("/api/indi/mount"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            action: "goto",
            ra,   // degrés — la route convertit en heures
            dec,
            device: getDevice(),
            ip: config.astroberryUrl,
          }),
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(`HTTP ${res.status}: ${text}`);
        }

        const data = await res.json();
        if (!data.success) throw new Error(data.error || "GoTo refusé par le backend");
        return true;
      } catch (err: any) {
        if (err?.name === "AbortError") return false;
        notification.error("Échec du GoTo", {
          description: err?.message || "Impossible de démarrer le pointage",
          source: "Monture",
        });
        setIsSlewing(false);
        setSlewing(false);
        return false;
      }
    },
    [config.astroberryUrl, getDevice, setSlewing]
  );

  const abort = useCallback(async () => {
    abortRef.current = true;
    gotoAbortRef.current?.abort();
    gotoAbortRef.current = null;

    try {
      const res = await fetch(clientApiUrl("/api/indi/mount"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "abort",
          device: getDevice(),
          ip: config.astroberryUrl,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Abort refusé");
    } catch (err: any) {
      notification.error("Échec de l'arrêt du pointage", {
        description: err?.message || "Impossible d'arrêter le slew",
        source: "Monture",
      });
    } finally {
      setIsSlewing(false);
      setSlewing(false);
    }
  }, [config.astroberryUrl, getDevice, setSlewing]);

  const waitForSlew = useCallback(
    (timeoutSec = 90): Promise<boolean> =>
      new Promise<boolean>((resolve) => {
        let wasSlewing = false;
        let settled = false;
        let es: EventSource | null = null;
        let timeoutId: ReturnType<typeof setTimeout> | null = null;

        const finish = (result: boolean) => {
          if (settled) return;
          settled = true;
          if (timeoutId) clearTimeout(timeoutId);
          es?.close();
          setIsSlewing(false);
          setSlewing(false);
          resolve(result);
        };

        // Garde-fou global
        timeoutId = setTimeout(() => {
          notification.error("Timeout GoTo", {
            description: `Le pointage n'a pas abouti en ${timeoutSec}s`,
            source: "Monture",
          });
          finish(false);
        }, timeoutSec * 1000);

        // Courte grâce pour que le NexStar passe en Busy (~200ms de latence firmware)
        setTimeout(() => {
          if (abortRef.current) { finish(false); return; }

          es = new EventSource(clientApiUrl("/api/indi/coords/stream"));

          es.onmessage = (evt) => {
            if (abortRef.current) { finish(false); return; }
            try {
              const data = JSON.parse(evt.data) as {
                mount_slew_state?: string;
                error?: string;
              };
              if (data.error) return; // backend temporairement indispo — ignorer

              const state = data.mount_slew_state;
              if (state === "Busy") {
                wasSlewing = true;
              } else if (state && wasSlewing) {
                // Était en cours → vient de se terminer
                if (state === "Error") {
                  notification.error("Erreur de pointage", {
                    description: "Le mount a signalé une erreur pendant le slew",
                    source: "Monture",
                  });
                  finish(false);
                } else {
                  // Idle, Ok, Not Aligned — arrivé à destination
                  finish(true);
                }
              }
            } catch {
              // Donnée SSE malformée — ignorer
            }
          };

          es.onerror = () => {
            notification.error("Stream SSE perdu pendant le slew", {
              description: "Connexion interrompue — statut du pointage inconnu",
              source: "Monture",
            });
            finish(false);
          };
        }, 300);
      }),
    [setSlewing]
  );

  return { goto, abort, waitForSlew, isSlewing };
}
