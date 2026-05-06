import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, ip } = body;
    
    const bridgeIp = ip || '127.0.0.1';
    const safeIp = bridgeIp.startsWith('localhost') ? bridgeIp.replace('localhost', '127.0.0.1') : bridgeIp;
    const finalIp = safeIp.includes(':') ? safeIp : `${safeIp}:5005`;
    const BRIDGE_URL = `http://${finalIp}`;
    
    // Action is either 'reconnect' (reconnect INDI) or 'restart_kstars' (restart KStars)
    const endpoint = action === 'restart_kstars' ? 'restart_kstars' : 'reconnect';
    
    const res = await fetch(`${BRIDGE_URL}/${endpoint}`, { 
      method: 'POST',
      cache: 'no-store'
    });
    
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
