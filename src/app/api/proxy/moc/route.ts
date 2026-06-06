import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const MOC_SERVER = 'https://alasky.unistra.fr/MocServer/query';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const url = new URL(MOC_SERVER);
    searchParams.forEach((value, key) => url.searchParams.append(key, value));

    const res = await fetch(url.toString(), {
      headers: { 'Accept': 'application/json' },
      next: { revalidate: 0 }
    });

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    return NextResponse.json(data, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: `MocServer proxy failed: ${error.message}` },
      { status: 502 }
    );
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}
