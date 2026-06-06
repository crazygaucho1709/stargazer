import { NextResponse } from 'next/server';
import http from 'http';
import { BRIDGE_URL } from '@/lib/apiConfig';

export const dynamic = 'force-dynamic';

export async function GET() {
  const url = `${BRIDGE_URL}/video_feed`;

  const stream = new ReadableStream({
    start(controller) {
      const request = http.get(url, {
        timeout: 30000
      }, (res) => {
        if (!res || res.statusCode !== 200) {
          controller.error(new Error(`Backend returned ${res?.statusCode}`));
          return;
        }

        res.on('data', (chunk) => {
          try {
            controller.enqueue(chunk);
          } catch (e) {
            // Stream may be closed by client
          }
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

      request.on('timeout', () => {
        request.destroy();
        controller.error(new Error('Backend connection timeout'));
      });
    },
    cancel() {
      // Client disconnected - cleanup happens automatically
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
