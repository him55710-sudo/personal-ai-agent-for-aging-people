// Synthetic AOSP-shaped hierarchy fixtures. Never evidence of a real VM run.
const escape = s => String(s).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
export const node = (id, text, opts = {}) => `<node resource-id="${escape(id)}" text="${escape(text)}" content-desc="" class="${opts.className || 'android.widget.TextView'}" package="${opts.package || 'com.android.settings'}" enabled="true" clickable="${!!opts.clickable}" focused="${!!opts.focused}" scrollable="${!!opts.scrollable}" checked="${!!opts.checked}" password="${!!opts.password}" bounds="${opts.bounds || '[20,100][600,180]'}">${opts.children || ''}</node>`;
export const xml = (...nodes) => '<?xml version="1.0"?><hierarchy rotation="0">' + nodes.join('') + '</hierarchy>';
const title = text => node('com.android.settings:id/header_title', text, { bounds: '[20,0][600,80]' });
export const screens = {
  home: xml(title('Settings'), node('android:id/title', 'Display', { clickable: true }), node('android:id/title', 'Private unrelated account name', { bounds: '[20,200][600,280]' })),
  display: xml(title('Display'), node('android:id/title', 'Font size', { clickable: true })),
  font: xml(title('Font size'), node('com.android.settings:id/seek_bar', '', { className: 'android.widget.SeekBar' })),
  search: xml(title('Settings'), node('com.android.settings:id/search_src_text', '', { className: 'android.widget.EditText', focused: true })),
  list: xml(title('Settings'), node('com.android.settings:id/recycler_view', '', { scrollable: true, bounds: '[0,100][720,1200]' })),
  outside: xml(node('com.android.launcher3:id/workspace', '', { package: 'com.android.launcher3' })),
  password: xml(node('com.android.settings:id/password', 'SECRET-OTP', { className: 'android.widget.EditText', password: true })),
  sms: xml(node('com.android.messaging:id/recipient_text_view', '01012345678', { package: 'com.android.messaging' }), node('com.android.messaging:id/compose_message_text', '조금 늦어요.', { package: 'com.android.messaging', className: 'android.widget.EditText', bounds: '[20,200][600,400]' }), node('com.android.messaging:id/send_message_button', 'Send', { package: 'com.android.messaging', clickable: true, bounds: '[620,200][700,400]' })),
  wrongSms: xml(node('com.android.messaging:id/conversation_bubble', '01012345678', { package: 'com.android.messaging' }), node('com.android.messaging:id/conversation_bubble', '조금 늦어요.', { package: 'com.android.messaging' })),
  alarm: xml(node('com.android.deskclock:id/alarm_item', '', { package: 'com.android.deskclock', bounds: '[0,0][720,600]', children:
    node('com.android.deskclock:id/digital_clock', '07:30', { package: 'com.android.deskclock' }) + node('com.android.deskclock:id/label', '아침', { package: 'com.android.deskclock', bounds: '[20,200][600,260]' }) + node('com.android.deskclock:id/onoff', '', { package: 'com.android.deskclock', checked: true, bounds: '[620,100][710,180]' }) + node('com.android.deskclock:id/repeat_days', 'Never', { package: 'com.android.deskclock', bounds: '[20,300][600,360]' }) })),
};
export function fixtureAndroid(initial = 'home', { rejectEffects = false, wrongResult = false } = {}) {
  let current = initial, fontScale = 1;
  const commands = [];
  const pkg = () => current.includes('Sms') || current === 'sms' ? 'com.android.messaging' : current === 'alarm' ? 'com.android.deskclock' : current === 'outside' ? 'com.android.launcher3' : 'com.android.settings';
  const runner = async (_, args, options) => {
    if (options.signal?.aborted) throw new Error('aborted');
    const command = args.at(-1); commands.push(command);
    if (command === 'dumpsys activity activities') return { stdout: `mResumedActivity: ActivityRecord{12 u0 ${pkg()}/.Main t1}` };
    if (command.startsWith('cat ')) return { stdout: screens[current] };
    if (command.startsWith('cmd package resolve-activity')) return { stdout: command.includes('SENDTO') ? 'com.android.messaging/.Compose' : 'com.android.deskclock/.HandleApiCalls' };
    if (command === 'settings get system font_scale') return { stdout: String(fontScale) };
    if (command.startsWith('input ') || command.startsWith('am start') || command.startsWith('settings put')) {
      if (rejectEffects) throw new Error('fixture lost connection after dispatch');
      if (!wrongResult) {
        if (command.startsWith('input tap')) current = current === 'home' ? 'display' : 'font';
        if (command.startsWith('input swipe')) current = 'home';
        if (command.startsWith('input text')) current = 'display';
        if (command === 'input keyevent 4') current = 'home';
        if (command.startsWith('settings put')) fontScale = Number(command.split(' ').at(-1));
        if (command.includes('SENDTO')) current = 'sms';
        if (command.includes('SET_ALARM')) current = 'alarm';
        if (command.includes('android.settings.SETTINGS')) current = 'home';
      }
      return { stdout: 'Status: ok', stderr: '' };
    }
    return { stdout: '', stderr: '' };
  };
  return { runner, commands, setScreen(name) { current = name; } };
}
