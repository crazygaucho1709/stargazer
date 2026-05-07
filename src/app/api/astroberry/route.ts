import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
const BRIDGE_URL = 'http://127.0.0.1:5005';

async function proxy(endpoint: string, method = 'GET', body?: any) {
  try {
    const res = await fetch(`${BRIDGE_URL}${endpoint}`, {
      method,
      cache: 'no-store',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    
    const resText = await res.text();
    try {
      const data = JSON.parse(resText);
      return NextResponse.json(data, { status: res.status });
    } catch (e) {
      return NextResponse.json({ 
        success: res.ok, 
        message: resText || (res.ok ? 'Success' : 'Backend returned invalid JSON'),
        raw: resText
      }, { status: res.status });
    }
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// GET /api/astroberry?action=status|indi-logs
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'status';
  const lines = searchParams.get('lines') || '50';
  try {
    if (action === 'indi-logs') return proxy(`/astroberry/indi/logs?lines=${lines}`);
    return proxy('/astroberry/status');
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }
}

// POST /api/astroberry  body: { action: 'restart-indi' | 'reboot', confirm?: string }
export async function POST(request: Request) {
  try {
    let body: any = {};
    try {
      const text = await request.text();
      if (text) body = JSON.parse(text);
    } catch (e) {
      console.warn('Failed to parse request body as JSON');
    }
    const { action, confirm = '' } = body;
    if (action === 'restart-indi') return proxy('/astroberry/indi/restart', 'POST');
    if (action === 'reboot') return proxy('/astroberry/reboot', 'POST', { confirm });
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }
}
