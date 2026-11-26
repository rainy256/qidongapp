export function bearerAuth(token: string | null): Record<string, string> {
  return token ? { Authorization: 'Bearer ' + token } : {};
}
export function apiEndpoint(base: string, path: string) {
  return base.endsWith('/app-api') && path.startsWith('/api/') ? base + path.slice(4) : base + path;
}
export async function fetchWithTimeout(url: string, init: RequestInit = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12000);
  try {
    return await fetch(url, { ...init, credentials: 'omit', cache: 'no-store', signal: ctl.signal });
  } finally {
    clearTimeout(timer);
  }
}
