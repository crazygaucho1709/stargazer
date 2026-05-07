import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BRIDGE_URL = 'http://localhost:5005';

export async function GET() {
  try {
    const device = 'Canon DSLR EOS 600D';

    // Start the stream on the bridge
    await fetch(`${BRIDGE_URL}/ccd/stream/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    return NextResponse.json({
      success: true,
      device,
      streamUrl: `${BRIDGE_URL}/ccd/stream`
    });
  } catch (error) {
    console.error('Failed to start stream:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
