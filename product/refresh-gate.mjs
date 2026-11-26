// Join concurrent state reads for the same login generation. Writes request a
// fresh read after any pre-existing read finishes, instead of accepting stale data.
export function createRefreshGate() {
  const flights = new Map();
  function run(key, task, afterCurrent = false) {
    const current = flights.get(key);
    if (current) {
      return afterCurrent
        ? current.then(() => run(key, task), () => run(key, task))
        : current;
    }
    const next = Promise.resolve().then(task).finally(() => {
      if (flights.get(key) === next) flights.delete(key);
    });
    flights.set(key, next);
    return next;
  }
  return { run };
}
