import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
const BRIDGE_URL = 'http://127.0.0.1:5005';

async function proxy(endpoint: string, method = 'GET', body?: any) {
  const res = await fetch(`${BRIDGE_URL}${endpoint}`, {
    method, cache: 'no-store',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  return NextResponse.json(await res.json(), { status: res.status });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'status';
  try {
    if (action === 'status') return proxy('/mount/status');
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, enabled } = body;
    if (action === 'park') return proxy('/mount/park', 'POST');
    if (action === 'unpark') return proxy('/mount/unpark', 'POST');
    if (action === 'abort') return proxy('/mount/abort', 'POST');
    if (action === 'track') return proxy('/mount/track', 'POST', { enabled });
    if (action === 'restart-backend') return proxy('/backend/restart', 'POST');
    if (action === 'restart-kstars') return proxy('/restart_kstars', 'POST');
    if (action === 'launch-ekos') return proxy('/launch_ekos', 'POST');
    if (action === 'reconnect-indi') return proxy('/reconnect', 'POST');
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }
}
