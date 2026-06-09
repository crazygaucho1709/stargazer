import { NextResponse } from 'next/server';
import { BRIDGE_URL } from '@/lib/apiConfig';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const res = await fetch(`${BRIDGE_URL}/phone-sensor/state`, { cache: 'no-store' });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ connected: false, error: e.message }, { status: 503 });
  }
}
