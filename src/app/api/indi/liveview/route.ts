import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, ip } = body;
    const bridgeIp = ip || '192.168.178.142';
    const BRIDGE_URL = `http://localhost:5005`;
    
    if (action === 'start' || action === 'stop') {
      const res = await fetch( `${BRIDGE_URL}/ccd/stream/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      return NextResponse.json({ success: res.ok });
    }
    return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
