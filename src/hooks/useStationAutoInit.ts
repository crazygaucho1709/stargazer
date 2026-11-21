// src/hooks/useStationAutoInit.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CELESTIAL_CATALOG, CelestialObject } from "@/data/celestialCatalog";
import { useStargazerStore } from "@/store/useStargazerStore";
import { notification } from "@/lib/notificationService";
import { useStationStream } from "@/hooks/useStationStream";

export interface StationStatusData {
  location_source: string | null;
  lat: number | null;
  lon: number | null;
  elevation: number;
  time_synced_at: string | null;
  auto_init_done: boolean;
  sky_synced: boolean;
  sky_sync_ra_deg: number | null;
  sky_sync_dec_deg: number | null;
  sky_sync_rotation_deg: number | null;
  sky_synced_at: string | null;
  last_ai_comment: string | null;
  mount_connected: boolean;
  ccd_connected: boolean;
  encoder_age_s: number | null;
  encoder_stale_s: number;
  polling_period_ms: number;
  link_suspect: boolean;
  /** Le driver monture signale des erreurs d'écriture série : ordres non transmis. */
  serial_error?: boolean;
  /** Position lue sur les encodeurs, en degrés ; null si rien de fiable. */
  encoder_alt?: number | null;
  encoder_az?: number | null;
  /** Limites réellement appliquées par le backend. */
  limits?: { alt_min: number; alt_max: number; az_min: number; az_max: number };
  /** Retard de l'image live sur le direct, en secondes ; null hors flux. */
  stream_lag_s?: number | null;
}

export interface IdentifySkyOutcome {
  success: boolean;
  raDeg?: number;
  decDeg?: number;
  rotationDeg?: number | null;
  synced?: boolean;
  aiComment?: string | null;
  matchedObject?: CelestialObject | null;
  distanceDeg?: number | null;
  error?: string;
}

function angularDistanceDeg(ra1: number, dec1: number, ra2: number, dec2: number): number {
  const r = Math.PI / 180;
  const d1 = dec1 * r;
  const d2 = dec2 * r;
  const dr = (ra2 - ra1) * r;
  const cosD = Math.sin(d1) * Math.sin(d2) + Math.cos(d1) * Math.cos(d2) * Math.cos(dr);
  return Math.acos(Math.max(-1, Math.min(1, cosD))) / r;
}

function findNearestCatalogObject(raDeg: number, decDeg: number): { obj: CelestialObject | null; dist: number | null } {
  let best: CelestialObject | null = null;
  let bestDist = Infinity;
  for (const obj of CELESTIAL_CATALOG) {
    const d = angularDistanceDeg(raDeg, decDeg, obj.ra_deg, obj.dec_deg);
    if (d < bestDist) {
      bestDist = d;
      best = obj;
    }
  }
  return { obj: best, dist: best ? bestDist : null };
}

export function useStationAutoInit() {
  const stationStatus = useStationStream().station;
  const [identifying, setIdentifying] = useState(false);
  const geoSentRef = useRef(false);

  // 1. Silent browser geolocation -> backend /station/location
  useEffect(() => {
    if (geoSentRef.current || typeof navigator === "undefined" || !navigator.geolocation) return;
    geoSentRef.current = true;

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude, altitude } = pos.coords;
        useStargazerStore.getState().updateConfig(
          {
            latitude: latitude.toFixed(5),
            longitude: longitude.toFixed(5),
          },
          false,
        );
        try {
          await fetch("/api/station/location", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              lat: latitude,
              lon: longitude,
              elevation: altitude ?? 0,
              source: "browser",
            }),
          });
        } catch {
          // Backend hors ligne : on conserve les coordonnées en local sans bloquer
        }
      },
      () => {
        // Permission refusée ou indisponible : on reste sur la config/gpsd
      },
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 300_000 },
    );
  }, []);

  // 2. État de la station (fraîcheur encodeur, initialisation Vespera) :
  //    poussé par le flux partagé, plus d'interrogation toutes les 3 s.

  // 3. One-click Vespera "Identifier le ciel"
  const identifySky = useCallback(
    async (exposure = 4.0): Promise<IdentifySkyOutcome> => {
      if (identifying) return { success: false, error: "Identification déjà en cours" };
      setIdentifying(true);
      notification.info("Identification du ciel en cours…", {
        description: "Capture courte → diagnostic IA → résolution astrométrique locale",
        source: "Vespera",
      });

      try {
        const res = await fetch("/api/station/identify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            exposure,
            use_ai_diagnosis: true,
            sync_mount: true,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          const msg = data.error || "Impossible d'identifier le champ";
          notification.warning("Identification interrompue", {
            description: msg,
            source: "Vespera",
          });
          return {
            success: false,
            aiComment: data.ai_diagnostic?.comment ?? null,
            error: msg,
          };
        }

        const raDeg = Number(data.ra_deg);
        const decDeg = Number(data.dec_deg);
        const { obj, dist } = findNearestCatalogObject(raDeg, decDeg);
        const aiComment = data.ai_diagnostic?.comment ?? null;

        const matchLabel =
          obj && dist !== null && dist <= 2.5
            ? `${obj.id} (${obj.name}) à ${dist.toFixed(2)}°`
            : `RA ${(raDeg / 15).toFixed(2)}h · DEC ${decDeg.toFixed(2)}°`;

        notification.success(
          data.synced ? "Ciel identifié et monture synchronisée" : "Ciel identifié",
          {
            description: aiComment ? `${matchLabel} — ${aiComment}` : matchLabel,
            source: "Vespera",
          },
        );

        return {
          success: true,
          raDeg,
          decDeg,
          rotationDeg: data.rotation_deg ?? null,
          synced: Boolean(data.synced),
          aiComment,
          matchedObject: obj && dist !== null && dist <= 2.5 ? obj : null,
          distanceDeg: dist,
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Erreur réseau";
        notification.error("Échec identification du ciel", {
          description: msg,
          source: "Vespera",
        });
        return { success: false, error: msg };
      } finally {
        setIdentifying(false);
      }
    },
    [identifying],
  );

  return {
    stationStatus,
    identifying,
    identifySky,
  };
}
