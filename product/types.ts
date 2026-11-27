import type { GameTag, Span } from '../src/original/domain/types';
import { apiEndpoint, fetchWithTimeout, bearerAuth } from './http';

export type WeekSpan = { day: number; from: number; to: number };

export type Member = {
  id: string;
  nickname: string;
  schedule: Span[];
  schedule_revision: number;
  scheduleStatus?: 'available' | 'unavailable' | 'unanswered';
  last_seen: number | null;
  available_until?: number | null;
  availability_revision?: number;
  template?: WeekSpan[];
  overrideDays?: number[];
};

export type SavedSchedule = Pick<Member, 'schedule' | 'schedule_revision' | 'scheduleStatus' | 'template' | 'overrideDays'>;

export function scheduleFields(member: SavedSchedule): SavedSchedule {
  const {schedule, schedule_revision, scheduleStatus, template, overrideDays} = member;
  return {schedule, schedule_revision, scheduleStatus, template, overrideDays};
}

export type Invite = {
  id: string;
  creator: string;
  game: GameTag;
  title: string;
  created_at: number;
  expires_at: number;
  revision: number;
  r1: string;
  r2: string;
  r3: string;
  r1_eta?: number | null;
  r2_eta?: number | null;
  r3_eta?: number | null;
  status: 'pending' | 'assembled' | 'expired';
};

export type Message = {
  id: string;
  invite_id: string;
  kind: 'invite' | 'reply' | 'assembled';
  actor: string;
  detail: string;
  created_at: number;
  read_at: number | null;
};

export type Reservation = {
  id: string;
  creator: string;
  game: GameTag;
  title: string;
  from_slot: number;
  to_slot: number;
  state: 'pending' | 'confirmed' | 'cancelled';
  r1: number;
  r2: number;
  r3: number;
  revision: number;
};

export type ReservationMessage = {
  id: string;
  reservation_id: string;
  detail: string;
  created_at: number;
  read_at: number | null;
};

export type Nudge = {
  id: string;
  invite_id: string;
  detail: string;
  created_at: number;
  status: string;
};

export type ReservationDraft = { game: GameTag; title: string; from: number | null };

export type Snapshot = {
  clientClock?: number;
  features?: { rebook: boolean };
  reservations: Reservation[];
  reservationMessages: ReservationMessage[];
  nudges: Nudge[];
  me: { id: string; nickname: string };
  members: Member[];
  invites: Invite[];
  messages: Message[];
  now: number;
};

export type Page = 'home' | 'schedule' | 'messages' | 'me';

export type WriteFn = (
  path: string,
  input: object,
  versioned?: boolean,
  actionKey?: string,
) => Promise<boolean>;

export const REPLY_LABELS: Record<string, string> = {
  pending: '待回复',
  ready: '马上来',
  '5': '等5分钟',
  '10': '等10分钟',
  '30': '等30分钟',
  no: '今天不玩',
};

export const GAME_LABELS: Record<GameTag, string> = {
  apex: 'Apex',
  gta: 'GTA',
  tarkov: '塔科夫',
  custom: '自定义',
};

export function memberReply(inv: Invite, id: string): string {
  return id === 'm1' ? inv.r1 : id === 'm2' ? inv.r2 : inv.r3;
}

export function memberEta(inv: Invite, id: string): number | null {
  return (id === 'm1' ? inv.r1_eta : id === 'm2' ? inv.r2_eta : inv.r3_eta) ?? null;
}

export function tonightDeadline(now: number): number {
  return Math.floor((now + 28800000) / 86400000) * 86400000 - 28800000 + 23 * 3600000;
}

const clockFormat = new Intl.DateTimeFormat('zh-CN', {timeZone:'Asia/Shanghai',hour12:false,hour:'2-digit',minute:'2-digit'});
const stampFormat = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', hour12: false, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
});

export function relativeTime(ms: number, now: number): string {
  const day = (v: number) => Math.floor((v + 28800000) / 86400000);
  const time = clockFormat.format(ms);
  const delta = day(ms) - day(now);
  return delta === 0 ? time : delta === 1 ? '明天 ' + time : delta === -1 ? '昨天 ' + time : formatTimestamp(ms);
}

export function formatTimestamp(ms: number): string {
  return stampFormat.format(ms);
}

export function formatSlotStamp(slot: number): string {
  return formatTimestamp(slot * 1800000);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

export async function apiRequest<T>(
  apiBase: string,
  path: string,
  token: string | null,
  input?: object,
  signal?: AbortSignal,
): Promise<T> {
  return fetchWithTimeout(apiEndpoint(apiBase, path), {
    method: input ? 'POST' : 'GET',
    signal,
    headers: {
      ...bearerAuth(token),
      ...(input ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(input ? { body: JSON.stringify(input) } : {}),
  }, async res => {
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new ApiError(res.status, data?.error || 'request_failed');
    }
    return await res.json() as T;
  }, path === '/api/state' && !input ? 20000 : undefined);
}

export function formatErrorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === 'reservation_conflict') return '这个时间已有预约，请查看已有预约或改选其他时段';
    if (e.status === 409) return '数据已更新或邀请已过期，请刷新后重试';
    if (e.status === 401) return '身份凭证无效，请联系管理员';
    if (e.status === 429) return '操作过于频繁，请稍后重试';
    if (e.code === 'push_key_not_configured') return '通知加密密钥尚未配置，请联系管理员';
    if (e.status === 400) return '输入内容不符合要求';
    return `服务端请求失败（${e.status}）`;
  }
  if (e instanceof Error && e.name === 'AbortError') return '等待服务器响应超时';
  if (e instanceof SyntaxError) return '服务器响应格式异常';
  return '无法连接到服务器，请重试';
}
