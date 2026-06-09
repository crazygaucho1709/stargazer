import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

export async function GET() {
  const BRIDGE = 'http://127.0.0.1:5005';
  const encoder = new TextEncoder();

  let id: NodeJS.Timeout;
  let hbId: NodeJS.Timeout;
  let timeoutId: NodeJS.Timeout;

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
      id = setInterval(poll, 2000);
      // Heartbeat every 30s to keep SSE alive
      hbId = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch (e) {
          // Stream may be closed
        }
      }, 30000);
      // Cleanup after 5 min (client will reconnect)
      timeoutId = setTimeout(() => { 
        clearInterval(id); 
        clearInterval(hbId); 
        try {
          controller.close();
        } catch (e) {}
      }, 5 * 60 * 1000);
    },
    cancel() {
      clearInterval(id);
      clearInterval(hbId);
      clearTimeout(timeoutId);
    }
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
