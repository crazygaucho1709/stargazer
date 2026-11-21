// src/hooks/useStationStream.ts
"use client";

/**
 * useStationStream — état de la station poussé par le backend (SSE).
 *
 * Une SEULE connexion pour toute l'application, partagée par tous les
 * composants abonnés (comptage de références). Elle remplace trois
 * interrogations périodiques : la liaison (2 s), l'état de la station (3 s) et
 * le rapport d'infrastructure (5 s).
 *
 * Backend injoignable : on ferme et on réessaie en espaçant (2, 4, 8 puis
 * 10 s), au lieu de laisser le navigateur relancer toutes les 3 secondes.
 */

import { useEffect, useState } from "react";
import { normalizeHealthFull, NormalizedHealth, RawHealthFull } from "@/lib/healthNormalize";
import type { StationStatusData } from "@/hooks/useStationAutoInit";
import type { StationSetupState } from "@/hooks/useStationSetup";

export interface StationStreamSnapshot {
  /** Faux tant qu'aucune trame (ou aucun échec) n'est arrivé. */
  loading: boolean;
  /** Le backend répond et pousse son état. */
  online: boolean;
  indiConnected: boolean;
  mountConnected: boolean;
  ccdConnected: boolean;
  station: StationStatusData | null;
  /** Rapport d'infrastructure, rafraîchi par le backend toutes les 5 s. */
  health: NormalizedHealth | null;
  /** Mise en station automatique ; null si elle n'a jamais été lancée. */
  setup: StationSetupState | null;
  /** Capteur du téléphone fixé sur le tube, tel que le backend le connaît. */
  phone: RawPhoneSensor | null;
}

export interface RawPhoneSensor {
  connected?: boolean;
  alpha?: number | null;
  beta?: number | null;
  gamma?: number | null;
  lat?: number | null;
  lon?: number | null;
  accuracy_m?: number | null;
  timestamp?: string | null;
  age_s?: number | null;
  stale?: boolean;
}

interface StreamFrame {
  error?: string;
  indi_connected?: boolean;
  mount_connected?: boolean;
  ccd_connected?: boolean;
  station?: StationStatusData;
  full?: RawHealthFull;
  setup?: StationSetupState | null;
  phone?: RawPhoneSensor | null;
}

const STREAM_URL = "/api/station/stream";
const RETRY_DELAYS_MS = [2_000, 4_000, 8_000, 10_000];

const OFFLINE: Omit<StationStreamSnapshot, "loading"> = {
  online: false,
  indiConnected: false,
  mountConnected: false,
  ccdConnected: false,
  station: null,
  health: null,
  setup: null,
  phone: null,
};

let snapshot: StationStreamSnapshot = { loading: true, ...OFFLINE };
const subscribers = new Set<() => void>();
let source: EventSource | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let attempt = 0;

function publish(next: StationStreamSnapshot) {
  snapshot = next;
  subscribers.forEach((fn) => fn());
}

function fail() {
  source?.close();
  source = null;
  // Hors ligne, on n'affiche plus le dernier état connu : une position ou un
  // rapport figés passeraient pour des valeurs courantes.
  publish({ loading: false, ...OFFLINE });
  if (subscribers.size === 0 || retryTimer) return;
  const delay = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
  attempt += 1;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    open();
  }, delay);
}

function open() {
  if (source || subscribers.size === 0) return;
  const es = new EventSource(STREAM_URL);
  source = es;

  es.onmessage = (evt: MessageEvent<string>) => {
    let frame: StreamFrame;
    try {
      frame = JSON.parse(evt.data) as StreamFrame;
    } catch {
      fail(); // trame illisible : on repart sur une connexion propre
      return;
    }
    if (frame.error) {
      fail();
      return;
    }
    attempt = 0;
    publish({
      loading: false,
      online: true,
      indiConnected: !!frame.indi_connected,
      mountConnected: !!frame.mount_connected,
      ccdConnected: !!frame.ccd_connected,
      station: frame.station ?? null,
      health: frame.full ? normalizeHealthFull(frame.full) : snapshot.health,
      setup: frame.setup ?? null,
      phone: frame.phone ?? null,
    });
  };

  es.onerror = () => fail();
}

function close() {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  source?.close();
  source = null;
  attempt = 0;
}

/** Remplace le rapport d'infrastructure sans attendre la prochaine trame. */
export function applyHealth(health: NormalizedHealth) {
  if (snapshot.online) publish({ ...snapshot, health });
}

export function useStationStream(): StationStreamSnapshot {
  const [, force] = useState(0);

  useEffect(() => {
    const cb = () => force((n) => n + 1);
    subscribers.add(cb);
    open();
    return () => {
      subscribers.delete(cb);
      if (subscribers.size === 0) close();
    };
  }, []);

  return snapshot;
}
