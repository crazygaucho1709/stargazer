import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
const BRIDGE_URL = 'http://127.0.0.1:5005';

export async function GET() {
  try {
    const res = await fetch(`${BRIDGE_URL}/health/full`, { cache: 'no-store' });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }
}
