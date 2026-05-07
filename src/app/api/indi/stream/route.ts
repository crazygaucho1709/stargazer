import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BRIDGE_URL = 'http://127.0.0.1:5005';

export async function GET() {
  try {
    // 1. Trigger the stream start on the backend
    // This ensures the mirror is up and INDI is streaming
    await fetch(`${BRIDGE_URL}/ccd/stream/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    // 2. Fetch the actual MJPEG stream from the backend
    const response = await fetch(`${BRIDGE_URL}/video_feed`);
    
    if (!response.ok) {
      throw new Error(`Backend stream failed: ${response.statusText}`);
    }

    // 3. Pipe the stream directly to the client
    // We pass through the headers (especially multipart/x-mixed-replace)
    return new Response(response.body, {
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'multipart/x-mixed-replace; boundary=frame',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  } catch (error) {
    console.error('Stream Proxy Error:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
