// src/app/api/station/setup/route.ts
// Lance ou arrête la mise en station automatique. L'avancement, lui, arrive
// par le flux /api/station/stream : pas d'interrogation périodique ici.
import { NextResponse } from "next/server";
import { BRIDGE_URL } from "@/lib/backendUrl";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { action } = (await request.json()) as { action?: string };
    if (action !== "start" && action !== "stop") {
      return NextResponse.json({ success: false, error: "Action invalide" }, { status: 400 });
    }
    const res = await fetch(`${BRIDGE_URL}/station/setup/${action}`, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    const data: { success?: boolean; error?: string; detail?: string } =
      await res.json().catch(() => ({ success: false, error: `Backend HTTP ${res.status}` }));
    if (!res.ok || data.success === false) {
      return NextResponse.json(
        { success: false, error: data.error || data.detail || `Backend HTTP ${res.status}` },
        { status: res.status === 409 ? 409 : 503 },
      );
    }
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Backend injoignable" },
      { status: 502 },
    );
  }
}
