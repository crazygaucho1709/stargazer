// src/app/api/indi/connect/route.ts
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BRIDGE_URL = 'http://127.0.0.1:5005';

export async function POST() {
  try {
    const res = await fetch(`${BRIDGE_URL}/reconnect`, {
      method: 'POST',
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ success: false, error: 'Backend unreachable' }, { status: 503 });
  }
}
