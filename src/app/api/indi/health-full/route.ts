// src/app/api/indi/health-full/route.ts
import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
const BRIDGE_URL = 'http://127.0.0.1:5005';

export async function GET() {
  try {
    const res = await fetch(`${BRIDGE_URL}/health/full`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return NextResponse.json({ error: `Backend HTTP ${res.status}` }, { status: 503 });

    const d = await res.json();

    // Normalize backend shape → ConnectionStatusBar interface
    const normalized = {
      bridge: {
        status: d.indi_bridge?.connected ? 'ok' : 'error',
        latency_ms: d.astroberry?.reachable ? undefined : undefined,
      },
      ssh: {
        status: d.astroberry?.ssh_reachable ? 'ok' : 'error',
        latency_ms: undefined as number | undefined,
      },
      mount: {
        status: d.mount?.connected ? 'ok' : (d.mount ? 'error' : 'missing'),
        driver: d.mount?.device ?? undefined,
      },
      camera: {
        status: d.camera?.connected ? 'ok' : (d.camera ? 'error' : 'missing'),
        type: d.camera?.device ?? undefined,
      },
      // Full backend payload — consumed by the diagnostics engine
      _raw: d,
    };

    return NextResponse.json(normalized);
  } catch {
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 503 });
  }
}
