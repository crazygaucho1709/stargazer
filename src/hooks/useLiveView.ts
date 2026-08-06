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
}

export function useLiveView(): UseLiveViewReturn {
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [status, setStatus] = useState("");

  const start = useCallback(async () => {
    if (isLive) return; // Déjà actif

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
  }, [isLive]);

  const stop = useCallback(async () => {
    // Mise à jour UI immédiate avant même la réponse réseau
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
  }, []);

  return { start, stop, streamUrl, isLive, status };
}
