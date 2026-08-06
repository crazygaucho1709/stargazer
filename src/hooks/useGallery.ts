// src/hooks/useGallery.ts
"use client";

/**
 * useGallery — galerie des captures de session (thumbnails serveur).
 *
 * - refresh() : GET /capture/gallery
 * - remove(thumbs) : POST /capture/gallery/delete (suppression en lot thumb + capture)
 * - thumbUrl(name) : URL directe du thumbnail servi par le backend
 * - Toutes les erreurs via notification (zéro silence)
 */

import { useState, useCallback } from "react";
import { useStargazerStore } from "@/store/useStargazerStore";
import { notification } from "@/lib/notificationService";

export interface GalleryItem {
  thumb: string;
  ts: string;
  capture_file: string | null;
  size_kb: number;
  capture_size_mb: number | null;
}

export interface UseGalleryReturn {
  items: GalleryItem[];
  loading: boolean;
  refresh: () => Promise<void>;
  remove: (thumbs: string[]) => Promise<boolean>;
  thumbUrl: (name: string) => string;
}

export function useGallery(): UseGalleryReturn {
  const { config } = useStargazerStore();
  const baseUrl = (config.astroberryUrl || "http://localhost:5005").replace(/\/+$/, "");

  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${baseUrl}/capture/gallery`, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
      const data = await res.json();
      if (!data.success) throw new Error(data.error ?? `HTTP ${res.status}`);
      setItems(data.items as GalleryItem[]);
    } catch (e: any) {
      notification.error("Chargement de la galerie échoué", {
        description: e.message ?? "Connexion échouée",
        source: "Galerie",
      });
    } finally {
      setLoading(false);
    }
  }, [baseUrl]);

  const remove = useCallback(async (thumbs: string[]): Promise<boolean> => {
    try {
      const res = await fetch(`${baseUrl}/capture/gallery/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thumbs }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error ?? `HTTP ${res.status}`);
      notification.success(`${(data.deleted as string[]).length} fichier(s) supprimé(s)`, { source: "Galerie" });
      setItems((prev) => prev.filter((i) => !thumbs.includes(i.thumb)));
      return true;
    } catch (e: any) {
      notification.error("Suppression échouée", {
        description: e.message ?? "Connexion échouée",
        source: "Galerie",
      });
      return false;
    }
  }, [baseUrl]);

  const thumbUrl = useCallback((name: string) => `${baseUrl}/capture/gallery/thumb/${name}`, [baseUrl]);

  return { items, loading, refresh, remove, thumbUrl };
}
