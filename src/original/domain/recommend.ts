import {
  formatDuration,
  formatNightRangeHeader,
  formatNightWeekday,
  formatSlotInNight,
  formatSpanInNight,
  formatSyncClock,
} from './time';
import type {
  Candidate,
  GameTag,
  Night,
  Pick,
  RecommendInput,
  RoomSnapshot,
  Slot,
  Span,
  Submission,
} from './types';

export function inferGameTag(title: string, explicit?: GameTag): GameTag {
  if (explicit) return explicit;
  const lower = title.toLowerCase();
  if (lower.includes('apex')) return 'apex';
  if (lower.includes('gta')) return 'gta';
  if (title.includes('塔科夫') || title.includes('塔可夫') || lower.includes('tarkov')) return 'tarkov';
  return 'custom';
}

/**
 * Sort and merge overlapping or immediately adjacent [from, to) intervals.
 * Strictly preserves real gaps of >= 1 slot (e.g. a 30-min or 1-hour dinner break).
 */
export function mergeSpans(spans: readonly Span[]): Span[] {
  const valid = spans
    .filter((s) => Number.isInteger(s.from) && Number.isInteger(s.to) && s.to > s.from)
    .map((s) => ({ from: s.from, to: s.to }))
    .sort((a, b) => a.from - b.from || a.to - b.to);

  if (valid.length === 0) return [];

  const merged: { from: Slot; to: Slot }[] = [{ ...valid[0] }];
  for (let i = 1; i < valid.length; i++) {
    const next = valid[i];
    const last = merged[merged.length - 1];
    if (next.from <= last.to) {
      last.to = Math.max(last.to, next.to);
    } else {
      merged.push({ ...next });
    }
  }
  return merged;
}

/**
 * Normalize a list of picks onto valid night boundaries and merge adjacent intervals per night.
 */
export function normalizePicks(picks: readonly Pick[], nights: readonly Night[]): Pick[] {
  const nightMap = new Map(nights.map((n) => [n.id, n]));
  const perNight = new Map<string, Span[]>();

  for (const pick of picks) {
    const night = nightMap.get(pick.nightId);
    if (!night) continue;
    const from = Math.max(night.from, pick.from);
    const to = Math.min(night.to, pick.to);
    if (to <= from) continue;
    const list = perNight.get(night.id) ?? [];
    list.push({ from, to });
    perNight.set(night.id, list);
  }

  const result: Pick[] = [];
  for (const night of nights) {
    const spans = mergeSpans(perNight.get(night.id) ?? []);
    for (const s of spans) {
      result.push({ nightId: night.id, from: s.from, to: s.to });
    }
  }
  return result;
}

function compareCandidates(a: Candidate, b: Candidate): number {
  const aReady = a.missingPlayers === 0 ? 0 : 1;
  const bReady = b.missingPlayers === 0 ? 0 : 1;
  if (aReady !== bReady) return aReady - bReady;

  if (a.missingPlayers !== b.missingPlayers) {
    return a.missingPlayers - b.missingPlayers;
  }

  if (a.firstStart !== b.firstStart) {
    return a.firstStart - b.firstStart;
  }

  const aSpan = a.availableUntil - a.firstStart;
  const bSpan = b.availableUntil - b.firstStart;
  if (aSpan !== bSpan) {
    return bSpan - aSpan;
  }

  if (a.memberIds.length !== b.memberIds.length) {
    return b.memberIds.length - a.memberIds.length;
  }

  const nightCmp = a.nightId.localeCompare(b.nightId);
  if (nightCmp !== 0) return nightCmp;

  return a.memberIds.join(',').localeCompare(b.memberIds.join(','));
}

/**
 * Pure recommendation engine:
 * Requires every member in a candidate cohort to be continuously available for the FULL
 * [s, s + durationSlots) interval (never summing per-slot counts across different rosters),
 * then coalesces contiguous start slots that share the exact same continuous cohort intersection.
 */
