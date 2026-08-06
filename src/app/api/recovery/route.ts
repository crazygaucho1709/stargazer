// src/app/api/recovery/route.ts
/**
 * Reprise simplifiée depuis Stargazer — s'exécute côté serveur sur le M4,
 * donc fonctionne même quand le backend Python (port 5005) est mort.
 *
 *  GET  /api/recovery  → diagnostic seul (port 5005, Pi joignable, INDI 7624)
 *  POST /api/recovery  → séquence de reprise :
 *    1. kill du zombie sur le port 5005
 *    2. pm2 restart stargazer-backend + stargazer-tunnel (pm2 sous nvm)
 *    3. poll de /health jusqu'à 200 (30 s max)
 *
 * Garde-fou : une seule reprise à la fois (verrou module).
 */

import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

export const dynamic = "force-dynamic";

const execAsync = promisify(exec);

const BACKEND_HEALTH = "http://localhost:5005/health";
const PI_IP = "astroberry.local"; // Résolution dynamique mDNS
const PM2_PREFIX = "source ~/.nvm/nvm.sh >/dev/null 2>&1;"; // pm2 vit sous nvm, pas dans PATH

interface Step {
  name: string;
  ok: boolean;
  detail: string;
}

let recoveryInProgress = false;

async function run(cmd: string, timeoutMs = 15_000): Promise<{ ok: boolean; out: string }> {
  try {
    const { stdout, stderr } = await execAsync(`${PM2_PREFIX} ${cmd}`, {
      timeout: timeoutMs,
      shell: "/bin/zsh",
    });
    return { ok: true, out: (stdout + stderr).trim() };
  } catch (e: any) {
    return { ok: false, out: (e.stdout ?? "") + (e.stderr ?? e.message ?? "") };
  }
}

async function checkTcp(host: string, port: number): Promise<boolean> {
  const { ok } = await run(`nc -z -G 3 ${host} ${port}`, 5_000);
  return ok;
}

async function backendHealthy(timeoutMs = 4_000): Promise<boolean> {
  try {
    const res = await fetch(BACKEND_HEALTH, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── GET : diagnostic ─────────────────────────────────────────────────────────

export async function GET() {
  const [backendUp, piSsh, piIndi] = await Promise.all([
    backendHealthy(),
    checkTcp(PI_IP, 22),
    checkTcp(PI_IP, 7624),
  ]);

  const port5005Held = backendUp ? true : (await run(`lsof -ti :5005`, 5_000)).out.length > 0;

  return NextResponse.json({
    backend: backendUp,
    zombie: !backendUp && port5005Held,
    pi_ssh: piSsh,
    pi_indi: piIndi,
    recoverable: piSsh && piIndi, // sans Pi joignable, la reprise M4 ne suffira pas
    in_progress: recoveryInProgress,
  });
}

// ─── POST : reprise ───────────────────────────────────────────────────────────

export async function POST() {
  if (recoveryInProgress) {
    return NextResponse.json({ success: false, error: "Reprise déjà en cours" }, { status: 409 });
  }
  recoveryInProgress = true;
  const steps: Step[] = [];

  try {
    // 1. Zombie port 5005
    const kill = await run(`lsof -ti :5005 | xargs kill -9 2>/dev/null; true`);
    steps.push({ name: "Nettoyage port 5005", ok: true, detail: kill.out || "aucun processus à tuer" });

    // 2. Restart PM2 (backend + tunnel — les deux crashent ensemble quand le Pi disparaît)
    const restart = await run(`pm2 restart stargazer-backend stargazer-tunnel`, 30_000);
    steps.push({
      name: "Redémarrage backend + tunnel",
      ok: restart.ok,
      detail: restart.ok ? "pm2 restart OK" : restart.out.slice(0, 300),
    });
    if (!restart.ok) {
      return NextResponse.json({ success: false, steps }, { status: 500 });
    }

    // 3. Attendre que /health réponde (30 s max)
    let healthy = false;
    for (let i = 0; i < 15 && !healthy; i++) {
      await new Promise((r) => setTimeout(r, 2_000));
      healthy = await backendHealthy();
    }
    steps.push({
      name: "Vérification /health",
      ok: healthy,
      detail: healthy ? "backend opérationnel" : "pas de réponse après 30 s — voir pm2 logs stargazer-backend",
    });

    return NextResponse.json({ success: healthy, steps }, { status: healthy ? 200 : 500 });
  } finally {
    recoveryInProgress = false;
  }
}
