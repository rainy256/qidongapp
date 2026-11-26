import type { CreateRoomSpec, MyRoomSummary, RoomSnapshot, SaveMineInput } from '../domain/types';
import {
  ForbiddenError,
  NetworkError,
  NotFoundError,
  RepositoryError,
  RevisionConflictError,
  RoomClosedError,
  type RoomRepository,
  type SubscribeHandlers,
} from './repository';

/**
 * Production repository client targeting the Phase-2 Fastify + SQLite + SSE backend
 * under same-origin `/api/rooms` routes with HttpOnly session cookies.
 */
export class HttpSseRoomClient implements RoomRepository {
  private readonly baseUrl: string;

  private sessionReady: Promise<void> | null = null;
  constructor(baseUrl = '/api', private readonly syncMode: 'sse' | 'poll' = 'sse', private readonly bootstrapSession = syncMode === 'poll') {
    this.baseUrl = baseUrl;
  }

  private async ensureSession(): Promise<void> {
    if (!this.bootstrapSession) return;
    // Single flight per tab, including React StrictMode's duplicate initial effects.
    if (!this.sessionReady) {
      this.sessionReady = this.fetchJson(`${this.baseUrl}/session`, {
        method: 'GET', credentials: 'same-origin', cache: 'no-store',
      }).then(() => undefined).catch(err => { this.sessionReady = null; throw err; });
    }
    await this.sessionReady;
  }

