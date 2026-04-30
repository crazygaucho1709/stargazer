import { NextResponse } from 'next/server';

// Proxy commands to Python bridge
async function sendToBridge(bridgeIp: string, endpoint: string, data: any): Promise<any> {
  const BRIDGE_URL = `http://localhost:5005`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout for hardware commands
  
  try {
    const res = await fetch( `${BRIDGE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return await res.json();
  } catch (error: any) {
    clearTimeout(timeoutId);
    throw new Error(`Bridge error: ${error.message}`);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, device = 'Celestron NexStar HC', ra, dec, direction, duration = 0.5 } = body;
    const bridgeIp = 'localhost';
    
    if (!action) {
      return NextResponse.json({ error: 'Missing action' }, { status: 400 });
    }
    
    let response: string;
    
    switch (action) {
      case 'goto':
        // GOTO coordonnées RA/DEC
        response = await sendToBridge(bridgeIp, '/mount/goto', { device, ra, dec });
        break;
        
      case 'jog':
        // Mouvement relatif (flèches directionnelles)
        response = await sendToBridge(bridgeIp, '/mount/jog', { device, direction, duration });
        break;
        
      case 'slew':
        // Slew vers objet
        response = await sendToBridge(bridgeIp, '/mount/slew', { device, ra, dec });
        break;
        
      case 'abort':
        // Stop le mouvement
        response = await sendToBridge(bridgeIp, '/mount/abort', { device });
        break;
        
      case 'sync':
        // Sync position (parking)
        response = await sendToBridge(bridgeIp, '/mount/sync', { device, ra, dec });
        break;
        
      case 'sync_master':
        // Master sync with location and time
        const { lat, lon, elev = 0, alt, az } = body;
        response = await sendToBridge(bridgeIp, '/mount/sync_master', { 
          lat, lon, elev, alt, az 
        });
        break;
        
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
    
    return NextResponse.json({ success: true, response });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}