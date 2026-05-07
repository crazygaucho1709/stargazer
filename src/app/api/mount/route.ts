import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BRIDGE_URL = 'http://127.0.0.1:5005';

export async function POST(req: Request) {
  try {
    const { pathname } = new URL(req.url);
    const body = await req.json().catch(() => ({}));
    
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
    
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const res = await fetch(`${BRIDGE_URL}/mount/status`, { cache: 'no-store' });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
