import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
const BRIDGE_URL = 'http://127.0.0.1:5005';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, ...data } = body;

    const res = await fetch(`${BRIDGE_URL}/autoalign/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    const resText = await res.text();
    try {
      return NextResponse.json(JSON.parse(resText), { status: res.status });
    } catch {
      return NextResponse.json(
        { success: res.ok, message: resText },
        { status: res.status }
      );
    }
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
