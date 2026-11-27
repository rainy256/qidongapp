export const STATE_TIMEOUT_MS = 20000;

export function bearerAuth(token: string | null): Record<string, string> {
  return token ? { Authorization: 'Bearer ' + token } : {};
}
export function apiEndpoint(base: string, path: string) {
  return base.endsWith('/app-api') && path.startsWith('/api/') ? base + path.slice(4) : base + path;
}
export function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response>;
export function fetchWithTimeout<T>(url: string, init: RequestInit, read: (res: Response) => Promise<T>, timeoutMs?: number): Promise<T>;
export async function fetchWithTimeout<T>(url: string, init: RequestInit = {}, read?: (res: Response) => Promise<T>, timeoutMs = 12000) {
  const ctl = new AbortController();
  const abort = () => ctl.abort();
  if (init.signal?.aborted) abort();
  else init.signal?.addEventListener('abort', abort, {once: true});
  const timer = setTimeout(abort, timeoutMs);
  try {
    const res = await fetch(url, { ...init, credentials: 'omit', cache: 'no-store', signal: ctl.signal });
    return read ? await read(res) : res;
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener('abort', abort);
  }
}
