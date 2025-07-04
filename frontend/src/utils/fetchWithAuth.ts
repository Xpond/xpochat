export async function fetchWithAuth(
  getToken: () => Promise<string | null>,
  input: RequestInfo,
  init: RequestInit = {}
) {
  // getToken is provided by caller (e.g., from useAuth inside a component)
  const token = await getToken();
  if (!token) {
    window.location.href = "/sign-in";
    return;
  }

  // Transform API calls to use our proxy
  let finalInput = input;
  if (typeof input === 'string' && input.startsWith('/api/')) {
    // Route through our proxy instead of direct backend calls
    finalInput = `/api/proxy?path=${encodeURIComponent(input)}`;
  }

  const doFetch = async (authToken: string) => {
    return fetch(finalInput, {
      ...init,
      headers: {
        ...(init.headers || {}),
        Authorization: `Bearer ${authToken}`,
      },
    });
  };

  try {
    let response = await doFetch(token);

    // If token is expired, force refresh once and retry
    if (response.status === 401 || response.status === 403) {
      const fresh = await (getToken as any)({ forceRefresh: true });
      if (!fresh) {
        window.location.href = "/sign-in";
        return;
      }
      response = await doFetch(fresh);
      if (response.status === 401 || response.status === 403) {
        window.location.href = "/sign-in";
        return;
      }
    }
    return response;
  } catch (_) {
    // Network error (server down, CORS, etc.). Swallow to avoid console spam.
    return;
  }
} 