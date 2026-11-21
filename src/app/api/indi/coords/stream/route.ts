// src/app/api/indi/coords/stream/route.ts
/**
 * Proxy SSE /api/indi/coords/stream → backend /coords/stream.
 * Position de la monture et état de pointage, poussés par le backend.
 */
import { NextRequest } from "next/server";
import { proxyBackendStream } from "@/lib/sseProxy";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return proxyBackendStream(req, "/coords/stream");
}
