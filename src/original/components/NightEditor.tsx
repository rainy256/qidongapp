import {
  AlertSoftIcon,
  ArrowSoftIcon,
  BoardedTicketIcon,
  BoltQuickIcon,
  CheckSoftIcon,
  InfoSoftIcon,
  MoonDreamIcon,
  PencilSoftIcon,
  PlusPillIcon,
  StarGlintIcon,
  TrashSoftIcon,
} from './AppIcons';
import { useEffect, useMemo, useState } from 'react';
import {
  computeDraftFeedback,
  computeOthersSlotAvailability,
  formatMemberAvailabilityLines,
  normalizePicks,
  recommend,
} from '../domain/recommend';
import {
  formatDuration,
  formatNightShort,
  formatSlotInNight,
  formatSpanInNight,
} from '../domain/time';
import type { Answer, Night, Pick, RoomSnapshot, Slot, Span } from '../domain/types';
import { DensityBar } from './DensityBar';
import { NicknameDialog } from './NicknameDialog';
import styles from './NightEditor.module.css';

type DraftSegment = {
  from: Slot | null;
  to: Slot | null;
};

type NightEditorProps = Readonly<{
  snapshot: RoomSnapshot;
  earliestStart: Slot;
  isSaving: boolean;
  saveError: { message: string; isConflict: boolean } | null;
  onSave: (nickname: string, answer: Answer) => Promise<boolean>;
  onRefreshLatest: () => void;
  onClearError: () => void;
}>;

function buildDraftMapFromSubmission(
  nights: readonly Night[],
  picks: readonly Pick[],
): Record<string, DraftSegment[]> {
  const map: Record<string, DraftSegment[]> = {};
  for (const n of nights) {
    const nightPicks = picks
      .filter((p) => p.nightId === n.id)
      .map((p) => ({ from: p.from, to: p.to }));
    map[n.id] = nightPicks.length > 0 ? nightPicks : [{ from: null, to: null }];
  }
  return map;
}

function flattenDraftPicks(
  nights: readonly Night[],
  draftMap: Record<string, DraftSegment[]>,
): Pick[] {
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
    const picks = mySub.answer.picks;
    const myNight = snapshot.nights.find((n) => picks.some((p) => p.nightId === n.id));
    if (myNight) return myNight.id;
  }

  return snapshot.nights[0]?.id ?? '';
}

