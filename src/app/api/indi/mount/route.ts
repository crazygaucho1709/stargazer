import { NextResponse } from 'next/server';
import { BRIDGE_URL } from '@/lib/apiConfig';
import { INDIErrorCode } from '@/lib/indiClient';

export const dynamic = 'force-dynamic';

function classifyBridgeError(message: string): INDIErrorCode {
  const lower = message.toLowerCase();
  if (lower.includes('timeout') || lower.includes('timed out')) return INDIErrorCode.TIMEOUT;
  if (lower.includes('not connected') || lower.includes('bridge') || lower.includes('connection failed')) return INDIErrorCode.NOT_CONNECTED;
  if (lower.includes('device not found') || lower.includes('no device') || lower.includes('driver')) return INDIErrorCode.DEVICE_NOT_FOUND;
  if (lower.includes('limit') || lower.includes('slew cancelled') || lower.includes('slew annulé')) return INDIErrorCode.LIMIT_REACHED;
  return INDIErrorCode.UNKNOWN;
}

// Proxy commands to Python bridge — always localhost, never mDNS
async function sendToBridge(_bridgeIp: string, endpoint: string, data: Record<string, unknown>): Promise<unknown> {
  const url = `${BRIDGE_URL}${endpoint}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data || {}),
      next: { revalidate: 0 }
    });

    const resText = await res.text();
    try {
      return JSON.parse(resText);
    } catch {
      if (res.ok) return { success: true, message: resText || 'Action successful' };
      throw new Error(`HTTP ${res.status}: ${resText}`);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Bridge connection failed: ${message}`);
  }
}

function bridgeCommandFailed(response: unknown): { error: string; error_code: INDIErrorCode } | null {
  if (
    response &&
    typeof response === 'object' &&
    'success' in response &&
    (response as { success: unknown }).success === false
  ) {
    const errorMessage = (response as { error?: string }).error || 'Bridge command failed';
    // Propagate error_code from bridge if present, otherwise classify from message
    const rawCode = (response as { error_code?: string }).error_code;
    const error_code =
      rawCode && Object.values(INDIErrorCode).includes(rawCode as INDIErrorCode)
        ? (rawCode as INDIErrorCode)
        : classifyBridgeError(errorMessage);
    return { error: errorMessage, error_code };
  }
  return null;
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
    const body = await request.json() as Record<string, unknown>;
    let { action, device = 'Celestron GPS', ra, dec, direction, state = 'start', duration = 0.5, ip, timestamp, jog_id } = body as {
      action?: string;
      device?: string;
      ra?: string | number;
      dec?: string | number;
      direction?: string;
      state?: string;
      duration?: number;
      ip?: string;
      timestamp?: string | number;
      jog_id?: string;
    };
    
    // Ensure we have a valid device name
    if (!device || device === 'undefined' || device === 'null') {
      device = 'Celestron GPS';
    }
    // Use provided IP (which might include port) or default to BRIDGE_URL
    const bridgeIp = ip || BRIDGE_URL.replace(/^http:\/\//, '');
    
    if (!action) {
      return NextResponse.json({ error: 'Missing action' }, { status: 400 });
    }
    
    const raHours = ra !== undefined ? (typeof ra === 'number' ? ra / 15.0 : parseRaToHours(ra)) : undefined;
    const decDegrees = dec !== undefined ? (typeof dec === 'number' ? dec : parseDecToDegrees(dec)) : undefined;
    
    let response: unknown;
    
    switch (action) {
      case 'goto':
        // GOTO coordonnées RA/DEC
        response = await sendToBridge(bridgeIp, '/mount/goto', { device, ra: raHours, dec: decDegrees });
        break;
        
      case 'jog':
        // Mouvement relatif (flèches directionnelles)
        response = await sendToBridge(bridgeIp, '/mount/jog', { device, direction, state, duration, timestamp, jog_id });
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
        
      case 'sync_master': {
        // Master sync with location and time
        const { lat, lon, elev = 0, alt, az } = body as { lat: unknown; lon: unknown; elev?: unknown; alt: unknown; az: unknown };
        response = await sendToBridge(bridgeIp, '/mount/sync_master', {
          lat, lon, elev, alt, az
        });
        break;
      }

      case 'abort_all':
        // Abort all hardware processes
        response = await sendToBridge(bridgeIp, '/command', { action: 'abort_all' });
        break;

      case 'rate': {
        // Changer la vitesse de mouvement (slider 1x - 9x)
        const { rate } = body as { rate: unknown };
        response = await sendToBridge(bridgeIp, '/mount/rate', { device, rate });
        break;
      }

      case 'track': {
        // Activer / désactiver le suivi sidéral
        const enabled = (body as { enabled?: unknown }).enabled !== false; // default true = ON
        response = await sendToBridge(bridgeIp, '/mount/track', { enabled });
        break;
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });

    }

    const bridgeErr = bridgeCommandFailed(response);
    if (bridgeErr) {
      return NextResponse.json({ success: false, error: bridgeErr.error, error_code: bridgeErr.error_code });
    }

    return NextResponse.json({ success: true, response });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const error_code = classifyBridgeError(message);
    return NextResponse.json({ success: false, error: message, error_code });
  }
}