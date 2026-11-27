import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRefreshGate} from '../refresh-gate.mjs';
function deferred() {
  let resolve, reject;
  const promise = new Promise((a,b) => {resolve=a;reject=b;});
  return {promise,resolve,reject};
}
test('slow state read is shared by polling and manual refresh, not superseded', async () => {
  const gate = createRefreshGate(), d = deferred();
  let reads = 0;
  const load = () => {reads++;return d.promise;};
  const a = gate.run(1,load);
  const b = gate.run(1,load);
  const c = gate.run(1,load);
  assert.equal(a,b); assert.equal(b,c);
  await Promise.resolve(); assert.equal(reads,1);
  d.resolve('snapshot');
  assert.deepEqual(await Promise.all([a,b,c]),['snapshot','snapshot','snapshot']);
});
test('post-write refresh waits for old read and starts a new read', async () => {
  const gate=createRefreshGate(), old=deferred();
  let reads=0;
  const a=gate.run(1,()=>{reads++;return old.promise;});
  const b=gate.run(1,async()=>{reads++;return 'new';},true);
  await Promise.resolve();assert.equal(reads,1);
  old.resolve('old');
  assert.equal(await a,'old');assert.equal(await b,'new');assert.equal(reads,2);
});
test('login generations do not share reads; failed reads can be retried', async () => {
  const gate=createRefreshGate(),old=deferred();
  const a=gate.run(1,()=>old.promise);
  assert.equal(await gate.run(2,async()=>true),true);
  old.reject(Error('network'));
  await assert.rejects(a,/network/);
  assert.equal(await gate.run(1,async()=>true),true);
});

test('an acknowledged write can replace a stalled read without waiting for its timeout', async () => {
  const gate = createRefreshGate(), stale = deferred(), fresh = deferred();
  let oldSignal;
  const before = gate.run(1, signal => { oldSignal = signal; return stale.promise; });
  await Promise.resolve();
  gate.invalidate(1);
  const after = gate.run(1, () => fresh.promise);
  assert.equal(oldSignal.aborted, true);
  stale.resolve('old');
  await before;
  assert.equal(gate.run(1, () => assert.fail('duplicate state read')), after);
  fresh.resolve('new');
  assert.equal(await after, 'new');
});
