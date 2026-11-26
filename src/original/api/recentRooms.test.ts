import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  mergeMyRooms,
  readLocalMyRooms,
  recordRoomSnapshot,
  removeLocalMyRoom,
} from './recentRooms';
import type { MyRoomSummary, RoomSnapshot } from '../domain/types';

function makeSnapshot(overrides: Partial<RoomSnapshot> = {}): RoomSnapshot {
  return {
    id: 'r-demo',
    title: '周五 Apex 三人车',
    gameTag: 'apex',
    tzid: 'Asia/Shanghai',
    nights: [{ id: 'n1', dateKey: '2026-11-27', from: 995670, to: 995682 }],
    targetPlayers: 3,
    durationSlots: 4,
    roomRevision: 1,
    closedAt: null,
    submissions: [],
    viewer: { memberId: null, canClose: true, mineRevision: 0 },
    syncedAt: '2026-11-25T10:00:00.000Z',
    ...overrides,
  };
}

function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => Array.from(map.keys())[i] ?? null,
    removeItem: (k) => {
      map.delete(k);
    },
    setItem: (k, v) => {
      map.set(k, v);
    },
  };
}

describe('recentRooms localStorage & D1 merge helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('records owner/member visits cleanly and ignores purely anonymous peeks', () => {
    vi.stubGlobal('localStorage', createMemoryStorage());

    recordRoomSnapshot(
      'prod',
      makeSnapshot({ id: 'r-peek', viewer: { memberId: null, canClose: false, mineRevision: 0 } }),
    );
    expect(readLocalMyRooms('prod')).toHaveLength(0);

    recordRoomSnapshot('prod', makeSnapshot({ id: 'r-owner' }));
    recordRoomSnapshot(
      'prod',
      makeSnapshot({
        id: 'r-member',
        title: '周六 GTA 四人局',
        viewer: { memberId: 'm1', canClose: false, mineRevision: 1 },
      }),
    );

    const list = readLocalMyRooms('prod');
    expect(list.map((r) => ({ id: r.id, role: r.role }))).toEqual([
      { id: 'r-member', role: 'member' },
      { id: 'r-owner', role: 'owner' },
    ]);

    removeLocalMyRoom('prod', 'r-member');
    expect(readLocalMyRooms('prod').map((r) => r.id)).toEqual(['r-owner']);
  });

  it('merges remote D1 creator rooms with local participant rooms and prefers live server counts', () => {
    const remote: MyRoomSummary[] = [
      {
        id: 'r-owner-1',
        title: '周五塔科夫五人车',
        gameTag: 'tarkov',
        nights: [{ id: 'n1', dateKey: '2026-11-27', from: 995670, to: 995682 }],
        targetPlayers: 5,
        durationSlots: 4,
        submissionCount: 4,
        closedAt: null,
        createdAt: '2026-11-25T08:00:00.000Z',
        role: 'owner',
      },
      {
        id: 'r-closed',
        title: '已收官房间',
        nights: [{ id: 'n1', dateKey: '2026-11-27', from: 995670, to: 995682 }],
        targetPlayers: 3,
        durationSlots: 4,
        submissionCount: 3,
        closedAt: '2026-11-25T11:00:00.000Z',
        createdAt: '2026-11-25T09:00:00.000Z',
        role: 'owner',
      },
    ];
    const local: MyRoomSummary[] = [
      {
        id: 'r-owner-1',
        title: '周五塔科夫五人车',
        gameTag: 'tarkov',
        nights: [{ id: 'n1', dateKey: '2026-11-27', from: 995670, to: 995682 }],
        targetPlayers: 5,
        durationSlots: 4,
        submissionCount: 0, // stale local count
        closedAt: null,
        createdAt: '2026-11-25T08:00:00.000Z',
        role: 'owner',
        lastVisitedAt: '2026-11-25T10:30:00.000Z',
      },
      {
        id: 'r-member-2',
        title: '群友发起的 GTA',
        gameTag: 'gta',
        nights: [{ id: 'n1', dateKey: '2026-11-28', from: 995718, to: 995730 }],
        targetPlayers: 4,
        durationSlots: 4,
        submissionCount: 2,
        closedAt: null,
        createdAt: '2026-11-25T07:00:00.000Z',
        role: 'member',
        lastVisitedAt: '2026-11-25T09:30:00.000Z',
      },
    ];

    const merged = mergeMyRooms(remote, local);
    // Active rooms come before closed rooms, sorted newest first; server count (4) overrides stale local (0)
    expect(merged.map((r) => r.id)).toEqual(['r-owner-1', 'r-member-2', 'r-closed']);
    expect(merged[0].submissionCount).toBe(4);
    expect(merged[0].lastVisitedAt).toBe('2026-11-25T10:30:00.000Z');

    // Clearing localStorage still recovers all D1 owner rooms cleanly
    expect(mergeMyRooms(remote, []).map((r) => r.id)).toEqual(['r-owner-1', 'r-closed']);

    // Member-only remote/local entries retain member role instead of promoting to owner
    const memberOnly = mergeMyRooms(
      [{ ...remote[0], id: 'r-m', role: 'member' }],
      [],
    );
    expect(memberOnly[0].role).toBe('member');
  });
});
