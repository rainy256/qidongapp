import { useEffect, useMemo, useState, useRef } from 'react';
import {
  AlertSoftIcon,
  ArrowSoftIcon,
  BoardedTicketIcon,
  BoltQuickIcon,
  CheckSoftIcon,
  InfoSoftIcon,
  MoonDreamIcon,
  PlusPillIcon,
  StarGlintIcon,
  TrashSoftIcon,
} from '../../src/original/components/AppIcons';
import styles from '../../src/original/components/NightEditor.module.css';
import {
  computeDraftFeedback,
  computeOthersSlotAvailability,
  formatMemberAvailabilityLines,
  normalizePicks,
  recommend,
} from '../../src/original/domain/recommend';
import {
  formatDuration,
  formatNightShort,
  formatSlotInNight,
  formatSpanInNight,
} from '../../src/original/domain/time';
import type { Answer, Night, Pick, RoomSnapshot, Slot, Span } from '../../src/original/domain/types';
import { OverlapTimeline } from './OverlapTimeline';
import { ConfirmDialog } from './ConfirmDialog';
import { bestFutureSpan, preserveElapsedPicks } from './overlap-layout.mjs';

type DraftSegment = {
  from: Slot | null;
  to: Slot | null;
};

type ScheduleEditorProps = Readonly<{
  visible: boolean;
  isDirty: boolean;
  setIsDirty: (dirty: boolean) => void;
  snapshot: RoomSnapshot;
  explicitlyUnavailable: boolean;
  earliestStart: Slot;
  isSaving: boolean;
  saveError: { message: string; isConflict: boolean } | null;
  onSave: (answer: Answer, revision: number, unavailable: boolean) => Promise<boolean>;
  onRefreshLatest: () => Promise<boolean>;
  onClearError: () => void;
}>;

function buildDraftMap(nights: readonly Night[], picks: readonly Pick[]): Record<string, DraftSegment[]> {
  const map: Record<string, DraftSegment[]> = {};
  for (const n of nights) {
    const nightPicks = picks
      .filter((p) => p.nightId === n.id)
      .map((p) => ({ from: p.from, to: p.to }));
    map[n.id] = nightPicks.length > 0 ? nightPicks : [{ from: null, to: null }];
  }
  return map;
}

function flattenDraftPicks(nights: readonly Night[], draftMap: Record<string, DraftSegment[]>): Pick[] {
  const list: Pick[] = [];
  for (const night of nights) {
    const segs = draftMap[night.id] ?? [];
    for (const seg of segs) {
      if (seg.from !== null && seg.to !== null && seg.to > seg.from) {
        list.push({ nightId: night.id, from: seg.from, to: seg.to });
      }
    }
  }
  return list;
}

function pickInitialNightId(snapshot: RoomSnapshot, earliestStart: Slot): string {
  const recs = recommend({
    nights: snapshot.nights,
    targetPlayers: snapshot.targetPlayers,
    durationSlots: snapshot.durationSlots,
    earliestStart,
    submissions: snapshot.submissions,
  });
  if (recs.length > 0) return recs[0].nightId;

  const mySub = snapshot.viewer.memberId
    ? snapshot.submissions.find((s) => s.memberId === snapshot.viewer.memberId)
    : undefined;
  if (mySub?.answer.kind === 'available' && mySub.answer.picks.length > 0) {
    const myNight = snapshot.nights.find(
      (n) => mySub.answer.kind === 'available' && mySub.answer.picks.some((p) => p.nightId === n.id),
    );
    if (myNight) return myNight.id;
  }

  return snapshot.nights[0]?.id ?? '';
}

