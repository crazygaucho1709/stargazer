import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BRIDGE_URL = 'http://127.0.0.1:5005';

export async function GET() {
  try {
    const res = await fetch(`${BRIDGE_URL}/logs`, { cache: 'no-store' });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ logs: [`Mock mode - bridge offline`, `Error: ${error.message}`] });
  }
}
