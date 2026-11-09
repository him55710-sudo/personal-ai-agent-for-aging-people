import { DomainError } from './core.mjs';

const settings = 'com.android.settings';
const settingsSearch = 'com.android.settings.intelligence';
const editable = /EditText|AutoCompleteTextView/;
const navLabels = /^(Settings|Display|Display & touch|Accessibility|Font size|Display size and text|설정|디스플레이|접근성|글꼴 크기|글씨 크기|디스플레이 크기 및 텍스트)$/i;
const fontLabel = /^(Font size|글꼴 크기|글씨 크기)$/i;
const searchIds = new Set(['com.android.settings:id/search_action_bar', 'com.android.settings:id/search', 'com.android.settings:id/search_src_text', 'android:id/search_src_text']);
const listIds = new Set(['android:id/list', 'com.android.settings:id/recycler_view', 'com.android.settings:id/list', 'com.android.settings:id/main_content']);
const forbidden = /password|passcode|\bOTP\b|verification code|sign.?in|log.?in|pay now|checkout|transfer money|비밀번호|인증.?번호|인증.?코드|로그인|결제|송금/i;
const inside = (a, b) => a[0] <= b[0] && a[1] <= b[1] && a[2] >= b[2] && a[3] >= b[3];

/** This is a versioned AOSP profile, not permission to tap every clickable node. */
export function boundedView(screen, scope) {
  if (screen.nodes.some(n => forbidden.test(n.label) && (/EditText|Button/.test(n.className) || n.resourceId.endsWith('/title')))) throw new DomainError('로그인·인증·결제 화면은 자동으로 다루지 않아요. 직접 확인해 주세요.', 403);
  if (screen.nodes.some(n => n.package && ![screen.package, 'com.android.systemui'].includes(n.package))) throw new DomainError('다른 앱의 화면이나 오버레이가 나타났어요. 직접 확인해 주세요.', 409);
  const allowed = scope.allowedApps.includes(screen.package), elements = [];
  let screenType = 'outside_scope';
  if (allowed && scope.goal === 'font_size') {
    const labels = screen.nodes.filter(n => n.package === screen.package && navLabels.test(n.label));
    const isFont = screen.package === settings && labels.some(n => fontLabel.test(n.label)) && screen.nodes.some(n => n.package === settings && /SeekBar/.test(n.className));
    const hasSearch = screen.nodes.some(n => searchIds.has(n.resourceId));
    const isSearch = screen.nodes.some(n => n.package === screen.package && searchIds.has(n.resourceId) && editable.test(n.className));
    if (labels.length || hasSearch) screenType = isFont ? 'font_size' : isSearch ? 'settings_search' : 'settings_navigation';
    for (const node of screen.nodes.filter(n => n.package === screen.package && [settings, settingsSearch].includes(n.package) && n.enabled)) {
      const actions = [];
      const label = navLabels.test(node.label) ? node.label : undefined;
      // Click the exact known preference title, not the center of a broad parent container.
      if (label && ['android:id/title', `${screen.package}:id/title`].includes(node.resourceId) && /TextView/.test(node.className)) actions.push('tap');
      if (searchIds.has(node.resourceId)) {
        if (node.clickable && !(editable.test(node.className) && node.focused)) actions.push('tap');
        if (editable.test(node.className) && node.focused && (!node.label.trim() || node.hint && node.label === node.hint)) actions.push('input');
      }
      if (screenType !== 'outside_scope' && node.scrollable && listIds.has(node.resourceId)) actions.push('scroll_up', 'scroll_down');
      if (actions.length) elements.push({ id: node.id, label: label || (searchIds.has(node.resourceId) ? 'Settings search' : 'Settings list'), actions });
    }
  } else if (allowed) screenType = scope.goal;
  if (allowed && screenType === 'outside_scope') throw new DomainError('지원되는 화면 구조를 확인하지 못했어요. 직접 확인 후 새로 승인해 주세요.', 409);
  if (elements.length > 40) throw new DomainError('안전하게 선택할 요소가 너무 많아요.', 409);
  const operations = scope.goal === 'font_size' ? (allowed ? ['back', ...(screenType === 'font_size' ? ['font_set'] : [])] : ['open']) : [scope.goal === 'sms_draft' ? 'compose' : 'set_alarm'];
  return { package: allowed ? screen.package : 'outside_scope', screenType, screenHash: screen.screenHash, capturedAt: screen.capturedAt, elements, operations: [...operations, 'finish', 'ask'] };
}

export function verifyGoal(screen, scope, action, facts = {}) {
  if (!scope.allowedApps.includes(screen.package)) return false;
  if (scope.goal === 'font_size') return boundedView(screen, scope).screenType === 'font_size' && facts.fontScale === scope.targetScale;
  if (scope.goal === 'sms_draft') {
    // Only explicit compose fields count, never old conversation bubbles or unrelated labels.
    const address = screen.nodes.filter(n => /\/(recipient_text_view|recipient_name|recipient_number|chips|contact_name)$/.test(n.resourceId));
    const body = screen.nodes.filter(n => /\/(compose_message_text|message_text|message_text_input)$/.test(n.resourceId) && /EditText/.test(n.className));
    const digits = action.recipient.phone.replace(/\D/g, '');
    return address.length === 1 && address[0].label.replace(/\D/g, '') === digits && body.length === 1 && body[0].label.trim() === scope.body.trim();
  }
  // Require one explicit clock field and an unambiguous time in the same known alarm row.
  return screen.nodes.filter(n => /\/alarm( clock)?_?item$|\/alarm_item$/.test(n.resourceId)).some(row => {
    const nodes = screen.nodes.filter(n => inside(row.bounds, n.bounds) && n.package === screen.package);
    const clocks = nodes.filter(n => /\/(digital_clock|clock|time)$/.test(n.resourceId));
    if (clocks.length !== 1) return false;
    const match = clocks[0].label.trim().match(/^(?:(AM|PM|오전|오후)\s*)?(\d{1,2}):(\d{2})(?:\s*(AM|PM|오전|오후))?$/i);
    if (!match || (match[1] && match[4])) return false;
    const markers = nodes.filter(n => /\/(am_pm|ampm)$/.test(n.resourceId));
    if (markers.length > 1) return false;
    const inline = match[1] || match[4], separate = markers[0]?.label.trim();
    if (inline && separate) return false;
    const marker = (inline || separate || '').toUpperCase();
    let hour = Number(match[2]); const minute = Number(match[3]);
    if (minute > 59 || hour > 23) return false;
    if (marker) {
      if (facts.clockFormat === '24' || !['AM', 'PM', '오전', '오후'].includes(marker) || hour < 1 || hour > 12) return false;
      hour = hour % 12 + (['PM', '오후'].includes(marker) ? 12 : 0);
    } else if (facts.clockFormat !== '24') return false;
    return hour === scope.hour && minute === scope.minute
      && nodes.some(n => /\/(label|alarm_label)$/.test(n.resourceId) && n.label === scope.label)
      && nodes.some(n => /\/(onoff|alarm_switch)$/.test(n.resourceId) && n.checked)
      && nodes.some(n => /\/(repeat_days|days_of_week)$/.test(n.resourceId) && /^(Never|Once|반복 안함|한 번)$/.test(n.label));
  });
}
