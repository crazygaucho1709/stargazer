// src/hooks/useKeyboardShortcuts.ts
"use client";

import { useEffect, useRef, useCallback } from "react";
import { useStargazerStore } from "@/store/useStargazerStore";
import { useJog, JogDirection } from "@/hooks/useJog";
import { clientApiUrl } from "@/lib/clientApi";
import { notification } from "@/lib/notificationService";

const SLEW_MIN = 1;
const SLEW_MAX = 9;

function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

const ARROW_TO_DIR: Record<string, JogDirection> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

export function useKeyboardShortcuts(): void {
  const { isConnected, config, updateConfig, detectedMount } = useStargazerStore();
  const { startJog, stopJog, activeDir } = useJog();

  // Track which arrow keys are currently held to avoid re-triggering on key repeat
  const heldKeys = useRef<Set<string>>(new Set());
  const activeDirRef = useRef<JogDirection | null>(null);

  const handleToggleTracking = useCallback(async () => {
    const bridgeIp = config.astroberryUrl
      .replace(/^https?:\/\//, "")
      .replace(/:\d+$/, "");
    const device = detectedMount || config.driverInstance || "Celestron GPS";
    const newTracking = !config.autoTracking;
    try {
      const res = await fetch(clientApiUrl("/api/indi/mount"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "tracking",
          enabled: newTracking,
          device,
          ip: bridgeIp,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      const data = await res.json();
      if (data && !data.success) throw new Error(data.error || "Erreur inconnue");
      updateConfig({ autoTracking: newTracking }, false);
      notification.success(newTracking ? "Tracking activé" : "Tracking désactivé", {
        source: "Clavier",
      });
    } catch (err: unknown) {
      notification.error("Échec toggle tracking", {
        description: err instanceof Error ? err.message : "Erreur inconnue",
        source: "Clavier",
      });
    }
  }, [config.astroberryUrl, config.driverInstance, config.autoTracking, detectedMount, updateConfig]);

  const handleSlewSpeed = useCallback(
    (delta: number) => {
      const next = Math.min(SLEW_MAX, Math.max(SLEW_MIN, config.slewSpeed + delta));
      if (next === config.slewSpeed) return;
      updateConfig({ slewSpeed: next }, false);
      notification.success(`Vitesse slew : ${next}`, { source: "Clavier" });
    },
    [config.slewSpeed, updateConfig]
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isConnected) return;
      if (isInputFocused()) return;

      const key = e.key;

      if (ARROW_TO_DIR[key]) {
        e.preventDefault();
        if (heldKeys.current.has(key)) return; // ignore key-repeat
        // Stop any existing jog in another direction
        if (activeDirRef.current !== null) {
          stopJog();
        }
        heldKeys.current.add(key);
        const dir = ARROW_TO_DIR[key];
        activeDirRef.current = dir;
        startJog(dir);
        return;
      }

      if (key === "Escape") {
        e.preventDefault();
        if (activeDirRef.current !== null) {
          stopJog();
          activeDirRef.current = null;
          heldKeys.current.clear();
        }
        return;
      }

      if (key === " ") {
        e.preventDefault();
        handleToggleTracking();
        return;
      }

      if (key === "+" || key === "=") {
        e.preventDefault();
        handleSlewSpeed(+1);
        return;
      }

      if (key === "-") {
        e.preventDefault();
        handleSlewSpeed(-1);
        return;
      }
    },
    [isConnected, startJog, stopJog, handleToggleTracking, handleSlewSpeed]
  );

  const onKeyUp = useCallback(
    (e: KeyboardEvent) => {
      if (!isConnected) return;
      const key = e.key;
      if (!ARROW_TO_DIR[key]) return;
      if (!heldKeys.current.has(key)) return;
      heldKeys.current.delete(key);
      // Only stop if this key was the active direction
      if (activeDirRef.current === ARROW_TO_DIR[key]) {
        stopJog();
        activeDirRef.current = null;
      }
    },
    [isConnected, stopJog]
  );

  // Safety: if we disconnect while jogging, stop
  useEffect(() => {
    if (!isConnected && activeDirRef.current !== null) {
      stopJog();
      activeDirRef.current = null;
      heldKeys.current.clear();
    }
  }, [isConnected, stopJog]);

  useEffect(() => {
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [onKeyDown, onKeyUp]);
}
