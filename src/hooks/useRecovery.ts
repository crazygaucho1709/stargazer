// src/hooks/useRecovery.ts
"use client";

/**
 * useRecovery — reprise simplifiée du backend depuis l'UI.
 *
 * - diagnose() : GET /api/recovery → état port 5005 / Pi / INDI
 * - recover()  : POST /api/recovery → kill zombie + pm2 restart + attente /health,
 *                puis refreshHealth() pour mettre à jour la barre de statut.
 * - Toutes les erreurs via notification (zéro silence).
 */

import { useState, useCallback } from "react";
import { notification } from "@/lib/notificationService";
import { refreshHealth } from "@/hooks/useHealthFull";

export interface RecoveryDiagnostic {
  backend: boolean;
  zombie: boolean;
  pi_ssh: boolean;
  pi_indi: boolean;
  recoverable: boolean;
  in_progress: boolean;
}

export interface RecoveryStep {
  name: string;
  ok: boolean;
  detail: string;
}

export interface UseRecoveryReturn {
  recovering: boolean;
  steps: RecoveryStep[];
  diagnose: () => Promise<RecoveryDiagnostic | null>;
  recover: () => Promise<boolean>;
}

export function useRecovery(): UseRecoveryReturn {
  const [recovering, setRecovering] = useState(false);
  const [steps, setSteps] = useState<RecoveryStep[]>([]);

  const diagnose = useCallback(async (): Promise<RecoveryDiagnostic | null> => {
    try {
      const res = await fetch("/api/recovery", { cache: "no-store", signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as RecoveryDiagnostic;
    } catch (e: any) {
      notification.error("Diagnostic de reprise impossible", {
        description: e.message ?? "Connexion échouée",
        source: "Recovery",
      });
      return null;
    }
  }, []);

  const recover = useCallback(async (): Promise<boolean> => {
    setRecovering(true);
    setSteps([]);
    try {
      const res = await fetch("/api/recovery", { method: "POST", signal: AbortSignal.timeout(60_000) });
      const data = await res.json();
      setSteps(data.steps ?? []);
      if (data.success) {
        notification.success("Reprise réussie — backend opérationnel", { source: "Recovery" });
        refreshHealth();
        return true;
      }
      const failed = (data.steps as RecoveryStep[] | undefined)?.find((s) => !s.ok);
      notification.error("Reprise échouée", {
        description: data.error ?? failed?.detail ?? "Cause inconnue",
        source: "Recovery",
      });
      return false;
    } catch (e: any) {
      notification.error("Reprise échouée", {
        description: e.message ?? "Connexion échouée",
        source: "Recovery",
      });
      return false;
    } finally {
      setRecovering(false);
      refreshHealth();
    }
  }, []);

  return { recovering, steps, diagnose, recover };
}
