import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BRIDGE_URL = 'http://127.0.0.1:5005';

export async function POST(req: Request) {
  try {
    const { pathname } = new URL(req.url);
    
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
    
    // Map /api/mount/X to backend /mount/X
    const action = pathname.split('/').pop();
    let endpoint = `/mount/${action}`;
    
    // Special cases if any
    if (action === 'track') endpoint = '/mount/track';

    const res = await fetch(`${BRIDGE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    
    // Safely handle response
    const resText = await res.text();
    try {
      const data = JSON.parse(resText);
      return NextResponse.json(data, { status: res.status });
    } catch (e) {
      return NextResponse.json({ 
        success: res.ok, 
        message: resText || (res.ok ? 'Success' : 'Backend returned invalid JSON'),
        status: res.status 
      }, { status: res.status });
    }
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const res = await fetch(`${BRIDGE_URL}/mount/status`, { cache: 'no-store' });
    const resText = await res.text();
    try {
      const data = JSON.parse(resText);
      return NextResponse.json(data);
    } catch (e) {
      return NextResponse.json({ error: 'Backend returned invalid JSON', raw: resText }, { status: 502 });
    }
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
