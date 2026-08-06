// src/app/api/ai/claude/key/route.ts
import { NextRequest, NextResponse } from "next/server";
import { BRIDGE_URL } from "@/lib/apiConfig";

const BRIDGE = BRIDGE_URL;

export async function POST(req: NextRequest) {
    const body = await req.json();
    const res = await fetch(`${BRIDGE}/ai/claude/key`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) return NextResponse.json(data, { status: res.status });
    return NextResponse.json(data);
}

export async function DELETE() {
    const res = await fetch(`${BRIDGE}/ai/claude/key`, { method: "DELETE" });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
}
