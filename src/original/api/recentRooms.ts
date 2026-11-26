import type { MyRoomRole, MyRoomSummary, RoomSnapshot } from '../domain/types';

export type StorageScope = 'prod' | 'mock';

const STORAGE_KEYS: Record<StorageScope, string> = {
  prod: 'qidong:my-rooms:v1',
  mock: 'qidong:my-rooms:mock:v1',
};

const MAX_STORED_ROOMS = 20;

function isValidSummary(item: unknown): item is MyRoomSummary {
  if (!item || typeof item !== 'object') return false;
  const r = item as Partial<MyRoomSummary>;
  return (
    typeof r.id === 'string' &&
    r.id.length > 0 &&
    typeof r.title === 'string' &&
    Array.isArray(r.nights) &&
    typeof r.targetPlayers === 'number' &&
    typeof r.durationSlots === 'number' &&
    typeof r.submissionCount === 'number' &&
    (r.closedAt === null || typeof r.closedAt === 'string') &&
    typeof r.createdAt === 'string' &&
    (r.role === 'owner' || r.role === 'member')
  );
}

function writeList(scope: StorageScope, rooms: readonly MyRoomSummary[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS[scope], JSON.stringify(rooms.slice(0, MAX_STORED_ROOMS)));
  } catch {
    // Private browsing or quota full — silently degrade.
  }
}

function sortRooms(rooms: readonly MyRoomSummary[]): MyRoomSummary[] {
  return [...rooms].sort((a, b) => {
    const aClosed = a.closedAt !== null ? 1 : 0;
    const bClosed = b.closedAt !== null ? 1 : 0;
    if (aClosed !== bClosed) return aClosed - bClosed;

    const aTime = a.lastVisitedAt ?? a.createdAt;
    const bTime = b.lastVisitedAt ?? b.createdAt;
    if (aTime !== bTime) return bTime.localeCompare(aTime);
    return b.createdAt.localeCompare(a.createdAt);
  });
}

export function readLocalMyRooms(scope: StorageScope): MyRoomSummary[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(STORAGE_KEYS[scope]);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return sortRooms(parsed.filter(isValidSummary)).slice(0, MAX_STORED_ROOMS);
  } catch {
    return [];
  }
}

export function upsertLocalMyRoom(scope: StorageScope, entry: MyRoomSummary): MyRoomSummary[] {
  const existing = readLocalMyRooms(scope);
  const prev = existing.find((r) => r.id === entry.id);
  const merged: MyRoomSummary = {
    ...entry,
    role: prev?.role === 'owner' || entry.role === 'owner' ? 'owner' : 'member',
    lastVisitedAt: entry.lastVisitedAt ?? prev?.lastVisitedAt ?? entry.createdAt,
  };
  const next = sortRooms([merged, ...existing.filter((r) => r.id !== entry.id)]).slice(
    0,
    MAX_STORED_ROOMS,
  );
  writeList(scope, next);
  return next;
}

export function recordRoomSnapshot(
  scope: StorageScope,
  snapshot: RoomSnapshot,
  roleOverride?: MyRoomRole,
): MyRoomSummary[] {
  const existing = readLocalMyRooms(scope);
  const prev = existing.find((r) => r.id === snapshot.id);

  let role: MyRoomRole | null = roleOverride ?? null;
  if (!role) {
    if (snapshot.viewer.canClose) {
      role = 'owner';
    } else if (snapshot.viewer.memberId !== null) {
      role = 'member';
    } else if (prev) {
      role = prev.role;
    }
  }

  if (!role) {
    return existing;
  }

  const nowIso = new Date().toISOString();
  const entry: MyRoomSummary = {
    id: snapshot.id,
    title: snapshot.title,
    ...(snapshot.gameTag ? { gameTag: snapshot.gameTag } : {}),
    nights: snapshot.nights,
    targetPlayers: snapshot.targetPlayers,
    durationSlots: snapshot.durationSlots,
    submissionCount: snapshot.submissions.length,
    closedAt: snapshot.closedAt,
    createdAt: prev?.createdAt ?? snapshot.syncedAt ?? nowIso,
    role: prev?.role === 'owner' || role === 'owner' ? 'owner' : 'member',
    lastVisitedAt: nowIso,
  };

  return upsertLocalMyRoom(scope, entry);
}

export function removeLocalMyRoom(scope: StorageScope, roomId: string): MyRoomSummary[] {
  const existing = readLocalMyRooms(scope);
  const next = existing.filter((r) => r.id !== roomId);
  if (next.length !== existing.length) {
    writeList(scope, next);
  }
  return next;
}

export function mergeMyRooms(
  remote: readonly MyRoomSummary[],
  local: readonly MyRoomSummary[],
): MyRoomSummary[] {
  const localMap = new Map<string, MyRoomSummary>();
  for (const item of local) {
    localMap.set(item.id, item);
  }

  const seen = new Set<string>();
  const combined: MyRoomSummary[] = [];

  for (const r of remote) {
    seen.add(r.id);
    const l = localMap.get(r.id);
    const lastVisitedAt =
      l?.lastVisitedAt && l.lastVisitedAt > (r.lastVisitedAt ?? r.createdAt)
        ? l.lastVisitedAt
        : (r.lastVisitedAt ?? l?.lastVisitedAt);
    combined.push({
      ...r,
      role: r.role === 'owner' || l?.role === 'owner' ? 'owner' : 'member',
      ...(lastVisitedAt ? { lastVisitedAt } : {}),
    });
  }

  for (const l of local) {
    if (!seen.has(l.id)) {
      combined.push(l);
    }
  }

  return sortRooms(combined).slice(0, MAX_STORED_ROOMS);
}
