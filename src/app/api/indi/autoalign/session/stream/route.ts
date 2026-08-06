// src/app/api/indi/autoalign/session/stream/route.ts
/**
 * Proxy SSE /api/indi/autoalign/session/stream → backend /autoalign/session/stream
 * Événements temps réel de la session d'auto-alignement (state, cell, pair, log, done).
 */
import { NextRequest } from 'next/server';
export const dynamic = 'force-dynamic';

const BRIDGE_URL = process.env.BRIDGE_URL || 'http://127.0.0.1:5005';

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

      try {
        const upstream = await fetch(`${BRIDGE_URL}/autoalign/session/stream`, {
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
        while (true) {
          if (req.signal.aborted) break;
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
      } catch {
        try {
          controller.enqueue(encoder.encode(`data: {"error":"stream_error"}\n\n`));
        } catch {}
      } finally {
        try { reader?.cancel(); } catch {}
        try { controller.close(); } catch {}
      }
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
