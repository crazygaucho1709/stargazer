// src/app/api/indi/health-full/route.ts
import { NextResponse } from 'next/server';
import { normalizeHealthFull } from '@/lib/healthNormalize';
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

    return NextResponse.json(normalizeHealthFull(d));
  } catch {
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 503 });
  }
}
