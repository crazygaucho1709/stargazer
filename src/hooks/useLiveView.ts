"use client";

/**
 * useLiveView — source unique de vérité pour le flux live CCD/Canon.
 *
 * Règles :
 *  - Timeout 12s sur le démarrage (Canon : ~4s de délai miroir)
 *  - URL de stream stable SANS timestamp — critique pour MJPEG
 *  - Toutes les erreurs affichées via notification (zéro silence)
 *  - stop() toujours appelable même si le stream n'est pas actif (idempotent)
 */

import { useState, useCallback, useRef } from "react";
import { notification } from "@/lib/notificationService";
import { clientApiUrl, getClientBridgeUrl } from "@/lib/clientApi";

export interface UseLiveViewReturn {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  /** URL stable du stream MJPEG, null si inactif */
  streamUrl: string | null;
  isLive: boolean;
  /** Texte de statut court ("LIVE", "Starting...", "❌ ...", "") */
  status: string;
  /** Loupe du boîtier Canon : niveau et centre normalisé (0..1) sur le capteur. */
  cameraZoom: CameraZoom;
  /** Règle la loupe du boîtier. Sans x/y, garde le centre courant. */
  setCameraZoom: (level: CameraZoomLevel, x?: number, y?: number) => Promise<void>;
  isZooming: boolean;
}

export type CameraZoomLevel = 1 | 5 | 10;
export interface CameraZoom { level: CameraZoomLevel; x: number; y: number }

const FULL_FRAME: CameraZoom = { level: 1, x: 0.5, y: 0.5 };

export function useLiveView(): UseLiveViewReturn {
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [status, setStatus] = useState("");
  const [cameraZoom, setCameraZoomState] = useState<CameraZoom>(FULL_FRAME);
  const [isZooming, setIsZooming] = useState(false);
  const cameraZoomRef = useRef<CameraZoom>(FULL_FRAME);

  const applyZoomState = useCallback((z: CameraZoom) => {
    cameraZoomRef.current = z;
    setCameraZoomState(z);
  }, []);

  const setCameraZoom = useCallback(
    async (level: CameraZoomLevel, x?: number, y?: number) => {
      const cur = cameraZoomRef.current;
      setIsZooming(true);
      try {
        const res = await fetch(clientApiUrl("/api/indi/liveview"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "zoom", level, x: x ?? cur.x, y: y ?? cur.y }),
        });
        const data: { success?: boolean; error?: string; level?: CameraZoomLevel; x?: number; y?: number } =
          await res.json().catch(() => ({ success: false, error: `HTTP ${res.status}` }));
        if (!res.ok || data.success === false) {
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        // Le backend renvoie le centre réellement appliqué (recalé dans le capteur)
        applyZoomState({ level: data.level ?? level, x: data.x ?? 0.5, y: data.y ?? 0.5 });
      } catch (err: unknown) {
        notification.error("Échec de la loupe Canon", {
          description: err instanceof Error ? err.message : "Impossible de régler le zoom du boîtier",
          source: "Caméra",
        });
      } finally {
        setIsZooming(false);
      }
    },
    [applyZoomState]
  );

  const start = useCallback(async () => {
    if (isLive) return; // Déjà actif

    applyZoomState(FULL_FRAME); // un flux qui démarre est en plein champ
    setStatus("Starting...");

    // Timeout 12s : Canon prend ~4s (délai miroir) — si ça dépasse, INDI ou caméra non dispo
    const ac = new AbortController();
    const timeoutId = setTimeout(() => ac.abort(), 12_000);

    try {
      const res = await fetch(clientApiUrl("/api/indi/liveview"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({ action: "start" }),
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
          const j = await res.json();
          if (j.error) msg = j.error;
        } catch {}
        setStatus(`❌ ${msg}`);
        notification.error("Échec du live view", {
          description: msg,
          source: "Caméra",
        });
        return;
      }

      const data = await res.json().catch(() => ({}));
      if (data?.success === false) {
        const msg = data.error || "Erreur inconnue";
        setStatus(`❌ ${msg}`);
        notification.error("Échec du live view", { description: msg, source: "Caméra" });
        return;
      }

      // URL directe vers FastAPI — bypass complet du proxy Next.js pour latence minimale
      const url = `${getClientBridgeUrl()}/video_feed`;
      setStreamUrl(url);
      setIsLive(true);
      setStatus("LIVE");
    } catch (err: any) {
      clearTimeout(timeoutId);
      const msg =
        err?.name === "AbortError"
          ? "Timeout (>12s) — INDI ou caméra non disponible"
          : err?.message || "Erreur réseau";
      setStatus(`❌ ${msg}`);
      notification.error("Échec du live view", { description: msg, source: "Caméra" });
    }
  }, [isLive, applyZoomState]);

  const stop = useCallback(async () => {
    // Mise à jour UI immédiate avant même la réponse réseau
    applyZoomState(FULL_FRAME);
    setIsLive(false);
    setStreamUrl(null);
    setStatus("");

    try {
      await fetch(clientApiUrl("/api/indi/liveview"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop" }),
      });
    } catch (err: any) {
      // Ne pas bloquer l'UI si le backend est injoignable — l'état local est déjà mis à jour
      notification.error("Arrêt du live view échoué", {
        description: err?.message || "Impossible d'envoyer la commande stop",
        source: "Caméra",
      });
    }
  }, [applyZoomState]);

  return { start, stop, streamUrl, isLive, status, cameraZoom, setCameraZoom, isZooming };
}
