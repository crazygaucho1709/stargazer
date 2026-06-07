import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const DOMAIN_MAP: Record<string, string> = {
  alasky: 'https://alasky.cds.unistra.fr',
  alaskybis: 'https://alaskybis.cds.unistra.fr',
  irsa: 'https://irsa.ipac.caltech.edu',
  cds: 'https://alasky.cds.unistra.fr'
};

export async function GET(
  request: Request,
  { params }: { params: { slug: string[] } }
) {
  try {
    const slug = params.slug;
    if (!slug || slug.length === 0) {
      return NextResponse.json({ error: 'Missing path' }, { status: 400 });
    }

    const domainKey = slug[0];
    const baseDomain = DOMAIN_MAP[domainKey];
    
    if (!baseDomain) {
      return NextResponse.json({ error: `Unsupported domain: ${domainKey}` }, { status: 400 });
    }

    const path = slug.slice(1).join('/');
    const { searchParams } = new URL(request.url);
    const queryString = searchParams.toString();
    
    const targetUrl = `${baseDomain}/${path}${queryString ? `?${queryString}` : ''}`;

    const res = await fetch(targetUrl, {
      method: 'GET',
      next: { revalidate: 0 }
    });

    const contentType = res.headers.get('content-type') || 'application/octet-stream';
    const buffer = await res.arrayBuffer();

    return new Response(buffer, {
      status: res.status,
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: `Aladin proxy failed: ${error.message}` },
      { status: 502 }
    );
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}
