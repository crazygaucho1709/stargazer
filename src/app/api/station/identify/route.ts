// src/app/api/station/identify/route.ts
import { NextResponse } from "next/server";
import { BRIDGE_URL } from "@/lib/backendUrl";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const res = await fetch(`${BRIDGE_URL}/station/identify-sky`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Timeout ou erreur backend" },
      { status: 502 },
    );
  }
}
