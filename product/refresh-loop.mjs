// Poll only after the previous read settles. Connectivity wake-ups are
// coalesced and force one fresh read after any in-flight request completes.
export function createRefreshLoop({
  run,
  interval,
  maxBackoff = 30000,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  let stopped = false;
  let timer = null;
  let running = false;
  let wakeQueued = false;
  let failures = 0;

  const clearScheduled = () => {
    if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }
  };

  const schedule = (delay) => {
    if (stopped) return;
    clearScheduled();
    timer = setTimer(() => {
      timer = null;
      void tick(false);
    }, delay);
  };

  const tick = async (force) => {
    if (stopped) return;
    clearScheduled();
    if (running) {
      if (force) wakeQueued = true;
      return;
    }

    running = true;
    let ok = false;
    try {
      ok = await run(force);
    } catch {
      ok = false;
    } finally {
      running = false;
    }

    if (stopped) return;
    if (wakeQueued) {
      wakeQueued = false;
      failures = 0;
      void tick(true);
      return;
    }

    const base = Math.max(1, Number(interval()) || 1);
    if (ok) {
      failures = 0;
      schedule(base);
      return;
    }

    failures += 1;
    const delay = Math.min(base * (2 ** Math.min(failures - 1, 10)), maxBackoff);
    schedule(delay);
  };

  return {
    start() {
      if (!stopped) void tick(false);
    },
    wake() {
      if (stopped) return;
      failures = 0;
      void tick(true);
    },
    stop() {
      stopped = true;
      wakeQueued = false;
      clearScheduled();
    },
  };
}
