import { NextResponse } from 'next/server';
import { BRIDGE_URL } from '@/lib/apiConfig';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    let searchParams: URLSearchParams;
    try {
        searchParams = new URL(request.url).searchParams;
    } catch {
        return NextResponse.json(
            [{ status: "False", message: "Invalid request URL" }],
            { status: 400 }
        );
    }
    const endpoint = searchParams.get('endpoint') || 'health';
    
    // Proxy for CCD image or other GET endpoints
    if (endpoint === 'ccd/latest') {
        try {
            const res = await fetch(`${BRIDGE_URL}/ccd/latest`, { cache: 'no-store' });
            if (res.status === 204) return new Response(null, { status: 204 });
            if (!res.ok) return new Response(null, { status: res.status });
            const blob = await res.blob();
            return new Response(blob, {
                headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-cache' }
            });
        } catch (e) {
            return new Response(null, { status: 502 });
        }
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        const res = await fetch(`${BRIDGE_URL}/${endpoint}`, { 
            cache: 'no-store',
            signal: controller.signal 
        });
        clearTimeout(timeoutId);
        const resText = await res.text();
        let data;
        try {
            data = JSON.parse(resText);
        } catch (e) {
            data = { status: res.ok ? "ok" : "error", message: resText };
        }
        
        const isOk = data.status === "True" || data.status === "ok";
        return NextResponse.json([{
            ...data,
            status: isOk ? "True" : "False",
            message: data.status || (res.ok ? "ok" : "error")
        }]);
    } catch (error) {
        console.error(`[PROXY] Backend unreachable: ${BRIDGE_URL}`);
        return NextResponse.json([{
            status: "False",
            message: "Backend offline"
        }], { status: 200 });
    }
}

export async function POST(request: Request) {
    let searchParams: URLSearchParams;
    try {
        searchParams = new URL(request.url).searchParams;
    } catch {
        return NextResponse.json({ error: "Invalid request URL" }, { status: 400 });
    }
    const endpoint = searchParams.get('endpoint') || 'command';
    
    try {
        let body = {};
        try {
            const text = await request.text();
            if (text) body = JSON.parse(text);
        } catch (e) {}

        const res = await fetch(`${BRIDGE_URL}/${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        
        const resText = await res.text();
        try {
            const data = JSON.parse(resText);
            return NextResponse.json(data, { status: res.status });
        } catch (e) {
            return NextResponse.json({ 
                success: res.ok, 
                message: resText || (res.ok ? 'Success' : 'Backend returned invalid JSON'),
                status: res.status 
            }, { status: res.status });
        }
    } catch (error: any) {
        console.error(`Proxy POST error [${endpoint}]:`, error);
        return NextResponse.json({ error: error.message || 'Internal proxy error' }, { status: 500 });
    }
}
