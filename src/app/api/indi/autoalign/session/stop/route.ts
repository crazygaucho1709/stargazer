// src/app/api/indi/autoalign/session/stop/route.ts
import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
const BRIDGE_URL = process.env.BRIDGE_URL || 'http://127.0.0.1:5005';

export async function POST() {
  try {
    const res = await fetch(`${BRIDGE_URL}/autoalign/session/stop`, { method: 'POST' });
    const resText = await res.text();
    try {
      return NextResponse.json(JSON.parse(resText), { status: res.status });
    } catch {
      return NextResponse.json({ success: res.ok, message: resText }, { status: res.status });
    }
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