export function recommend(input: RecommendInput): Candidate[] {
  if (
    !Number.isInteger(input.targetPlayers) ||
    input.targetPlayers <= 0 ||
    !Number.isInteger(input.durationSlots) ||
    input.durationSlots <= 0 ||
    input.nights.length === 0
  ) {
    return [];
  }

  // Deduplicate submissions by memberId (one current answer per member per room)
  const latestByMember = new Map<string, Submission>();
  for (const sub of input.submissions) {
    if (!sub.memberId) continue;
    latestByMember.set(sub.memberId, sub);
  }

  const nightById = new Map<string, Night>();
  const validNights: Night[] = [];
  for (const n of input.nights) {
    if (n.to > n.from && !nightById.has(n.id)) {
      nightById.set(n.id, n);
      validNights.push(n);
    }
  }

  // Build normalized per-night merged spans for each available member
  const memberNightSpans = new Map<string, Map<string, Span[]>>();
  for (const [memberId, sub] of latestByMember.entries()) {
    if (sub.answer.kind !== 'available') continue;
    const perNight = new Map<string, Span[]>();
    for (const pick of sub.answer.picks) {
      const night = nightById.get(pick.nightId);
      if (!night) continue;
      const from = Math.max(night.from, pick.from);
      const to = Math.min(night.to, pick.to);
      if (to <= from) continue;
      const list = perNight.get(night.id) ?? [];
      list.push({ from, to });
      perNight.set(night.id, list);
    }
    const mergedPerNight = new Map<string, Span[]>();
    for (const [nid, spans] of perNight.entries()) {
      const merged = mergeSpans(spans);
      if (merged.length > 0) mergedPerNight.set(nid, merged);
    }
    if (mergedPerNight.size > 0) {
      memberNightSpans.set(memberId, mergedPerNight);
    }
  }

  const sortedMemberIds = [...memberNightSpans.keys()].sort();
  const seenKeys = new Set<string>();
  const candidates: Candidate[] = [];

  for (const night of validNights) {
    const minStart = Math.max(night.from, input.earliestStart);
    const maxStart = night.to - input.durationSlots;
    if (maxStart < minStart) continue;

    for (let s = minStart; s <= maxStart; s++) {
      const windowEnd = s + input.durationSlots;
      const coveringIds: string[] = [];
      let intersectionStart = night.from;
      let intersectionEnd = night.to;

      for (const memberId of sortedMemberIds) {
        const spans = memberNightSpans.get(memberId)?.get(night.id);
        if (!spans) continue;
        const covering = spans.find((sp) => sp.from <= s && sp.to >= windowEnd);
        if (!covering) continue;
        coveringIds.push(memberId);
        if (covering.from > intersectionStart) intersectionStart = covering.from;
        if (covering.to < intersectionEnd) intersectionEnd = covering.to;
      }

      if (coveringIds.length === 0) continue;

      const firstStart = Math.max(intersectionStart, input.earliestStart);
      const lastStart = intersectionEnd - input.durationSlots;
      if (lastStart < firstStart) continue;

      const dedupeKey = `${night.id}|${coveringIds.join(',')}|${firstStart}|${intersectionEnd}`;
      if (seenKeys.has(dedupeKey)) continue;
      seenKeys.add(dedupeKey);

      candidates.push({
        nightId: night.id,
        memberIds: coveringIds,
        firstStart,
        lastStart,
        availableUntil: intersectionEnd,
        missingPlayers: Math.max(0, input.targetPlayers - coveringIds.length),
      });
    }
  }

  candidates.sort(compareCandidates);
  return candidates;
}

export type DisplayRecommendations = Readonly<{
  primary: Candidate | null;
  alternatives: readonly Candidate[];
}>;

/**
 * Curate primary + compact non-redundant alternatives for the Recommendation Card:
 * - Ready (missingPlayers === 0): show primary + up to 3 other ready options (preferring different nights/windows).
 * - Almost ready (missingPlayers === 1): show primary + up to 2 distinct 1-short options.
 * - Missing >= 2: show primary only ("目前最多 N 人能一起玩满 T 小时").
 */
