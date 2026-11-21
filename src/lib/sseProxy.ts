// src/lib/sseProxy.ts
/**
 * Relais SSE d'un flux du backend vers le navigateur, partagé par les routes
 * /api/station/stream et /api/indi/coords/stream.
 */
import { BRIDGE_URL } from "@/lib/backendUrl";

export function proxyBackendStream(req: Request, backendPath: string): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Une trame d'erreur plutôt qu'un statut HTTP : le client la reçoit dans
      // onmessage et peut espacer ses tentatives, au lieu de laisser le
      // navigateur se reconnecter en boucle toutes les 3 secondes.
      const fail = (reason: string) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: reason })}\n\n`));
        } catch {
          // Le client est déjà parti : plus personne à prévenir.
        }
      };

      let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
      try {
        const upstream = await fetch(`${BRIDGE_URL}${backendPath}`, {
          headers: { Accept: "text/event-stream" },
          cache: "no-store",
          signal: req.signal,
        });
        if (!upstream.ok || !upstream.body) {
          fail(`Backend HTTP ${upstream.status}`);
          return;
        }
        reader = upstream.body.getReader();
        while (!req.signal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
        if (!req.signal.aborted) fail("Flux backend interrompu");
      } catch (err: unknown) {
        if (!req.signal.aborted) fail(err instanceof Error ? err.message : "Backend injoignable");
      } finally {
        reader?.cancel().catch(() => undefined);
        try {
          controller.close();
        } catch {
          // Déjà fermé par l'abandon du client.
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    },
  });
}
