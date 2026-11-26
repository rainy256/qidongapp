import { normalizePicks } from '../domain/recommend';
import type {
  CreateRoomSpec,
  MyRoomSummary,
  RoomSnapshot,
  SaveMineInput,
  Submission,
  ViewerRoleState,
} from '../domain/types';
import { createSeedScenarios, type StoredScenario } from '../mocks/scenarios';
import {
  ForbiddenError,
  NetworkError,
  NotFoundError,
  RevisionConflictError,
  RoomClosedError,
  type RoomRepository,
  type SubscribeHandlers,
} from './repository';

export type DemoRole = 'guest' | 'member' | 'owner';

export type DemoControlState = Readonly<{
  role: DemoRole;
  offline: boolean;
  denyClipboard: boolean;
  failNextSave: boolean;
  conflictNextSave: boolean;
}>;

const PEER_POOL = ['阿星', '老K', '小橘', '大锤', 'CC'] as const;

export class MockRoomClient implements RoomRepository {
  private scenarios: Map<string, StoredScenario>;
  private guestMemberByRoom = new Map<string, string>();
  private mineRevisions = new Map<string, number>(); // key: `${roomId}:${memberId}`
  private mutationResults = new Map<string, RoomSnapshot>();
  private subscribers = new Map<string, Set<SubscribeHandlers>>();
  private controlListeners = new Set<() => void>();
  private createdRoomIds = new Set<string>();
  private deletedDemoIds = new Set<string>();
  private counter = 100;

  private controls: DemoControlState = {
    role: 'guest',
    offline: false,
    denyClipboard: false,
    failNextSave: false,
    conflictNextSave: false,
  };

  constructor() {
    this.scenarios = createSeedScenarios();
  }

  getControlState(): DemoControlState {
    return this.controls;
  }

  subscribeControls(listener: () => void): () => void {
    this.controlListeners.add(listener);
    return () => {
      this.controlListeners.delete(listener);
    };
  }

  private emitControlChange(): void {
    for (const fn of this.controlListeners) fn();
  }

  private resolveViewer(roomId: string, stored: StoredScenario): ViewerRoleState {
    let memberId: string | null = null;
    let canClose = false;

    if (this.controls.role === 'owner') {
      memberId = stored.ownerMemberId;
      canClose = true;
    } else if (this.controls.role === 'member') {
      memberId = stored.sampleMemberId ?? this.guestMemberByRoom.get(roomId) ?? null;
    } else {
      memberId = this.guestMemberByRoom.get(roomId) ?? null;
    }

    const revKey = memberId ? `${roomId}:${memberId}` : '';
    const hasExisting =
      memberId !== null && stored.room.submissions.some((s) => s.memberId === memberId);
    const mineRevision =
      memberId === null ? 0 : (this.mineRevisions.get(revKey) ?? (hasExisting ? 1 : 0));

    return { memberId, canClose, mineRevision };
  }

  private toSnapshot(roomId: string): RoomSnapshot {
    const stored = this.scenarios.get(roomId);
    if (!stored) {
      throw new NotFoundError();
    }
    return {
      ...stored.room,
      viewer: this.resolveViewer(roomId, stored),
    };
  }

  private broadcastRoom(roomId: string): void {
    const subs = this.subscribers.get(roomId);
    if (!subs || subs.size === 0) return;
    const snap = this.toSnapshot(roomId);
    for (const h of subs) {
      h.onSnapshot(snap);
    }
  }

  setRole(role: DemoRole, activeRoomId?: string): void {
    this.controls = { ...this.controls, role };
    this.emitControlChange();
    if (activeRoomId && this.scenarios.has(activeRoomId)) {
      this.broadcastRoom(activeRoomId);
    }
  }

  setFault(
    patch: Partial<Pick<DemoControlState, 'offline' | 'denyClipboard' | 'failNextSave' | 'conflictNextSave'>>,
    activeRoomId?: string,
  ): void {
    this.controls = { ...this.controls, ...patch };
    this.emitControlChange();
    if (activeRoomId && this.subscribers.has(activeRoomId)) {
      const subs = this.subscribers.get(activeRoomId)!;
      for (const h of subs) {
        h.onConnection(this.controls.offline ? 'offline' : 'live');
      }
      if (!this.controls.offline && this.scenarios.has(activeRoomId)) {
        this.broadcastRoom(activeRoomId);
      }
    }
  }

  setScenarioDuration(roomId: string, durationSlots: number): void {
    const stored = this.scenarios.get(roomId);
    if (!stored) return;
    this.scenarios.set(roomId, {
      ...stored,
      room: {
        ...stored.room,
        durationSlots,
        roomRevision: stored.room.roomRevision + 1,
        syncedAt: new Date().toISOString(),
      },
    });
    this.broadcastRoom(roomId);
  }

