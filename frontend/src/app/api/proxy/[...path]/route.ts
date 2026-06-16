import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
  return handleProxy(req, params.path, 'GET');
}

export async function POST(req: NextRequest, { params }: { params: { path: string[] } }) {
  return handleProxy(req, params.path, 'POST');
}

export async function PUT(req: NextRequest, { params }: { params: { path: string[] } }) {
  return handleProxy(req, params.path, 'PUT');
}

export async function DELETE(req: NextRequest, { params }: { params: { path: string[] } }) {
  return handleProxy(req, params.path, 'DELETE');
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Frappe-Base-Url, X-Frappe-Api-Key, X-Frappe-Api-Secret',
    },
  });
}

async function handleProxy(req: NextRequest, pathSegments: string[], method: string) {
  const baseUrl = req.headers.get('x-frappe-base-url');
  const apiKey = req.headers.get('x-frappe-api-key');
  const apiSecret = req.headers.get('x-frappe-api-secret');

  if (!baseUrl) {
    return NextResponse.json({ error: 'Missing X-Frappe-Base-Url header' }, { status: 400 });
  }

  // Build target URL (removes any double slashes and handles query string)
  const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const endpoint = pathSegments.join('/');
  const query = new URL(req.url).search;
  const remoteUrl = `${cleanBaseUrl}/${endpoint}${query}`;

  // Safe logging (obfuscating key & secret)
  const safeKey = apiKey ? `${apiKey.slice(0, 4)}...${apiKey.slice(-3)}` : 'None';
  console.log(`[Proxy] ${method} -> ${remoteUrl} | AuthKey: ${safeKey}`);

  // Set up headers to forward to Frappe
  const headers = new Headers();
  headers.set('Accept', 'application/json');
  headers.set('Bypass-Tunnel-Reminder', 'true');
  if (apiKey && apiSecret) {
    headers.set('Authorization', `token ${apiKey}:${apiSecret}`);
  }

  const options: RequestInit = {
    method,
    headers,
  };

  // Attach body for writing methods
  if (method === 'POST' || method === 'PUT') {
    try {
      const contentType = req.headers.get('content-type') || 'application/json';
      headers.set('Content-Type', contentType);
      const textBody = await req.text();
      options.body = textBody;
    } catch (err) {
      console.warn('[Proxy] Failed to read request body', err);
    }
  }

  try {
    const response = await fetch(remoteUrl, options);
    const dataText = await response.text();

    let data;
    try {
      data = dataText ? JSON.parse(dataText) : {};
    } catch {
      data = { rawResponse: dataText };
    }

    const resHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json',
    };

    return NextResponse.json(data, {
      status: response.status,
      headers: resHeaders,
    });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Proxy Error] ${method} to ${remoteUrl} failed:`, errMsg);
    return NextResponse.json(
      { error: 'Failed to contact remote ERPNext server', message: errMsg },
      { status: 502 }
    );
  }
}
