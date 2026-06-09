/**
 * Proxy SSE /api/indi/coords/stream → backend /coords/stream
 * Pousse RA/DEC + mount_slew_state à 500ms — remplace le polling /health pour les coords.
 */
import { NextRequest } from 'next/server';
export const dynamic = 'force-dynamic';

const BRIDGE_URL = process.env.BRIDGE_URL || 'http://127.0.0.1:5005';

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let upstream: Response | null = null;
      let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

      const cleanup = () => {
        try { reader?.cancel(); } catch {}
      };

      try {
        upstream = await fetch(`${BRIDGE_URL}/coords/stream`, {
          headers: { Accept: 'text/event-stream' },
          // @ts-expect-error: Node 18+ fetch supports duplex
          duplex: 'half',
        });

        if (!upstream.ok || !upstream.body) {
          controller.enqueue(encoder.encode(`data: {"error":"backend unavailable"}\n\n`));
          controller.close();
          return;
        }

        reader = upstream.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          // Abort if client disconnected
          if (req.signal.aborted) break;

          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
      } catch (err) {
        // Backend down — send error event so client can show it
        try {
          controller.enqueue(encoder.encode(`data: {"error":"stream_error"}\n\n`));
        } catch {}
      } finally {
        cleanup();
        try { controller.close(); } catch {}
      }
    },
    cancel() {
      // client disconnected — nothing extra to do (reader.cancel() called in finally)
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
      'Connection': 'keep-alive',
    },
  });
}
