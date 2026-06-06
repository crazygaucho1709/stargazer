import { NextResponse } from 'next/server';
import { BRIDGE_URL } from '@/lib/apiConfig';

export const dynamic = 'force-dynamic';

export async function POST() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        const res = await fetch(`${BRIDGE_URL}/hardware/connect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        const resText = await res.text();
        try {
            const data = JSON.parse(resText);
            return NextResponse.json(data, { status: res.status });
        } catch (e) {
            return NextResponse.json({
                success: res.ok,
                message: resText || (res.ok ? 'Hardware connected' : 'Connection failed')
            }, { status: res.status });
        }
    } catch (error: any) {
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}

export async function GET() {
    return NextResponse.json({ status: 'ok', message: 'Hardware connect endpoint ready' });
}