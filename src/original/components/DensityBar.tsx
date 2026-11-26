import { useState, type CSSProperties } from 'react';
import {
  computeOverlapSpans,
  getHeatLevel,
  mergeDensityRuns,
  type SlotDensityCell,
} from '../domain/recommend';
import {
  formatAxisTick,
  formatDuration,
  formatSlotInNight,
  formatSpanInNight,
  slotToShanghaiParts,
} from '../domain/time';
import type { Candidate, Night, Slot, Span } from '../domain/types';
import { ChevronSoftIcon } from './AppIcons';
import styles from './DensityBar.module.css';

type DensityBarProps = Readonly<{
  night: Night;
  cells: readonly SlotDensityCell[];
  draftSpans: readonly Span[];
  targetPlayers?: number;
  durationSlots: number;
  bestCandidate: Candidate | null;
  showMyTrack?: boolean;
  hasUnsavedDraft?: boolean;
}>;

export function DensityBar({
  night,
  cells,
  draftSpans,
  durationSlots,
  bestCandidate,
  showMyTrack = true,
  hasUnsavedDraft = false,
}: DensityBarProps) {
  const [hoveredCell, setHoveredCell] = useState<SlotDensityCell | null>(null);
  const [showList, setShowList] = useState(false);

  const totalSlots = cells.length;
  if (totalSlots === 0) return null;

  const canHover =
    typeof window !== 'undefined' && window.matchMedia?.('(hover: hover)').matches;

  const peakCount = cells.reduce((max, c) => Math.max(max, c.count), 0);
  const overlapSpans = computeOverlapSpans(cells, 2);

  let statusBadge: {
    tone: 'ready' | 'almost' | 'info' | 'neutral' | 'muted';
    label: string;
  } | null = null;

  if (bestCandidate && bestCandidate.memberIds.length >= 2) {
    const heroSpan: Span = {
      from: Math.max(night.from, bestCandidate.firstStart),
      to: Math.min(night.to, bestCandidate.availableUntil),
    };
    if (heroSpan.to > heroSpan.from) {
      const spanText = formatSpanInNight(night, heroSpan);
      if (bestCandidate.missingPlayers === 0) {
        statusBadge = {
          tone: 'ready',
          label: `${spanText} · ${bestCandidate.memberIds.length} 人已凑齐`,
        };
      } else if (bestCandidate.missingPlayers === 1) {
        statusBadge = {
          tone: 'almost',
          label: `${spanText} · ${bestCandidate.memberIds.length} 人（差 1 人）`,
        };
      } else {
        statusBadge = {
          tone: 'info',
          label: `${spanText} · ${bestCandidate.memberIds.length} 人重合`,
        };
      }
    }
  } else if (overlapSpans.length > 0) {
    let longest = overlapSpans[0];
    for (let i = 1; i < overlapSpans.length; i++) {
      if (overlapSpans[i].to - overlapSpans[i].from > longest.to - longest.from) {
        longest = overlapSpans[i];
      }
    }
    statusBadge = {
      tone: 'neutral',
      label: `短时重合 ${formatSpanInNight(night, longest)}（不足 ${formatDuration(durationSlots)}）`,
    };
  } else if (peakCount === 1) {
    statusBadge = {
      tone: 'muted',
      label: '已有 1 人 · 等小伙伴重合',
    };
  }

  const ticks: {
    slot: Slot;
    label: string;
    leftPct: number;
    align: 'start' | 'center' | 'end';
  }[] = [];
  for (let i = 0; i <= totalSlots; i++) {
    const slot = night.from + i;
    const parts = slotToShanghaiParts(slot);
    const isEvenHour = parts.minute === 0 && parts.hour % 2 === 0;
    const isEdge = i === 0 || i === totalSlots;
    if (!isEvenHour && !isEdge) continue;
    if (i > 0 && i < 2) continue;
    if (i < totalSlots && totalSlots - i < 2) continue;

    ticks.push({
      slot,
      label: formatAxisTick(slot, night.dateKey),
      leftPct: (i / totalSlots) * 100,
      align: i === 0 ? 'start' : i === totalSlots ? 'end' : 'center',
    });
  }

  const clampedDrafts = draftSpans
    .map((s) => ({
      from: Math.max(night.from, s.from),
      to: Math.min(night.to, s.to),
    }))
    .filter((s) => s.to > s.from);

  const myTimeReadout =
    clampedDrafts.length > 0
      ? clampedDrafts.map((s) => formatSpanInNight(night, s)).join('、')
      : '当晚未选';

  const runs = mergeDensityRuns(cells);

  return (
    <div className={styles.root}>
      <div className={styles.topBar}>
        <div className={styles.titleGroup}>
          <span className={styles.label}>当晚重合</span>
          {statusBadge && (
            <span className={`${styles.statusBadge} ${styles[`badge_${statusBadge.tone}`]} tabular`}>
              {statusBadge.label}
            </span>
          )}
        </div>
        <button
          type="button"
          className={styles.inspectBtn}
          aria-expanded={showList}
          onClick={() => setShowList((v) => !v)}
        >
          <span>{showList ? '收起人数' : '查看人数'}</span>
          <ChevronSoftIcon
            size={15}
            className={showList ? styles.chevronOpen : styles.chevron}
          />
        </button>
      </div>

      {/* Uniform equal-size heat block grid */}
      <div
        className={styles.heatGrid}
        style={{ gridTemplateColumns: `repeat(${totalSlots}, minmax(0, 1fr))` }}
        onMouseLeave={() => setHoveredCell(null)}
        aria-label="当晚全员空余时段分布"
      >
        {cells.map((cell, idx) => {
          const parts = slotToShanghaiParts(cell.slot);
          const isMidnightStart =
            idx > 0 && parts.dateKey !== night.dateKey && parts.hour === 0 && parts.minute === 0;
          const level = getHeatLevel(cell.count, peakCount);
          const isPeak = peakCount >= 2 && cell.count === peakCount;
          return (
            <div
              key={cell.slot}
              className={`${styles.heatCell} ${isMidnightStart ? styles.midnightDivider : ''}`}
              onMouseEnter={() => {
                if (canHover) setHoveredCell(cell);
              }}
            >
              <div
                className={`${styles.heatBlock} ${styles[`level${level}`]} ${isPeak ? styles.isPeak : ''}`}
                style={
                  isPeak
                    ? ({ '--shimmer-delay': `${idx * 0.08}s` } as CSSProperties)
                    : undefined
                }
              >
                {isPeak ? (
                  <span className={styles.sparkle} aria-hidden="true">
                    ✦
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {/* Slim personal coral track */}
      {showMyTrack && (
        <div className={styles.myBlock}>
          <div className={styles.myHeader}>
            <span className={styles.myLabelWrap}>
              <span className={styles.myDot} aria-hidden="true" />
              <span className={styles.myCaption}>
                {hasUnsavedDraft ? '我的草稿 · 未保存' : '我的时间'}
              </span>
            </span>
            <span className={`${styles.myTimeReadout} tabular`}>{myTimeReadout}</span>
          </div>
          <div
            className={styles.myRail}
            style={{ gridTemplateColumns: `repeat(${totalSlots}, minmax(0, 1fr))` }}
          >
            {clampedDrafts.map((span) => (
              <div
                key={`${span.from}-${span.to}`}
                className={styles.mySegment}
                style={{
                  gridColumn: `${span.from - night.from + 1} / ${span.to - night.from + 1}`,
                }}
              />
            ))}
          </div>
        </div>
      )}

      <div className={`${styles.axis} tabular`} aria-hidden="true">
        {ticks.map((t) => (
          <span
            key={t.slot}
            className={`${styles.tick} ${styles[`tick_${t.align}`]}`}
            style={{ left: `${t.leftPct}%` }}
          >
            {t.label}
          </span>
        ))}
      </div>

      <div className={styles.heatLegend} aria-hidden="true">
        <span>少</span>
        {([0, 1, 2, 3, 4, 5] as const).map((lv) => (
          <span key={lv} className={`${styles.legendSwatch} ${styles[`level${lv}`]}`} />
        ))}
        <span>多</span>
      </div>

      {hoveredCell && (
        <p className={`${styles.hoverReadout} tabular`}>
          {formatSlotInNight(hoveredCell.slot, night.dateKey)}–
          {formatSlotInNight(hoveredCell.slot + 1, night.dateKey)} · {hoveredCell.count} 人有空
          {hoveredCell.memberNames.length > 0
            ? `（${hoveredCell.memberNames.join('、')}）`
            : ''}
        </p>
      )}

      {showList && (
        <div className={styles.breakdown}>
          {runs.length === 0 ? (
            <p className={styles.breakdownEmpty}>这晚暂时还没有人填写空余时间。</p>
          ) : (
            <ul className={styles.breakdownList}>
              {runs.map((run) => (
                <li key={`${run.from}-${run.to}`} className={`${styles.breakdownRow} tabular`}>
                  <span className={styles.breakdownTime}>{formatSpanInNight(night, run)}</span>
                  <span className={styles.breakdownCount}>{run.count} 人</span>
                  <span className={styles.breakdownNames}>{run.memberNames.join('、')}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
