"use client";

/**
 * useJog — pilotage directionnel de la monture.
 *
 * Protocole :
 *  - onPointerDown → startJog(dir) : envoie START immédiatement, puis un pulse
 *    toutes les 800ms pour maintenir le watchdog backend (1.5s) en vie.
 *  - onPointerUp   → stopJog()     : coupe l'intervalle, envoie STOP.
 *  - Pas de timestamp, pas de lock asyncio côté backend → STOP est toujours
 *    traité immédiatement, indépendamment des pulses en vol.
 */

import { useRef, useState, useEffect, useCallback } from "react";
import { useStargazerStore } from "@/store/useStargazerStore";
import { notification } from "@/lib/notificationService";

export type JogDirection =
  | "up" | "down" | "left" | "right"
  | "up-left" | "up-right" | "down-left" | "down-right";

export interface UseJogReturn {
  startJog: (dir: JogDirection) => void;
  stopJog: () => void;
  activeDir: JogDirection | null;
  isMoving: boolean;
}

export function useJog(): UseJogReturn {
  const { config, detectedMount, setSlewing } = useStargazerStore();

  const [activeDir, setActiveDir] = useState<JogDirection | null>(null);
  const [isMoving, setIsMoving] = useState(false);

  const activeDirRef    = useRef<JogDirection | null>(null);
  const intervalRef     = useRef<NodeJS.Timeout | null>(null);
  const startAbortRef   = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      startAbortRef.current?.abort();
    };
  }, []);

  const getParams = useCallback(() => {
    const bridgeIp = config.astroberryUrl
      .replace(/^https?:\/\//, "")
      .replace(/:\d+$/, "");
    const device = detectedMount || config.driverInstance || "Celestron GPS";
    return { bridgeIp, device };
  }, [config.astroberryUrl, config.driverInstance, detectedMount]);

  /** Envoie un pulse START (fire-and-forget, ignoré si AbortSignal révoqué). */
  const sendStart = useCallback(
    (direction: JogDirection, signal: AbortSignal) => {
      const { bridgeIp, device } = getParams();
      fetch("/api/indi/mount", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({ action: "jog", direction, state: "start", device, ip: bridgeIp }),
      })
        .then(async (res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
          const data = await res.json();
          if (data && !data.success) throw new Error(data.error || "Erreur inconnue");
        })
        .catch((err) => {
          if (err?.name === "AbortError") return; // normal à l'arrêt
          notification.error("Échec du déplacement", {
            description: err?.message || "Impossible de déplacer la monture",
            source: "Monture",
          });
          setIsMoving(false);
          setSlewing(false);
        });
    },
    [getParams, setSlewing]
  );

  const startJog = useCallback(
    (direction: JogDirection) => {
      // Arrêter un jog précédent si nécessaire
      if (intervalRef.current) clearInterval(intervalRef.current);
      startAbortRef.current?.abort();

      const controller = new AbortController();
      startAbortRef.current = controller;
      activeDirRef.current = direction;
      setActiveDir(direction);
      setIsMoving(true);
      setSlewing(true);

      // Premier pulse immédiat
      sendStart(direction, controller.signal);

      // Pulses suivants toutes les 800ms (< watchdog 1.5s) pour maintenir le mouvement
      intervalRef.current = setInterval(() => {
        if (activeDirRef.current === direction) {
          sendStart(direction, controller.signal);
        }
      }, 800);
    },
    [sendStart, setSlewing]
  );

  const stopJog = useCallback(() => {
    // 1. Couper l'intervalle
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    const dir = activeDirRef.current;
    if (!dir) return;
    activeDirRef.current = null;
    setActiveDir(null);

    // 2. Annuler les pulses en vol (le backend les ignore de toute façon car STOP arrive après)
    startAbortRef.current?.abort();
    startAbortRef.current = null;

    const { bridgeIp, device } = getParams();

    // 3. STOP — pas de signal abort, doit arriver coûte que coûte
    fetch("/api/indi/mount", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "jog", direction: dir, state: "stop", device, ip: bridgeIp }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
        const data = await res.json();
        if (data && !data.success) throw new Error(data.error || "Erreur inconnue");
      })
      .catch((err) => {
        notification.error("❌ Arrêt monture échoué", {
          description: err?.message || "Impossible d'arrêter la monture — vérifiez INDI",
          source: "Monture",
        });
      })
      .finally(() => {
        setIsMoving(false);
        setSlewing(false);
      });
  }, [getParams, setSlewing]);

  return { startJog, stopJog, activeDir, isMoving };
}
