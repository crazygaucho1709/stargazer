import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BRIDGE_URL = 'http://127.0.0.1:5005';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'start' || action === 'stop') {
      const res = await fetch(`${BRIDGE_URL}/ccd/stream/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      let data: { success?: boolean; error?: string } = {};
      try {
        data = await res.json();
      } catch {
        return NextResponse.json(
          { success: res.ok, error: res.ok ? undefined : 'Invalid JSON from bridge' },
          { status: res.ok ? 200 : 502 }
        );
      }
      if (!res.ok || data.success === false) {
        return NextResponse.json(
          { success: false, error: data.error || `Bridge returned ${res.status}` },
          { status: 503 }
        );
      }
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
