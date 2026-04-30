import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const bridgeIp = url.searchParams.get('ip') || '192.168.178.142';
    const BRIDGE_URL = `http://localhost:5005`;
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
    const { ip, ...config } = body;
    const bridgeIp = ip || '192.168.178.142';
    const BRIDGE_URL = `http://${bridgeIp}:5005`;
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
