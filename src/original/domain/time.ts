import type { GameTag, Night, Slot, Span } from './types';

export const SLOT_MS = 30 * 60 * 1000;
export const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const WEEKDAYS_ZH = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const;

export type ShanghaiParts = Readonly<{
  year: number;
  month: number;
  day: number;
  weekday: number;
  weekdayLabel: string;
  dateKey: string;
  hour: number;
  minute: number;
  hhmm: string;
}>;

function parseDateKey(dateKey: string): { year: number; month: number; day: number } {
  const [y, m, d] = dateKey.split('-').map(Number);
  return { year: y, month: m, day: d };
}

export function addDaysToDateKey(dateKey: string, deltaDays: number): string {
  const { year, month, day } = parseDateKey(dateKey);
  const dt = new Date(Date.UTC(year, month - 1, day + deltaDays));
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function shanghaiToSlot(
  dateKey: string,
  hour: number,
  minute: 0 | 30 = 0,
  nextDay = false,
): Slot {
  const { year, month, day } = parseDateKey(dateKey);
  const utcMs =
    Date.UTC(year, month - 1, day + (nextDay ? 1 : 0), hour, minute, 0, 0) - SHANGHAI_OFFSET_MS;
  return Math.floor(utcMs / SLOT_MS);
}

export function slotToShanghaiParts(slot: Slot): ShanghaiParts {
  const shanghaiMs = slot * SLOT_MS + SHANGHAI_OFFSET_MS;
  const d = new Date(shanghaiMs);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const weekday = d.getUTCDay();
  const hour = d.getUTCHours();
  const minute = d.getUTCMinutes();
  const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const hhmm = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  return {
    year,
    month,
    day,
    weekday,
    weekdayLabel: WEEKDAYS_ZH[weekday],
    dateKey,
    hour,
    minute,
    hhmm,
  };
}

export function formatSlotInNight(slot: Slot, nightDateKey: string): string {
  const parts = slotToShanghaiParts(slot);
  return parts.dateKey !== nightDateKey ? `次日 ${parts.hhmm}` : parts.hhmm;
}

export function formatAxisTick(slot: Slot, nightDateKey: string): string {
  const parts = slotToShanghaiParts(slot);
  const hStr = String(parts.hour).padStart(2, '0');
  if (parts.dateKey !== nightDateKey && parts.hour === 0 && parts.minute === 0) {
    return '次日 00';
  }
  return parts.minute === 0 ? hStr : `${hStr}:${String(parts.minute).padStart(2, '0')}`;
}

export function formatNightWeekday(dateKey: string): string {
  const parts = slotToShanghaiParts(shanghaiToSlot(dateKey, 12, 0));
  return parts.weekdayLabel;
}

export function formatNightShort(dateKey: string): string {
  const parts = slotToShanghaiParts(shanghaiToSlot(dateKey, 12, 0));
  return `${parts.weekdayLabel} ${parts.day}`;
}

export function formatNightFull(dateKey: string): string {
  const parts = slotToShanghaiParts(shanghaiToSlot(dateKey, 12, 0));
  return `${parts.weekdayLabel} ${parts.month} 月 ${parts.day} 日`;
}

export function formatNightRangeHeader(nights: readonly Night[]): string {
  if (nights.length === 0) return '';
  const sorted = [...nights].sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  const first = slotToShanghaiParts(shanghaiToSlot(sorted[0].dateKey, 12, 0));
  if (sorted.length === 1) {
    return `${first.month} 月 ${first.day} 日`;
  }
  const last = slotToShanghaiParts(shanghaiToSlot(sorted[sorted.length - 1].dateKey, 12, 0));

  // Check if all nights are consecutive calendar days
  let consecutive = true;
  for (let i = 1; i < sorted.length; i++) {
    if (addDaysToDateKey(sorted[i - 1].dateKey, 1) !== sorted[i].dateKey) {
      consecutive = false;
      break;
    }
  }

  if (consecutive && first.month === last.month && first.year === last.year) {
    return `${first.month} 月 ${first.day}–${last.day} 日`;
  }
  if (consecutive) {
    return `${first.month} 月 ${first.day} 日–${last.month} 月 ${last.day} 日`;
  }
  return sorted
    .map((n) => {
      const p = slotToShanghaiParts(shanghaiToSlot(n.dateKey, 12, 0));
      return `${p.month}月${p.day}日`;
    })
    .join('、');
}

export function formatDuration(slots: number): string {
  const hours = slots * 0.5;
  return `${hours} 小时`;
}

export function formatSpanInNight(night: Night, span: Span): string {
  return `${formatSlotInNight(span.from, night.dateKey)}–${formatSlotInNight(span.to, night.dateKey)}`;
}

export function formatNightSpansSummary(night: Night, spans: readonly Span[]): string {
  if (spans.length === 0) return '';
  const day = formatNightWeekday(night.dateKey);
  const parts = spans.map((s) => formatSpanInNight(night, s)).join('、');
  return `${day} ${parts}`;
}

export function formatSyncClock(isoString: string): string {
  const ms = Date.parse(isoString);
  if (Number.isNaN(ms)) return '刚刚';
  const d = new Date(ms + SHANGHAI_OFFSET_MS);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function getTodayShanghaiDateKey(nowMs: number = Date.now()): string {
  const d = new Date(nowMs + SHANGHAI_OFFSET_MS);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export type NightPresetOption = Readonly<{
  dateKey: string;
  weekdayLabel: string;
  monthDayLabel: string;
  dayNumber: number;
  isWeekend: boolean;
}>;

export function buildUpcomingDateOptions(baseDateKey: string, count: number): NightPresetOption[] {
  const list: NightPresetOption[] = [];
  for (let i = 0; i < count; i++) {
    const dk = addDaysToDateKey(baseDateKey, i);
    const parts = slotToShanghaiParts(shanghaiToSlot(dk, 12, 0));
    list.push({
      dateKey: dk,
      weekdayLabel: parts.weekdayLabel,
      monthDayLabel: `${parts.month}/${parts.day}`,
      dayNumber: parts.day,
      isWeekend: parts.weekday === 5 || parts.weekday === 6 || parts.weekday === 0,
    });
  }
  return list;
}

export function buildNightWindow(
  dateKey: string,
  startHour: number,
  startMinute: 0 | 30,
  endHour: number,
  endMinute: 0 | 30,
): Night {
  const nextDay = endHour < startHour || (endHour === startHour && endMinute <= startMinute);
  const from = shanghaiToSlot(dateKey, startHour, startMinute, false);
  const to = shanghaiToSlot(dateKey, endHour, endMinute, nextDay);
  return {
    id: `n_${dateKey.replace(/-/g, '')}`,
    dateKey,
    from,
    to,
  };
}

export function daysBetweenDateKeys(a: string, b: string): number {
  const pa = parseDateKey(a);
  const pb = parseDateKey(b);
  const msA = Date.UTC(pa.year, pa.month - 1, pa.day);
  const msB = Date.UTC(pb.year, pb.month - 1, pb.day);
  return Math.round((msB - msA) / DAY_MS);
}

export function pickDefaultWeekendDates(options: readonly NightPresetOption[]): string[] {
  let run: string[] = [];
  for (const opt of options) {
    if (opt.isWeekend) {
      run.push(opt.dateKey);
    } else {
      if (run.length >= 2) return run.slice(0, 3);
      run = [];
    }
  }
  if (run.length >= 2) return run.slice(0, 3);
  return options.slice(0, 3).map((d) => d.dateKey);
}

export function formatSelectedDatesTitlePrefix(
  selectedDates: readonly string[],
  todayKey: string,
): string {
  const sorted = [...new Set(selectedDates)].sort();
  if (sorted.length === 0) return '';

  const partsOf = (dk: string) => slotToShanghaiParts(shanghaiToSlot(dk, 12, 0));

  if (sorted.length === 1) {
    const diff = daysBetweenDateKeys(todayKey, sorted[0]);
    if (diff === 0) return '今晚';
    if (diff === 1) return '明晚';
    const p = partsOf(sorted[0]);
    if (diff >= 2 && diff <= 6) return `${p.weekdayLabel}晚`;
    return `${p.month}月${p.day}日晚`;
  }

  const diffs = sorted.map((dk) => daysBetweenDateKeys(todayKey, dk));
  const allWithinSixDays = diffs.every((d) => d >= 0 && d <= 6);
  let consecutive = true;
  for (let i = 1; i < sorted.length; i++) {
    if (daysBetweenDateKeys(sorted[i - 1], sorted[i]) !== 1) {
      consecutive = false;
      break;
    }
  }

  const first = partsOf(sorted[0]);
  const last = partsOf(sorted[sorted.length - 1]);

  if (consecutive) {
    const weekdays = sorted.map((dk) => partsOf(dk).weekday);
    const isWeekendBlock =
      weekdays.every((w) => w === 5 || w === 6 || w === 0) &&
      weekdays.includes(6) &&
      weekdays.includes(0);
    if (isWeekendBlock) {
      return diffs[diffs.length - 1] <= 6 ? '周末' : '下周末';
    }
    if (allWithinSixDays) {
      return `${first.weekdayLabel}–${last.weekdayLabel}`;
    }
    if (first.year === last.year && first.month === last.month) {
      return `${first.month}月${first.day}–${last.day}日`;
    }
    return `${first.month}月${first.day}日–${last.month}月${last.day}日`;
  }

  if (sorted.length <= 3 && allWithinSixDays) {
    return sorted.map((dk) => partsOf(dk).weekdayLabel).join('、');
  }
  return `${first.month}月${first.day}日等${sorted.length}晚`;
}

export function buildPresetRoomTitle(
  gameTag: GameTag,
  selectedDates: readonly string[],
  todayKey: string,
  targetPlayers: number,
): string {
  if (gameTag === 'custom') return '';
  const prefix = formatSelectedDatesTitlePrefix(selectedDates, todayKey);
  const suffix =
    gameTag === 'apex'
      ? targetPlayers === 3
        ? 'Apex 三排'
        : targetPlayers === 2
          ? 'Apex 双排'
          : `Apex ${targetPlayers}人车`
      : gameTag === 'gta'
        ? 'GTA 抢劫分红车'
        : '塔科夫跑图车队';

  if (!prefix) return suffix;
  if (
    gameTag === 'tarkov' &&
    (prefix === '今晚' ||
      prefix === '明晚' ||
      prefix === '周末' ||
      prefix === '下周末' ||
      (prefix.endsWith('晚') && !prefix.includes('日')))
  ) {
    return `${prefix}${suffix}`;
  }
  return `${prefix} ${suffix}`;
}
