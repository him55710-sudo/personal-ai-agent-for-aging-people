import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScreen } from '../src/android.mjs';
import { boundedView } from '../src/bounded-screen.mjs';
import { profileApps } from '../src/bounded-scope.mjs';
import { inspectAndroidCapabilities, resolveApprovedActivity } from '../src/android-capabilities.mjs';
import { node, xml } from './fixtures/bounded-ui.mjs';

// Distilled from the real 2026-11-09 VM hierarchy, not evidence of a successful live rerun.
test('actual Settings Intelligence search field exposes fixed input despite its visible hint', () => {
  const search = xml(node('android:id/search_src_text', 'Search…', { package: 'com.android.settings.intelligence', className: 'android.widget.AutoCompleteTextView', focused: true, clickable: true }).replace('password="false"', 'password="false" hint="Search…"'));
  const screen = parseScreen(search, 'com.android.settings.intelligence');
  const view = boundedView(screen, { goal: 'font_size', allowedApps: profileApps.font_size });
  assert.equal(view.screenType, 'settings_search');
  assert.deepEqual(view.elements[0].actions, ['input']);
  assert(!view.operations.includes('font_set'));
  const oldScope = boundedView(screen, { goal: 'font_size', allowedApps: ['com.android.settings'] });
  assert.equal(oldScope.screenType, 'outside_scope'); assert.equal(oldScope.elements.length, 0);
  const populated = boundedView(parseScreen(search.replace('text="Search…"', 'text="private query"'), 'com.android.settings.intelligence'), { goal: 'font_size', allowedApps: profileApps.font_size });
  assert(!populated.elements.some(n => n.actions.includes('input')));
  assert(!JSON.stringify(populated).includes('private query'));
});

test('search results expose only known Settings titles, never login or arbitrary app controls', () => {
  const source = xml(node('com.android.settings.intelligence:id/title', 'Font size', { package: 'com.android.settings.intelligence' }), node('com.android.settings.intelligence:id/title', 'Unrelated private label', { package: 'com.android.settings.intelligence' }));
  const view = boundedView(parseScreen(source, 'com.android.settings.intelligence'), { goal: 'font_size', allowedApps: profileApps.font_size });
  assert.deepEqual(view.elements.map(n => n.label), ['Font size']);
  assert.throws(() => parseScreen(source.replace('Font size', 'Login'), 'com.android.settings.intelligence'), { status: 403 });
});

test('capability inspection reports the observed missing SMS app without launching or claiming success', async () => {
  const commands = [], binding = { serial: 'fixture-only' };
  const android = { binding: () => binding, adb: async (_binding, args) => {
    commands.push(args.at(-1));
    return { stdout: args.at(-1).includes('SENDTO') ? 'No activities found\n' : args.at(-1).includes('SET_ALARM') ? 'com.android.deskclock/.HandleSetAlarmApiCalls\n' : 'com.android.settings/.Settings\n' };
  } };
  const result = await inspectAndroidCapabilities(android, () => {});
  assert.equal(result.goals.sms_draft.available, false); assert.equal(result.goals.sms_draft.code, 'android_app_missing');
  assert.equal(result.goals.alarm.available, true); assert.equal(result.goals.font_size.available, true);
  assert(Object.values(result.goals).every(goal => goal.executionVerified === false));
  assert(commands.every(command => command.startsWith('cmd package resolve-activity')));
  assert(!JSON.stringify(result).includes('fixture-only'));
  await assert.rejects(resolveApprovedActivity(android, binding, 'sms_draft', '+12025550123'), { code: 'android_app_missing' });
});

test('capability inspection rejects revoked permission, changed binding and unsupported intent handlers', async () => {
  let binding = { serial: 'first' }, calls = 0;
  const android = { binding: () => binding, adb: async () => { calls++; binding = { serial: 'other' }; return { stdout: 'com.android.settings/.Settings' }; } };
  await assert.rejects(inspectAndroidCapabilities(android, () => {}), { status: 409 }); assert.equal(calls, 1);
  await assert.rejects(inspectAndroidCapabilities(android, () => { throw Error('revoked'); }), /revoked/); assert.equal(calls, 1);
  await assert.rejects(resolveApprovedActivity({ adb: async () => ({ stdout: 'com.example.unapproved/.Sms' }) }, binding, 'sms_draft'), { code: 'android_app_unresolved' });
});
