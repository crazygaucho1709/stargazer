// src/app/api/indi/ccd-reconnect/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const BRIDGE_URL = "http://127.0.0.1:5005";

export async function POST() {
  try {
    const res = await fetch(`${BRIDGE_URL}/ccd/reconnect`, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e: unknown) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Backend injoignable" },
      { status: 504 },
    );
  }
}
