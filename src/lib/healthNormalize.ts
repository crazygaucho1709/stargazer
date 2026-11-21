// src/lib/healthNormalize.ts
// Mise en forme du rapport /health/full du backend pour l'interface.
// Partagé par la route /api/indi/health-full et par le flux /api/station/stream :
// les deux doivent produire exactement la même forme.

type SubsystemStatus = "ok" | "error" | "missing";

export interface RawHealthFull {
  indi_bridge?: { connected?: boolean };
  astroberry?: { reachable?: boolean; ssh_reachable?: boolean };
  mount?: { connected?: boolean; device?: string } | null;
  camera?: { connected?: boolean; device?: string } | null;
  [key: string]: unknown;
}

export interface NormalizedHealth {
  bridge: { status: SubsystemStatus; latency_ms?: number };
  ssh: { status: SubsystemStatus; latency_ms?: number };
  mount: { status: SubsystemStatus; driver?: string };
  camera: { status: SubsystemStatus; type?: string };
  /** Rapport backend complet, lu par le moteur de diagnostic. */
  _raw: RawHealthFull;
}

export function normalizeHealthFull(d: RawHealthFull): NormalizedHealth {
  return {
    bridge: { status: d.indi_bridge?.connected ? "ok" : "error" },
    ssh: { status: d.astroberry?.ssh_reachable ? "ok" : "error" },
    mount: {
      status: d.mount?.connected ? "ok" : d.mount ? "error" : "missing",
      driver: d.mount?.device ?? undefined,
    },
    camera: {
      status: d.camera?.connected ? "ok" : d.camera ? "error" : "missing",
      type: d.camera?.device ?? undefined,
    },
    _raw: d,
  };
}
