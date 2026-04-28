import { NextResponse } from 'next/server';

const BRIDGE_URL = 'http://192.168.178.142:5000';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const device = searchParams.get('device') || 'Canon DSLR EOS 600D';
  
  // Start the stream on the bridge
  try {
    await fetch(`${BRIDGE_URL}/ccd/stream/start`, {
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