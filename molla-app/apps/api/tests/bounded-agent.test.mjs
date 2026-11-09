import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { BoundedAndroidAgent } from '../src/bounded-agent.mjs';
import { boundedView, verifyGoal } from '../src/bounded-screen.mjs';
import { prepareAgentTask } from '../src/bounded-scope.mjs';
import { parseScreen } from '../src/android.mjs';
import { seed, consent, member, addContact, phoneBinding } from '../src/core.mjs';
import { screens, fixtureAndroid, xml, node } from './fixtures/bounded-ui.mjs';

const env = { MOLLA_ALLOW_ANDROID_AGENT: '1', MOLLA_ALLOW_ANDROID_UI: '1', MOLLA_ALLOW_ANDROID_APPS: '1', MOLLA_ALLOW_ANDROID_COMPOSE: '1', MOLLA_PHONE_BINDINGS: JSON.stringify({ mom: { serial: 'fixture-device', mode: 'local' } }) };
function planned(goal, extra = {}) {
  const state = seed({ live: true }); consent(state, 'mom', 'active'); const me = member(state, 'mom'); me.scopes.push('phone'); me.cloudAI.enabled = true;
  const contact = addContact(state, 'mom', { name: '아들', relation: '아들', phone: '01012345678' });
  const args = { goal, maxSteps: 8, maxSeconds: 60, maxTokens: 30000, ...(goal === 'font_size' ? { targetScale: 1.15 } : goal === 'sms_draft' ? { contactId: contact.id, body: '조금 늦어요.' } : { hour: 7, minute: 30, label: '아침' }), ...extra };
  return { state, args, action: prepareAgentTask(state, 'mom', args, env).action };
}
export const result = step => ({ call: { function: { name: 'android_step', arguments: JSON.stringify({ elementId: '', reason: 'Choose an approved action', ...step }) } }, model: 'fixture/model', provider: 'fixture', usage: { inputTokens: 100, outputTokens: 30 } });
function planner({ messages }) {
  const screen = JSON.parse(messages.at(-1).content).screen;
  if (screen.screenType === 'font_size') return result({ operation: 'font_set' });
  if (screen.elements[0]) return result({ operation: screen.elements[0].actions[0], elementId: screen.elements[0].id });
  return result({ operation: screen.operations[0] });
}
async function run(goal, options = {}) {
  const { action } = planned(goal, options.scope), android = options.android || fixtureAndroid(options.initial || (goal === 'font_size' ? 'home' : 'outside'));
  let effects = 0, authorized = true; const records = [];
  const check = () => { if (!authorized) throw new Error('cancelled'); };
  const agent = new BoundedAndroidAgent('mom', { getEnv: () => options.env || env, runner: android.runner, provider: { complete: options.complete || planner }, record: r => records.push(r), ...(options.now ? { now: options.now } : {}) });
  const work = agent.execute(action, { authorize: check, beforeEffect: () => { check(); effects++; }, verifying: check });
  options.onStart?.(() => { authorized = false; });
  return { evidence: await work, android, effects, records, action };
}
const reports = [];
for (const goal of ['font_size', 'sms_draft', 'alarm']) test(`fixture ${goal}: observe, reason, approved act, verify and account`, async () => {
  const r = await run(goal); assert.equal(r.evidence.verified, true); assert.equal(r.evidence.report.outcome, 'completed');
  assert(r.evidence.report.steps.every(s => s.observed.screenHash)); assert(r.evidence.report.usage.inputTokens > 0); assert(r.evidence.report.usage.reservedTokens <= r.action.scope.maxTokens);
  assert(!JSON.stringify(r.evidence.report).includes('Private unrelated account')); assert(!r.android.commands.some(c => /keyevent 66|service call|sms send/.test(c)));
  if (goal !== 'font_size') assert.equal(r.effects, 1);
  reports.push({ scenario: goal, fixturePassed: true, realEnvironment: 'not_run', ...r.evidence.report, source: 'synthetic-ui-fixture' });
});
test('only allowlisted elements are sent to the model; instruction-like labels and Send are not actions', () => {
  const scope = planned('font_size').action.scope;
  const view = boundedView(parseScreen(screens.home, 'com.android.settings'), scope);
  assert.equal(view.elements.length, 1); assert.equal(view.elements[0].label, 'Display');
  const smsView = boundedView(parseScreen(screens.sms, 'com.android.messaging'), planned('sms_draft').action.scope);
  assert.equal(smsView.elements.length, 0); assert(!JSON.stringify(smsView).includes('01012345678')); assert(!JSON.stringify(smsView).includes('늦어요'));
});
test('same text in old SMS bubbles is not compose evidence; wrong alarm label/enabled state is not success', () => {
  const { action } = planned('sms_draft'); assert.equal(verifyGoal(parseScreen(screens.wrongSms, 'com.android.messaging'), action.scope, action), false);
  const alarm = planned('alarm').action;
  for (const screen of [screens.alarm.replace('아침', '다른 알람'), screens.alarm.replace('checked="true"', 'checked="false"')]) assert.equal(verifyGoal(parseScreen(screen, 'com.android.deskclock'), alarm.scope, alarm, { clockFormat: '24' }), false);
  assert.equal(verifyGoal(parseScreen(screens.alarm, 'com.android.deskclock'), alarm.scope, alarm, { clockFormat: '12' }), false);
  const multiple = screens.sms.replace('</hierarchy>', node('com.android.messaging:id/recipient_number', '01099999999', { package: 'com.android.messaging' }) + '</hierarchy>');
  assert.equal(verifyGoal(parseScreen(multiple, 'com.android.messaging'), action.scope, action), false);
});
test('password, malformed XML and unsupported sensitive UI fail closed before provider/act', async () => {
  let calls = 0; const r = await run('font_size', { initial: 'password', complete: async () => { calls++; return planner(); } });
  assert.equal(calls, 0); assert.equal(r.effects, 0); assert.equal(r.evidence.verified, false); assert(!JSON.stringify(r.records).includes('SECRET-OTP'));
  assert.throws(() => parseScreen('<hierarchy><node>', 'com.android.settings'));
  const payment = xml(node('com.android.settings:id/title', '결제', { className: 'android.widget.Button' }));
  assert.throws(() => boundedView(parseScreen(payment, 'com.android.settings'), planned('font_size').action.scope));
});
test('stale model target is never executed; one re-observation permitted, repeated change stops', async () => {
  const android = fixtureAndroid('home'); let calls = 0;
  const r = await run('font_size', { android, complete: async m => { android.setScreen(++calls === 1 ? 'display' : 'home'); return planner(m); } });
  assert.equal(r.effects, 0); assert.equal(calls, 2); assert.equal(r.evidence.report.steps[0].result, 'stale_reobserved_no_action'); assert.equal(r.evidence.verified, false);
});
test('invented IDs, shell commands, added arguments, Send and out-of-scope actions never execute', async () => {
  for (const step of [{ operation: 'tap', elementId: 'invented' }, { operation: 'shell', command: 'id' }, { operation: 'compose' }, { operation: 'tap', elementId: 'send_message_button' }]) {
    const r = await run('font_size', { complete: async () => result(step) }); assert.equal(r.effects, 0); assert.equal(r.evidence.verified, false);
  }
});
test('model finish cannot manufacture success; unchanged UI and post-effect failure are uncertain without retry', async () => {
  const early = await run('font_size', { complete: async () => result({ operation: 'finish' }) }); assert.equal(early.evidence.verified, false);
  for (const options of [{ rejectEffects: true }, { wrongResult: true }]) {
    const r = await run('sms_draft', { android: fixtureAndroid('outside', options) }); assert.equal(r.effects, 1); assert.equal(r.evidence.verified, false); assert.equal(r.evidence.report.outcome, 'needs_verification');
  }
});
test('cancellation during reasoning prevents the next action; device/permission changes stop', async () => {
  let release, started; const entered = new Promise(r => started = r), wait = new Promise(r => release = r); let cancel;
  const work = run('font_size', { onStart: c => cancel = c, complete: async m => { started(); await wait; return planner(m); } });
  await entered; cancel(); release(); const r = await work; assert.equal(r.effects, 0); assert.equal(r.evidence.verified, false);
  for (const changed of [{ ...env, MOLLA_ALLOW_ANDROID_UI: '0' }, { ...env, MOLLA_PHONE_BINDINGS: JSON.stringify({ mom: { serial: 'different' } }) }]) assert.equal((await run('font_size', { env: changed })).effects, 0);
});
test('token, time and step budgets stop before another call/effect; unknown usage fails', async () => {
  let calls = 0; const r = await run('font_size', { scope: { maxTokens: 4000 }, complete: async m => { calls++; return planner(m); } }); assert.equal(calls, 0); assert.equal(r.effects, 0);
  let n = 0; const time = await run('font_size', { now: () => n++ ? 100000 : 0 }); assert.equal(time.effects, 0);
  const steps = await run('font_size', { scope: { maxSteps: 1 } }); assert.equal(steps.effects, 1); assert.equal(steps.evidence.verified, false);
  const noUsage = await run('font_size', { complete: async m => ({ ...planner(m), usage: {} }) }); assert.equal(noUsage.effects, 0);
});
test('ID-based fixed search input, list scrolling and Back use server-generated commands only', async () => {
  for (const initial of ['search', 'list']) {
    const r = await run('font_size', { initial }); assert.equal(r.evidence.verified, true);
    assert(r.android.commands.includes(initial === 'search' ? "input text 'font%ssize'" : 'input swipe 360 375 360 925 400'));
  }
  let first = true; const r = await run('font_size', { initial: 'display', complete: async m => first ? (first = false, result({ operation: 'back' })) : planner(m) }); assert(r.android.commands.includes('input keyevent 4')); assert(r.evidence.verified);
});
test('approval scope includes every budget/target; contact, phone scope and opt-in required', () => {
  const { state, args } = planned('font_size');
  for (const extra of [{ maxSteps: 99 }, { goal: 'bank_transfer' }, { allowedApps: ['evil'] }, { body: 'extra' }]) assert.throws(() => prepareAgentTask(state, 'mom', { ...args, ...extra }, env));
  assert.throws(() => prepareAgentTask(state, 'mom', args, { ...env, MOLLA_ALLOW_ANDROID_AGENT: '0' }));
  member(state, 'mom').scopes = []; assert.throws(() => prepareAgentTask(state, 'mom', args, env));
  assert.equal(phoneBinding('dad', env), null);
});
test.after(() => {
  if (process.env.MOLLA_WRITE_FIXTURE_REPORT === '1') {
    const path = resolve(import.meta.dirname, '../../../docs/live/bounded-agent-fixtures.json'); mkdirSync(resolve(path, '..'), { recursive: true });
    writeFileSync(path, JSON.stringify({ fixtureOnly: true, realModelCalled: false, realVmStarted: false, scenarios: reports }, null, 2) + '\n');
  }
});
