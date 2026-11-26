import type { SlotDensityCell } from '../../src/original/domain/recommend';
import type { Span, Pick } from '../../src/original/domain/types';
export function overlapWindows(cells: readonly SlotDensityCell[], earliestStart: number): {
  future: SlotDensityCell[];
  overlapCount: number;
  windows: { cells: SlotDensityCell[]; runs: (Span & { peak: number; minimum: number })[] }[];
};
export function cellsPerRow(width: number): number;
export function chunkCells<T>(cells: readonly T[], max: number): T[][];
export function tickIndices(length: number, width: number): number[];
export function bestFutureSpan(cells: readonly SlotDensityCell[], earliestStart: number): Span | null;
export function preserveElapsedPicks(saved: readonly Pick[], draft: readonly Pick[], earliestStart: number, unavailable: boolean): { history: Pick[]; future: Pick[]; picks: Pick[] };