export function NightEditor({
  snapshot,
  earliestStart,
  isSaving,
  saveError,
  onSave,
  onRefreshLatest,
  onClearError,
}: NightEditorProps) {
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
  const [isEditing, setIsEditing] = useState<boolean>(!mySubmission);
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [draftMode, setDraftMode] = useState<'available' | 'unavailable'>(
    mySubmission?.answer.kind === 'unavailable' ? 'unavailable' : 'available',
  );
  const [draftByNight, setDraftByNight] = useState<Record<string, DraftSegment[]>>(() =>
    buildDraftMapFromSubmission(
      snapshot.nights,
      mySubmission?.answer.kind === 'available' ? mySubmission.answer.picks : [],
    ),
  );
  const [nickname, setNickname] = useState<string>(mySubmission?.nickname ?? '');
  const [nicknameDialogOpen, setNicknameDialogOpen] = useState<boolean>(false);
  const [pendingSaveAfterNickname, setPendingSaveAfterNickname] = useState<boolean>(false);
  const [validationMsg, setValidationMsg] = useState<string | null>(null);
  const [closedDirtyNotice, setClosedDirtyNotice] = useState<boolean>(false);

  const identityKey = `${snapshot.id}:${snapshot.viewer.memberId ?? 'guest'}`;
  const [lastIdentity, setLastIdentity] = useState<string>(identityKey);

  useEffect(() => {
    const identityChanged = identityKey !== lastIdentity;
    if (identityChanged) {
      setLastIdentity(identityKey);
      setActiveNightId(pickInitialNightId(snapshot, earliestStart));
      setIsDirty(false);
      setValidationMsg(null);
      setClosedDirtyNotice(false);
      setNicknameDialogOpen(false);
      setPendingSaveAfterNickname(false);
      setIsEditing(!mySubmission);
      setDraftMode(mySubmission?.answer.kind === 'unavailable' ? 'unavailable' : 'available');
      setDraftByNight(
        buildDraftMapFromSubmission(
          snapshot.nights,
          mySubmission?.answer.kind === 'available' ? mySubmission.answer.picks : [],
        ),
      );
      setNickname(mySubmission?.nickname ?? '');
      return;
    }

    if (snapshot.closedAt && isDirty) {
      setClosedDirtyNotice(true);
      setIsDirty(false);
      setIsEditing(false);
      setNicknameDialogOpen(false);
      return;
    }

    if (!isDirty) {
      setDraftMode(mySubmission?.answer.kind === 'unavailable' ? 'unavailable' : 'available');
      setDraftByNight(
        buildDraftMapFromSubmission(
          snapshot.nights,
          mySubmission?.answer.kind === 'available' ? mySubmission.answer.picks : [],
        ),
      );
      if (mySubmission?.nickname) {
        setNickname(mySubmission.nickname);
      }
      if (!snapshot.nights.some((n) => n.id === activeNightId)) {
        setActiveNightId(snapshot.nights[0]?.id ?? '');
      }
    }
  }, [
    activeNightId,
    earliestStart,
    identityKey,
    isDirty,
    lastIdentity,
    mySubmission,
    snapshot,
  ]);

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
    if (!snapshot.closedAt && isEditing) {
      const others = snapshot.submissions.filter((s) => s.memberId !== snapshot.viewer.memberId);
      if (draftMode === 'available') {
        const normalized = normalizePicks(allDraftPicks, snapshot.nights);
        if (normalized.length > 0) {
          return [
            ...others,
            {
              memberId: snapshot.viewer.memberId ?? '__draft_me__',
              nickname: nickname.trim() || '我',
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
    nickname,
    snapshot.closedAt,
    snapshot.nights,
    snapshot.submissions,
    snapshot.syncedAt,
    snapshot.viewer.memberId,
  ]);

  // Peak crowd count per night for candy-pill tabs (including viewer's active/saved availability)
  const peakByNight = useMemo(() => {
    const map = new Map<string, number>();
    for (const n of snapshot.nights) {
      const cells = computeOthersSlotAvailability(n, effectiveSubmissions, null);
      map.set(n.id, cells.length > 0 ? Math.max(...cells.map((c) => c.count)) : 0);
    }
    return map;
  }, [effectiveSubmissions, snapshot.nights]);

  const combinedCells = useMemo(() => {
    if (!activeNight) return [];
    return computeOthersSlotAvailability(activeNight, effectiveSubmissions, null);
  }, [activeNight, effectiveSubmissions]);

  const bestActiveNightCandidate = useMemo(() => {
    if (!activeNight) return null;
    const recs = recommend({
      nights: [activeNight],
      targetPlayers: snapshot.targetPlayers,
      durationSlots: snapshot.durationSlots,
      earliestStart: Math.max(earliestStart, activeNight.from),
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

  const mySavedActiveSpans: Span[] = useMemo(() => {
    if (!activeNight || mySubmission?.answer.kind !== 'available') return [];
    return mySubmission.answer.picks
      .filter((p) => p.nightId === activeNight.id)
      .map((p) => ({
        from: Math.max(activeNight.from, p.from),
        to: Math.min(activeNight.to, p.to),
      }))
      .filter((s) => s.to > s.from);
  }, [activeNight, mySubmission]);

  // Smart 1-tap quick-join span on activeNight matching the biggest continuous peer group
  const quickJoinSpan = useMemo((): Span | null => {
    if (!activeNight) return null;
    const others = snapshot.submissions.filter((s) => s.memberId !== snapshot.viewer.memberId);
    if (others.length === 0) return null;
    const recs = recommend({
      nights: [activeNight],
      targetPlayers: snapshot.targetPlayers,
      durationSlots: snapshot.durationSlots,
      earliestStart: Math.max(earliestStart, activeNight.from),
      submissions: others,
    });
    if (recs.length === 0) return null;
    return { from: recs[0].firstStart, to: recs[0].availableUntil };
  }, [
    activeNight,
    earliestStart,
    snapshot.durationSlots,
    snapshot.submissions,
    snapshot.targetPlayers,
    snapshot.viewer.memberId,
  ]);

  const feedback = useMemo(
    () =>
      computeDraftFeedback(
        snapshot,
        allDraftPicks,
        draftMode,
        isDirty,
        earliestStart,
      ),
    [allDraftPicks, draftMode, earliestStart, isDirty, snapshot],
  );

  const markDirty = () => {
    setIsDirty(true);
    setValidationMsg(null);
    onClearError();
  };

  const applyQuickSpan = (span: Span) => {
    if (!activeNight) return;
    markDirty();
    setDraftMode('available');
    setDraftByNight((prev) => ({
      ...prev,
      [activeNight.id]: [{ from: span.from, to: span.to }],
    }));
  };

  const updateSegment = (index: number, kind: 'from' | 'to', rawVal: string) => {
    if (!activeNight) return;
    markDirty();
    setDraftMode('available');
    const val = rawVal === '' ? null : Number(rawVal);

    setDraftByNight((prev) => {
      const list = [...(prev[activeNight.id] ?? [{ from: null, to: null }])];
      const cur = { ...list[index] };

      if (kind === 'from') {
        cur.from = val;
        if (val === null) {
          cur.to = null;
        } else if (cur.to === null || cur.to <= val) {
          cur.to = Math.min(val + snapshot.durationSlots, activeNight.to);
        }
      } else {
        cur.to = val;
        if (val !== null && cur.from === null) {
          cur.from = Math.max(activeNight.from, val - snapshot.durationSlots);
        }
      }

      list[index] = cur;
      return { ...prev, [activeNight.id]: list };
    });
  };

  const addSecondSegment = () => {
    if (!activeNight) return;
    markDirty();
    setDraftByNight((prev) => {
      const list = [...(prev[activeNight.id] ?? [])];
      if (list.length >= 2) return prev;
      return {
        ...prev,
        [activeNight.id]: [...list, { from: null, to: null }],
      };
    });
  };

  const removeSegment = (index: number) => {
    if (!activeNight) return;
    markDirty();
    setDraftByNight((prev) => {
      const list = [...(prev[activeNight.id] ?? [])];
      if (list.length <= 1) {
        return { ...prev, [activeNight.id]: [{ from: null, to: null }] };
      }
      list.splice(index, 1);
      return { ...prev, [activeNight.id]: list };
    });
  };

  const toggleUnavailable = () => {
    markDirty();
    setDraftMode((prev) => (prev === 'unavailable' ? 'available' : 'unavailable'));
  };

  const cancelEditing = () => {
    setIsDirty(false);
    setValidationMsg(null);
    onClearError();
    setDraftMode(mySubmission?.answer.kind === 'unavailable' ? 'unavailable' : 'available');
    setDraftByNight(
      buildDraftMapFromSubmission(
        snapshot.nights,
        mySubmission?.answer.kind === 'available' ? mySubmission.answer.picks : [],
      ),
    );
    setNickname(mySubmission?.nickname ?? '');
    if (mySubmission) {
      setIsEditing(false);
    }
  };

  const executeSave = async (finalName: string) => {
    const cleanName = finalName.trim();
    if (!cleanName) return;

    if (draftMode === 'available') {
      const normalized = normalizePicks(allDraftPicks, snapshot.nights);
      if (normalized.length === 0) {
        setValidationMsg('请先选一段有空的时间，或点击「这次都不行」。');
        return;
      }
      const ok = await onSave(cleanName, { kind: 'available', picks: normalized });
      if (ok) {
        setNickname(cleanName);
        setIsDirty(false);
        setIsEditing(false);
        setNicknameDialogOpen(false);
        setPendingSaveAfterNickname(false);
      }
    } else {
      const ok = await onSave(cleanName, { kind: 'unavailable' });
      if (ok) {
        setNickname(cleanName);
        setIsDirty(false);
        setIsEditing(false);
        setNicknameDialogOpen(false);
        setPendingSaveAfterNickname(false);
      }
    }
  };

  const handlePrimarySaveClick = () => {
    if (snapshot.closedAt || isSaving) return;

    if (draftMode === 'available') {
      const normalized = normalizePicks(allDraftPicks, snapshot.nights);
      if (normalized.length === 0) {
        setValidationMsg('请先点上方快捷时段，或选择起止时间～');
        return;
      }
    }

    const cleanName = nickname.trim();
    if (!cleanName) {
      setPendingSaveAfterNickname(true);
      setNicknameDialogOpen(true);
      return;
    }

    void executeSave(cleanName);
  };

  const renderNightTabs = () => {
    if (!activeNight) return null;
    return (
      <div className={styles.nightTabs} role="tablist" aria-label="选择候选夜晚">
        {snapshot.nights.map((night) => {
          const selected = night.id === activeNight.id;
          const peak = peakByNight.get(night.id) ?? 0;
          const hasPick =
            !snapshot.closedAt && isEditing
              ? draftMode === 'available' &&
                (draftByNight[night.id] ?? []).some(
                  (s) => s.from !== null && s.to !== null && s.to > s.from,
                )
              : mySubmission?.answer.kind === 'available' &&
                mySubmission.answer.picks.some((p) => p.nightId === night.id);
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
              {peak > 0 && (
                <span className={`${styles.tabPeak} tabular`}>{peak}人空</span>
              )}
            </button>
          );
        })}
      </div>
    );
  };

  if (snapshot.closedAt) {
    return (
      <section id="time-picker" className={styles.card} aria-label="我的时间">
        <div className={styles.closedHeader}>
          <h2 className={styles.sectionTitle}>收集已结束</h2>
          <span className={styles.closedChip}>只读</span>
        </div>
        {closedDirtyNotice && (
          <p className={styles.warningBanner} role="status">
            房主刚刚结束了收集，你刚才尚未保存的修改未提交。
          </p>
        )}
        {mySubmission ? (
          <p className={`${styles.savedLine} tabular`}>
            我已提交：{mySubmission.nickname} ·{' '}
            {formatMemberAvailabilityLines(mySubmission, snapshot.nights)}
          </p>
        ) : (
          <p className={styles.mutedLine}>本次收集已经收官啦，你还没有提交过时段。</p>
        )}
        {activeNight && (
          <>
            <div className={styles.sectionDivider} />
            {renderNightTabs()}
            <DensityBar
              night={activeNight}
              cells={combinedCells}
              draftSpans={mySavedActiveSpans}
              showMyTrack={mySavedActiveSpans.length > 0}
              targetPlayers={snapshot.targetPlayers}
              durationSlots={snapshot.durationSlots}
              bestCandidate={bestActiveNightCandidate}
            />
          </>
        )}
      </section>
    );
  }

  if (mySubmission && !isEditing) {
    return (
      <section id="time-picker" className={styles.card} aria-label="我的时间">
        <div className={styles.summaryRow}>
          <div className={styles.summaryText}>
            <div className={styles.savedTitleRow}>
              <BoardedTicketIcon size={20} tone="violet" className={styles.savedIcon} />
              <h2 className={styles.sectionTitle}>已上车（{mySubmission.nickname}）</h2>
            </div>
            <p className={`${styles.savedLine} tabular`}>
              {formatMemberAvailabilityLines(mySubmission, snapshot.nights)}
            </p>
            <p className={styles.browserHint}>用当前浏览器再打开此链接，随时能改时间～</p>
          </div>
          <button
            type="button"
            className={styles.modifyBtn}
            onClick={() => setIsEditing(true)}
          >
            修改时间
          </button>
        </div>
        {activeNight && (
          <>
            <div className={styles.sectionDivider} />
            {renderNightTabs()}
            <DensityBar
              night={activeNight}
              cells={combinedCells}
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

  const firstSegComplete =
    activeSegments[0]?.from !== null &&
    activeSegments[0]?.to !== null &&
    activeSegments[0].to > activeSegments[0].from;
  const canAddSecond =
    draftMode === 'available' &&
    activeSegments.length === 1 &&
    firstSegComplete &&
    activeNight.to - activeNight.from >= 3;

  const dialogSummary =
    draftMode === 'unavailable'
      ? '标记为「这次都不行」'
      : feedback?.message
        ? feedback.message.replace(' 尚未保存。', '').replace('尚未保存。', '')
        : '保存后大家立刻就能看到你的空余时间';

  return (
    <>
      <section id="time-picker" className={styles.card} aria-label="填写我的可玩时间">
        <div className={styles.editorHeader}>
          <h2 className={styles.sectionTitle}>选你有空的晚上</h2>
          <div className={styles.headerActions}>
            {nickname.trim() && (
              <button
                type="button"
                className={styles.nickChipBtn}
                onClick={() => {
                  setPendingSaveAfterNickname(false);
                  setNicknameDialogOpen(true);
                }}
              >
                <PencilSoftIcon size={13} tone="rose" />
                <span>{nickname.trim()}</span>
              </button>
            )}
            {mySubmission && (
              <button type="button" className={styles.textAction} onClick={cancelEditing}>
                取消
              </button>
            )}
          </div>
        </div>

        {/* Candy-pill Night Tabs with Peak Crowd Badge */}
        {renderNightTabs()}

        {/* 1-Tap Smart Shortcuts for Phones */}
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
                  跟大家一起 {formatSpanInNight(activeNight, quickJoinSpan)}
                </span>
              </button>
            )}
            <button
              type="button"
              className={styles.quickFullBtn}
              onClick={() => applyQuickSpan({ from: activeNight.from, to: activeNight.to })}
            >
              <MoonDreamIcon size={15} tone="violet" />
              <span>整晚都有空</span>
            </button>
          </div>
        )}

        {/* Plush Rounded Time Select Tiles vs Unavailable Mode */}
        {draftMode === 'unavailable' ? (
          <div className={styles.unavailableBox}>
            <div>
              <p className={styles.unavailableTitle}>已选「这次都不行」</p>
              <p className={styles.unavailableHint}>之前挑过的时间帮你留着，点右侧随时恢复。</p>
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
              for (let s = activeNight.from; s < activeNight.to; s++) {
                startSlots.push(s);
              }
              const minEnd = seg.from !== null ? seg.from + 1 : activeNight.from + 1;
              const endSlots: Slot[] = [];
              for (let s = minEnd; s <= activeNight.to; s++) {
                endSlots.push(s);
              }
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
                      <span className={styles.timeCardLabel}>几点能上车</span>
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
                      <span className={styles.timeCardLabel}>最晚玩到</span>
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
                        当晚可选 {formatDuration(segDuration)}
                      </span>
                      {activeSegments.length === 1 && (
                        <button
                          type="button"
                          className={styles.clearBtn}
                          onClick={() => removeSegment(0)}
                        >
                          清空当晚
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

        {/* Variable-height Crowd Wave + Overlap Track + Coral Draft Capsule */}
        <DensityBar
          night={activeNight}
          cells={combinedCells}
          draftSpans={draftMode === 'available' ? activeDraftSpans : []}
          showMyTrack={true}
          hasUnsavedDraft={isDirty}
          targetPlayers={snapshot.targetPlayers}
          durationSlots={snapshot.durationSlots}
          bestCandidate={bestActiveNightCandidate}
        />
      </section>

      {/* Sticky Thumb-Zone Bottom Dock */}
      <div className={styles.bottomDock}>
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
                <button
                  type="button"
                  className={styles.refreshBtn}
                  onClick={onRefreshLatest}
                >
                  查看最新填写
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
            {draftMode === 'unavailable' ? '改回有空' : '这次都不行'}
          </button>

          <button
            type="button"
            className={styles.primaryBtn}
            disabled={isSaving}
            onClick={handlePrimarySaveClick}
          >
            {isSaving
              ? '正在保存…'
              : draftMode === 'unavailable'
                ? '确认这次都不行'
                : '保存我的时间'}
          </button>
        </div>
      </div>

      <NicknameDialog
        open={nicknameDialogOpen}
        initialNickname={nickname}
        isSaving={isSaving}
        actionSummary={dialogSummary}
        onCancel={() => {
          setNicknameDialogOpen(false);
          setPendingSaveAfterNickname(false);
        }}
        onConfirm={(chosenName) => {
          setNickname(chosenName);
          if (pendingSaveAfterNickname) {
            void executeSave(chosenName);
          } else {
            setNicknameDialogOpen(false);
          }
        }}
      />
    </>
  );
}
