import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRefreshLoop} from '../refresh-loop.mjs';

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return {promise, resolve};
}

async function flush() {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

function fakeTimers() {
  let nextId = 0;
  const jobs = new Map();
  return {
    setTimer(callback, delay) {
      const id = ++nextId;
      jobs.set(id, {callback, delay});
      return id;
    },
    clearTimer(id) {
      jobs.delete(id);
    },
    delays() {
      return [...jobs.values()].map((job) => job.delay);
    },
    size() {
      return jobs.size;
    },
    async fireNext() {
      const entry = jobs.entries().next().value;
      assert.ok(entry, 'expected a scheduled timer');
      jobs.delete(entry[0]);
      entry[1].callback();
      await flush();
    },
  };
}

test('a slow read stays single-flight and connectivity wake queues one fresh read', async () => {
  const timers = fakeTimers();
  const slow = deferred();
  const calls = [];
  let active = 0;
  let maxActive = 0;
  const loop = createRefreshLoop({
    run: async (force) => {
      calls.push(force);
      active += 1;
      maxActive = Math.max(maxActive, active);
      try {
        return calls.length === 1 ? await slow.promise : true;
      } finally {
        active -= 1;
      }
    },
    interval: () => 6000,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
  });

  loop.start();
  await flush();
  assert.deepEqual(calls, [false]);

  loop.wake();
  loop.wake();
  await flush();
  assert.deepEqual(calls, [false], 'wake-ups must not overlap the slow read');

  slow.resolve(false);
  await flush();
  assert.deepEqual(calls, [false, true], 'one forced read follows the slow read');
  assert.equal(maxActive, 1);
  assert.deepEqual(timers.delays(), [6000]);
  loop.stop();
  assert.equal(timers.size(), 0);
});

test('failed reads back off and a successful read resets the interval', async () => {
  const timers = fakeTimers();
  const results = [false, false, false, false, false, true];
  let calls = 0;
  const loop = createRefreshLoop({
    run: async () => {
      calls += 1;
      return results.shift();
    },
    interval: () => 3000,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
  });

  loop.start();
  await flush();
  assert.equal(calls, 1);
  assert.deepEqual(timers.delays(), [3000]);

  for (const delay of [6000, 12000, 24000, 30000, 3000]) {
    await timers.fireNext();
    assert.deepEqual(timers.delays(), [delay]);
  }
  assert.equal(calls, 6);
  loop.stop();
});

test('wake cancels a pending poll and refreshes immediately; stop cancels the next poll', async () => {
  const timers = fakeTimers();
  const calls = [];
  const loop = createRefreshLoop({
    run: async (force) => {
      calls.push(force);
      return true;
    },
    interval: () => 6000,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
  });

  loop.start();
  await flush();
  assert.deepEqual(calls, [false]);
  assert.deepEqual(timers.delays(), [6000]);

  loop.wake();
  await flush();
  assert.deepEqual(calls, [false, true]);
  assert.deepEqual(timers.delays(), [6000]);

  loop.stop();
  assert.equal(timers.size(), 0);
});
