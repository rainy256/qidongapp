import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ChevronDown } from 'lucide-react';
import { DensityBar } from '../../src/original/components/DensityBar';
import type { SlotDensityCell } from '../../src/original/domain/recommend';
import { formatDuration, formatSlotInNight, formatSpanInNight, slotToShanghaiParts } from '../../src/original/domain/time';
import type { Candidate, Night, Slot, Span } from '../../src/original/domain/types';
import { cellsPerRow, chunkCells, overlapWindows, tickIndices } from './overlap-layout.mjs';

type Props = Readonly<{
  night: Night; cells: readonly SlotDensityCell[]; earliestStart: Slot;
  draftSpans: readonly Span[]; showMyTrack: boolean; hasUnsavedDraft?: boolean;
  targetPlayers: number; durationSlots: number; bestCandidate: Candidate | null;
}>;

export function OverlapTimeline({ night, cells, earliestStart, draftSpans, showMyTrack,
  hasUnsavedDraft = false, targetPlayers, durationSlots, bestCandidate }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<Slot | null>(null);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(measure);
      observer.observe(el);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  useEffect(() => { setSelected(null); setExpanded(false); }, [night.id]);
  const { windows, overlapCount, future } = useMemo(() => overlapWindows(cells, earliestStart), [cells, earliestStart]);
  const trackWidth = Math.max(70, (width || 320) - 46);
  const maxPerRow = cellsPerRow(trackWidth);
  
  const wide = width >= 460;

  function renderRows(list: readonly SlotDensityCell[]) {
    return chunkCells(list, maxPerRow).map(row => {
      const first = row[0].slot, end = row[row.length - 1].slot + 1;
      const picked = row.find(c => c.slot === selected);
      const midnightIndex = row.findIndex(c => { const t = slotToShanghaiParts(c.slot); return t.hour === 0 && t.minute === 0; });
      return <div key={first} className="overlapRowBlock">
        <div className="overlapRowMeta tabular">
          <span>{formatSlotInNight(first, night.dateKey)}</span>
          <span>{formatSlotInNight(end, night.dateKey)}</span>
        </div>
        <div className="overlapGrid" style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}>
          {row.map(cell => {
            const level = Math.min(3, Math.max(0, cell.count));
            const full = cell.count >= targetPlayers;
            const mine = showMyTrack && draftSpans.some(s => cell.slot >= s.from && cell.slot < s.to);
            const parts = slotToShanghaiParts(cell.slot);
            const midnight = parts.hour === 0 && parts.minute === 0;
            return <button type="button" key={cell.slot}
              className={`overlapCell overlapLevel_${level}${full ? ' isFullOverlap' : ''}${mine ? ' isMineSlot' : ''}${midnight ? ' isMidnightSlot' : ''}`}
              style={{ '--twinkle-delay': `${(cell.slot % 11) * .17}s` } as CSSProperties}
              aria-label={`${formatSlotInNight(cell.slot, night.dateKey)} 至 ${formatSlotInNight(cell.slot + 1, night.dateKey)}，${cell.count}人空闲${cell.memberNames.length ? '：'+cell.memberNames.join('、') : ''}`}
              aria-pressed={selected === cell.slot} onClick={() => setSelected(v => v === cell.slot ? null : cell.slot)}>
              {full && <span className="overlapShimmer" aria-hidden="true"/>}
              {full && <span className="twinkleStar" aria-hidden="true">✦</span>}
              <span className="overlapCellCount tabular">{cell.count}</span>
            </button>;
          })}
        </div>
        {row.length >= 4 && <div className="overlapTicks tabular" aria-hidden="true">
          {tickIndices(row.length, trackWidth).filter(i => i > 0 && i < row.length).map(i =>
            <span key={i} style={{ left: `${i / row.length * 100}%` }}>{slotToShanghaiParts(first + i).hhmm}</span>)}
          {midnightIndex > 0 && <i className="overlapMidnightTick" style={{ left: `${midnightIndex / row.length * 100}%` }}/> }
        </div>}
        {picked && <small className="overlapReadout" role="status">{formatSlotInNight(picked.slot, night.dateKey)}–{formatSlotInNight(picked.slot+1, night.dateKey)} · {picked.count} 人{picked.memberNames.length ? `（${picked.memberNames.join('、')}）` : '有空'}</small>}
      </div>;
    });
  }

  // A genuinely wide card uses the unmodified desktop component. Narrow cards
  // (including a split-screen tablet) always use the mobile layout.
  return <div className="adaptiveTimeline" ref={root}>
    {wide ? <DensityBar night={night} cells={cells} draftSpans={draftSpans}
      showMyTrack={showMyTrack} hasUnsavedDraft={hasUnsavedDraft} targetPlayers={targetPlayers}
      durationSlots={durationSlots} bestCandidate={bestCandidate}/> : <div className="mobileTimelineWrap">
      <div className="overlapCard">
        <div className="overlapHeader"><strong className="overlapTitle">当晚重合</strong>
          <span className="overlapCount tabular">{overlapCount ? `${overlapCount} 段重合` : '暂无重合'}</span></div>
        {!windows.length ? <p className="overlapEmpty">{!future.length ? '今日时段已过，可切换后续日期。' : '还没有 2 人以上共同空闲的未来时段。'}</p> :
          <div className="overlapSegments">{windows.map(w => <div key={w.cells[0].slot} className="overlapSegment">
            <div className="overlapRunLabels">{w.runs.map(r => <div key={r.from} className={`overlapRunLabel${r.peak >= targetPlayers ? ' full' : ''}`}>
              <strong>{formatSpanInNight(night, r)}</strong><span>{r.minimum >= targetPlayers ? '3人齐' : r.peak >= targetPlayers ? '2–3人' : '2人'} · {formatDuration(r.to-r.from)}</span>
            </div>)}</div>
            {renderRows(w.cells)}
          </div>)}</div>}
        <div className="overlapLegend" aria-label="图例">{[0,1,2,3].map(n => <span className="legendItem" key={n}><i className={`legendSwatch overlapLevel_${n}`}/>{n}人</span>)}</div>
        {showMyTrack && <small className="overlapReadout"><i className="overlapMyLegend"/> {hasUnsavedDraft ? '我的草稿时间' : '我的时间'}</small>}
        <small className="overlapReadout">点击格子查看成员；每格30分钟。</small>
      </div>
      {future.length > 0 && <details className="disclosureInner" open={expanded} onToggle={e => setExpanded(e.currentTarget.open)}>
        <summary className="disclosureSummaryInner"><span>展开完整剩余时间轴</span><ChevronDown size={16} className="disclosureChevron" aria-hidden="true"/></summary>
        {expanded && <div className="disclosureContentInner overlapSegment">{renderRows(future)}

        </div>}
      </details>}
    </div>}
  </div>;
}
