import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpSseRoomClient } from './httpSseClient';
import {
  ForbiddenError,
  NotFoundError,
  RepositoryError,
  RevisionConflictError,
  RoomClosedError,
} from './repository';
import type { ConnectionState, RoomSnapshot } from '../domain/types';

type Listener = (evt?: unknown) => void;

class FakeEventTarget {
  private readonly listeners = new Map<string, Set<Listener>>();

  addEventListener(type: string, listener: Listener): void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type: string, event?: unknown): void {
    for (const fn of Array.from(this.listeners.get(type) ?? [])) {
      fn(event);
    }
  }
}

class FakeEventSource extends FakeEventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  static instances: FakeEventSource[] = [];

  readonly url: string;
  readonly withCredentials: boolean;
  readyState = FakeEventSource.CONNECTING;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string, init?: { withCredentials?: boolean }) {
    super();
    this.url = url;
    this.withCredentials = Boolean(init?.withCredentials);
    FakeEventSource.instances.push(this);
  }

  close(): void {
    this.readyState = FakeEventSource.CLOSED;
  }

  triggerOpen(): void {
    this.readyState = FakeEventSource.OPEN;
    this.onopen?.();
  }

  triggerError(readyState = FakeEventSource.CONNECTING): void {
    this.readyState = readyState;
    this.onerror?.();
  }
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('HttpSseRoomClient', () => {
  afterEach(() => {
    FakeEventSource.instances = [];
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('maps backend { error: { code, message } } accurately and separates ORIGIN_FORBIDDEN from OWNER_REQUIRED', async () => {
    const client = new HttpSseRoomClient('/api');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        jsonResponse(403, { error: { code: 'ORIGIN_FORBIDDEN', message: '来源校验失败，仅允许同源请求。' } }),
      ),
    );
    await expect(client.closeRoom('r-1', 'm-1')).rejects.toMatchObject({
      name: 'RepositoryError',
      code: 'ORIGIN_FORBIDDEN',
      message: '来源校验失败，仅允许同源请求。',
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        jsonResponse(403, { error: { code: 'OWNER_REQUIRED', message: '只有房主可以结束收集。' } }),
      ),
    );
    await expect(client.closeRoom('r-1', 'm-2')).rejects.toBeInstanceOf(ForbiddenError);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        jsonResponse(409, { error: { code: 'IDEMPOTENCY_CONFLICT', message: '请求编号冲突' } }),
      ),
    );
    await expect(
      client.saveMine('r-1', {
        nickname: '阿哲',
        answer: { kind: 'unavailable' },
        baseMineRevision: 0,
        mutationId: 'm-3',
      }),
    ).rejects.toSatisfy(
      (err: unknown) => err instanceof RepositoryError && err.code === 'IDEMPOTENCY_CONFLICT',
    );

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        jsonResponse(409, { error: { code: 'REVISION_CONFLICT', message: '版本冲突' } }),
      ),
    );
    await expect(
      client.saveMine('r-1', {
        nickname: '阿哲',
        answer: { kind: 'unavailable' },
        baseMineRevision: 0,
        mutationId: 'm-4',
      }),
    ).rejects.toBeInstanceOf(RevisionConflictError);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        jsonResponse(410, { error: { code: 'ROOM_CLOSED', message: '已关房' } }),
      ),
    );
    await expect(
      client.saveMine('r-1', {
        nickname: '阿哲',
        answer: { kind: 'unavailable' },
        baseMineRevision: 0,
        mutationId: 'm-5',
      }),
    ).rejects.toBeInstanceOf(RoomClosedError);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        jsonResponse(404, { error: { code: 'NOT_FOUND', message: '不存在' } }),
      ),
    );
    await expect(client.getRoom('r-missing')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('starts 6s fallback polling after 2 consecutive SSE errors and stops polling when SSE recovers', async () => {
    vi.useFakeTimers();

    const docTarget = new FakeEventTarget();
    const docMock = Object.assign(docTarget, { visibilityState: 'visible' as const });
    const winTarget = new FakeEventTarget();
    const winMock = Object.assign(winTarget, {
      setInterval: globalThis.setInterval.bind(globalThis),
    });

    const snap2: RoomSnapshot = {
      id: 'r-sse',
      title: '测试房',
      tzid: 'Asia/Shanghai',
      nights: [{ id: 'n1', dateKey: '2026-11-27', from: 995670, to: 995682 }],
      targetPlayers: 3,
      durationSlots: 4,
      roomRevision: 2,
      closedAt: null,
      submissions: [],
      viewer: { memberId: null, canClose: false, mineRevision: 0 },
      syncedAt: '2026-11-27T12:00:00.000Z',
    };
    const snap3: RoomSnapshot = { ...snap2, roomRevision: 3 };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, snap2))
      .mockResolvedValueOnce(jsonResponse(200, snap3));

    vi.stubGlobal('document', docMock);
    vi.stubGlobal('window', winMock);
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal('EventSource', FakeEventSource);
    vi.stubGlobal('fetch', fetchMock);

    const client = new HttpSseRoomClient('/api');
    const snapshots: number[] = [];
    const states: ConnectionState[] = [];

    const unsub = client.subscribe('r-sse', 1, {
      onSnapshot: (s) => snapshots.push(s.roomRevision),
      onConnection: (st) => states.push(st),
    });

    const source = FakeEventSource.instances[0];
    expect(source).toBeDefined();

    // Two consecutive SSE errors (still CONNECTING, not CLOSED) trigger fallback polling
    source.triggerError(FakeEventSource.CONNECTING);
    source.triggerError(FakeEventSource.CONNECTING);
    expect(states).toContain('reconnecting');

    await vi.advanceTimersByTimeAsync(6000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(snapshots).toEqual([2]);
    expect(states[states.length - 1]).toBe('live');

    // When SSE opens again, polling stops and missed updates are fetched once
    source.triggerOpen();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(snapshots).toEqual([2, 3]);

    // Advancing another 6s should NOT trigger polling because SSE is live
    await vi.advanceTimersByTimeAsync(6000);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    unsub();
  });

  it('lists creator rooms from GET /api/my-rooms and returns empty array on 404 fallback', async () => {
    const client = new HttpSseRoomClient('/api');
    const mockRooms = [
      {
        id: 'r-test1',
        title: '周五塔科夫',
        gameTag: 'tarkov',
        nights: [{ id: 'n1', dateKey: '2026-11-27', from: 995670, to: 995682 }],
        targetPlayers: 4,
        durationSlots: 4,
        submissionCount: 2,
        closedAt: null,
        createdAt: '2026-11-25T03:00:00.000Z',
        role: 'owner',
      },
    ];

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(jsonResponse(200, { rooms: mockRooms })),
    );
    await expect(client.listMyRooms()).resolves.toEqual(mockRooms);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        jsonResponse(404, { error: { code: 'NOT_FOUND', message: 'not found' } }),
      ),
    );
    await expect(client.listMyRooms()).resolves.toEqual([]);
  });

  it('deletes an owned room via DELETE /api/rooms/:id and maps 403/404 errors', async () => {
    const client = new HttpSseRoomClient('/api');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(jsonResponse(200, { ok: true, id: 'r-del' })),
    );
    await expect(client.deleteRoom('r-del')).resolves.toBeUndefined();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        jsonResponse(403, { error: { code: 'OWNER_REQUIRED', message: '只有房主可以删除这个车队。' } }),
      ),
    );
    await expect(client.deleteRoom('r-del')).rejects.toBeInstanceOf(ForbiddenError);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        jsonResponse(404, { error: { code: 'NOT_FOUND', message: '不存在' } }),
      ),
    );
    await expect(client.deleteRoom('r-missing')).rejects.toBeInstanceOf(NotFoundError);
  });
});