  simulatePeerSubmission(roomId: string): void {
    const stored = this.scenarios.get(roomId);
    if (!stored || stored.room.closedAt) return;
    const firstNight = stored.room.nights[0];
    if (!firstNight) return;

    const idx = ++this.counter;
    const name = PEER_POOL[idx % PEER_POOL.length];
    const spanLen = Math.min(stored.room.durationSlots + 1, firstNight.to - firstNight.from);
    const from = Math.min(firstNight.from + 2, firstNight.to - spanLen);
    const to = Math.min(firstNight.to, from + spanLen);

    const newSub: Submission = {
      memberId: `peer_${idx}`,
      nickname: `${name}${idx % 10}`,
      answer: {
        kind: 'available',
        picks: [{ nightId: firstNight.id, from, to }],
      },
      updatedAt: new Date().toISOString(),
    };

    this.scenarios.set(roomId, {
      ...stored,
      room: {
        ...stored.room,
        roomRevision: stored.room.roomRevision + 1,
        submissions: [...stored.room.submissions, newSub],
        syncedAt: new Date().toISOString(),
      },
    });
    this.broadcastRoom(roomId);
  }

  resetAll(activeRoomId?: string): void {
    this.scenarios = createSeedScenarios();
    this.guestMemberByRoom.clear();
    this.mineRevisions.clear();
    this.mutationResults.clear();
    this.createdRoomIds.clear();
    this.deletedDemoIds.clear();
    this.controls = {
      role: 'guest',
      offline: false,
      denyClipboard: false,
      failNextSave: false,
      conflictNextSave: false,
    };
    this.emitControlChange();
    if (activeRoomId && this.scenarios.has(activeRoomId)) {
      const subs = this.subscribers.get(activeRoomId);
      if (subs) {
        for (const h of subs) h.onConnection('live');
      }
      this.broadcastRoom(activeRoomId);
    }
  }

  async createRoom(spec: CreateRoomSpec, mutationId: string): Promise<RoomSnapshot> {
    if (this.controls.offline) {
      throw new NetworkError('当前处于离线状态，暂时无法创建房间。');
    }
    const cached = this.mutationResults.get(`create:${mutationId}`);
    if (cached) return cached;

    await delay(140);
    const id = `r-${(++this.counter).toString(36)}k`;
    const ownerMemberId = `owner_${id}`;
    const stored: StoredScenario = {
      room: {
        id,
        title: spec.title.trim() || '周末开黑局',
        gameTag: spec.gameTag,
        tzid: 'Asia/Shanghai',
        nights: spec.nights,
        targetPlayers: spec.targetPlayers,
        durationSlots: spec.durationSlots,
        roomRevision: 1,
        closedAt: null,
        submissions: [],
        syncedAt: new Date().toISOString(),
      },
      ownerMemberId,
      sampleMemberId: null,
    };
    this.scenarios.set(id, stored);
    this.createdRoomIds.add(id);
    // Creator automatically enters as owner in the browser session
    this.controls = { ...this.controls, role: 'owner' };
    this.emitControlChange();

    const snap = this.toSnapshot(id);
    this.mutationResults.set(`create:${mutationId}`, snap);
    return snap;
  }

  async getRoom(id: string, signal?: AbortSignal): Promise<RoomSnapshot> {
    if (this.controls.offline) {
      throw new NetworkError();
    }
    await delay(90, signal);
    return this.toSnapshot(id);
  }

  async saveMine(id: string, input: SaveMineInput): Promise<RoomSnapshot> {
    if (this.controls.offline) {
      throw new NetworkError();
    }
    if (this.controls.failNextSave) {
      this.controls = { ...this.controls, failNextSave: false };
      this.emitControlChange();
      throw new NetworkError('模拟保存失败：服务器暂时没响应，草稿已保留在本地。');
    }

    const cached = this.mutationResults.get(`save:${id}:${input.mutationId}`);
    if (cached) return cached;

    await delay(140);

    const stored = this.scenarios.get(id);
    if (!stored) throw new NotFoundError();
    if (stored.room.closedAt) throw new RoomClosedError();

    if (this.controls.conflictNextSave) {
      this.controls = { ...this.controls, conflictNextSave: false };
      this.emitControlChange();
      throw new RevisionConflictError();
    }

    const currentViewer = this.resolveViewer(id, stored);
    if (input.baseMineRevision !== currentViewer.mineRevision) {
      throw new RevisionConflictError();
    }

    const memberId = currentViewer.memberId ?? `u_guest_${++this.counter}`;
    if (this.controls.role === 'guest') {
      this.guestMemberByRoom.set(id, memberId);
    }

    const normalizedAnswer =
      input.answer.kind === 'available'
        ? { kind: 'available' as const, picks: normalizePicks(input.answer.picks, stored.room.nights) }
        : { kind: 'unavailable' as const };

    const cleanName = input.nickname.trim();
    const updatedSub: Submission = {
      memberId,
      nickname: cleanName || '朋友',
      answer: normalizedAnswer,
      updatedAt: new Date().toISOString(),
    };

    const existingIdx = stored.room.submissions.findIndex((s) => s.memberId === memberId);
    const nextSubmissions =
      existingIdx >= 0
        ? stored.room.submissions.map((s, i) => (i === existingIdx ? updatedSub : s))
        : [...stored.room.submissions, updatedSub];

    this.mineRevisions.set(`${id}:${memberId}`, currentViewer.mineRevision + 1);
    this.scenarios.set(id, {
      ...stored,
      room: {
        ...stored.room,
        roomRevision: stored.room.roomRevision + 1,
        submissions: nextSubmissions,
        syncedAt: new Date().toISOString(),
      },
    });

    const snap = this.toSnapshot(id);
    this.mutationResults.set(`save:${id}:${input.mutationId}`, snap);
    this.broadcastRoom(id);
    return snap;
  }

