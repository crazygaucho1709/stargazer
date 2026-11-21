// src/hooks/usePhoneSensor.ts
"use client";

import { useMemo } from "react";
import { useStationStream } from "@/hooks/useStationStream";

export interface PhoneSensorState {
  /** Le téléphone envoie des mesures en ce moment (connecté ET données fraîches). */
  connected: boolean;
  alpha: number | null;   // cap boussole 0-360°
  beta: number | null;    // inclinaison avant-arrière
  gamma: number | null;   // roulis
  lat: number | null;
  lon: number | null;
  accuracy_m: number | null;
  timestamp: string | null;
  /** Dernière mesure trop ancienne : le téléphone s'est tu. */
  stale: boolean;
}

const EMPTY: PhoneSensorState = {
  connected: false, alpha: null, beta: null, gamma: null,
  lat: null, lon: null, accuracy_m: null, timestamp: null, stale: true,
};

/**
 * Capteur du téléphone fixé sur le tube, lu dans le flux de la station.
 *
 * Source unique : trois assistants ouvraient chacun leur propre connexion et
 * tenaient « connexion ouverte » pour « téléphone connecté », pendant qu'un
 * quatrième composant interrogeait le backend toutes les deux secondes.
 */
export function usePhoneSensor(): PhoneSensorState {
  const phone = useStationStream().phone;
  return useMemo(() => {
    if (!phone) return EMPTY;
    const stale = phone.stale !== false;
    return {
      connected: !!phone.connected && !stale,
      alpha: phone.alpha ?? null,
      beta: phone.beta ?? null,
      gamma: phone.gamma ?? null,
      lat: phone.lat ?? null,
      lon: phone.lon ?? null,
      accuracy_m: phone.accuracy_m ?? null,
      timestamp: phone.timestamp ?? null,
      stale,
    };
  }, [phone]);
}
