import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BRIDGE_URL = 'http://127.0.0.1:5005';

export async function POST(request: Request) {
  try {
    let body = {};
    try {
      const text = await request.text();
      if (text) body = JSON.parse(text);
    } catch (e) {}
    
    let actionsTaken: string[] = [];
    
    // 1. Check health
    let healthRes;
    try {
        healthRes = await fetch(`${BRIDGE_URL}/health`, { cache: 'no-store', signal: AbortSignal.timeout(3000) });
    } catch(e) {
        return NextResponse.json({ success: false, error: 'Backend is unreachable (Timeout)' }, { status: 504 });
    }
    
    if (!healthRes.ok) {
       return NextResponse.json({ success: false, error: 'Backend is unreachable' }, { status: 502 });
    }
    const health = await healthRes.json();
    
    // 2. If INDI is not connected, reconnect
    if (!health.indi_connected) {
      actionsTaken.push("Reconnecting INDI Bridge...");
      await fetch(`${BRIDGE_URL}/reconnect`, { method: 'POST' });
      // wait a bit for reconnect
      await new Promise(r => setTimeout(r, 4000));
    } else {
      actionsTaken.push("INDI Bridge already connected.");
    }
    
    // 3. Connect hardware
    actionsTaken.push("Sending connect signals to hardware (Mount & CCD)...");
    await fetch(`${BRIDGE_URL}/hardware/connect`, { method: 'POST' });
    await new Promise(r => setTimeout(r, 2000));
    
    // 4. Final check
    const finalHealthRes = await fetch(`${BRIDGE_URL}/health`, { cache: 'no-store' });
    const finalHealth = await finalHealthRes.json();
    
    const allGood = finalHealth.indi_connected && finalHealth.devices?.mount && finalHealth.devices?.ccd;
    
    return NextResponse.json({
       success: true,
       all_good: allGood,
       actions: actionsTaken,
       status: finalHealth
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
