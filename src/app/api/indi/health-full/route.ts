import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
const BRIDGE_URL = 'http://127.0.0.1:5005';

export async function GET() {
  try {
    const res = await fetch(`${BRIDGE_URL}/health/full`, { cache: 'no-store' });
    const resText = await res.text();
    try {
      const data = JSON.parse(resText);
      return NextResponse.json(data);
    } catch (e) {
      return NextResponse.json({ error: 'Backend returned invalid JSON', raw: resText }, { status: 502 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }
}
