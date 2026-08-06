// src/components/observatory/DiagnosticsPanel.tsx
"use client";

/**
 * DiagnosticsPanel — diagnostic précis + récupération en un clic.
 *
 * Interprète /api/indi/health-full (payload backend complet sous `_raw`) en une
 * liste de pannes priorisées. Chaque panne expose : cause probable + correctif
 * ciblé. Un unique bouton "RESET ALL" lance la récupération graduée du backend
 * (/reset-all) et affiche le journal d'étapes en direct.
 *
 * Source unique de vérité réseau : ce composant possède la logique de diagnostic.
 */

import { useCallback, useState } from "react";
import { AlertTriangle, CheckCircle2, XCircle, Wrench, Activity, Loader2, ShieldCheck } from "lucide-react";
import { notification } from "@/lib/notificationService";
import { useHealthFull, refreshHealth } from "@/hooks/useHealthFull";

type Severity = "critical" | "warning" | "info";

interface Fix {
  label: string;
  endpoint: string;
  body?: Record<string, unknown>;
}

interface Issue {
  id: string;
  severity: Severity;
  title: string;
  cause: string;
  fix?: Fix;
}

interface ResetStep {
  step: string;
  ok: boolean;
  detail: string;
}

const SEV_STYLE: Record<Severity, { color: string; bg: string; border: string }> = {
  critical: { color: "#f87171", bg: "rgba(248,113,113,0.08)", border: "rgba(248,113,113,0.35)" },
  warning: { color: "#facc15", bg: "rgba(250,204,21,0.08)", border: "rgba(250,204,21,0.30)" },
  info: { color: "#38bdf8", bg: "rgba(56,189,248,0.08)", border: "rgba(56,189,248,0.30)" },
};

