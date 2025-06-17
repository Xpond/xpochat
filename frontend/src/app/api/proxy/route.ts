export async function GET() {
  // Base URL for the private backend. On Railway this should resolve via internal DNS, e.g. "http://backend.internal:8080/api/data".
  // You can override the default via the BACKEND_INTERNAL_URL environment variable at build/runtime.
  const backendUrl = process.env.BACKEND_INTERNAL_URL || "http://backend.internal:8080/api/data";

  try {
    const backendRes = await fetch(backendUrl, {
      // Disable caching to always return fresh data
      cache: "no-store",
    });

    // Attempt to parse JSON regardless of status to relay backend message
    const data = await backendRes.json();

    return new Response(JSON.stringify(data), {
      status: backendRes.status,
      headers: { "Content-Type": "application/json" },
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