export function pickDisplayCandidates(candidates: readonly Candidate[]): DisplayRecommendations {
  if (candidates.length === 0) {
    return { primary: null, alternatives: [] };
  }

  const primary = candidates[0];
  if (primary.missingPlayers >= 2) {
    return { primary, alternatives: [] };
  }

  const targetMissing = primary.missingPlayers === 0 ? 0 : 1;
  const maxAlts = primary.missingPlayers === 0 ? 3 : 2;
  const alternatives: Candidate[] = [];
  const usedSignatures = new Set<string>([`${primary.nightId}:${primary.firstStart}`]);

  for (let i = 1; i < candidates.length; i++) {
    const c = candidates[i];
    if (c.missingPlayers > targetMissing) break;
    // Skip strict subset on the exact same night & start when primary already covers it
    const sig = `${c.nightId}:${c.firstStart}`;
    if (usedSignatures.has(sig) && c.memberIds.length <= primary.memberIds.length) {
      continue;
    }
    usedSignatures.add(sig);
    alternatives.push(c);
    if (alternatives.length >= maxAlts) break;
  }

  return { primary, alternatives };
}

export type SlotDensityCell = Readonly<{
  slot: Slot;
  count: number;
  memberNames: readonly string[];
}>;

export type MergedDensityRun = Readonly<{
  from: Slot;
  to: Slot;
  count: number;
  memberNames: readonly string[];
}>;

export function computeOthersSlotAvailability(
  night: Night,
  submissions: readonly Submission[],
  excludeMemberId: string | null,
): SlotDensityCell[] {
  const cells: SlotDensityCell[] = [];
  const relevant = submissions.filter(
    (s) => s.memberId !== excludeMemberId && s.answer.kind === 'available',
  );

  // Pre-normalize each participant's spans for this night
  const participantSpans = relevant.map((sub) => {
    const picks = sub.answer.kind === 'available' ? sub.answer.picks : [];
    const spans = mergeSpans(
      picks
        .filter((p) => p.nightId === night.id)
        .map((p) => ({ from: Math.max(night.from, p.from), to: Math.min(night.to, p.to) })),
    );
    return { nickname: sub.nickname, spans };
  });

  for (let slot = night.from; slot < night.to; slot++) {
    const names: string[] = [];
    for (const p of participantSpans) {
      if (p.spans.some((sp) => sp.from <= slot && sp.to > slot)) {
        names.push(p.nickname);
      }
    }
    cells.push({
      slot,
      count: names.length,
      memberNames: names,
    });
  }

  return cells;
}

export function mergeDensityRuns(cells: readonly SlotDensityCell[]): MergedDensityRun[] {
  const runs: MergedDensityRun[] = [];
  for (const cell of cells) {
    if (cell.count === 0) continue;
    const prev = runs[runs.length - 1];
    const sameRoster =
      prev &&
      prev.to === cell.slot &&
      prev.memberNames.length === cell.memberNames.length &&
      prev.memberNames.every((n, idx) => n === cell.memberNames[idx]);
    if (sameRoster) {
      runs[runs.length - 1] = {
        ...prev,
        to: cell.slot + 1,
      };
    } else {
      runs.push({
        from: cell.slot,
        to: cell.slot + 1,
        count: cell.count,
        memberNames: cell.memberNames,
      });
    }
  }
  return runs;
}

export function computeOverlapSpans(
  cells: readonly SlotDensityCell[],
  minCount = 2,
): Span[] {
  const spans: Span[] = [];
  for (const cell of cells) {
    if (cell.count < minCount) continue;
    const prev = spans[spans.length - 1];
    if (prev && prev.to === cell.slot) {
      spans[spans.length - 1] = { from: prev.from, to: cell.slot + 1 };
    } else {
      spans.push({ from: cell.slot, to: cell.slot + 1 });
    }
  }
  return spans;
}

export function getHeatLevel(
  count: number,
  peakCount: number,
): 0 | 1 | 2 | 3 | 4 | 5 {
  if (count <= 0) return 0;
  if (peakCount <= 1) return 1;
  if (count >= peakCount) return 5;
  if (count === 1) return 1;
  const t = (count - 1) / (peakCount - 1);
  if (t >= 0.66) return 4;
  if (t >= 0.34) return 3;
  return 2;
}

export type DraftFeedback = Readonly<{
  tone: 'ready' | 'almost' | 'info' | 'warning';
  message: string;
}>;

const DRAFT_ME_ID = '__draft_me__';

/**
 * Evaluate what happens if the user saves their current draft right now.
 * Replaces their previous submission with the current draft and runs `recommend()`.
 */
