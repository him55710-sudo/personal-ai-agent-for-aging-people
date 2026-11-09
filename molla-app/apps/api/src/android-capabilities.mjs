import { DomainError, shellQuote } from './core.mjs';
import { profileApps } from './bounded-scope.mjs';

export async function resolveApprovedActivity(android, binding, goal, phone = '') {
  const intent = goal === 'sms_draft' ? 'android.intent.action.SENDTO' : goal === 'alarm' ? 'android.intent.action.SET_ALARM' : 'android.settings.SETTINGS';
  const uri = goal === 'sms_draft' ? ` -d ${shellQuote('smsto:' + phone)}` : '';
  const { stdout } = await android.adb(binding, ['shell', `cmd package resolve-activity --brief -a ${intent}${uri}`]);
  const component = stdout.trim().split(/\r?\n/).at(-1);
  if (/^No activit(?:y|ies) found\.?$/i.test(component)) {
    const name = goal === 'sms_draft' ? '문자 작성' : goal === 'alarm' ? '알람' : '설정';
    throw Object.assign(new DomainError(`이 VM에 ${name} 요청을 처리할 앱이 없어요. 지원 앱을 설치한 뒤 새로 승인해 주세요.`, 409), { code: 'android_app_missing' });
  }
  if (!/^[A-Za-z0-9_.]+\/[A-Za-z0-9_.$]+$/.test(component) || !profileApps[goal]?.includes(component.split('/')[0])) {
    throw Object.assign(new DomainError('지원되는 기본 앱을 선택한 뒤 새로 승인해 주세요.', 409), { code: 'android_app_unresolved' });
  }
  return component;
}

/** Intent availability only. It never launches apps or asserts that a goal succeeded. */
export async function inspectAndroidCapabilities(android, authorize) {
  const binding = android.binding(), original = android.adb.bind(android), goals = {};
  const check = () => {
    authorize();
    if (JSON.stringify(android.binding()) !== JSON.stringify(binding)) throw new DomainError('기기 연결이 변경되었어요.', 409);
  };
  const guarded = { adb: async (...args) => { check(); const result = await original(...args); check(); return result; } };
  for (const goal of ['font_size', 'sms_draft', 'alarm']) {
    check();
    try { await resolveApprovedActivity(guarded, binding, goal); goals[goal] = { available: true, executionVerified: false }; }
    catch (error) {
      if (!['android_app_missing', 'android_app_unresolved'].includes(error.code)) throw error;
      goals[goal] = { available: false, executionVerified: false, code: error.code, reason: error.message };
    }
  }
  check(); return { checkedAt: new Date().toISOString(), goals };
}
