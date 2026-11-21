// src/lib/stationReadiness.ts
// État unique de la station : Prête, Dégradée, Bloquée ou Hors ligne.
//
// Une seule fonction décide, pour toute l'interface, si l'on peut observer.
// Avant elle, trois écrans annonçaient « Station en ligne », « 100 % HEALTH »
// et « Tous les systèmes sont nominaux » dès que les liens répondaient — même
// avec une monture non alignée, un lieu par défaut ou un Pi en sous-tension.

import type { StationStatusData } from "@/hooks/useStationAutoInit";

export type ReadinessLevel = "ready" | "degraded" | "blocked" | "offline";

export interface ReadinessIssue {
  level: "degraded" | "blocked";
  text: string;
}

export interface StationReadiness {
  level: ReadinessLevel;
  /** Libellé court, pour la pastille de l'en-tête. */
  label: string;
  /** Une phrase : la raison principale. */
  summary: string;
  issues: ReadinessIssue[];
}

export interface ReadinessInput {
  loading: boolean;
  online: boolean;
  indiConnected: boolean;
  mountConnected: boolean;
  ccdConnected: boolean;
  station: StationStatusData | null;
  /** Code brut de vcgencmd get_throttled sur le Pi (ex. "0x50005"). */
  piThrottled?: string | null;
}

export function computeReadiness(input: ReadinessInput): StationReadiness {
  if (input.loading) {
    return { level: "offline", label: "Connexion…", summary: "Lecture de l'état de la station", issues: [] };
  }
  if (!input.online) {
    return {
      level: "offline",
      label: "Hors ligne",
      summary: "Le serveur Stargazer ne répond pas. Navigation et préparation libres.",
      issues: [],
    };
  }

  const st = input.station;
  const issues: ReadinessIssue[] = [];
  const blocked = (text: string) => issues.push({ level: "blocked", text });
  const degraded = (text: string) => issues.push({ level: "degraded", text });

  if (!input.indiConnected) blocked("Serveur INDI injoignable");
  else if (!input.mountConnected) blocked("Monture non connectée");
  if (st?.serial_error) blocked("Liaison série de la monture en panne");
  if (st?.link_suspect) blocked("Monture muette : un mouvement est resté sans effet");
  if (input.mountConnected && !st?.serial_error && st && st.encoder_alt == null) {
    blocked("Position de la monture non lue");
  }

  if (input.indiConnected && !input.ccdConnected) degraded("Caméra non connectée");
  if (input.mountConnected && !st?.sky_synced) degraded("Monture non alignée sur le ciel");
  if (st?.location_source === "fallback") degraded("Lieu par défaut : position GPS non reçue");

  const code = parseInt(String(input.piThrottled ?? ""), 16);
  if (!Number.isNaN(code)) {
    if (code & 0x1) degraded("Pi en sous-tension en ce moment");
    else if (code & 0x10000) degraded("Alimentation du Pi instable depuis son démarrage");
  }

  const firstBlocked = issues.find((i) => i.level === "blocked");
  if (firstBlocked) {
    return { level: "blocked", label: "Station bloquée", summary: firstBlocked.text, issues };
  }
  if (issues.length > 0) {
    const summary = issues.length === 1 ? issues[0].text : `${issues.length} points à régler avant d'observer`;
    return { level: "degraded", label: "Station dégradée", summary, issues };
  }
  return { level: "ready", label: "Station prête", summary: "Alignée, localisée, tous les liens répondent", issues };
}
