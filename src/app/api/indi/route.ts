import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const endpoint = searchParams.get('endpoint') || 'health';
    
    // Proxy for CCD image or other GET endpoints
    if (endpoint === 'ccd/latest') {
        try {
            const res = await fetch('http://localhost:5005/ccd/latest', { cache: 'no-store' });
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
        const res = await fetch(`http://localhost:5005/${endpoint}`, { cache: 'no-store' });
        const resText = await res.text();
        let data;
        try {
            data = JSON.parse(resText);
        } catch (e) {
            data = { status: res.ok ? "ok" : "error", message: resText };
        }
        
        // Return structured status for the ping logic
        return NextResponse.json([{
            status: data.status === "ok" ? "True" : "False",
            mount_connected: data.mount_connected || false,
            indi_connected: data.indi_connected || false,
            message: data.status || "error"
        }]);
    } catch (error) {
        return NextResponse.json([{
            status: "False",
            message: "Backend offline"
        }], { status: 200 });
    }
}

export async function POST(request: Request) {
    const { searchParams } = new URL(request.url);
    // Default to 'command' if no specific endpoint is provided in query params
    const endpoint = searchParams.get('endpoint') || 'command';
    
    try {
        let body = {};
        try {
            const text = await request.text();
            if (text) body = JSON.parse(text);
        } catch (e) {}

        const res = await fetch(`http://localhost:5005/${endpoint}`, {
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
