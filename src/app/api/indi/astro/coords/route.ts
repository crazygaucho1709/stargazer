import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { ip, ...data } = body;
    const bridgeIp = ip || '127.0.0.1';
    const safeIp = bridgeIp.startsWith('localhost') ? bridgeIp.replace('localhost', '127.0.0.1') : bridgeIp;
    const finalIp = safeIp.includes(':') ? safeIp : `${safeIp}:5005`;
    const BRIDGE_URL = `http://${finalIp}`;
    
    const res = await fetch(`${BRIDGE_URL}/astro/coords`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
    const json = await res.json();
    return NextResponse.json(json);
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
