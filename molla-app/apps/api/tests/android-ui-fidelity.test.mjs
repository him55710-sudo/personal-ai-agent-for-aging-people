import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScreen, AndroidExecutor } from '../src/android.mjs';
import { boundedView, verifyGoal } from '../src/bounded-screen.mjs';
import { node, xml, screens } from './fixtures/bounded-ui.mjs';

test('visible Settings title remains selectable when accessibility description duplicates it', () => {
  const source = xml(node('android:id/title', 'Display', { clickable: true }).replace('content-desc=""', 'content-desc="Display"'));
  const screen = parseScreen(source, 'com.android.settings');
  const view = boundedView(screen, { goal: 'font_size', allowedApps: ['com.android.settings'] });
  assert.equal(view.elements[0]?.label, 'Display');
  assert.deepEqual(view.elements[0]?.actions, ['tap']);
});

test('XML built-in entities are decoded for visible menu labels; custom entities stay forbidden', () => {
  const source = xml(node('android:id/title', 'Display & touch'));
  const view = boundedView(parseScreen(source, 'com.android.settings'), { goal: 'font_size', allowedApps: ['com.android.settings'] });
  assert.equal(view.elements[0]?.label, 'Display & touch');
  assert.throws(() => parseScreen('<!DOCTYPE hierarchy [<!ENTITY secret "private">]>' + source, 'com.android.settings'));
});

test('SMS exact-body verification uses visible text without appending accessibility hints', () => {
  const source = screens.sms.replace('text="조금 늦어요." content-desc=""', 'text="조금 늦어요." content-desc="Message input"');
  const scope = { goal: 'sms_draft', allowedApps: ['com.android.messaging'], body: '조금 늦어요.' };
  assert.equal(verifyGoal(parseScreen(source, 'com.android.messaging'), scope, { recipient: { phone: '01012345678' } }), true);
});

test('accessibility-only authentication hints still block and changes invalidate the screen hash', () => {
  const field = node('com.android.settings:id/search_src_text', 'Search', { className: 'android.widget.EditText' });
  assert.throws(() => parseScreen(xml(field.replace('content-desc=""', 'content-desc="verification code"')), 'com.android.settings'), { status: 403 });
  const paymentTitle = node('android:id/title', 'Continue').replace('content-desc=""', 'content-desc="checkout"');
  assert.throws(() => parseScreen(xml(paymentTitle), 'com.android.settings'), { status: 403 });
  assert.throws(() => parseScreen(xml(field.replace('content-desc=""', 'content-desc="&#79;TP"')), 'com.android.settings'), { status: 403 });
  const first = parseScreen(xml(field), 'com.android.settings');
  const changed = parseScreen(xml(field.replace('content-desc=""', 'content-desc="New description"')), 'com.android.settings');
  assert.notEqual(first.screenHash, changed.screenHash);
});

test('screen reader accepts a valid hierarchy without an XML declaration', async () => {
  const env = { MOLLA_PHONE_BINDINGS: JSON.stringify({ mom: { serial: 'fixture-device', mode: 'local' } }) };
  const executor = new AndroidExecutor('mom', { getEnv: () => env, runner: async (_, args) => ({ stdout: args.at(-1) === 'dumpsys activity activities'
    ? 'mResumedActivity: ActivityRecord{12 u0 com.android.settings/.Settings t1}'
    : args.at(-1).startsWith('cat ') ? screens.home.replace('<?xml version="1.0"?>', '') : '' }) });
  const screen = await executor.screen(executor.binding(), () => {});
  assert.equal(screen.package, 'com.android.settings');
  assert(screen.nodes.some(n => n.label === 'Display'));
});
