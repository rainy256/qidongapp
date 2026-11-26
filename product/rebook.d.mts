import type { Candidate } from '../src/original/domain/types';
import type { Reservation } from './types';
export function rebookOptions(candidates: readonly Candidate[], reservations: readonly Reservation[], now: number, limit?: number): {from:number;to:number}[];
