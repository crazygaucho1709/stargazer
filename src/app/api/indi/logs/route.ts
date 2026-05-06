import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const bridgeIp = url.searchParams.get('ip') || '127.0.0.1';
    const safeIp = bridgeIp.startsWith('localhost') ? bridgeIp.replace('localhost', '127.0.0.1') : bridgeIp;
    const finalIp = safeIp.includes(':') ? safeIp : `${safeIp}:5005`;
    const BRIDGE_URL = `http://${finalIp}`;
    
    const res = await fetch(`${BRIDGE_URL}/logs`, { cache: 'no-store' });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ logs: ["Mock mode - bridge offline", `Error: ${error.message}`] });
  }
}
