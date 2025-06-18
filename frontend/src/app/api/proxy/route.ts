import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  return handleProxyRequest(request, 'GET');
}

export async function POST(request: NextRequest) {
  return handleProxyRequest(request, 'POST');
}

export async function PUT(request: NextRequest) {
  return handleProxyRequest(request, 'PUT');
}

export async function DELETE(request: NextRequest) {
  return handleProxyRequest(request, 'DELETE');
}

async function handleProxyRequest(request: NextRequest, method: string) {
  // Get and validate the path to proxy from the query parameter
  const { searchParams } = new URL(request.url);
  const requestedPath = searchParams.get('path');

  // Default path if validation fails or not provided
  const DEFAULT_PATH = '/api/data';

  // Normalize to always start with '/'
  const normalizedPath = requestedPath
    ? requestedPath.startsWith('/')
      ? requestedPath
      : `/${requestedPath}`
    : undefined;

  // Allow only paths that start with allowed prefixes and do not contain path traversal sequences
  const ALLOWED_PREFIXES = ['/api/'];
  const isValidPath =
    normalizedPath !== undefined &&
    ALLOWED_PREFIXES.some((prefix) => normalizedPath.startsWith(prefix)) &&
    !normalizedPath.includes('..');

  const path = isValidPath ? normalizedPath! : DEFAULT_PATH;
  
  // Build backend URL
  // Local dev default → http://localhost:3001
  // Production default (Railway) → http://backend.internal:8080
  const isDev = process.env.NODE_ENV !== 'production';
  const backendBaseUrl = process.env.BACKEND_INTERNAL_URL || (isDev ? "http://localhost:3001" : "http://backend.internal:8080");

  // Debug: log what URL we are about to fetch in production. Remove or comment out once issue is fixed.
  if (!isDev) {
    console.log('[proxy] backendBaseUrl=', backendBaseUrl, 'path=', path);
  }

  const backendUrl = `${backendBaseUrl}${path}`;

  try {
    // Forward the request to the backend
    const requestInit: RequestInit = {
      method,
      cache: "no-store",
      headers: {
        'Content-Type': 'application/json',
        // Forward authorization header if present
        ...(request.headers.get('authorization') && {
          'Authorization': request.headers.get('authorization')!
        }),
      },
    };

    // Add body for POST/PUT requests
    if (method === 'POST' || method === 'PUT') {
      try {
        const body = await request.text();
        if (body) {
          requestInit.body = body;
        }
      } catch (error) {
        // No body is fine for some requests
      }
    }

    const backendRes = await fetch(backendUrl, requestInit);

    // Stream the response body directly to the client to preserve streaming capabilities
    // and support all content types, including binary data.
    const headers = new Headers(backendRes.headers);

    // Explicitly forward CORS headers if present
    const corsHeader = backendRes.headers.get('access-control-allow-origin');
    if (corsHeader) {
      headers.set('Access-Control-Allow-Origin', corsHeader);
    }

    return new Response(backendRes.body, {
      status: backendRes.status,
      headers,
    });
  } catch (error) {
    console.error("Proxy error:", error);
    return new Response(
      JSON.stringify({ error: "Unable to reach backend" }),
      {
        status: 502,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
} 