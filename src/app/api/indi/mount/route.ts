import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BRIDGE_URL = 'http://127.0.0.1:5005';

// Proxy commands to Python bridge
async function sendToBridge(bridgeIp: string, endpoint: string, data: any): Promise<any> {
  // The Python bridge always runs on localhost alongside the Next.js app on port 5005
  const BRIDGE_URL = `http://127.0.0.1:5005`;

  // Retry logic with increasing timeout
  const maxRetries = 2;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const controller = new AbortController();
    // 30s timeout for hardware operations (slew can take time)
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    try {
      const res = await fetch(`${BRIDGE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data || {}),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      const resText = await res.text();
      try {
        return JSON.parse(resText);
      } catch (e) {
        if (res.ok) return { success: true, message: resText || 'Action successful' };
        throw new Error(`HTTP ${res.status}: ${resText || 'Backend returned invalid JSON'}`);
      }
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (attempt === maxRetries - 1) {
        throw new Error(`Bridge error after ${maxRetries} attempts: ${error.message}`);
      }
      // Wait before retry
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  throw new Error('Unexpected error');
}

function parseRaToHours(coord: string | number): number {
  if (typeof coord === 'number') {
    return coord / 15.0; // Assume numeric input is in degrees
  }
  if (!coord) return 0;
  
  const strCoord = String(coord).trim();
  // Match various formats: 12:34:56, 12h 34m 56s, 12 34 56
  const match = strCoord.match(/([+-]?\d+)[h°:\s]\s*(\d+)[m':\s]\s*([\d.]+)[s":\s]?/);
  if (match) {
    const d = parseFloat(match[1]);
    const m = parseFloat(match[2]);
    const s = parseFloat(match[3]);
    const sign = d < 0 || Object.is(d, -0) || strCoord.startsWith('-') ? -1 : 1;
    const value = (Math.abs(d) + m / 60 + s / 3600) * sign;
    if (strCoord.includes('°')) {
      return value / 15.0;
    }
    return value; // already in hours
  }
  
  const parsed = parseFloat(strCoord);
  return isNaN(parsed) ? 0 : parsed / 15.0;
}

function parseDecToDegrees(coord: string | number): number {
  if (typeof coord === 'number') return coord;
  if (!coord) return 0;
  
  const strCoord = String(coord).trim();
  const match = strCoord.match(/([+-]?\d+)[h°:\s]\s*(\d+)[m':\s]\s*([\d.]+)[s":\s]?/);
  if (match) {
    const d = parseFloat(match[1]);
    const m = parseFloat(match[2]);
    const s = parseFloat(match[3]);
    const sign = d < 0 || Object.is(d, -0) || strCoord.startsWith('-') ? -1 : 1;
    return (Math.abs(d) + m / 60 + s / 3600) * sign;
  }
  
  const parsed = parseFloat(strCoord);
  return isNaN(parsed) ? 0 : parsed;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    let { action, device = 'Celestron GPS', ra, dec, direction, state = 'start', duration = 0.5, ip } = body;
    // Use 'Celestron GPS' as default if not specified
    if (!device) {
      device = 'Celestron GPS';
    }
    // Use provided IP (which might include port) or default to local Python bridge
    const bridgeIp = ip || '127.0.0.1:5005';
    
    if (!action) {
      return NextResponse.json({ error: 'Missing action' }, { status: 400 });
    }
    
    const raHours = ra !== undefined ? parseRaToHours(ra) : undefined;
    const decDegrees = dec !== undefined ? parseDecToDegrees(dec) : undefined;
    
    let response: string;
    
    switch (action) {
      case 'goto':
        // GOTO coordonnées RA/DEC
        response = await sendToBridge(bridgeIp, '/mount/goto', { device, ra: raHours, dec: decDegrees });
        break;
        
      case 'jog':
        // Mouvement relatif (flèches directionnelles)
        response = await sendToBridge(bridgeIp, '/mount/jog', { device, direction, state, duration });
        break;
        
      case 'slew':
        // Slew vers objet
        response = await sendToBridge(bridgeIp, '/mount/slew', { device, ra: raHours, dec: decDegrees });
        break;
        
      case 'abort':
        // Stop le mouvement
        response = await sendToBridge(bridgeIp, '/mount/abort', { device });
        break;
        
      case 'sync':
        // Sync position (parking)
        response = await sendToBridge(bridgeIp, '/mount/sync', { device, ra: raHours, dec: decDegrees });
        break;
        
      case 'sync_master':
        // Master sync with location and time
        const { lat, lon, elev = 0, alt, az } = body;
        response = await sendToBridge(bridgeIp, '/mount/sync_master', { 
          lat, lon, elev, alt, az 
        });
        break;
        
      case 'abort_all':
        // Abort all hardware processes
        response = await sendToBridge(bridgeIp, '/command', { action: 'abort_all' });
        break;
        
      case 'rate':
        // Changer la vitesse de mouvement (slider 1x - 9x)
        const { rate } = body;
        response = await sendToBridge(bridgeIp, '/mount/rate', { device, rate });
        break;
        
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
    
    return NextResponse.json({ success: true, response });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}