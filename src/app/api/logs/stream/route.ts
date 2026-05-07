import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

const BRIDGE_URL = 'http://127.0.0.1:5005';

export async function GET(req: NextRequest) {
  const response = await fetch(`${BRIDGE_URL}/logs/stream`, {
    headers: {
      'Accept': 'text/event-stream',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    return new Response('Failed to connect to log stream', { status: 502 });
  }

  // Create a TransformStream to pass through the SSE events
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const reader = response.body?.getReader();

  if (!reader) {
    return new Response('No log stream body', { status: 502 });
  }

  // Handle the streaming in the background
  (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        await writer.write(value);
      }
    } catch (error) {
      console.error('Log stream proxy error:', error);
    } finally {
      writer.close();
      reader.releaseLock();
    }
  })();

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
