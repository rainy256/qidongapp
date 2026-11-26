export function bearerAuth(token: string | null): Record<string, string> {
  return token ? { Authorization: 'Bearer ' + token } : {};
}
export function apiEndpoint(base: string, path: string) {
  return base.endsWith('/app-api') && path.startsWith('/api/') ? base + path.slice(4) : base + path;
}
export function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response>;
export function fetchWithTimeout<T>(url: string, init: RequestInit, read: (res: Response) => Promise<T>): Promise<T>;
export async function fetchWithTimeout<T>(url: string, init: RequestInit = {}, read?: (res: Response) => Promise<T>) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12000);
  try {
    const res = await fetch(url, { ...init, credentials: 'omit', cache: 'no-store', signal: ctl.signal });
    return read ? await read(res) : res;
  } finally {
    clearTimeout(timer);
  }
}
