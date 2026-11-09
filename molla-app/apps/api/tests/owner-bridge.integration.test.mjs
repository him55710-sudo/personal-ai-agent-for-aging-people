import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { createApi } from '../src/server.mjs';
import { digest } from '../src/storage.mjs';
import { fixtureAndroid } from './fixtures/bounded-ui.mjs';
import { createDemoServer } from '../../../../fa-kakao-demo/server.mjs';

// Real HTTP/proxy/auth/approval/executor integration; provider, cloud and Android are fixtures.
// This test does not load operator credentials, start a VM or call an AI service.
test('Cheese owner bridge runs all three approved fixture goals and shuts down the same VM', async t => {
  const directory = mkdtempSync(resolve(tmpdir(), 'molla-owner-bridge-'));
  let api, bridge;
  t.after(async () => {
    if (bridge) { bridge.closeAllConnections(); await new Promise(done => bridge.close(done)); }
    if (api) await api.close();
    assert(directory.startsWith(resolve(tmpdir(), 'molla-owner-bridge-')));
    rmSync(directory, { recursive: true, force: true });
  });
  const tokens = { mom: randomBytes(32).toString('base64url'), dad: randomBytes(32).toString('base64url') };
  const authFile = resolve(directory, 'owners.json');
  writeFileSync(authFile, JSON.stringify({ owners: Object.entries(tokens).map(([actor, token]) => ({ actor, hash: digest(token), expiresAt: new Date(Date.now() + 3600000).toISOString() })) }));
  const env = { MOLLA_ENV: 'development', MOLLA_API_AUTH_FILE: authFile, MOLLA_LLM_ENABLED: '1', MOLLA_LLM_API_KEY: 'fixture-only', MOLLA_LLM_BASE_URL: 'https://example.invalid/v1', MOLLA_LLM_MODEL: 'fixture/model', MOLLA_ALLOW_ANDROID_AGENT: '1', MOLLA_ALLOW_ANDROID_UI: '1', MOLLA_ALLOW_ANDROID_APPS: '1', MOLLA_ALLOW_ANDROID_COMPOSE: '1', MOLLA_CLOUD_BINDINGS: JSON.stringify({ mom: { phoneId: 'fixture-mom-profile' } }) };
  const android = fixtureAndroid('home'), cloudCalls = [];
  let goal = 'font_size', contactId;
  const response = (name, args) => ({ call: { id: randomUUID(), type: 'function', function: { name, arguments: JSON.stringify(args) } }, model: 'fixture/model', provider: 'fixture', usage: { inputTokens: 100, outputTokens: 20 } });
  api = createApi({ env, dataDirectory: directory,
    cloudCall: async input => {
      cloudCalls.push(input);
      return { ok: true, phoneId: input.phoneId, sessionId: 'fixture-session', serial: 'fixture-device', state: input.operation === 'stop' ? 'stopped' : 'ready', expiresAt: Date.now() / 1000 + 180 };
    },
    runner: android.runner,
    provider: { complete: async ({ tools, messages }) => {
      if (tools.some(tool => tool.function.name === 'phone_agent_prepare')) {
        if (goal === 'sms_draft' && !messages.some(message => message.role === 'tool')) return response('contact_lookup', { query: '아들' });
        return response('phone_agent_prepare', { goal, maxSteps: 8, maxSeconds: 60, maxTokens: 30000,
          ...(goal === 'font_size' ? { targetScale: 1.15 } : goal === 'sms_draft' ? { contactId, body: '조금 늦어요.' } : { hour: 7, minute: 30, label: '아침' }) });
      }
      const { screen } = JSON.parse(messages.at(-1).content);
      const element = screen.elements[0];
      const operation = screen.screenType === 'font_size' ? 'font_set' : element ? element.actions[0] : screen.operations[0];
      return response(`android_${operation}`, { reason: 'Fixture approved operation', ...(element && operation !== 'font_set' ? { elementId: element.id } : {}) });
    } },
  });
  await new Promise(done => api.server.listen(0, '127.0.0.1', done));
  bridge = createDemoServer({ MOLLA_OWNER_API_URL: `http://127.0.0.1:${api.server.address().port}` });
  await new Promise(done => bridge.listen(0, '127.0.0.1', done));
  const base = `http://127.0.0.1:${bridge.address().port}`;
  const request = async (path, body, actor = 'mom') => {
    const res = await fetch(base + '/api/owner' + path, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${tokens[actor]}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json', 'Idempotency-Key': body.requestId || randomUUID() }) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  assert((await (await fetch(base)).text()).includes('owner-open'));
  assert.equal((await request('/phone/capabilities')).status, 403);
  assert.equal(android.commands.length, 0);
  for (const [path, body] of [['/consent', { value: 'active' }], ['/ai/consent', { enabled: true, includeMemories: false }], ['/preferences', { agentName: '치즈', scopes: ['phone', 'message'] }]]) assert.equal((await request(path, body)).status, 200);
  const quote = await request('/phone/quote', { durationMinutes: 3 });
  assert.equal(quote.body.estimatedMaxUsd, 0.15); assert.equal(cloudCalls.length, 0);
  assert.equal((await request('/phone/start', { quoteId: quote.body.quoteId })).status, 200);
  assert.equal((await request('/runtime')).body.phone.connected, true);
  const capabilities = await request('/phone/capabilities');
  assert.equal(capabilities.status, 200);
  assert(Object.values(capabilities.body.goals).every(result => result.available && !result.executionVerified));
  contactId = (await request('/contacts', { name: '아들', relation: '아들', phone: '01012345678' })).body.id;
  assert(contactId);
  for (goal of ['font_size', 'sms_draft', 'alarm']) {
    android.setScreen(goal === 'font_size' ? 'home' : 'outside');
    const before = android.commands.length;
    const planned = await request('/chat', { text: `Fixture ${goal}`, requestId: randomUUID() });
    assert.equal(planned.status, 200, `${goal}: ${planned.body.error}`);
    const task = planned.body.task;
    assert.equal(task.status, 'awaiting_approval'); assert.equal(android.commands.length, before);
    const approval = { id: task.id, decision: 'approve', expectedActionHash: task.approvalHash };
    assert.equal((await request('/task/decision', approval, 'dad')).status, 404);
    assert.equal((await request('/task/decision', approval)).status, 200);
    await Promise.all([...api.jobs]);
    const state = (await request('/state')).body, done = state.tasks.find(item => item.id === task.id);
    assert.equal(done.status, 'completed', `${goal}: ${done.agentReport?.error}`);
    assert.equal(done.agentReport.verified, true); assert(done.agentReport.steps.length > 0);
    assert(!JSON.stringify(state).includes(tokens.mom));
  }
  assert(!android.commands.some(command => /sms send|service call|keyevent 66/.test(command)));
  assert.equal((await request('/phone/stop', {})).body.state, 'stopped');
  assert.equal((await request('/runtime')).body.phone.connected, false);
  assert.deepEqual(cloudCalls.map(call => call.operation), ['start', 'stop']);
  assert.equal(cloudCalls[0].requestId, cloudCalls[1].requestId);
});