export function computeDraftFeedback(
  snapshot: RoomSnapshot,
  draftPicks: readonly Pick[],
  draftMode: 'available' | 'unavailable',
  isDirty: boolean,
  earliestStart: Slot,
): DraftFeedback | null {
  if (snapshot.closedAt) return null;

  const myId = snapshot.viewer.memberId;
  const suffix = isDirty ? ' 尚未保存。' : '';

  if (draftMode === 'unavailable') {
    return {
      tone: 'info',
      message: isDirty
        ? '已标记为「这次都不行」，保存后将向大家同步。'
        : '你已标记这次都不行，随时可重新选时段。',
    };
  }

  const normalizedPicks = normalizePicks(draftPicks, snapshot.nights);
  if (normalizedPicks.length === 0) {
    return null;
  }

  const maxPickLen = Math.max(...normalizedPicks.map((p) => p.to - p.from));
  if (maxPickLen < snapshot.durationSlots) {
    return {
      tone: 'warning',
      message: `当前所选时段不足 ${formatDuration(snapshot.durationSlots)}，仍可保存供大家参考。${suffix}`,
    };
  }

  const others = snapshot.submissions.filter((s) => s.memberId !== myId);
  const draftSub: Submission = {
    memberId: DRAFT_ME_ID,
    nickname: '你',
    answer: { kind: 'available', picks: normalizedPicks },
    updatedAt: snapshot.syncedAt,
  };

  const withDraft = recommend({
    nights: snapshot.nights,
    targetPlayers: snapshot.targetPlayers,
    durationSlots: snapshot.durationSlots,
    earliestStart,
    submissions: [...others, draftSub],
  });

  // Check only candidates that include the current draft
  const withMe = withDraft.filter((c) => c.memberIds.includes(DRAFT_ME_ID));
  if (withMe.length === 0) {
    return {
      tone: 'info',
      message: `已选 ${normalizedPicks.length} 段时段，保存后大家就能看到你的空余时间。${suffix}`,
    };
  }

  const bestWithMe = withMe[0];
  const night = snapshot.nights.find((n) => n.id === bestWithMe.nightId);
  const nightPrefix = night ? formatNightWeekday(night.dateKey) : '';
  const startStr = night ? formatSlotInNight(bestWithMe.firstStart, night.dateKey) : '';

  if (bestWithMe.missingPlayers === 0) {
    if (bestWithMe.memberIds.length === snapshot.targetPlayers) {
      return {
        tone: 'ready',
        message: `算上你，${nightPrefix} ${startStr} 就能凑齐 ${snapshot.targetPlayers} 人。${suffix}`.trim(),
      };
    }
    return {
      tone: 'ready',
      message: `算上你，${nightPrefix} ${startStr} 共有 ${bestWithMe.memberIds.length} 人能玩满 ${formatDuration(snapshot.durationSlots)}。${suffix}`.trim(),
    };
  }

  if (bestWithMe.missingPlayers === 1) {
    return {
      tone: 'almost',
      message: `算上你，${nightPrefix} ${startStr} 已有 ${bestWithMe.memberIds.length} 人能开，只差最后 1 人。${suffix}`.trim(),
    };
  }

  return {
    tone: 'info',
    message: `算上你，${nightPrefix} ${startStr} 已有 ${bestWithMe.memberIds.length} 人能连玩 ${formatDuration(snapshot.durationSlots)}。${suffix}`.trim(),
  };
}

