// src/lib/sessionMachine.ts
// Session state machine formelle — remplace les booléens isSlewing/isExposing

export type SessionState =
  | "IDLE"
  | "PARKED"
  | "UNPARKING"
  | "TRACKING"
  | "SLEWING"
  | "GUIDING"
  | "CAPTURING"
  | "STACKING"
  | "STOPPING"
  | "ERROR";

export type SessionEvent =
  | "PARK"
  | "UNPARK"
  | "UNPARKED"
  | "SLEW"
  | "ARRIVED"
  | "START_GUIDE"
  | "STOP_GUIDE"
  | "START_CAPTURE"
  | "FRAME_DONE"
  | "STACK_DONE"
  | "ABORT"
  | "RESET"
  | "ERROR";

type TransitionMap = Partial<Record<SessionState, Partial<Record<SessionEvent, SessionState>>>>;

const TRANSITIONS: TransitionMap = {
  IDLE:        { PARK: "PARKED" },
  PARKED:      { UNPARK: "UNPARKING" },
  UNPARKING:   { UNPARKED: "TRACKING", ABORT: "STOPPING", ERROR: "ERROR" },
  TRACKING:    { SLEW: "SLEWING", START_GUIDE: "GUIDING", START_CAPTURE: "CAPTURING", PARK: "PARKED", ABORT: "STOPPING", ERROR: "ERROR" },
  SLEWING:     { ARRIVED: "TRACKING", ABORT: "STOPPING", ERROR: "ERROR" },
  GUIDING:     { STOP_GUIDE: "TRACKING", SLEW: "SLEWING", ABORT: "STOPPING", ERROR: "ERROR" },
  CAPTURING:   { FRAME_DONE: "STACKING", ABORT: "STOPPING", ERROR: "ERROR" },
  STACKING:    { STACK_DONE: "TRACKING", ABORT: "STOPPING", ERROR: "ERROR" },
  STOPPING:    { PARK: "PARKED", RESET: "IDLE", ERROR: "ERROR" },
  ERROR:       { RESET: "IDLE" },
};

export const STATE_LABELS: Record<SessionState, { fr: string; en: string }> = {
  IDLE:        { fr: "INACTIF",       en: "IDLE" },
  PARKED:      { fr: "GARÉ",         en: "PARKED" },
  UNPARKING:   { fr: "DÉGARAGE",     en: "UNPARKING" },
  TRACKING:    { fr: "SUIVI",        en: "TRACKING" },
  SLEWING:     { fr: "DÉPLACEMENT",  en: "SLEWING" },
  GUIDING:     { fr: "GUIDAGE",      en: "GUIDING" },
  CAPTURING:   { fr: "CAPTURE",      en: "CAPTURING" },
  STACKING:    { fr: "EMPILAGE",     en: "STACKING" },
  STOPPING:    { fr: "ARRÊT",        en: "STOPPING" },
  ERROR:       { fr: "ERREUR",       en: "ERROR" },
};

export function canTransition(from: SessionState, event: SessionEvent): boolean {
  return !!TRANSITIONS[from]?.[event];
}

export function transitionState(from: SessionState, event: SessionEvent): SessionState {
  const next = TRANSITIONS[from]?.[event];
  if (!next) {
    throw new Error(`Transition impossible : ${from} → ${event}`);
  }
  return next;
}

export const STATE_COLORS: Record<SessionState, string> = {
  IDLE:        "gray.500",
  PARKED:      "var(--astro-teal)",
  UNPARKING:   "yellow.400",
  TRACKING:    "green.400",
  SLEWING:     "var(--astro-gold)",
  GUIDING:     "cyan.400",
  CAPTURING:   "orange.400",
  STACKING:    "purple.400",
  STOPPING:    "red.400",
  ERROR:       "red.500",
};
