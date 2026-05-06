import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BRIDGE_URL = 'http://127.0.0.1:5005';

export async function GET() {
  try {
    const res = await fetch(`${BRIDGE_URL}/health`, { cache: 'no-store' });
    const data = await res.json();
    return NextResponse.json([{
      status: data.mount_connected ? 'True' : 'False',
      mount_connected: data.mount_connected,
      message: data.status
    }]);
  } catch (error: any) {
    return NextResponse.json([{
      status: 'False',
      mount_connected: false,
      message: `Bridge offline: ${error.message}`,
      mock: true
    }]);
  }
}
