import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BRIDGE_URL = 'http://127.0.0.1:5005';

export async function POST() {
  try {
    const res = await fetch(`${BRIDGE_URL}/launch_ekos`, {
      method: 'POST',
      cache: 'no-store'
    });

    const resText = await res.text();
    try {
      const data = JSON.parse(resText);
      return NextResponse.json(data, { status: res.status });
    } catch (e) {
      return NextResponse.json({ 
        success: res.ok, 
        message: resText || (res.ok ? 'Success' : 'Backend returned invalid JSON')
      }, { status: res.status });
    }
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
