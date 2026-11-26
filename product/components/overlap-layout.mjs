// Compact timeline windows use absolute half-hour slots, not wall-clock indices.
export function overlapWindows(cells, earliestStart) {
  const future = cells.filter(c => c.slot >= earliestStart);
  const runs = [];
  let start = -1;
  for (let i = 0; i <= future.length; i++) {
    if (i < future.length && future[i].count >= 2) {
      if (start < 0) start = i;
    } else if (start >= 0) {
      runs.push({ start, end: i - 1 });
      start = -1;
    }
  }
  const windows = [];
  for (const run of runs) {
    const start = Math.max(0, run.start - 1);
    const end = Math.min(future.length - 1, run.end + 1);
    const last = windows[windows.length - 1];
    if (last && start <= last.end + 1) {
      last.end = Math.max(last.end, end);
      last.runs.push(run);
    } else windows.push({ start, end, runs: [run] });
  }
  return { future, overlapCount: runs.length, windows: windows.map(w => ({
    cells: future.slice(w.start, w.end + 1),
    runs: w.runs.map(r => ({ from: future[r.start].slot, to: future[r.end].slot + 1,
      peak: Math.max(...future.slice(r.start, r.end + 1).map(c => c.count)),
      minimum: Math.min(...future.slice(r.start, r.end + 1).map(c => c.count)) })),
  })) };
}
export function cellsPerRow(width) {
  // 24px minimum tile width, 3px gap, 12-slot cap.
  return Math.max(1, Math.min(12, Math.floor((Math.max(0, width) + 3) / 27)));
}
export function chunkCells(cells, max) {
  const rows = [];
  const cap = Math.max(1, Math.floor(max));
  for (let i = 0; i < cells.length; i += cap) rows.push(cells.slice(i, i + cap));
  return rows;
}
export function tickIndices(length, width) {
  if (length <= 0) return [];
  // End labels align inwards. Reserve 64px between any adjacent tick marks.
  const minSlots = Math.max(1, Math.ceil(length * 64 / Math.max(1, width)));
  const step = Math.max(2, Math.ceil(minSlots / 2) * 2);
  const result = [0];
  for (let i = step; i < length; i += step) {
    if (length - i >= minSlots) result.push(i);
  }
  result.push(length);
  return result;
}
export function bestFutureSpan(cells, earliestStart) {
  const future = cells.filter(c => c.slot >= earliestStart);
  const peak = future.reduce((max, c) => Math.max(max, c.count), 0);
  if (!peak) return null;
  let best = null, current = null;
  for (const c of future) {
    if (c.count === peak) {
      if (current && c.slot === current.to) current.to++;
      else current = { from: c.slot, to: c.slot + 1 };
      if (!best || current.to - current.from > best.to - best.from) best = { ...current };
    } else current = null;
  }
  return best;
}

export function preserveElapsedPicks(saved, draft, earliestStart, unavailable) {
  const history = saved.map(p => ({ ...p, to: Math.min(p.to, earliestStart) })).filter(p => p.to > p.from);
  const future = unavailable ? [] : draft.map(p => ({ ...p, from: Math.max(p.from, earliestStart) })).filter(p => p.to > p.from);
  return { history, future, picks: [...history, ...future] };
}
