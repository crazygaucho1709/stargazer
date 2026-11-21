// src/hooks/useStationSetup.ts
"use client";

/**
 * useStationSetup — mise en station automatique (balayage, limites,
 * alignement, focus numérique).
 *
 * L'état vient du flux partagé useStationStream ; ce hook n'ajoute que les
 * deux ordres, démarrer et arrêter.
 */

import { useCallback, useState } from "react";
import { useStationStream } from "@/hooks/useStationStream";
import { notification } from "@/lib/notificationService";

export type SetupStepStatus = "pending" | "running" | "done" | "warning" | "failed" | "aborted";

export interface SetupStep {
  id: string;
  label: string;
  status: SetupStepStatus;
  detail: string | null;
}

export interface StationSetupState {
  running: boolean;
  state: string;
  steps: SetupStep[];
  progress: { done: number; total: number } | null;
  logs: string[];
  result: { success: boolean; error?: string; step?: string } | null;
  horizon: {
    visible: boolean;
    sky_cells: number;
    blocked_cells: number;
    zone: { altMin: number; altMax: number; azMin: number; azMax: number } | null;
    computed_at?: number;
  } | null;
}

async function order(action: "start" | "stop"): Promise<void> {
  const res = await fetch("/api/station/setup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
  const data: { success?: boolean; error?: string } =
    await res.json().catch(() => ({ success: false, error: `HTTP ${res.status}` }));
  if (!res.ok || data.success === false) throw new Error(data.error || `HTTP ${res.status}`);
}

export function useStationSetup() {
  const setup = useStationStream().setup;
  const [pending, setPending] = useState(false);

  const start = useCallback(async () => {
    setPending(true);
    try {
      await order("start");
    } catch (err: unknown) {
      notification.error("Mise en station non lancée", {
        description: err instanceof Error ? err.message : "Erreur inconnue",
        source: "Monture",
      });
    } finally {
      setPending(false);
    }
  }, []);

  const stop = useCallback(async () => {
    try {
      await order("stop");
    } catch (err: unknown) {
      // L'arrêt n'a pas été confirmé : on le dit haut et fort, la monture
      // peut encore être en mouvement.
      notification.error("Arrêt de la mise en station non confirmé", {
        description: `${err instanceof Error ? err.message : "Erreur inconnue"} — utilisez le STOP de la monture`,
        source: "Monture",
      });
    }
  }, []);

  return { setup, start, stop, pending };
}
