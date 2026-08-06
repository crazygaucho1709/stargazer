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
import { clientApiUrl } from "@/lib/clientApi";

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
  const jogIdRef        = useRef<string | null>(null);
  const jogStartedRef   = useRef(false);

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
    (direction: JogDirection, jogId: string, signal: AbortSignal) => {
      const { bridgeIp, device } = getParams();
      fetch(clientApiUrl("/api/indi/mount"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({ action: "jog", direction, state: "start", device, ip: bridgeIp, jog_id: jogId }),
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

      const jogId = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
      jogIdRef.current = jogId;
      // Armé au démarrage, désarmé seulement une fois l'arrêt émis. Sert de
      // garde pour les coupures globales (blur, onglet masqué, démontage) afin
      // qu'elles n'émettent pas un STOP à chaque clic de l'application. Il est
      // volontairement indépendant de activeDirRef : c'est cette variable-là
      // qui, en se vidant trop tôt, faisait sauter l'arrêt.
      jogStartedRef.current = true;

      activeDirRef.current = direction;
      setActiveDir(direction);
      setIsMoving(true);
      setSlewing(true);

      // Premier pulse immédiat
      sendStart(direction, jogId, controller.signal);

      // Pulses suivants toutes les 800ms (< watchdog 1.5s) pour maintenir le mouvement
      intervalRef.current = setInterval(() => {
        if (activeDirRef.current === direction) {
          sendStart(direction, jogId, controller.signal);
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
    const jogId = jogIdRef.current;
    // Rien à couper si aucun jog n'a été démarré depuis le dernier arrêt.
    // La garde porte sur ce drapeau et NON sur la direction : c'est
    // `if (!dir) return` qui laissait passer des relâchements sans arrêt dès
    // que l'état local avait déjà été nettoyé.
    if (!jogStartedRef.current) return;
    jogStartedRef.current = false;
    activeDirRef.current = null;
    jogIdRef.current = null;
    setActiveDir(null);

    // 2. NE PAS abort le START en vol : sur un tap rapide (pointerdown+up quasi
    //    simultanés) l'abort tuait le START avant qu'il n'atteigne le backend
    //    (net::ERR_ABORTED) → la monture ne recevait jamais l'ordre de mouvement.
    //    Le backend ignore déjà les pulses tardifs via jog_id/_stopped_jog_ids,
    //    et le STOP ci-dessous arrête le mouvement. On laisse donc le START finir.
    startAbortRef.current = null;

    const { bridgeIp, device } = getParams();

    // 3. STOP — pas de signal abort, doit arriver coûte que coûte
    fetch(clientApiUrl("/api/indi/mount"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "jog", direction: dir ?? "unknown", state: "stop", device, ip: bridgeIp, jog_id: jogId }),
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

  // Règle absolue : hors GoTo, aucun mouvement ne survit à l'absence de doigt
  // sur une touche. Le relâchement du pointeur est le cas nominal, mais il peut
  // ne jamais arriver — onglet masqué, fenêtre qui perd le focus, composant
  // démonté par une navigation. Chacun de ces cas doit couper.
  const stopJogRef = useRef(stopJog);
  stopJogRef.current = stopJog;

  useEffect(() => {
    const cut = () => stopJogRef.current();
    const onVisibility = () => { if (document.hidden) cut(); };

    window.addEventListener("blur", cut);
    window.addEventListener("pointerup", cut);
    window.addEventListener("pointercancel", cut);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("blur", cut);
      window.removeEventListener("pointerup", cut);
      window.removeEventListener("pointercancel", cut);
      document.removeEventListener("visibilitychange", onVisibility);
      cut();   // démontage : on ne laisse jamais la monture en mouvement
    };
  }, []);

  return { startJog, stopJog, activeDir, isMoving };
}
