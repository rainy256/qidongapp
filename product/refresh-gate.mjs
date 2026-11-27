// Join concurrent state reads for the same login generation. Writes request a
// fresh read after any pre-existing read finishes, instead of accepting stale data.
export function createRefreshGate() {
  const flights = new Map();
  function run(key, task, afterCurrent = false) {
    const current = flights.get(key);
    if (current) {
      return afterCurrent
        ? current.promise.then(() => run(key, task), () => run(key, task))
        : current.promise;
    }
    const controller = new AbortController();
    const promise = Promise.resolve().then(() => task(controller.signal)).finally(() => {
      if (flights.get(key)?.controller === controller) flights.delete(key);
    });
    flights.set(key, {controller, promise});
    return promise;
  }
  function invalidate(key) {
    const current = flights.get(key);
    flights.delete(key);
    current?.controller.abort();
  }
  return { run, invalidate };
}