export function ScheduleEditor({
  visible,
  isDirty,
  setIsDirty,
  snapshot,
  explicitlyUnavailable,
  earliestStart,
  isSaving,
  saveError,
  onSave,
  onRefreshLatest,
  onClearError,
}: ScheduleEditorProps) {
  const mySubmission = useMemo(
    () =>
      snapshot.viewer.memberId
        ? snapshot.submissions.find((s) => s.memberId === snapshot.viewer.memberId)
        : undefined,
    [snapshot.submissions, snapshot.viewer.memberId],
  );

  const [activeNightId, setActiveNightId] = useState<string>(() =>
    pickInitialNightId(snapshot, earliestStart),
  );
  const [isEditing, setIsEditing] = useState<boolean>(
    !mySubmission,
  );
  const [draftMode, setDraftMode] = useState<'available' | 'unavailable'>(
    explicitlyUnavailable || mySubmission?.answer.kind === 'unavailable' ? 'unavailable' : 'available',
  );
  const [draftByNight, setDraftByNight] = useState<Record<string, DraftSegment[]>>(() =>
    buildDraftMap(
      snapshot.nights,
      mySubmission?.answer.kind === 'available' ? mySubmission.answer.picks : [],
    ),
  );
  const [validationMsg, setValidationMsg] = useState<string | null>(null);
  const draftRevision = useRef<number | null>(null);
  const [confirmReload, setConfirmReload] = useState(false);
  const [reloading, setReloading] = useState(false);

  const [windowNotice, setWindowNotice] = useState('');
  const [reviewUnavailable, setReviewUnavailable] = useState(false);
  const [replacement, setReplacement] = useState<{ nightId: string; span: Span; revision: number } | null>(null);
  const previousWindow = useRef(snapshot.id);

  useEffect(() => {
    if (!visible) {
      setReplacement(null);
      setConfirmReload(false);
    }
  }, [visible]);

  useEffect(() => {
    const rolled = previousWindow.current !== snapshot.id;
    previousWindow.current = snapshot.id;
    if (!isDirty || rolled) {
      const saved = buildDraftMap(snapshot.nights, mySubmission?.answer.kind === 'available' ? mySubmission.answer.picks : []);
      if (isDirty) {
        // Night IDs are absolute Shanghai dates. The incoming day starts with its server schedule.
        setDraftByNight(previous => Object.fromEntries(snapshot.nights.map(n => [n.id, previous[n.id] ?? saved[n.id]])));
        setWindowNotice('七天日期已更新。已移出范围的日期已移除，其余日期的草稿已保留。');
        setReviewUnavailable(draftMode === 'unavailable');
      } else {
        draftRevision.current = null;
        setDraftByNight(saved);
        setDraftMode(explicitlyUnavailable || mySubmission?.answer.kind === 'unavailable' ? 'unavailable' : 'available');
        setWindowNotice('');
        setReviewUnavailable(false);
      }
      if (!snapshot.nights.some(n => n.id === activeNightId)) setActiveNightId(snapshot.nights[0]?.id ?? '');
    }
  }, [snapshot, activeNightId, mySubmission, explicitlyUnavailable, isDirty, draftMode]);

  const activeNight =
    snapshot.nights.find((n) => n.id === activeNightId) ?? snapshot.nights[0] ?? null;

  const allDraftPicks = useMemo(
    () => flattenDraftPicks(snapshot.nights, draftByNight),
    [snapshot.nights, draftByNight],
  );

  const activeSegments = activeNight
    ? (draftByNight[activeNight.id] ?? [{ from: null, to: null }])
    : [];

  const activeDraftSpans: Span[] = activeSegments
    .filter((s): s is { from: Slot; to: Slot } => s.from !== null && s.to !== null && s.to > s.from)
    .map((s) => ({ from: s.from, to: s.to }));

  const effectiveSubmissions = useMemo(() => {
    if (isEditing) {
      const others = snapshot.submissions.filter((s) => s.memberId !== snapshot.viewer.memberId);
      if (draftMode === 'available') {
        const normalized = normalizePicks(allDraftPicks, snapshot.nights);
        if (normalized.length > 0) {
          return [
            ...others,
            {
              memberId: snapshot.viewer.memberId ?? '__draft_me__',
              nickname: mySubmission?.nickname ?? '我',
              answer: { kind: 'available' as const, picks: normalized },
              updatedAt: snapshot.syncedAt,
            },
          ];
        }
      }
      return others;
    }
    return snapshot.submissions;
  }, [
    allDraftPicks,
    draftMode,
    isEditing,
    mySubmission?.nickname,
    snapshot.nights,
    snapshot.submissions,
    snapshot.syncedAt,
    snapshot.viewer.memberId,
  ]);

  const combinedCells = useMemo(() => {
    if (!activeNight) return [];
    return computeOthersSlotAvailability(activeNight, effectiveSubmissions, null);
  }, [activeNight, effectiveSubmissions]);

  const othersCells = useMemo(() => {
    if (!activeNight) return [];
    return computeOthersSlotAvailability(activeNight, snapshot.submissions, snapshot.viewer.memberId);
  }, [activeNight, snapshot.submissions, snapshot.viewer.memberId]);

  const quickJoinSpan = useMemo(() => bestFutureSpan(othersCells, earliestStart), [othersCells, earliestStart]);

  const peakByNight = useMemo(() => {
    const map = new Map<string, number>();
    for (const night of snapshot.nights) {
      const cells = computeOthersSlotAvailability(night, effectiveSubmissions, null);
      const peak = cells.filter(c => c.slot >= earliestStart).reduce((max, c) => Math.max(max, c.count), 0);
      map.set(night.id, peak);
    }
    return map;
  }, [effectiveSubmissions, snapshot.nights, earliestStart]);

  const bestActiveNightCandidate = useMemo(() => {
    if (!activeNight) return null;
    const recs = recommend({
      nights: [activeNight],
      targetPlayers: snapshot.targetPlayers,
      durationSlots: snapshot.durationSlots,
      earliestStart,
      submissions: effectiveSubmissions,
    });
    return recs[0] ?? null;
  }, [
    activeNight,
    earliestStart,
    effectiveSubmissions,
    snapshot.durationSlots,
    snapshot.targetPlayers,
  ]);

  const feedback = useMemo(() => {
    if (!isEditing) return null;
    return computeDraftFeedback(snapshot, allDraftPicks, draftMode, isDirty, earliestStart);
  }, [
    allDraftPicks,
    draftMode,
    earliestStart,
    isEditing,
    isDirty,
    snapshot,
  ]);

  const mySavedActiveSpans: Span[] = useMemo(() => {
    if (!activeNight || mySubmission?.answer.kind !== 'available') return [];
    return mySubmission.answer.picks
      .filter((p) => p.nightId === activeNight.id)
      .map((p) => ({ from: p.from, to: p.to }));
  }, [activeNight, mySubmission]);

  const markDirty = () => {
    if (draftRevision.current === null) draftRevision.current = snapshot.viewer.mineRevision;
    setIsDirty(true);
    setValidationMsg(null);
    onClearError();
  };

  const updateSegment = (segIdx: number, field: 'from' | 'to', rawValue: string) => {
    if (!activeNight) return;
    markDirty();
    const parsed = rawValue === '' ? null : Number(rawValue);
    setDraftByNight((prev) => {
      const current = [...(prev[activeNight.id] ?? [{ from: null, to: null }])];
      const seg = { ...(current[segIdx] ?? { from: null, to: null }) };
      if (field === 'from') {
        seg.from = parsed;
        if (parsed !== null && (seg.to === null || seg.to <= parsed)) {
          seg.to = Math.min(activeNight.to, parsed + snapshot.durationSlots);
        }
      } else {
        seg.to = parsed;
      }
      current[segIdx] = seg;
      return { ...prev, [activeNight.id]: current };
    });
  };

  const replaceActiveDay = (span: Span) => {
    if (!activeNight) return;
    const from = Math.max(span.from, earliestStart);
    if (from >= span.to) return;
    markDirty();
    setDraftMode('available');
    setDraftByNight((prev) => ({
      ...prev,
      [activeNight.id]: [{ from, to: span.to }],
    }));
  };

  const applyQuickSpan = (span: Span) => {
    if (!activeNight) return;
    const from = Math.max(span.from, earliestStart);
    if (from >= span.to) return;
    const existing = activeSegments.filter(segment => segment.from !== null || segment.to !== null);
    if (existing.length === 1 && activeSegments.length === 1 && existing[0].from === from && existing[0].to === span.to) return;
    if (existing.length) {
      setReplacement({ nightId: activeNight.id, span: { from, to: span.to }, revision: snapshot.viewer.mineRevision });
    } else {
      replaceActiveDay(span);
    }
  };

  const addSecondSegment = () => {
    if (!activeNight) return;
    markDirty();
    setDraftByNight((prev) => {
      const current = prev[activeNight.id] ?? [];
      if (current.length >= 2) return prev;
      return { ...prev, [activeNight.id]: [...current, { from: null, to: null }] };
    });
  };

  const removeSegment = (segIdx: number) => {
    if (!activeNight) return;
    markDirty();
    setDraftByNight((prev) => {
      const current = [...(prev[activeNight.id] ?? [])];
      current.splice(segIdx, 1);
      return {
        ...prev,
        [activeNight.id]: current.length > 0 ? current : [{ from: null, to: null }],
      };
    });
  };

  const toggleUnavailable = () => {
    markDirty();
    setReviewUnavailable(false);
    setDraftMode((prev) => (prev === 'unavailable' ? 'available' : 'unavailable'));
  };

  const cancelEditing = () => {
    draftRevision.current = null;
    setIsEditing(false);
    setIsDirty(false);
    setValidationMsg(null);
    onClearError();
    setDraftMode(explicitlyUnavailable || mySubmission?.answer.kind === 'unavailable' ? 'unavailable' : 'available');
    setDraftByNight(
      buildDraftMap(
        snapshot.nights,
        mySubmission?.answer.kind === 'available' ? mySubmission.answer.picks : [],
      ),
    );
  };

  const handleSave = async () => {
    if (isSaving || reloading || reviewUnavailable) return;
    if (draftMode === 'available') {
      const incomplete = Object.values(draftByNight).flat().some(s =>
        (s.from === null) !== (s.to === null) || (s.from !== null && s.to !== null && s.to <= s.from));
      if (incomplete) {
        setValidationMsg('有时间段未选完整或结束早于开始，请检查后保存。');
        return;
      }
    }
    // Hiding elapsed slots is display-only. Preserve elapsed portions of the saved schedule,
    // even if the user marks all future slots unavailable.
    const oldPicks = mySubmission?.answer.kind === 'available' ? mySubmission.answer.picks : [];
    const { history, future, picks } = preserveElapsedPicks(oldPicks, allDraftPicks, earliestStart, draftMode === 'unavailable');
    const normalized = normalizePicks(picks, snapshot.nights);
    if (draftMode === 'available' && !future.length && !history.length) {
      setValidationMsg('请先选择未来空闲时间，或标记都没空。');
      return;
    }
    const answer: Answer = normalized.length ? { kind: 'available', picks: normalized } : { kind: 'unavailable' };
    const ok = await onSave(answer, draftRevision.current ?? snapshot.viewer.mineRevision, draftMode === 'unavailable');
    if (ok) {
      draftRevision.current = null;
      setIsDirty(false);
      setIsEditing(false);
      setValidationMsg(null);
    }
  };

  const reloadDraft = async () => {
    if (reloading || isSaving) return;
    setReloading(true);
    try {
      if (await onRefreshLatest()) {
        draftRevision.current = null;
        setIsDirty(false);
        setValidationMsg(null);
        setConfirmReload(false);
        onClearError();
      } else { setConfirmReload(false); setValidationMsg('未能拉取最新日程，草稿仍保留，请重试。'); }
    } finally { setReloading(false); }
  };

  const renderDayTabs = () => {
    if (!activeNight) return null;
    return (
      <div className={styles.nightTabs} role="tablist" aria-label="选择日期">
        {snapshot.nights.map((night) => {
          const selected = night.id === activeNight.id;
          const peak = peakByNight.get(night.id) ?? 0;
          const hasPick = isEditing
            ? draftMode === 'available' &&
              (draftByNight[night.id] ?? []).some(
                (s) => s.from !== null && s.to !== null && s.to > Math.max(s.from, earliestStart),
              )
            : mySubmission?.answer.kind === 'available' &&
              mySubmission.answer.picks.some((p) => p.nightId === night.id && p.to > earliestStart);
          return (
            <button
              key={night.id}
              type="button"
              role="tab"
              aria-selected={selected}
              className={`${styles.nightTab} ${selected ? styles.nightTabActive : ''}`}
              onClick={() => setActiveNightId(night.id)}
            >
              <span className={`${styles.tabDate} tabular`}>
                {formatNightShort(night.dateKey)}
                {hasPick && <span className={styles.pickDot} aria-label="已选时段" />}
              </span>
              {peak > 0 && <span className={`${styles.tabPeak} tabular`}>{peak}人空</span>}
            </button>
          );
        })}
      </div>
    );
  };

  if (!visible) return null;

  if (mySubmission && !isEditing) {
    const remaining = mySubmission.answer.kind === 'available'
      ? mySubmission.answer.picks.map(p => ({ ...p, from: Math.max(p.from, earliestStart) })).filter(p => p.to > p.from)
      : [];
    return (
      <section id="time-picker" className={styles.card} aria-label="我的未来七天空闲">
        <div className={styles.summaryRow}>
          <div className={styles.summaryText}>
            <div className={styles.savedTitleRow}>
              <BoardedTicketIcon size={20} tone="violet" className={styles.savedIcon} />
              <h2 className={styles.sectionTitle}>我的未来七天空闲</h2>
            </div>
            <p className={`${styles.savedLine} tabular`}>
              {remaining.length ? formatMemberAvailabilityLines({ ...mySubmission, answer: { kind: 'available', picks: remaining } }, snapshot.nights) : explicitlyUnavailable || mySubmission.answer.kind === 'unavailable' ? '已确认未来七天都没空' : '暂无未来空闲时间'}
            </p>
            <p className={styles.browserHint}>已同步给小队成员，随时可调整单日时段。</p>
          </div>
          <button type="button" className={styles.modifyBtn} onClick={() => setIsEditing(true)}>
            修改时间
          </button>
        </div>
        {activeNight && (
          <>
            <div className={styles.sectionDivider} />
            {renderDayTabs()}
            <OverlapTimeline
              night={activeNight}
              cells={combinedCells}
              earliestStart={earliestStart}
              draftSpans={mySavedActiveSpans}
              showMyTrack={mySubmission.answer.kind === 'available'}
              targetPlayers={snapshot.targetPlayers}
              durationSlots={snapshot.durationSlots}
              bestCandidate={bestActiveNightCandidate}
            />
          </>
        )}
      </section>
    );
  }

  if (!activeNight) return null;

  const firstSegment = activeSegments[0];
  const firstSegComplete = !!firstSegment && firstSegment.from !== null && firstSegment.to !== null && firstSegment.to > firstSegment.from;
  const canAddSecond =
    draftMode === 'available' &&
    activeSegments.length === 1 &&
    firstSegComplete &&
    activeNight.to - activeNight.from >= 3;

  return (
    <div className="scheduleEditorWrap">
      <section id="time-picker" className={styles.card} aria-label="编辑未来七天空闲" inert={isSaving || reloading}>
        <div className={styles.editorHeader}>
          <h2 className={styles.sectionTitle}>{mySubmission ? '编辑未来七天空闲' : '你这周什么时候能玩？'}</h2>
          {mySubmission && (
            <button type="button" className={styles.textAction} onClick={cancelEditing}>
              取消
            </button>
          )}
        </div>

        {!mySubmission && <p className={styles.browserHint}>还未确认空闲时间，选择日期和时段，或明确标记都没空。</p>}
        {renderDayTabs()}

        {draftMode === 'available' && (
          <div className={styles.quickJoinRow}>
            {quickJoinSpan && (
              <button
                type="button"
                className={styles.quickMatchBtn}
                onClick={() => applyQuickSpan(quickJoinSpan)}
              >
                <BoltQuickIcon size={15} tone="honey" />
                <span className="tabular">
                  跟队友重合 {formatSpanInNight(activeNight, quickJoinSpan)}
                </span>
              </button>
            )}
            <button
              type="button"
              className={styles.quickFullBtn}
              disabled={earliestStart >= activeNight.to}
              onClick={() => applyQuickSpan({ from: activeNight.from, to: activeNight.to })}
            >
              <MoonDreamIcon size={15} tone="violet" />
              <span>{earliestStart > activeNight.from ? "剩余时间都有空" : "全天都有空"}</span>
            </button>
          </div>
        )}

        {draftMode === 'unavailable' ? (
          <div className={styles.unavailableBox}>
            <div>
              <p className={styles.unavailableTitle}>{isDirty ? '待确认「未来七天都没空」' : '已标记「未来七天都没空」'}</p>
              <p className={styles.unavailableHint}>之前选过的时间已保留，点右侧随时恢复。</p>
            </div>
            <button type="button" className={styles.undoBtn} onClick={toggleUnavailable}>
              改回填时间
            </button>
          </div>
        ) : (
          <div className={styles.segments}>
            {activeSegments.map((seg, idx) => {
              const fromId = `from-${activeNight.id}-${idx}`;
              const toId = `to-${activeNight.id}-${idx}`;
              const startSlots: Slot[] = [];
              const firstFuture = Math.max(activeNight.from, earliestStart);
              // Preserve saved historical values when editing another date; do not offer new past slots.
              if (seg.from !== null && seg.from < firstFuture) startSlots.push(seg.from);
              for (let s = firstFuture; s < activeNight.to; s++) startSlots.push(s);
              const minEnd = Math.max(firstFuture + 1, seg.from !== null ? seg.from + 1 : firstFuture + 1);
              const endSlots: Slot[] = [];
              if (seg.to !== null && seg.to < minEnd) endSlots.push(seg.to);
              for (let s = minEnd; s <= activeNight.to; s++) endSlots.push(s);
              const segDuration =
                seg.from !== null && seg.to !== null && seg.to > seg.from ? seg.to - seg.from : 0;

              return (
                <div key={`${activeNight.id}-${idx}`} className={styles.segmentBlock}>
                  {activeSegments.length > 1 && (
                    <div className={styles.segmentTitleRow}>
                      <span className={styles.segmentLabel}>第 {idx + 1} 段</span>
                      <button
                        type="button"
                        className={styles.removeSegBtn}
                        onClick={() => removeSegment(idx)}
                      >
                        <TrashSoftIcon size={14} />
                        <span>移除</span>
                      </button>
                    </div>
                  )}

                  <div className={styles.selectRow}>
                    <label className={styles.timeCard} htmlFor={fromId}>
                      <span className={styles.timeCardLabel}>开始时间</span>
                      <select
                        id={fromId}
                        className={`${styles.select} tabular`}
                        value={seg.from === null ? '' : String(seg.from)}
                        onChange={(e) => updateSegment(idx, 'from', e.target.value)}
                      >
                        <option value="">选开始</option>
                        {startSlots.map((slot) => (
                          <option key={slot} value={slot}>
                            {formatSlotInNight(slot, activeNight.dateKey)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <span className={styles.arrowMid} aria-hidden="true">
                      <ArrowSoftIcon size={17} tone="violet" />
                    </span>

                    <label className={styles.timeCard} htmlFor={toId}>
                      <span className={styles.timeCardLabel}>结束时间</span>
                      <select
                        id={toId}
                        className={`${styles.select} tabular`}
                        value={seg.to === null ? '' : String(seg.to)}
                        onChange={(e) => updateSegment(idx, 'to', e.target.value)}
                      >
                        <option value="">选结束</option>
                        {endSlots.map((slot) => (
                          <option key={slot} value={slot}>
                            {formatSlotInNight(slot, activeNight.dateKey)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  {segDuration > 0 && (
                    <div className={styles.segMetaRow}>
                      <span className={`${styles.durationChip} tabular`}>
                        当天可选 {formatDuration(segDuration)}
                      </span>
                      {activeSegments.length === 1 && (
                        <button
                          type="button"
                          className={styles.clearBtn}
                          onClick={() => removeSegment(0)}
                        >
                          清空当天
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {canAddSecond && (
              <button type="button" className={styles.addSegBtn} onClick={addSecondSegment}>
                <PlusPillIcon size={15} tone="violet" />
                <span>加第二段（比如中间去吃饭）</span>
              </button>
            )}
          </div>
        )}

        <OverlapTimeline
          night={activeNight}
          cells={combinedCells}
          earliestStart={earliestStart}
          draftSpans={draftMode === 'available' ? activeDraftSpans : []}
          showMyTrack={true}
          hasUnsavedDraft={isDirty}
          targetPlayers={snapshot.targetPlayers}
          durationSlots={snapshot.durationSlots}
          bestCandidate={bestActiveNightCandidate}
        />
      </section>

      <ConfirmDialog
        open={replacement !== null && replacement.nightId === activeNight.id && replacement.revision === snapshot.viewer.mineRevision}
        title="替换这一天的时段？"
        body={replacement ? `将把 ${formatNightShort(activeNight.dateKey)} 已填的时段替换为 ${formatSpanInNight(activeNight, replacement.span)}。其他日期保留原草稿。` : ''}
        confirmLabel="替换时段" cancelLabel="保留原时段" tone="primary"
        onCancel={() => setReplacement(null)}
        onConfirm={() => {
          if (replacement?.nightId === activeNight.id && replacement.revision === snapshot.viewer.mineRevision) replaceActiveDay(replacement.span);
          setReplacement(null);
        }}
      />
      <ConfirmDialog open={confirmReload} title="重新载入日程" body="将放弃尚未保存的草稿，并拉取其他设备的最新日程。" confirmLabel="拉取并重新编辑" tone="primary" busy={reloading} onCancel={() => setConfirmReload(false)} onConfirm={() => void reloadDraft()}/>
      <div className={`${styles.bottomDock} productDock`}>
        {feedback && (
          <div
            className={`${styles.feedbackBubble} ${styles[`feedback_${feedback.tone}`]}`}
            role="status"
          >
            {feedback.tone === 'ready' ? (
              <CheckSoftIcon size={16} className={styles.feedbackIcon} />
            ) : feedback.tone === 'almost' ? (
              <StarGlintIcon size={16} className={styles.feedbackIcon} />
            ) : (
              <InfoSoftIcon size={16} className={styles.feedbackIcon} />
            )}
            <span className="tabular">{feedback.message}</span>
          </div>
        )}

        {windowNotice && <p role="status" className={styles.browserHint}>{windowNotice}</p>}
        {reviewUnavailable && <button type="button" className={styles.refreshBtn} onClick={() => setReviewUnavailable(false)}>
          确认新范围（至 {formatNightShort(snapshot.nights[snapshot.nights.length - 1].dateKey)}）都没空
        </button>}
        {isDirty && draftRevision.current !== snapshot.viewer.mineRevision && !saveError && (
          <p role="status" className={styles.browserHint}>其他设备已更新日程，本机草稿仍保留。
            <button type="button" className={styles.refreshBtn} onClick={() => setConfirmReload(true)}>查看最新日程</button>
          </p>
        )}

        {validationMsg && (
          <p className={styles.errorBanner} role="alert">
            <AlertSoftIcon size={15} />
            <span>{validationMsg}</span>
          </p>
        )}

        {saveError && (
          <div className={styles.errorBanner} role="alert">
            <AlertSoftIcon size={15} className={styles.errorIcon} />
            <div className={styles.errorContent}>
              <span>{saveError.message}</span>
              {saveError.isConflict && (
                <button type="button" className={styles.refreshBtn} onClick={() => setConfirmReload(true)}>
                  拉取最新日程
                </button>
              )}
            </div>
          </div>
        )}

        <div className={styles.dockActions}>
          <button
            type="button"
            className={styles.secondaryGhostBtn}
            onClick={toggleUnavailable}
            disabled={isSaving}
          >
            {draftMode === 'unavailable' ? '改回有空' : '都没空'}
          </button>

          <button
            type="button"
            className={styles.primaryBtn}
            disabled={isSaving || reloading || reviewUnavailable}
            onClick={() => void handleSave()}
          >
            {isSaving
              ? '正在保存…'
              : draftMode === 'unavailable'
                ? '确认都没空'
                : '保存我的时间'}
          </button>
        </div>
      </div>
    </div>
  );
}
