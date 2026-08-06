// src/app/api/indi/autoalign/session/status/route.ts
import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
const BRIDGE_URL = process.env.BRIDGE_URL || 'http://127.0.0.1:5005';

export async function GET() {
  try {
    const res = await fetch(`${BRIDGE_URL}/autoalign/session/status`, { cache: 'no-store' });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
