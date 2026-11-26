export function createRefreshGate(): {
  run<T>(key: number, task: () => Promise<T>, afterCurrent?: boolean): Promise<T>;
};