  async closeRoom(id: string, mutationId: string): Promise<RoomSnapshot> {
    if (this.controls.offline) {
      throw new NetworkError();
    }
    const cached = this.mutationResults.get(`close:${id}:${mutationId}`);
    if (cached) return cached;

    await delay(120);

    const stored = this.scenarios.get(id);
    if (!stored) throw new NotFoundError();
    const viewer = this.resolveViewer(id, stored);
    if (!viewer.canClose) throw new ForbiddenError();

    if (!stored.room.closedAt) {
      this.scenarios.set(id, {
        ...stored,
        room: {
          ...stored.room,
          roomRevision: stored.room.roomRevision + 1,
          closedAt: new Date().toISOString(),
          syncedAt: new Date().toISOString(),
        },
      });
    }

    const snap = this.toSnapshot(id);
    this.mutationResults.set(`close:${id}:${mutationId}`, snap);
    this.broadcastRoom(id);
    return snap;
  }

  async deleteRoom(id: string): Promise<void> {
    if (this.controls.offline) {
      throw new NetworkError();
    }
    await delay(100);

    const stored = this.scenarios.get(id);
    if (!stored) throw new NotFoundError();

    const canDelete =
      this.createdRoomIds.has(id) || id === 'demo-almost' || this.controls.role === 'owner';
    if (!canDelete) {
      throw new ForbiddenError('只有房主可以删除这个车队。');
    }

    this.scenarios.delete(id);
    this.createdRoomIds.delete(id);
    this.deletedDemoIds.add(id);

    const subs = this.subscribers.get(id);
    if (subs) {
      for (const h of subs) {
        h.onNotFound?.();
      }
      this.subscribers.delete(id);
    }
  }

  async listMyRooms(signal?: AbortSignal): Promise<readonly MyRoomSummary[]> {
    if (this.controls.offline) {
      throw new NetworkError();
    }
    await delay(60, signal);

    const summaries: MyRoomSummary[] = [];
    const createdList = Array.from(this.createdRoomIds).reverse();
    for (const id of createdList) {
      if (this.deletedDemoIds.has(id)) continue;
      const stored = this.scenarios.get(id);
      if (!stored) continue;
      summaries.push({
        id: stored.room.id,
        title: stored.room.title,
        gameTag: stored.room.gameTag,
        nights: stored.room.nights,
        targetPlayers: stored.room.targetPlayers,
        durationSlots: stored.room.durationSlots,
        submissionCount: stored.room.submissions.length,
        closedAt: stored.room.closedAt,
        createdAt: stored.room.syncedAt,
        role: 'owner',
      });
    }

    const demoEntries: readonly { id: string; role: 'owner' | 'member' }[] = [
      { id: 'demo-almost', role: 'owner' },
      { id: 'demo-ready', role: 'member' },
    ];
    for (const item of demoEntries) {
      if (this.createdRoomIds.has(item.id) || this.deletedDemoIds.has(item.id)) continue;
      const stored = this.scenarios.get(item.id);
      if (!stored) continue;
      summaries.push({
        id: stored.room.id,
        title: stored.room.title,
        gameTag: stored.room.gameTag,
        nights: stored.room.nights,
        targetPlayers: stored.room.targetPlayers,
        durationSlots: stored.room.durationSlots,
        submissionCount: stored.room.submissions.length,
        closedAt: stored.room.closedAt,
        createdAt: stored.room.syncedAt,
        role: item.role,
      });
    }

    return summaries;
  }

  subscribe(id: string, afterRevision: number, handlers: SubscribeHandlers): () => void {
    const set = this.subscribers.get(id) ?? new Set<SubscribeHandlers>();
    set.add(handlers);
    this.subscribers.set(id, set);

    handlers.onConnection(this.controls.offline ? 'offline' : 'live');

    if (!this.controls.offline && this.scenarios.has(id)) {
      const latest = this.toSnapshot(id);
      if (latest.roomRevision > afterRevision) {
        queueMicrotask(() => handlers.onSnapshot(latest));
      }
    }

    return () => {
      const current = this.subscribers.get(id);
      if (!current) return;
      current.delete(handlers);
      if (current.size === 0) {
        this.subscribers.delete(id);
      }
    };
  }
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export const mockRoomClient = new MockRoomClient();
