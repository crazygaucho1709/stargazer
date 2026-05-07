import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BRIDGE_URL = 'http://127.0.0.1:5005';

export async function GET() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(`${BRIDGE_URL}/config`, {
      cache: 'no-store',
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { ip: _ip, ...config } = body; // strip ip param, always use local bridge

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(`${BRIDGE_URL}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
