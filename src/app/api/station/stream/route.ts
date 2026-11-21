// src/app/api/station/stream/route.ts
/**
 * Proxy SSE /api/station/stream → backend /station/stream.
 * État de liaison, état de la station et rapport d'infrastructure, poussés par
 * le backend : remplace trois interrogations périodiques de l'interface.
 */
import { NextRequest } from "next/server";
import { proxyBackendStream } from "@/lib/sseProxy";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return proxyBackendStream(req, "/station/stream");
}
