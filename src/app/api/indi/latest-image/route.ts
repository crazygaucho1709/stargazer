import { NextResponse } from 'next/server';

// Simple 1x1 transparent pixel as fallback (base64 encoded)
const FALLBACK_IMAGE = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAAgACADAREAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AL8A//Z',
  'base64'
);

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const bridgeIp = url.searchParams.get('ip') || '192.168.178.142';
    const BRIDGE_URL = `http://localhost:5005`;

    // Fetch the latest image from the bridge with timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    
    const res = await fetch( `${BRIDGE_URL}/ccd/latest`, {
      cache: 'no-store',
      signal: controller.signal
    });
    
    clearTimeout(timeout);
    
    if (!res.ok) {
      throw new Error(`Bridge returned ${res.status}`);
    }
    
    // Get the image data as array buffer
    const imageBuffer = await res.arrayBuffer();
    
    // Return with proper content type
    return new NextResponse(imageBuffer, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  } catch (error: any) {
    console.error('Bridge error, returning fallback:', error.message);
    
    // Return fallback image instead of error
    return new NextResponse(FALLBACK_IMAGE, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'no-cache',
      }
    });
  }
}
