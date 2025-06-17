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
  // Get the path to proxy from query parameter
  const { searchParams } = new URL(request.url);
  const path = searchParams.get('path') || '/api/data';
  
  // Build backend URL
  // For local development: http://localhost:3001
  // For Railway production: http://backend.internal:8080
  const backendBaseUrl = process.env.BACKEND_INTERNAL_URL || "http://localhost:3001";
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

    // Try to parse as JSON, fallback to text
    let data;
    const contentType = backendRes.headers.get('content-type');
    
    if (contentType?.includes('application/json')) {
      data = await backendRes.json();
    } else {
      data = await backendRes.text();
    }

    return new Response(
      typeof data === 'string' ? data : JSON.stringify(data),
      {
        status: backendRes.status,
        headers: { 
          "Content-Type": contentType || "application/json",
          // Forward CORS headers if present
          ...(backendRes.headers.get('access-control-allow-origin') && {
            'Access-Control-Allow-Origin': backendRes.headers.get('access-control-allow-origin')!
          }),
        },
      }
    );
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