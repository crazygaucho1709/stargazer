import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const device = searchParams.get('device') || 'Canon DSLR EOS 600D';
    const exposure = parseFloat(searchParams.get('exposure') || '0.1');
    const bridgeIp = searchParams.get('ip') || '127.0.0.1';
    const safeIp = bridgeIp.startsWith('localhost') ? bridgeIp.replace('localhost', '127.0.0.1') : bridgeIp;
    const finalIp = safeIp.includes(':') ? safeIp : `${safeIp}:5005`;
    const BRIDGE_URL = `http://${finalIp}`;
    
    // Trigger capture via bridge
    const res = await fetch( `${BRIDGE_URL}/ccd/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device, exposure })
    });
    
    const data = await res.json();
    
    if (!data.success) {
      return NextResponse.json({ error: data.error || 'Capture failed' }, { status: 500 });
    }
    
    // Return JSON indicating capture started
    // In a full implementation, the bridge would return image data or a URL
    return NextResponse.json({ 
      success: true, 
      message: 'Capture started',
      exposure,
      device 
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}