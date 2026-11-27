import {scheduleFields, type Invite, type Reservation, type SavedSchedule, type Snapshot} from './types';

export type WriteResult = Partial<SavedSchedule> & {
  invite?: Invite;
  reservation?: Reservation;
  availability_revision?: number;
  available_until?: number | null;
};

function updateRow<T extends {id: string; revision: number}>(rows: T[], saved: T) {
  const previous = rows.find(row => row.id === saved.id);
  if (!previous) return [...rows, saved];
  return rows.map(row => row.id === saved.id && row.revision <= saved.revision ? saved : row);
}

export function applyConfirmedWrite(snap: Snapshot, path: string, input: object, saved: WriteResult): Snapshot {
  if (saved.invite) {
    const invites = updateRow(snap.invites, saved.invite).sort((a, b) => b.created_at - a.created_at);
    return {...snap, invites: invites.slice(0, 20)};
  }
  if (saved.reservation) {
    const reservations = updateRow(snap.reservations, saved.reservation).sort((a, b) => a.from_slot - b.from_slot);
    return {...snap, reservations: reservations.slice(0, 50)};
  }
  if (Array.isArray(saved.schedule) && typeof saved.schedule_revision === 'number') {
    const fields = scheduleFields({...saved, schedule: saved.schedule, schedule_revision: saved.schedule_revision});
    return {...snap, members: snap.members.map(m =>
      m.id === snap.me.id && m.schedule_revision <= fields.schedule_revision ? {...m, ...fields} : m)};
  }
  if (path === '/api/availability' && typeof saved.availability_revision === 'number') {
    const revision = saved.availability_revision;
    return {...snap, members: snap.members.map(m =>
      m.id === snap.me.id && (m.availability_revision ?? 0) <= revision
        ? {...m, availability_revision: revision, available_until: saved.available_until ?? null} : m)};
  }
  if (path === '/api/profile' && 'nickname' in input && typeof input.nickname === 'string') {
    const nickname = input.nickname.trim();
    return {...snap, me: {...snap.me, nickname}, members: snap.members.map(m => m.id === snap.me.id ? {...m, nickname} : m)};
  }
  if ('id' in input) {
    const markRead = <T extends {id: string; read_at: number | null}>(row: T) =>
      row.id === input.id && !row.read_at ? {...row, read_at: snap.now} : row;
    if (path === '/api/messages/read') return {...snap, messages: snap.messages.map(markRead)};
    if (path === '/api/reservation-messages/read') return {...snap, reservationMessages: snap.reservationMessages.map(markRead)};
  }
  return snap;
}
