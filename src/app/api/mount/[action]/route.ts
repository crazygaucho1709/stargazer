import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BRIDGE_URL = 'http://127.0.0.1:5005';

export async function POST(req: Request, { params }: { params: { action: string } }) {
  try {
    const action = params.action;
    
    // Safely get body
    let body = {};
    try {
      const text = await req.text();
      if (text) {
        body = JSON.parse(text);
      }
    } catch (e) {
      console.warn('Failed to parse request body as JSON, using empty object');
    }
    
    let endpoint = `/mount/${action}`;
    
    // Special cases if any
    if (action === 'track') endpoint = '/mount/track';

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(`${BRIDGE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    // Safely handle response
    const resText = await res.text();
    try {
      const data = JSON.parse(resText);
      return NextResponse.json(data, { status: res.status });
    } catch (e) {
      return NextResponse.json({ 
        success: res.ok, 
        message: resText || (res.ok ? 'Success' : 'Backend returned invalid JSON'),
      });
    }
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message });
  }
}

export async function GET() {
  try {
    const res = await fetch(`${BRIDGE_URL}/mount/status`, { 
      cache: 'no-store',
      signal: AbortSignal.timeout(5000)
    });
    const resText = await res.text();
    try {
      const data = JSON.parse(resText);
      return NextResponse.json(data);
    } catch (e) {
      return NextResponse.json({ success: false, error: 'Backend returned invalid JSON' });
    }
  } catch (error: any) {
    return NextResponse.json({ success: false, status: 'offline', error: 'Bridge unreachable' });
  }
}
