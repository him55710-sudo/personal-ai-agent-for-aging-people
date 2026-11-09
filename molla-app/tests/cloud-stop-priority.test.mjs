import test from 'node:test';
import assert from 'node:assert/strict';
import { seed } from '../server/domain.mjs';
import { CloudVMManager } from '../server/cloud-vm.mjs';

function fixture(call) {
  let state = seed();
  for (const person of state.members) { person.consent = 'active'; person.scopes.push('phone'); }
  const store = { load: () => structuredClone(state), save: value => { state = structuredClone(value); } };
  const env = { MOLLA_CLOUD_BINDINGS: JSON.stringify({ mom: { phoneId: 'profile-mom' }, dad: { phoneId: 'profile-dad' } }) };
  return { store, cloud: new CloudVMManager({ ...store, env, call }) };
}
const ready = phoneId => ({ ok: true, phoneId, state: 'ready', sessionId: `session-${phoneId}`, serial: `vm-${phoneId}`, expiresAt: Date.now() / 1000 + 180 });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

test('stop during provisioning is retained, coalesced and prioritized over another diagnose/start', async () => {
  const gate = deferred(), calls = [];
  const { cloud, store } = fixture(async input => {
    calls.push(input);
    if (input.operation === 'start') { await gate.promise; return ready(input.phoneId); }
    return { ok: true, phoneId: input.phoneId, state: 'stopped' };
  });
  const starting = cloud.start('mom', cloud.quote('mom', 1).quoteId);
  const stopping = cloud.stop('mom'), duplicate = cloud.stop('mom');
  await assert.rejects(cloud.diagnose('mom'), { status: 409 });
  gate.resolve();
  await starting;
  assert.equal((await stopping).state, 'stopped');
  assert.equal((await duplicate).state, 'stopped');
  assert.deepEqual(calls.map(c => c.operation), ['start', 'stop']);
  assert.equal(calls[1].requestId, calls[0].requestId);
  assert.equal(store.load().cloudSessions.mom.state, 'stopped');
  await cloud.stop('mom');
  assert.equal(calls.length, 2);
});

test('queued stop recovers a failed start without ADB or a second paid start', async () => {
  const gate = deferred(), calls = [];
  const { cloud } = fixture(async input => {
    calls.push(input);
    if (input.operation === 'start') { await gate.promise; throw Error('fixture timeout'); }
    if (input.operation === 'recover') { assert.equal(input.connect, false); return ready(input.phoneId); }
    return { ok: true, phoneId: input.phoneId, state: 'stopped' };
  });
  const starting = cloud.start('mom', cloud.quote('mom', 1).quoteId);
  const failed = assert.rejects(starting, /fixture timeout/);
  const stopping = cloud.stop('mom');
  gate.resolve(); await failed;
  assert.equal((await stopping).state, 'stopped');
  assert.deepEqual(calls.map(c => c.operation), ['start', 'recover', 'stop']);
  assert(calls.every(c => c.phoneId === 'profile-mom' && c.requestId === calls[0].requestId));
});

test('stop waits for current status call and does not block another owner', async () => {
  const gate = deferred(), entered = deferred(), calls = [];
  const { cloud } = fixture(async input => {
    calls.push(input);
    if (input.operation === 'status') { entered.resolve(); await gate.promise; }
    return input.operation === 'stop' ? { ok: true, phoneId: input.phoneId, state: 'stopped' } : ready(input.phoneId);
  });
  await cloud.start('mom', cloud.quote('mom', 1).quoteId);
  const diagnosing = cloud.diagnose('mom'); await entered.promise;
  const stopping = cloud.stop('mom');
  assert.equal((await cloud.start('dad', cloud.quote('dad', 1).quoteId)).state, 'ready');
  gate.resolve(); await diagnosing;
  assert.equal((await stopping).state, 'stopped');
  assert.deepEqual(calls.filter(c => c.phoneId === 'profile-mom').map(c => c.operation), ['start', 'status', 'stop']);
});

test('provider stop failure stays unconfirmed and releases locks for explicit recovery', async () => {
  let failStop = true;
  const { cloud, store } = fixture(async input => {
    if (input.operation === 'stop' && failStop) throw Error('fixture stop unavailable');
    return input.operation === 'stop' ? { ok: true, phoneId: input.phoneId, state: 'stopped' } : ready(input.phoneId);
  });
  await cloud.start('mom', cloud.quote('mom', 1).quoteId);
  await assert.rejects(cloud.stop('mom'), /fixture stop unavailable/);
  assert.notEqual(store.load().cloudSessions.mom.state, 'stopped');
  failStop = false;
  assert.equal((await cloud.stop('mom')).state, 'stopped');
});
