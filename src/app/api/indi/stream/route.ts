import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const device = searchParams.get('device') || 'Canon DSLR EOS 600D';
  const bridgeIp = searchParams.get('ip') || '192.168.178.142';
  const BRIDGE_URL = `http://localhost:5005`;
  
  // Start the stream on the bridge
  try {
    await fetch( `${BRIDGE_URL}/ccd/stream/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Failed to start stream:', error);
  }
  
  // Return the direct bridge stream URL for the frontend to use
  return NextResponse.json({
    success: true,
    device,
    streamUrl: `${BRIDGE_URL}/ccd/stream`
  });
}