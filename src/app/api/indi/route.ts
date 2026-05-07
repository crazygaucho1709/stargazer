import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const endpoint = searchParams.get('endpoint') || 'health';
    
    // Proxy for CCD image or other GET endpoints
    if (endpoint === 'ccd/latest') {
        try {
            const res = await fetch('http://127.0.0.1:5005/ccd/latest', { cache: 'no-store' });
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
        const res = await fetch(`http://127.0.0.1:5005/${endpoint}`, { cache: 'no-store' });
        const data = await res.json();
        
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
        const body = await request.json();
        const res = await fetch(`http://127.0.0.1:5005/${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        
        if (!res.ok) {
            const errorText = await res.text();
            return NextResponse.json({ error: `Backend Error: ${res.status} ${errorText}` }, { status: res.status });
        }
        
        const data = await res.json();
        return NextResponse.json(data);
    } catch (error: any) {
        console.error(`Proxy POST error [${endpoint}]:`, error);
        return NextResponse.json({ error: error.message || 'Internal proxy error' }, { status: 500 });
    }
}
