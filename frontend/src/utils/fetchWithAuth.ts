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
  const response = await fetch(input, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });
  if (response.status === 401 || response.status === 403) {
    window.location.href = "/sign-in";
    return;
  }
  return response;
} 