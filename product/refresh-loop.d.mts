export function createRefreshLoop(options: {
  run: (afterCurrent: boolean) => Promise<boolean>;
  interval: () => number;
  maxBackoff?: number;
  setTimer?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
}): {
  start(): void;
  wake(): void;
  stop(): void;
};