/** Parse "79.0'C" / "79.0" → 79.0 */
function parseTemp(t: unknown): number | null {
  if (typeof t !== "string") return null;
  const m = t.match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

/**
 * Moteur de règles. Ordre = priorité. La première cause racine rencontrée
 * masque les conséquences en aval (ex: Pi injoignable → on ne signale pas
 * "monture déconnectée", c'est une conséquence).
 */
function diagnose(raw: any): Issue[] {
  if (!raw || typeof raw !== "object") {
    return [{
      id: "backend-offline",
      severity: "critical",
      title: "Backend Mac Mini injoignable",
      cause: "Le serveur FastAPI (port 5005) ne répond pas. Vérifiez PM2 sur le Mac Mini.",
    }];
  }

  const a = raw.astroberry ?? {};
  const bridge = raw.indi_bridge ?? {};
  const mount = raw.mount ?? {};
  const cam = raw.camera ?? {};
  const issues: Issue[] = [];

  // 1 — Pi injoignable (cause racine réseau)
  if (a.reachable === false) {
    issues.push({
      id: "pi-unreachable",
      severity: "critical",
      title: "Raspberry Pi injoignable",
      cause: "Le Pi ne répond pas au ping. Probablement éteint, en reboot, ou hors réseau Wi-Fi. Le tunnel SSH se rétablira automatiquement à son retour.",
      fix: { label: "Réessayer la connexion", endpoint: "/api/indi/reset-all" },
    });
    return issues; // tout le reste est une conséquence
  }

  // 2 — Tunnel SSH coupé
  if (a.ssh_reachable === false) {
    issues.push({
      id: "ssh-down",
      severity: "critical",
      title: "Tunnel SSH coupé",
      cause: "Le Pi répond au ping mais le tunnel SSH (port 2222) est tombé. Reset All relancera la connexion.",
      fix: { label: "Reconnecter", endpoint: "/api/indi/reset-all" },
    });
    return issues;
  }

  // 3 — Bridge INDI déconnecté. La connexion socket est la source de vérité :
  //     si le bridge est connecté, indiserver tourne forcément (les champs
  //     astroberry.indi_running/pid sont des sondes SSH périodiques peu fiables
  //     et ne doivent jamais déclencher d'alarme seuls).
  if (bridge.connected !== true) {
    if (a.indi_running === false) {
      issues.push({
        id: "indi-down",
        severity: "critical",
        title: "Serveur INDI arrêté sur le Pi",
        cause: "indiserver n'est pas en cours d'exécution sur l'Astroberry. Aucun pilote (monture/caméra) n'est disponible.",
        fix: { label: "Redémarrer INDI (Pi)", endpoint: "/api/astroberry", body: { action: "restart-indi" } },
      });
    } else {
      issues.push({
        id: "bridge-down",
        severity: "critical",
        title: "Bridge INDI déconnecté",
        cause: "Le bridge local n'est pas connecté au port 7624 via le tunnel. Reconnexion nécessaire.",
        fix: { label: "Reconnecter le bridge", endpoint: "/api/indi/reconnect", body: { action: "reconnect" } },
      });
    }
    return issues;
  }

  // 5 — Monture non connectée
  if (mount.connected === false) {
    issues.push({
      id: "mount-down",
      severity: "warning",
      title: "Monture non connectée",
      cause: `Le pilote "${mount.device || "Celestron GPS"}" est chargé mais le port série n'est pas ouvert. Câble USB-série débranché ou monture éteinte ?`,
      fix: { label: "Reconnecter le matériel", endpoint: "/api/hardware/connect" },
    });
  }

  // 6 — Caméra Canon
  if (cam.connected === false) {
    const detected = typeof a.gphoto_detect === "string" && /canon/i.test(a.gphoto_detect);
    const usbError = typeof a.last_usb_error === "string" && /error -?32|device descriptor read/i.test(a.last_usb_error);
    if (detected) {
      issues.push({
        id: "canon-usb-lock",
        severity: "warning",
        title: "Canon détectée mais non connectée",
        cause: "Le Canon EOS est vu sur l'USB mais le pilote INDI n'a pas la main — verrou libgphoto2/gvfs résiduel. Libération du verrou USB recommandée.",
        fix: { label: "Libérer le verrou USB", endpoint: "/api/indi/ccd-reconnect" },
      });
    } else if (usbError) {
      issues.push({
        id: "canon-enum-fail",
        severity: "warning",
        title: "Échec d'énumération USB du Canon",
        cause: "Erreur USB -32 détectée (alimentation insuffisante sur RPi 3B+). Utilisez un hub USB alimenté ou un câble plus court, puis reconnectez.",
        fix: { label: "Reconnecter la caméra", endpoint: "/api/indi/ccd-reconnect" },
      });
    } else {
      issues.push({
        id: "canon-down",
        severity: "warning",
        title: "Caméra non connectée",
        cause: "Aucun Canon détecté sur l'USB du Pi. Vérifiez le câble et que l'appareil est allumé.",
        fix: { label: "Reconnecter la caméra", endpoint: "/api/indi/ccd-reconnect" },
      });
    }
  }

  // 7 — Monture parkée (info)
  if (mount.connected && mount.parked) {
    issues.push({
      id: "mount-parked",
      severity: "info",
      title: "Monture parkée",
      cause: "La monture est en position de parking. Désparkez avant de pointer une cible.",
      fix: { label: "Désparker", endpoint: "/api/mount/unpark" },
    });
  }

  // 8 — Température Pi élevée (warning)
  const temp = parseTemp(a.temperature);
  if (temp !== null && temp >= 75) {
    issues.push({
      id: "pi-hot",
      severity: "warning",
      title: `Température du Pi élevée (${temp.toFixed(0)}°C)`,
      cause: "Le CPU du Raspberry Pi chauffe (≥ 75°C). Risque de throttling. Vérifiez la ventilation/dissipateur.",
    });
  }

  return issues;
}

export function DiagnosticsPanel() {
  // Source unique partagée (un seul poller pour toute l'app)
  const { raw, loading } = useHealthFull();
  const loaded = !loading;
  const [fixingId, setFixingId] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetSteps, setResetSteps] = useState<ResetStep[]>([]);

  const issues = diagnose(raw);
  const healthy = loaded && issues.length === 0;

  const runFix = useCallback(async (issue: Issue) => {
    if (!issue.fix) return;
    setFixingId(issue.id);
    try {
      const res = await fetch(issue.fix.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: issue.fix.body ? JSON.stringify(issue.fix.body) : undefined,
        signal: AbortSignal.timeout(45000),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success !== false) {
        notification.success(`Correctif appliqué : ${issue.title}`, { source: "Diagnostic" });
      } else {
        notification.error(`Échec du correctif : ${issue.title}`, {
          source: "Diagnostic",
          description: data.error || data.detail || `HTTP ${res.status}`,
        });
      }
    } catch (e: unknown) {
      notification.error(`Échec du correctif : ${issue.title}`, {
        source: "Diagnostic",
        description: e instanceof Error ? e.message : "Erreur réseau",
      });
    } finally {
      setFixingId(null);
      refreshHealth();
    }
  }, []);

  const runResetAll = useCallback(async () => {
    setResetting(true);
    setResetSteps([]);
    try {
      const res = await fetch("/api/indi/reset-all", { method: "POST", signal: AbortSignal.timeout(50000) });
      const data = await res.json().catch(() => ({}));
      setResetSteps(Array.isArray(data.steps) ? data.steps : []);
      if (res.ok && data.success) {
        notification.success("Reset All terminé — tous les sous-systèmes connectés", { source: "Diagnostic" });
      } else {
        notification.warning("Reset All partiel — consultez le journal d'étapes", {
          source: "Diagnostic",
          description: data.error || data.detail,
        });
      }
    } catch (e: unknown) {
      notification.error("Reset All échoué", {
        source: "Diagnostic",
        description: e instanceof Error ? e.message : "Backend injoignable",
      });
    } finally {
      setResetting(false);
      refreshHealth();
    }
  }, []);

  return (
    <div style={{ background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 16 }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Activity size={16} color={healthy ? "#4ade80" : "#facc15"} />
          <span style={{ fontSize: 12, fontWeight: "bold", letterSpacing: "0.1em", color: "rgba(255,255,255,0.85)" }}>
            DIAGNOSTIC
          </span>
          {!healthy && loaded && (
            <span style={{ fontSize: 10, color: "#f87171", background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 4, padding: "1px 6px" }}>
              {issues.length} problème{issues.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <button
          onClick={runResetAll}
          disabled={resetting}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: resetting ? "rgba(34,211,238,0.15)" : "#0ea5e9",
            color: resetting ? "#22d3ee" : "white",
            border: "none", borderRadius: 6, padding: "6px 14px",
            fontSize: 11, fontWeight: "bold", letterSpacing: "0.05em",
            cursor: resetting ? "not-allowed" : "pointer", opacity: resetting ? 0.8 : 1,
          }}
        >
          {resetting ? <Loader2 size={13} className="animate-spin" /> : <Wrench size={13} />}
          {resetting ? "RÉCUPÉRATION…" : "RESET ALL"}
        </button>
      </div>

      {/* Healthy state */}
      {healthy && (
        <div className="flex items-center gap-3" style={{ padding: "10px 12px", borderRadius: 8, background: "rgba(74,222,128,0.06)", border: "1px solid rgba(74,222,128,0.25)" }}>
          <ShieldCheck size={18} color="#4ade80" />
          <span style={{ fontSize: 12, color: "#86efac" }}>Tous les systèmes sont nominaux.</span>
        </div>
      )}

      {/* Issue list */}
      {!healthy && loaded && (
        <div className="flex flex-col gap-2">
          {issues.map((iss) => {
            const st = SEV_STYLE[iss.severity];
            const Icon = iss.severity === "info" ? CheckCircle2 : iss.severity === "warning" ? AlertTriangle : XCircle;
            return (
              <div key={iss.id} style={{ padding: 12, borderRadius: 8, background: st.bg, border: `1px solid ${st.border}` }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5" style={{ flex: 1 }}>
                    <Icon size={15} color={st.color} style={{ marginTop: 1, flexShrink: 0 }} />
                    <div>
                      <p style={{ fontSize: 12, fontWeight: "bold", color: st.color, margin: 0 }}>{iss.title}</p>
                      <p style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", margin: "3px 0 0", lineHeight: 1.5 }}>{iss.cause}</p>
                    </div>
                  </div>
                  {iss.fix && (
                    <button
                      onClick={() => runFix(iss)}
                      disabled={fixingId !== null || resetting}
                      style={{
                        display: "flex", alignItems: "center", gap: 5, flexShrink: 0,
                        background: "rgba(255,255,255,0.06)", color: st.color,
                        border: `1px solid ${st.border}`, borderRadius: 6,
                        padding: "5px 10px", fontSize: 10, fontWeight: "bold",
                        cursor: fixingId !== null || resetting ? "not-allowed" : "pointer",
                        opacity: fixingId !== null || resetting ? 0.5 : 1, whiteSpace: "nowrap",
                      }}
                    >
                      {fixingId === iss.id ? <Loader2 size={11} className="animate-spin" /> : <Wrench size={11} />}
                      {iss.fix.label}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Reset All step log */}
      {resetSteps.length > 0 && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <p style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em", margin: "0 0 8px" }}>
            JOURNAL DE RÉCUPÉRATION
          </p>
          <div className="flex flex-col gap-1.5">
            {resetSteps.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                {s.ok ? <CheckCircle2 size={13} color="#4ade80" /> : <XCircle size={13} color="#f87171" />}
                <span style={{ fontSize: 11, color: s.ok ? "rgba(255,255,255,0.75)" : "#fca5a5" }}>
                  {s.step}
                  {s.detail && <span style={{ color: "rgba(255,255,255,0.4)" }}> — {s.detail}</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loaded && (
        <div className="flex items-center gap-2" style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>
          <Loader2 size={13} className="animate-spin" /> Analyse de l&apos;infrastructure…
        </div>
      )}
    </div>
  );
}