export function formatMemberListZh(names: readonly string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]}和${names[1]}`;
  return `${names.slice(0, -1).join('、')}和${names[names.length - 1]}`;
}

export type RoomShareMeta = Readonly<{
  title: string;
  description: string;
  imageUrl: string;
  canonicalUrl: string;
}>;

export type RoomCompletionState = 'open' | 'settled' | 'closed-incomplete';

export function getRoomCompletionState(
  closedAt: string | null,
  candidate: Candidate | null,
): RoomCompletionState {
  if (closedAt === null) return 'open';
  return candidate?.missingPlayers === 0 ? 'settled' : 'closed-incomplete';
}

export function formatCandidateProgress(candidate: Candidate, targetPlayers: number): string {
  if (candidate.missingPlayers === 0) {
    return candidate.memberIds.length > targetPlayers
      ? `已有 ${candidate.memberIds.length} 人有空，已满足 ${targetPlayers} 人发车条件`
      : `已凑齐 ${candidate.memberIds.length}/${targetPlayers} 人`;
  }
  return `已有 ${candidate.memberIds.length}/${targetPlayers} 人重合 · 还差 ${candidate.missingPlayers} 人`;
}

export function formatCandidateBadge(candidate: Candidate, targetPlayers: number): string {
  if (candidate.missingPlayers > 0) return `还差 ${candidate.missingPlayers} 人`;
  return candidate.memberIds.length === targetPlayers
    ? `${targetPlayers} 人可开`
    : `${candidate.memberIds.length} 人有空 · ${targetPlayers} 人可开`;
}

export function buildRoomShareMeta(
  snapshot: Readonly<{
    id: string;
    title: string;
    gameTag?: GameTag;
    nights: readonly Night[];
    targetPlayers: number;
    durationSlots: number;
    closedAt: string | null;
    submissions: readonly Submission[];
  }>,
  origin: string,
): RoomShareMeta {
  const earliestStart = snapshot.nights[0]?.from ?? 0;
  const candidates = recommend({
    nights: snapshot.nights,
    targetPlayers: snapshot.targetPlayers,
    durationSlots: snapshot.durationSlots,
    earliestStart,
    submissions: snapshot.submissions,
  });
  const primary = candidates[0] ?? null;
  const completionState = getRoomCompletionState(snapshot.closedAt, primary);

  const availableCount = snapshot.submissions.filter((s) => s.answer.kind === 'available').length;
  const unavailableCount = snapshot.submissions.length - availableCount;
  const totalSubmitted = snapshot.submissions.length;

  const gameTag = inferGameTag(snapshot.title, snapshot.gameTag);
  const cleanOrigin = origin.replace(/\/+$/, '');
  const imageUrl = `${cleanOrigin}/art/game-${gameTag}.png`;
  const canonicalUrl = `${cleanOrigin}/r/${encodeURIComponent(snapshot.id)}`;
  const dateRange = formatNightRangeHeader(snapshot.nights);
  const durationText = formatDuration(snapshot.durationSlots);

  const night = primary ? snapshot.nights.find((n) => n.id === primary.nightId) : undefined;
  const nameMap = new Map(snapshot.submissions.map((s) => [s.memberId, s.nickname]));
  const names = primary ? primary.memberIds.map((id) => nameMap.get(id) ?? id) : [];
  const dayLabel = night ? formatNightWeekday(night.dateKey) : '';
  const startLabel = primary && night ? formatSlotInNight(primary.firstStart, night.dateKey) : '';
  const endLabel =
    primary && night ? formatSlotInNight(primary.availableUntil, night.dateKey) : '';

  let title: string;
  if (completionState === 'settled' && primary && night) {
    title = `【已定场】${snapshot.title} · ${dayLabel} ${startLabel} 开`;
  } else if (completionState === 'closed-incomplete') {
    const progress = primary && night ? ` · ${formatCandidateProgress(primary, snapshot.targetPlayers)}` : '';
    title = `【收集已结束·未凑齐】${snapshot.title}${progress}`;
  } else if (totalSubmitted === 0) {
    title = `【${snapshot.title}】0/${snapshot.targetPlayers} 人已填 · 点击上车`;
  } else if (primary && night && primary.missingPlayers === 0) {
    title = `【${snapshot.title}】${formatCandidateProgress(primary, snapshot.targetPlayers)} · ${dayLabel} ${startLabel} 开`;
  } else if (primary && night) {
    title = `【${snapshot.title}】${formatCandidateProgress(primary, snapshot.targetPlayers)}`;
  } else {
    title = `【${snapshot.title}】已有 ${totalSubmitted} 人填完 · 点击来凑时间`;
  }

  let description: string;
  if (completionState === 'settled' && primary && night) {
    const settledCountNote =
      names.length > snapshot.targetPlayers
        ? `${names.length} 人已定场，满足 ${snapshot.targetPlayers} 人发车条件`
        : `${names.length} 人已定场`;
    description = `${dayLabel} ${startLabel}–${endLabel}，${formatMemberListZh(names)}（${settledCountNote}，至少玩 ${durationText}）。`;
  } else if (completionState === 'closed-incomplete' && primary && night) {
    description = `${dayLabel} ${startLabel}–${endLabel}，${formatMemberListZh(names)}（${formatCandidateProgress(primary, snapshot.targetPlayers)}）；本次收集已结束，未达到发车人数要求。`;
  } else if (completionState === 'closed-incomplete') {
    description = `${dateRange}，本次收集已结束，未凑出满足人数和时长要求的重合时段，点击查看最终记录。`;
  } else if (totalSubmitted === 0) {
    description = `${dateRange}，${snapshot.targetPlayers} 人发车（至少玩 ${durationText}），免登录点开直接选空余时间。`;
  } else if (primary && night && primary.missingPlayers === 0) {
    const progressNote =
      names.length > snapshot.targetPlayers
        ? `；${formatCandidateProgress(primary, snapshot.targetPlayers)}`
        : '';
    description = `${dayLabel} ${startLabel}–${endLabel} 可连玩满 ${durationText}（${formatMemberListZh(names)}${progressNote}），点击查看详情或补报时间。`;
  } else if (primary && night) {
    description = `最佳重合 ${dayLabel} ${startLabel}–${endLabel}（${formatMemberListZh(names)}），还差 ${primary.missingPlayers} 人凑齐 ${snapshot.targetPlayers} 人发车，点开直接上车！`;
  } else {
    const unavailableNote = unavailableCount > 0 ? `、${unavailableCount} 人这次不行` : '';
    description = `已有 ${availableCount} 人填了时间${unavailableNote}，暂未凑出满 ${durationText} 重合时段，快来填一下你的空余时间。`;
  }

  return { title, description, imageUrl, canonicalUrl };
}

export function formatGroupNotice(
  snapshot: RoomSnapshot,
  candidate: Candidate | null,
  inviteUrl: string,
  isOffline: boolean,
  alternatives: readonly Candidate[] = [],
): string {
  const syncNote = isOffline ? `（按 ${formatSyncClock(snapshot.syncedAt)} 已同步）` : '';
  const availableCount = snapshot.submissions.filter((s) => s.answer.kind === 'available').length;
  const unavailableNames = snapshot.submissions
    .filter((s) => s.answer.kind === 'unavailable')
    .map((s) => s.nickname);
  const durationText = formatDuration(snapshot.durationSlots);
  const dateRange = formatNightRangeHeader(snapshot.nights);
  const completionState = getRoomCompletionState(snapshot.closedAt, candidate);
  const closedTag =
    completionState === 'settled'
      ? ' · 已定场'
      : completionState === 'closed-incomplete'
        ? ' · 收集已结束（未凑齐）'
        : '';
  const closedAction =
    completionState === 'settled'
      ? '已锁定本场，详情见链接：'
      : completionState === 'closed-incomplete'
        ? '收集已结束，尚未达到发车人数要求，详情见链接：'
        : null;

  const altItems: string[] = [];
  for (const alt of alternatives.slice(0, 2)) {
    const altNight = snapshot.nights.find((n) => n.id === alt.nightId);
    if (!altNight) continue;
    const altDay = formatNightWeekday(altNight.dateKey);
    const altStart = formatSlotInNight(alt.firstStart, altNight.dateKey);
    const altEnd = formatSlotInNight(alt.availableUntil, altNight.dateKey);
    const altStatus =
      alt.missingPlayers === 0
        ? alt.memberIds.length > snapshot.targetPlayers
          ? `${alt.memberIds.length} 人有空，已满足 ${snapshot.targetPlayers} 人发车条件`
          : `${alt.memberIds.length} 人可开`
        : `${alt.memberIds.length} 人，差 ${alt.missingPlayers} 人`;
    altItems.push(`${altDay} ${altStart}–${altEnd}（${altStatus}）`);
  }
  const altLine = altItems.length > 0 ? `备选时段：${altItems.join(' / ')}` : null;
  const unavailableLine =
    unavailableNames.length > 0 ? `本次不便：${unavailableNames.join('、')}` : null;

  if (snapshot.submissions.length === 0) {
    const emptyHeadline =
      completionState === 'closed-incomplete'
        ? `【${snapshot.title}】收集已结束 · 未凑齐（0/${snapshot.targetPlayers} 人已填，${dateRange} · 至少玩 ${durationText}）${syncNote}`
        : `【${snapshot.title}】0/${snapshot.targetPlayers} 人已填（${dateRange} · 至少玩 ${durationText}）${syncNote}`;
    return [
      emptyHeadline,
      completionState === 'closed-incomplete'
        ? '本次收集已结束，尚未达到发车人数要求，详情见链接：'
        : '刚建好车票，免登录点链接选一下你有空的晚上：',
      inviteUrl,
    ].join('\n');
  }

  const night = candidate ? snapshot.nights.find((n) => n.id === candidate.nightId) : undefined;
  if (!candidate || !night) {
    const progressNote = `已有 ${snapshot.submissions.length} 人填完${
      unavailableNames.length > 0
        ? `（${availableCount} 人有空，${unavailableNames.length} 人本次不行）`
        : ''
    }`;
    return [
      `【${snapshot.title}】${progressNote}${closedTag}${syncNote}`,
      ...(unavailableLine ? [unavailableLine] : []),
      completionState === 'closed-incomplete'
        ? `收集已结束，暂未凑出满 ${durationText} 的连续重合时段，未达到发车人数要求，详情见链接：`
        : `暂未凑出满 ${durationText} 的连续重合时段，还没填的朋友点链接补个位：`,
      inviteUrl,
    ].join('\n');
  }

  const nameMap = new Map(snapshot.submissions.map((s) => [s.memberId, s.nickname]));
  const names = candidate.memberIds.map((id) => nameMap.get(id) ?? id);
  const dayLabel = formatNightWeekday(night.dateKey);
  const startLabel = formatSlotInNight(candidate.firstStart, night.dateKey);
  const lastStartLabel = formatSlotInNight(candidate.lastStart, night.dateKey);
  const endLabel = formatSlotInNight(candidate.availableUntil, night.dateKey);

  if (candidate.missingPlayers === 0) {
    const latestNote =
      candidate.lastStart > candidate.firstStart ? `，最晚 ${lastStartLabel} 开` : '';
    return [
      `【${snapshot.title}】${formatCandidateProgress(candidate, snapshot.targetPlayers)}${closedTag}${syncNote}`,
      `推荐发车：${dayLabel} ${startLabel}–${endLabel}（${names.join('、')}，满 ${durationText}${latestNote}）`,
      ...(altLine ? [altLine] : []),
      ...(unavailableLine ? [unavailableLine] : []),
      closedAction ?? '大家这个点开怎么样？详情/改时间：',
      inviteUrl,
    ].join('\n');
  }

  if (candidate.missingPlayers === 1) {
    return [
      `【${snapshot.title}】还差 1 人发车（已有 ${candidate.memberIds.length}/${snapshot.targetPlayers} 人重合）${closedTag}${syncNote}`,
      `最佳重合：${dayLabel} ${startLabel}–${endLabel}（${names.join('、')}，都能连玩满 ${durationText}）`,
      ...(altLine ? [altLine] : []),
      ...(unavailableLine ? [unavailableLine] : []),
      closedAction ?? '有空的朋友点链接补个位上车：',
      inviteUrl,
    ].join('\n');
  }

  return [
    `【${snapshot.title}】目前 ${candidate.memberIds.length}/${snapshot.targetPlayers} 人重合 · 还差 ${candidate.missingPlayers} 人${closedTag}${syncNote}`,
    `当前最佳：${dayLabel} ${startLabel}–${endLabel}（${names.join('、')}，满 ${durationText}）`,
    ...(altLine ? [altLine] : []),
    ...(unavailableLine ? [unavailableLine] : []),
    closedAction ?? '还没填的小伙伴点链接选下时间：',
    inviteUrl,
  ].join('\n');
}

export function formatMemberAvailabilityLines(
  sub: Submission,
  nights: readonly Night[],
): string {
  if (sub.answer.kind === 'unavailable') return '这次都不行';
  const parts: string[] = [];
  for (const night of nights) {
    const spans = mergeSpans(
      sub.answer.picks
        .filter((p) => p.nightId === night.id)
        .map((p) => ({ from: Math.max(night.from, p.from), to: Math.min(night.to, p.to) })),
    );
    if (spans.length === 0) continue;
    const label = spans.map((s) => formatSpanInNight(night, s)).join('、');
    parts.push(`${formatNightWeekday(night.dateKey)} ${label}`);
  }
  return parts.length > 0 ? parts.join('；') : '未填写时段';
}
