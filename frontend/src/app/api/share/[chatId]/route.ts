import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  try {
    const { chatId } = await params;
    
    // Build backend URL - same logic as proxy route
    const isDev = process.env.NODE_ENV !== 'production';
    const backendBaseUrl = process.env.BACKEND_INTERNAL_URL || (isDev ? "http://localhost:3001" : "http://backend.internal:8080");
    const backendUrl = `${backendBaseUrl}/api/share/${chatId}`;

    // Forward the request to backend
    const backendResponse = await fetch(backendUrl, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Forward the response
    const data = await backendResponse.json();
    
    return NextResponse.json(data, { 
      status: backendResponse.status,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    });
    
  } catch (error) {
    console.error('Share API route error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch shared chat' },
      { status: 500 }
    );
  }
} 