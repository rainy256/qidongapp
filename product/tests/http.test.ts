import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest } from '../types';
import { apiEndpoint, bearerAuth, fetchWithTimeout } from '../http';
import { applyConfirmedWrite } from '../confirmed-write';
import { readSquadState } from '../state-read';
import type { Snapshot, Invite } from '../types';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('production squad read routes', () => {
  const primary = 'https://qidong.apexdaishi.xyz/app-api';
  const direct = 'https://qidongapp.apexdaishi.xyz/api/state';
  const read = (base = primary) => readSquadState(base, 'fixture', new AbortController().signal);

  it('uses only the primary route for healthy reads and respects a definitive rejection', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({now:1}))
      .mockResolvedValueOnce(Response.json({error:'unauthorized'}, {status:401}));
    vi.stubGlobal('fetch', fetcher);
    await expect(read()).resolves.toEqual({now:1});
    await expect(read()).rejects.toMatchObject({status:401});
    expect(fetcher.mock.calls.map(call => call[0])).toEqual([primary+'/state', primary+'/state']);
  });

  it('uses the existing direct route after a slow read and cancels the losing request', async () => {
    vi.useFakeTimers();
    let primarySignal: AbortSignal | undefined;
    const fetcher = vi.fn((url: string, init: RequestInit) => {
      if (url === direct) return Promise.resolve(Response.json({now:2}));
      primarySignal = init.signal!;
      return new Promise<Response>((_resolve,reject) => primarySignal!.addEventListener('abort', () => reject(new DOMException('Aborted','AbortError'))));
    });
    vi.stubGlobal('fetch', fetcher);
    const result = read();
    await vi.advanceTimersByTimeAsync(4499);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toEqual({now:2});
    expect(fetcher).toHaveBeenNthCalledWith(2,direct,expect.objectContaining({method:'GET',credentials:'omit',headers:{Authorization:'Bearer fixture'}}));
    expect(primarySignal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('recovers immediately from a transient failure and never reroutes a custom server', async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new TypeError('network')).mockResolvedValueOnce(Response.json({now:3}))
      .mockRejectedValueOnce(new TypeError('custom network'));
    vi.stubGlobal('fetch', fetcher);
    await expect(read()).resolves.toEqual({now:3});
    await expect(read('https://custom.test')).rejects.toThrow('custom network');
    expect(fetcher.mock.calls.map(call=>call[0])).toEqual([primary+'/state',direct,'https://custom.test/api/state']);
  });

  it('keeps one deadline for both routes and cancels promptly on invalidation', async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    vi.stubGlobal('fetch', (_url: string, init: RequestInit) => new Promise((_resolve,reject) => {
      signals.push(init.signal!);
      init.signal!.addEventListener('abort', () => reject(new DOMException('Aborted','AbortError')));
    }));
    const timeout = expect(read()).rejects.toMatchObject({name:'AbortError'});
    await vi.advanceTimersByTimeAsync(20000);
    await timeout;
    const ctl = new AbortController();
    const cancelled = expect(readSquadState(primary,'fixture',ctl.signal)).rejects.toMatchObject({name:'AbortError'});
    ctl.abort();
    await cancelled;
    expect(signals).toHaveLength(3);
    expect(signals.every(signal=>signal.aborted)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
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

  it('keeps the timeout active until the save confirmation body arrives', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => ({
      ok: true,
      json: () => new Promise((_resolve, reject) =>
        init.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))),
    }));
    const result = expect(apiRequest('https://example.test', '/api/schedule', 'session', {}))
      .rejects.toMatchObject({name: 'AbortError'});
    await vi.advanceTimersByTimeAsync(12000);
    await result;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves an upstream HTTP error even when the body is HTML', async () => {
    vi.stubGlobal('fetch', async () => new Response('<html>Unavailable</html>', {status: 503}));
    await expect(apiRequest('https://example.test', '/api/schedule', 'session', {}))
      .rejects.toMatchObject({status: 503});
  });

  it('accepts a slow state read past the write deadline and still bounds a stalled read', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => ({
      ok: true, json: () => new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve({now: 123}), 15000);
        init.signal!.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); });
      }),
    }));
    const pending = apiRequest('https://example.test', '/api/state', 'session');
    await vi.advanceTimersByTimeAsync(15000);
    await expect(pending).resolves.toEqual({now: 123});
    vi.stubGlobal('fetch', (_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    const timeout = expect(apiRequest('https://example.test', '/api/state', 'session')).rejects.toMatchObject({name:'AbortError'});
    await vi.advanceTimersByTimeAsync(20000);
    await timeout;
    const ctl = new AbortController();
    const cancelled = expect(apiRequest('https://example.test', '/api/state', 'session', undefined, ctl.signal)).rejects.toMatchObject({name:'AbortError'});
    ctl.abort();
    await cancelled;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('renders a confirmed invite immediately and keeps a newer revision', () => {
    const snapshot: Snapshot = {me:{id:'m1',nickname:'test'}, members:[], invites:[], messages:[], reservations:[], reservationMessages:[], nudges:[], now:1};
    const invite: Invite = {id:'i',creator:'m1',game:'apex',title:'test',created_at:1,expires_at:100,revision:2,r1:'ready',r2:'ready',r3:'pending',status:'pending'};
    const confirmed = applyConfirmedWrite(snapshot, '/api/invites', {}, {invite});
    expect(confirmed.invites).toEqual([invite]);
    expect(snapshot.invites).toEqual([]);
    expect(applyConfirmedWrite(confirmed, '/api/invites/i/reply', {}, {invite:{...invite, revision:1,r2:'pending'}}).invites).toEqual([invite]);
  });
});
