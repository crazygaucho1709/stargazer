// src/app/api/station/status/route.ts
import { NextResponse } from "next/server";
import { BRIDGE_URL } from "@/lib/backendUrl";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await fetch(`${BRIDGE_URL}/station/status`, {
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err: unknown) {
    return NextResponse.json(
      { offline: true, error: err instanceof Error ? err.message : "Backend unreachable" },
      { status: 502 },
    );
  }
}