  async createRoom(spec: CreateRoomSpec, mutationId: string): Promise<RoomSnapshot> {
    await this.ensureSession();
    const res = await this.fetchJson(`${this.baseUrl}/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ ...spec, mutationId }),
    });
    return res as RoomSnapshot;
  }

  async getRoom(id: string, signal?: AbortSignal): Promise<RoomSnapshot> {
    await this.ensureSession();
    const res = await this.fetchJson(`${this.baseUrl}/rooms/${encodeURIComponent(id)}`, {
      method: 'GET',
      credentials: 'same-origin',
      signal,
    });
    return res as RoomSnapshot;
  }

  async saveMine(id: string, input: SaveMineInput): Promise<RoomSnapshot> {
    await this.ensureSession();
    const res = await this.fetchJson(`${this.baseUrl}/rooms/${encodeURIComponent(id)}/me`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(input),
    });
    return res as RoomSnapshot;
  }

  async closeRoom(id: string, mutationId: string): Promise<RoomSnapshot> {
    await this.ensureSession();
    const res = await this.fetchJson(`${this.baseUrl}/rooms/${encodeURIComponent(id)}/closure`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ mutationId }),
    });
    return res as RoomSnapshot;
  }

  async deleteRoom(id: string): Promise<void> {
    await this.ensureSession();
    await this.fetchJson(`${this.baseUrl}/rooms/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      credentials: 'same-origin',
      cache: 'no-store',
    });
  }

  async listMyRooms(signal?: AbortSignal): Promise<readonly MyRoomSummary[]> {
    try {
      const res = (await this.fetchJson(`${this.baseUrl}/my-rooms`, {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        signal,
      })) as { rooms?: unknown };
      return Array.isArray(res?.rooms) ? (res.rooms as MyRoomSummary[]) : [];
    } catch (err) {
      if (err instanceof NotFoundError) {
        return [];
      }
      throw err;
    }
  }

  subscribe(id: string, afterRevision: number, handlers: SubscribeHandlers): () => void {
    let lastRevision = afterRevision;
    let disposed = false;
    let terminal = false;
    let wasDisconnected = false;
    let consecutiveSseErrors = 0;
    let source: EventSource | null = null;
    let pollTimer: number | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let connectTimer: ReturnType<typeof setTimeout> | null = null;
    let inFlight: AbortController | null = null;
    let queued = false;
    const pollingOnly = this.syncMode === 'poll' || typeof EventSource === 'undefined';
    const visible = () => !disposed && !terminal && document.visibilityState !== 'hidden';
    const connectionError = () => handlers.onConnection(navigator.onLine === false ? 'offline' : 'reconnecting');
    const stopPolling = () => { if (pollTimer !== null) clearInterval(pollTimer); pollTimer = null; };
    const stopTimers = () => {
      stopPolling();
      if (retryTimer !== null) clearTimeout(retryTimer);
      if (connectTimer !== null) clearTimeout(connectTimer);
      retryTimer = connectTimer = null;
    };
    const closeSource = () => { const old = source; source = null; old?.close(); };

    const pullSnapshot = async () => {
      if (!visible()) return;
      if (inFlight) { queued = true; return; }
      const controller = new AbortController();
      inFlight = controller;
      try {
        const snap = await this.getRoom(id, controller.signal);
        if (!visible() || controller.signal.aborted) return;
        if (snap.roomRevision > lastRevision) {
          lastRevision = snap.roomRevision;
          handlers.onSnapshot(snap);
        }
        handlers.onConnection('live');
        if (!pollingOnly && source?.readyState === EventSource.OPEN) stopPolling();
      } catch (err) {
        if (!visible() || controller.signal.aborted || (err as Error)?.name === 'AbortError') return;
        if (err instanceof NotFoundError) {
          terminal = true;
          stopTimers();
          closeSource();
          handlers.onNotFound?.();
          return;
        }
        connectionError();
        startPolling();
      } finally {
        if (inFlight === controller) inFlight = null;
        if (queued && visible()) { queued = false; void pullSnapshot(); }
      }
    };
    const startPolling = () => {
      if (!visible() || pollTimer !== null) return;
      pollTimer = window.setInterval(() => { if (!inFlight) void pullSnapshot(); }, 6000);
    };
    const connectSse = () => {
      if (!visible()) return;
      if (pollingOnly) { startPolling(); return; }
      if (retryTimer !== null) clearTimeout(retryTimer);
      if (connectTimer !== null) clearTimeout(connectTimer);
      retryTimer = connectTimer = null;
      closeSource();
      const current = new EventSource(
        `${this.baseUrl}/rooms/${encodeURIComponent(id)}/events?afterRevision=${lastRevision}`,
        { withCredentials: true },
      );
      source = current;
      connectTimer = setTimeout(() => { if (source === current && current.readyState !== EventSource.OPEN) startPolling(); }, 10000);
      current.onopen = () => {
        if (!visible() || source !== current) return;
        if (connectTimer !== null) clearTimeout(connectTimer);
        connectTimer = null;
        consecutiveSseErrors = 0;
        stopPolling();
        handlers.onConnection('live');
        if (wasDisconnected) { wasDisconnected = false; void pullSnapshot(); }
      };
      current.addEventListener('revision', evt => {
        if (!visible() || source !== current) return;
        try {
          const payload = JSON.parse((evt as MessageEvent).data) as { roomRevision?: number };
          if (typeof payload.roomRevision === 'number' && payload.roomRevision > lastRevision) void pullSnapshot();
        } catch { void pullSnapshot(); }
      });
      current.onerror = () => {
        if (!visible() || source !== current) return;
        wasDisconnected = true;
        consecutiveSseErrors++;
        connectionError();
        if (current.readyState === EventSource.CLOSED || consecutiveSseErrors >= 2) startPolling();
        if (current.readyState === EventSource.CLOSED && retryTimer === null) {
          retryTimer = setTimeout(() => { retryTimer = null; connectSse(); }, 15000);
        }
      };
    };
    const pause = () => {
      closeSource();
      stopTimers();
      inFlight?.abort();
      consecutiveSseErrors = 0;
      queued = false;
    };
    const resume = () => { if (visible()) { void pullSnapshot(); connectSse(); } };
    const onVisibilityChange = () => { if (document.visibilityState === 'hidden') pause(); else resume(); };
    const onOffline = () => { if (!disposed) { wasDisconnected = true; handlers.onConnection('offline'); } };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', resume);
    connectSse();
    if (pollingOnly) void pullSnapshot();
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', resume);
      pause();
    };
  }

  private async fetchJson(url: string, init: RequestInit): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') throw err;
      throw new NetworkError();
    }

    if (response.ok) {
      return response.json();
    }

    const body = (await response.json().catch(() => null)) as {
      error?: { code?: unknown; message?: unknown };
      code?: unknown;
      message?: unknown;
    } | null;

    const rawCode = body?.error?.code ?? body?.code;
    const rawMsg = body?.error?.message ?? body?.message;
    const code = typeof rawCode === 'string' && rawCode.trim() ? rawCode.trim() : null;
    const message = typeof rawMsg === 'string' && rawMsg.trim() ? rawMsg.trim() : undefined;

    if (code === 'NOT_FOUND' || response.status === 404) {
      throw new NotFoundError(message);
    }
    if (code === 'ORIGIN_FORBIDDEN') {
      throw new RepositoryError(
        'ORIGIN_FORBIDDEN',
        message ?? '来源校验失败，请从原页面重新打开后再试。',
      );
    }
    if (code === 'OWNER_REQUIRED' || response.status === 403) {
      throw new ForbiddenError(message);
    }
    if (code === 'IDEMPOTENCY_CONFLICT') {
      throw new RepositoryError(
        'IDEMPOTENCY_CONFLICT',
        message ?? '请求编号冲突，请刷新后重试。',
      );
    }
    if (code === 'REVISION_CONFLICT' || response.status === 409) {
      throw new RevisionConflictError(message);
    }
    if (code === 'ROOM_CLOSED' || response.status === 410) {
      throw new RoomClosedError(message);
    }
    if (code === 'SESSION_REQUIRED') throw new RepositoryError(code, message ?? '请刷新页面恢复身份。');
    if (code === 'INVALID_INPUT' || response.status === 400) {
      throw new RepositoryError(
        'INVALID_INPUT',
        message ?? '输入参数不合法，请检查后重试。',
      );
    }
    throw new NetworkError(message ?? `请求失败（${response.status}），请稍后重试。`);
  }
}
