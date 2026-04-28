import { NextResponse } from 'next/server';

const BRIDGE_URL = 'http://192.168.178.142:5000';

export async function GET(request: Request) {
  try {
    // Fetch the latest image from the bridge
    const res = await fetch(`${BRIDGE_URL}/ccd/latest?t=${Date.now()}`, {
      cache: 'no-store'
    });
    
    if (!res.ok) {
      return new NextResponse('Image not found', { status: 404 });
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
    return new NextResponse(`Error: ${error.message}`, { status: 500 });
  }
}
