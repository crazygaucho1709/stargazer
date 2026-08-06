// src/app/api/ai/auth/route.ts
import { NextResponse } from 'next/server';
import { BRIDGE_URL } from '@/lib/apiConfig';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const res = await fetch(`${BRIDGE_URL}/ai/auth/status`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ claude: false, gemini: false, provider: null }, { status: 503 });
  }
}
