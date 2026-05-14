import { NextResponse } from 'next/server';
import http from 'http';

export const dynamic = 'force-dynamic';

const BRIDGE_URL = 'http://127.0.0.1:5005';

export async function GET() {
  const url = `${BRIDGE_URL}/video_feed`;

  // We use a ReadableStream to pipe the data from the backend to the client
  // using the native 'http' module to avoid undici/fetch timeouts and buffering.
  const stream = new ReadableStream({
    start(controller) {
      const request = http.get(url, (res) => {
        res.on('data', (chunk) => {
          controller.enqueue(chunk);
        });
        res.on('end', () => {
          controller.close();
        });
        res.on('error', (err) => {
          controller.error(err);
        });
      });

      request.on('error', (err) => {
        controller.error(err);
      });
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Connection': 'keep-alive',
    },
  });
}
