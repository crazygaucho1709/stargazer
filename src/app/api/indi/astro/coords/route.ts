import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BRIDGE_URL = 'http://localhost:5005';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { ip: _ip, ...data } = body; // strip ip param, always use local bridge

    const res = await fetch(`${BRIDGE_URL}/astro/coords`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    const json = await res.json();
    return NextResponse.json(json);
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
