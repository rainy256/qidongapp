import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiEndpoint, bearerAuth, fetchWithTimeout } from '../http';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('APK HTTP transport', () => {
  it('retains dedicated API entry and direct Worker compatibility', () => {
    expect(apiEndpoint('https://qidong.apexdaishi.xyz/app-api', '/api/state')).toBe('https://qidong.apexdaishi.xyz/app-api/state');
    expect(apiEndpoint('https://qidong.apexdaishi.xyz/app-api', '/api/account/password')).toBe('https://qidong.apexdaishi.xyz/app-api/account/password');
    expect(apiEndpoint('https://qidongapp.apexdaishi.xyz', '/api/state')).toBe('https://qidongapp.apexdaishi.xyz/api/state');
    expect(bearerAuth('apk-token')).toEqual({Authorization:'Bearer apk-token'});
    expect(bearerAuth(null)).toEqual({});
  });

  it('never sends cookies, avoids cache, and preserves authorization and request body', async () => {
    const fetcher = vi.fn(async (_url: string, _init: RequestInit) => new Response('{}'));
    vi.stubGlobal('fetch', fetcher);
    await fetchWithTimeout('https://example.test/app-api/profile', {
      method:'POST', credentials:'include', cache:'force-cache', headers:bearerAuth('apk-token'), body:'{}',
    });
    expect(fetcher).toHaveBeenCalledWith('https://example.test/app-api/profile', expect.objectContaining({
      method:'POST', credentials:'omit', cache:'no-store', headers:{Authorization:'Bearer apk-token'}, body:'{}', signal:expect.any(AbortSignal),
    }));
  });

  it('aborts a stalled request after twelve seconds and clears timers', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve,reject)=>{
      init.signal!.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')), {once:true});
    })));
    const pending = fetchWithTimeout('https://example.test/app-api/state');
    const rejection = expect(pending).rejects.toMatchObject({name:'AbortError'});
    await vi.advanceTimersByTimeAsync(12000);
    await rejection;
    expect(vi.getTimerCount()).toBe(0);
  });
});
