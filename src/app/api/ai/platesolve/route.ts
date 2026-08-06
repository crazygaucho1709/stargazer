// src/app/api/ai/platesolve/route.ts
import { NextResponse } from 'next/server';
import { BRIDGE_URL } from '@/lib/apiConfig';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { imageBase64, provider } = await request.json();
    if (!imageBase64) return NextResponse.json({ error: 'imageBase64 missing.' }, { status: 400 });
    const res = await fetch(`${BRIDGE_URL}/ai/platesolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64, provider: provider ?? null }),
      signal: AbortSignal.timeout(35000),
    });
    const data = await res.json();
    if (!res.ok) return NextResponse.json(data, { status: res.status });
    return NextResponse.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
