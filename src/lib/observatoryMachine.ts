// src/lib/observatoryMachine.ts
// Observatory health state machine with per-subsystem failure detection and recovery

export type SubsystemId = "mount" | "ccd" | "indi_bridge" | "astroberry" | "weather" | "power";

export type SubsystemStatus = "nominal" | "degraded" | "failed" | "recovering" | "offline";

export type ObservatoryState =
  | "OFFLINE"
  | "STARTING"
  | "INITIALIZING_INDI"
  | "CONNECTING_MOUNT"
  | "CONNECTING_CCD"
  | "CONNECTING_WEATHER"
  | "ONLINE"
  | "DEGRADED"
  | "RECOVERING"
  | "CRITICAL"
  | "SHUTDOWN";

export type ObservatoryEvent =
  | "START"
  | "INDI_READY"
  | "MOUNT_CONNECTED"
  | "CCD_CONNECTED"
  | "WEATHER_CONNECTED"
  | "SUBSYSTEM_FAILED"
  | "SUBSYSTEM_RECOVERED"
  | "START_RECOVERY"
  | "RECOVERY_COMPLETE"
  | "SHUTDOWN"
  | "SHUTDOWN_COMPLETE"
  | "FORCE_CRITICAL"
  | "RESET";

export interface SubsystemHealth {
  id: SubsystemId;
  label: string;
  status: SubsystemStatus;
  lastSeen: number | null;
  errorCount: number;
  lastError: string | null;
  recoveryAttempts: number;
  recoveryActions: string[];
}

interface ObservatoryTransition {
  from: ObservatoryState;
  event: ObservatoryEvent;
  to: ObservatoryState;
  description: string;
}

const TRANSITIONS: ObservatoryTransition[] = [
  { from: "OFFLINE",      event: "START",            to: "STARTING",           description: "Démarrage de l'observatoire" },
  { from: "STARTING",     event: "INDI_READY",       to: "INITIALIZING_INDI",   description: "Bridge INDI prêt" },
  { from: "INITIALIZING_INDI", event: "MOUNT_CONNECTED", to: "CONNECTING_CCD",  description: "Monture connectée" },
  { from: "CONNECTING_CCD", event: "CCD_CONNECTED",  to: "CONNECTING_WEATHER", description: "Caméra connectée" },
  { from: "CONNECTING_WEATHER", event: "WEATHER_CONNECTED", to: "ONLINE",       description: "Météo connectée" },
  { from: "ONLINE",       event: "SUBSYSTEM_FAILED", to: "DEGRADED",            description: "Panne d'un sous-système" },
  { from: "DEGRADED",     event: "SUBSYSTEM_FAILED", to: "DEGRADED",            description: "Panne supplémentaire" },
  { from: "DEGRADED",     event: "SUBSYSTEM_RECOVERED", to: "ONLINE",           description: "Récupéré, retour online" },
  { from: "DEGRADED",     event: "START_RECOVERY",   to: "RECOVERING",          description: "Lancement recovery" },
  { from: "RECOVERING",   event: "RECOVERY_COMPLETE", to: "ONLINE",             description: "Recovery réussi" },
  { from: "RECOVERING",   event: "SUBSYSTEM_FAILED", to: "CRITICAL",            description: "Échec du recovery" },
  { from: "ONLINE",       event: "FORCE_CRITICAL",   to: "CRITICAL",            description: "Panne critique" },
  { from: "DEGRADED",     event: "FORCE_CRITICAL",   to: "CRITICAL",            description: "Forcé critique" },
  { from: "CRITICAL",     event: "RESET",            to: "OFFLINE",             description: "Redémarrage forcé" },
  { from: "SHUTDOWN",     event: "SHUTDOWN_COMPLETE", to: "OFFLINE",            description: "Extinction terminée" },
  { from: "ONLINE",       event: "SHUTDOWN",         to: "SHUTDOWN",            description: "Extinction en cours" },
  { from: "DEGRADED",     event: "SHUTDOWN",         to: "SHUTDOWN",            description: "Extinction depuis dégradé" },
];

