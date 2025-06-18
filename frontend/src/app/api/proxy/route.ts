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

export async function OPTIONS(request: NextRequest) {
  // Handle CORS preflight requests by echoing requested headers/methods and returning 204 quickly.
  const headers = new Headers();
  const reqHeaders = request.headers;
  const allowHeaders = reqHeaders.get("access-control-request-headers") || "Authorization, Content-Type";
  const allowMethod = reqHeaders.get("access-control-request-method") || "GET,POST,PUT,DELETE,OPTIONS";
  headers.set("Access-Control-Allow-Origin", reqHeaders.get("origin") || "*");
  headers.set("Access-Control-Allow-Headers", allowHeaders);
  headers.set("Access-Control-Allow-Methods", allowMethod);
  headers.set("Access-Control-Max-Age", "86400");
  return new Response(null, { status: 204, headers });
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
    // Removed console.log for production security - do not expose internal URLs
  }

  const backendUrl = `${backendBaseUrl}${path}`;

  try {
    const originalHeaders = new Headers(request.headers);
    // Remove headers that Node's fetch will set automatically or that could cause issues
    originalHeaders.delete('host');

    // Ensure auth header is forwarded (may already exist on originalHeaders)
    const authHeader = request.headers.get('authorization');
    if (authHeader && !originalHeaders.has('authorization')) {
      originalHeaders.set('authorization', authHeader);
    }

    const requestInit: RequestInit = {
      method,
      cache: 'no-store',
      headers: originalHeaders,
      // For GET and HEAD, the body should be undefined; for others, forward the raw body stream.
      body: method === 'GET' || method === 'HEAD' ? undefined : (request as any).body,
      // Explicitly allow streaming of larger payloads (file uploads)
      duplex: 'half',
    } as RequestInit & { duplex?: 'half' };

    // Note: Next.js might freeze the body after reading, so avoid consuming it before forwarding.

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
    // Only log errors in development
    if (process.env.NODE_ENV === 'development') {
      console.error("Proxy error:", error);
    }
    return new Response(
      JSON.stringify({ error: "Unable to reach backend" }),
      {
        status: 502,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
} 