"use client";

/**
 * useGoTo — source unique de vérité pour toute opération GoTo/Slew.
 *
 * Règles :
 *  - Un seul GoTo actif à la fois : abort() annule le précédent avant d'en démarrer un nouveau
 *  - RA transmis en degrés (la route Next.js convertit automatiquement en heures)
 *  - Toutes les erreurs sont affichées via notification (zéro silence)
 *  - isSlewing reflété dans le store Zustand global
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
   * Attend la fin du slew par polling INDI.
   * Retourne true si IDLE avant le timeout, false si timeout ou abort.
   */
  waitForSlew: (timeoutSec?: number) => Promise<boolean>;
  isSlewing: boolean;
}

export function useGoTo(): UseGoToReturn {
  const { config, detectedMount, setSlewing, setPosition } = useStargazerStore();
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
    async (timeoutSec = 90): Promise<boolean> => {
      // Petite pause initiale : le mount met ~1-2s avant de passer en Busy
      await new Promise((r) => setTimeout(r, 2000));

      const deadline = Date.now() + timeoutSec * 1000;
      while (Date.now() < deadline) {
        if (abortRef.current) {
          setIsSlewing(false);
          setSlewing(false);
          return false;
        }

        try {
          const res = await fetch(clientApiUrl("/api/indi?endpoint=status"), {
            cache: "no-store",
          });
          if (res.ok) {
            const s = (await res.json()).mount_slew_state as string | undefined;
            if (s === "Idle" || s === "Ok" || s === "Not Aligned") {
              setIsSlewing(false);
              setSlewing(false);
              return true;
            }
            if (s === "Error") {
              notification.error("Erreur de pointage", {
                description: "Le mount a signalé une erreur pendant le slew",
                source: "Monture",
              });
              setIsSlewing(false);
              setSlewing(false);
              return false;
            }
          }
        } catch {
          // Réseau temporairement indisponible — on réessaie
        }

        await new Promise((r) => setTimeout(r, 2000));
      }

      // Timeout
      notification.error("Timeout GoTo", {
        description: `Le pointage n'a pas abouti en ${timeoutSec}s`,
        source: "Monture",
      });
      setIsSlewing(false);
      setSlewing(false);
      return false;
    },
    [setSlewing]
  );

  return { goto, abort, waitForSlew, isSlewing };
}
