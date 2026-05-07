import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BRIDGE_URL = 'http://192.168.178.91:5005';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const device = searchParams.get('device') || 'Canon DSLR EOS 600D';
    const exposure = parseFloat(searchParams.get('exposure') || '0.1');

    const res = await fetch(`${BRIDGE_URL}/ccd/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device, exposure })
    });

    const data = await res.json();

    if (!data.success) {
      return NextResponse.json({ error: data.error || 'Capture failed' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Capture started', exposure, device });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
