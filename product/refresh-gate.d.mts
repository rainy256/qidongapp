export function createRefreshGate(): {
  run<T>(key: number, task: (signal: AbortSignal) => Promise<T>, afterCurrent?: boolean): Promise<T>;
  invalidate(key: number): void;
};
