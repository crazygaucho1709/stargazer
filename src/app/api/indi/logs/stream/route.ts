import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

export async function GET() {
  const BRIDGE = 'http://127.0.0.1:5005';
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let lastIdx = 0;
      const poll = async () => {
        try {
          const res = await fetch(`${BRIDGE}/logs`, { cache: 'no-store' });
          const data = await res.json();
          const entries: string[] = data.logs || [];
          const newEntries = entries.slice(lastIdx);
          for (const msg of newEntries) {
            const payload = JSON.stringify({ source: 'backend', message: msg });
            controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
          }
          lastIdx = entries.length;
        } catch { /* ignore fetch errors */ }
      };
      // Initial load
      await poll();
      // Poll every 2 seconds
      const id = setInterval(poll, 2000);
      // Heartbeat every 30s to keep SSE alive
      const hbId = setInterval(() => {
        controller.enqueue(encoder.encode(`: heartbeat\n\n`));
      }, 30000);
      // Cleanup after 5 min (client will reconnect)
      setTimeout(() => { clearInterval(id); clearInterval(hbId); controller.close(); }, 5 * 60 * 1000);
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
