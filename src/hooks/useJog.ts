"use client";

/**
 * useJog — source unique de vérité pour le pilotage directionnel de la monture.
 *
 * Règles :
 *  - Tous les pulses partagent le même AbortController → abort() les annule TOUS ensemble
 *  - Intervalle 800ms (< 1200ms watchdog backend) pour laisser de la marge au STOP
 *  - STOP envoyé SANS signal (non annulable) avec timestamp +9999ms pour écraser tout pulse tardif
 *  - Toute erreur est affichée via notification (zéro silence)
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

  const activeDirRef   = useRef<JogDirection | null>(null);
  const jogAbortRef    = useRef<AbortController | null>(null);
  const jogIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Nettoyage au démontage du composant
  useEffect(() => {
    return () => {
      jogAbortRef.current?.abort();
      if (jogIntervalRef.current) clearInterval(jogIntervalRef.current);
    };
  }, []);

  /** Extrait hostname + device depuis le store */
  const getParams = useCallback(() => {
    // Supporte "astroberry.local", "http://astroberry.local:8624", "192.168.1.x"
    const bridgeIp = config.astroberryUrl
      .replace(/^https?:\/\//, "")
      .replace(/:\d+$/, "");
    const device = detectedMount || config.driverInstance || "Celestron GPS";
    return { bridgeIp, device };
  }, [config.astroberryUrl, config.driverInstance, detectedMount]);

  const startJog = useCallback(
    (direction: JogDirection) => {
      // Annuler le jog précédent s'il existe
      if (jogIntervalRef.current) clearInterval(jogIntervalRef.current);
      jogAbortRef.current?.abort();

      const controller = new AbortController();
      jogAbortRef.current  = controller;
      activeDirRef.current = direction;
      setActiveDir(direction);
      setIsMoving(true);
      setSlewing(true);

      const { bridgeIp, device } = getParams();

      // Tous les pulses utilisent le même controller → un seul abort() les arrête tous
      const sendPulse = () => {
        fetch("/api/indi/mount", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            action: "jog",
            direction,
            state: "start",
            device,
            ip: bridgeIp,
            timestamp: Date.now(),
          }),
        })
          .then(async (res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
            const data = await res.json();
            if (data && !data.success) throw new Error(data.error || "Erreur inconnue");
          })
          .catch((err) => {
            if (err?.name === "AbortError") return; // Normal à l'arrêt
            notification.error("Échec du déplacement", {
              description: err?.message || "Impossible de déplacer la monture",
              source: "Monture",
            });
            setIsMoving(false);
            setSlewing(false);
          });
      };

      // Premier pulse immédiat
      sendPulse();

      // 800ms < 1200ms watchdog backend — laisse de la marge avant timeout
      jogIntervalRef.current = setInterval(() => {
        if (activeDirRef.current === direction) {
          sendPulse();
        } else {
          clearInterval(jogIntervalRef.current!);
          jogIntervalRef.current = null;
        }
      }, 800);
    },
    [getParams, setSlewing]
  );

  const stopJog = useCallback(() => {
    // 1. Arrêter l'intervalle
    if (jogIntervalRef.current) {
      clearInterval(jogIntervalRef.current);
      jogIntervalRef.current = null;
    }

    const dir = activeDirRef.current;
    if (!dir) return;
    activeDirRef.current = null;
    setActiveDir(null);

    // 2. Annuler TOUS les pulses en vol avant d'envoyer STOP
    jogAbortRef.current?.abort();
    jogAbortRef.current = null;

    const { bridgeIp, device } = getParams();

    // 3. STOP sans signal (non annulable) + timestamp futur pour écraser tout pulse tardif
    fetch("/api/indi/mount", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "jog",
        direction: dir,
        state: "stop",
        device,
        ip: bridgeIp,
        timestamp: Date.now() + 9999,
      }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
        const data = await res.json();
        if (data && !data.success) throw new Error(data.error || "Erreur inconnue");
      })
      .catch((err) => {
        notification.error("❌ Arrêt de la monture échoué", {
          description: err?.message || "Impossible d'arrêter le déplacement — vérifiez INDI",
          source: "Monture",
        });
      })
      .finally(() => {
        setSlewing(false);
        setIsMoving(false);
      });
  }, [getParams, setSlewing]);

  return { startJog, stopJog, activeDir, isMoving };
}
