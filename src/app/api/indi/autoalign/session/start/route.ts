// src/app/api/indi/autoalign/session/start/route.ts
import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
const BRIDGE_URL = process.env.BRIDGE_URL || 'http://127.0.0.1:5005';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const res = await fetch(`${BRIDGE_URL}/autoalign/session/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
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