export function obsTransition(from: ObservatoryState, event: ObservatoryEvent): ObservatoryState {
  const t = TRANSITIONS.find((tr) => tr.from === from && tr.event === event);
  if (!t) throw new Error(`Observatoire: transition impossible ${from} → ${event}`);
  return t.to;
}

export function canObservatoryTransition(from: ObservatoryState, event: ObservatoryEvent): boolean {
  return !!TRANSITIONS.find((tr) => tr.from === from && tr.event === event);
}

export function createSubsystems(): Record<SubsystemId, SubsystemHealth> {
  return {
    mount: {
      id: "mount",
      label: "NexStar 4SE",
      status: "offline",
      lastSeen: null,
      errorCount: 0,
      lastError: null,
      recoveryAttempts: 0,
      recoveryActions: ["reconnect_indi", "restart_driver", "power_cycle"],
    },
    ccd: {
      id: "ccd",
      label: "Canon EOS 600D",
      status: "offline",
      lastSeen: null,
      errorCount: 0,
      lastError: null,
      recoveryAttempts: 0,
      recoveryActions: ["reconnect_indi", "restart_gphoto", "power_cycle_usb"],
    },
    indi_bridge: {
      id: "indi_bridge",
      label: "INDI TCP Bridge",
      status: "offline",
      lastSeen: null,
      errorCount: 0,
      lastError: null,
      recoveryAttempts: 0,
      recoveryActions: ["restart_bridge", "restart_kstars"],
    },
    astroberry: {
      id: "astroberry",
      label: "Astroberry RPi",
      status: "offline",
      lastSeen: null,
      errorCount: 0,
      lastError: null,
      recoveryAttempts: 0,
      recoveryActions: ["ping_ssh", "restart_indi", "reboot"],
    },
    weather: {
      id: "weather",
      label: "Station Météo",
      status: "offline",
      lastSeen: null,
      errorCount: 0,
      lastError: null,
      recoveryAttempts: 0,
      recoveryActions: ["retry_fetch", "fallback_open_meteo"],
    },
    power: {
      id: "power",
      label: "Batterie",
      status: "offline",
      lastSeen: null,
      errorCount: 0,
      lastError: null,
      recoveryAttempts: 0,
      recoveryActions: ["check_voltage", "low_power_shutdown"],
    },
  };
}

export function getRecoveryPriority(subsystem: SubsystemId): number {
  const priorities: Record<SubsystemId, number> = {
    indi_bridge: 1,
    mount: 2,
    ccd: 3,
    astroberry: 4,
    power: 5,
    weather: 6,
  };
  return priorities[subsystem];
}

export const OBSERVATORY_LABELS: Record<ObservatoryState, { fr: string; en: string }> = {
  OFFLINE:            { fr: "HORS LIGNE",       en: "OFFLINE" },
  STARTING:           { fr: "DÉMARRAGE",        en: "STARTING" },
  INITIALIZING_INDI:  { fr: "INDI",             en: "INIT INDI" },
  CONNECTING_MOUNT:   { fr: "MONTURE",          en: "MOUNT" },
  CONNECTING_CCD:     { fr: "CAMÉRA",           en: "CAMERA" },
  CONNECTING_WEATHER: { fr: "MÉTÉO",            en: "WEATHER" },
  ONLINE:             { fr: "EN LIGNE",         en: "ONLINE" },
  DEGRADED:           { fr: "DÉGRADÉ",          en: "DEGRADED" },
  RECOVERING:         { fr: "RÉCUPÉRATION",     en: "RECOVERING" },
  CRITICAL:           { fr: "CRITIQUE",         en: "CRITICAL" },
  SHUTDOWN:           { fr: "EXTINCTION",       en: "SHUTDOWN" },
};

export const OBSERVATORY_COLORS: Record<ObservatoryState, string> = {
  OFFLINE:            "gray.500",
  STARTING:           "yellow.400",
  INITIALIZING_INDI:  "yellow.500",
  CONNECTING_MOUNT:   "orange.400",
  CONNECTING_CCD:     "orange.400",
  CONNECTING_WEATHER: "orange.400",
  ONLINE:             "green.400",
  DEGRADED:           "var(--astro-gold)",
  RECOVERING:         "cyan.400",
  CRITICAL:           "red.500",
  SHUTDOWN:           "gray.600",
};
