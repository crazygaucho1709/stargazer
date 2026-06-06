import { NextResponse } from 'next/server';
import { BRIDGE_URL } from '@/lib/apiConfig';

export const dynamic = 'force-dynamic';

/** Returns the current mount RA/Dec position from the INDI bridge.
 *  ra  = degrees (divide by 15 to get hours)
 *  dec = degrees
 */
export async function GET() {
  try {
    const res = await fetch(`${BRIDGE_URL}/mount/status`, { cache: 'no-store' });
    if (!res.ok) return NextResponse.json({ success: false, error: `HTTP ${res.status}` }, { status: 502 });
    const data = await res.json();
    return NextResponse.json({ success: true, ...data });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
