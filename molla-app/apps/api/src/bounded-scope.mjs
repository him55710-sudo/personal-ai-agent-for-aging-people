import { ajv, object, string, choice } from './schema.mjs';
import { DomainError, PolicyEngine, member, phoneBinding, resolveContact, enableLifecycle, id, now } from './core.mjs';

export const agentScopeSchema = object({
  goal: choice(['font_size', 'sms_draft', 'alarm']),
  targetScale: { type: 'number', enum: [0.85, 1, 1.15, 1.3] },
  contactId: { type: 'string', maxLength: 100 }, body: { type: 'string', maxLength: 1000 },
  hour: { type: 'integer', minimum: 0, maximum: 23 }, minute: { type: 'integer', minimum: 0, maximum: 59 },
  label: { type: 'string', maxLength: 40 },
  maxSteps: { type: 'integer', minimum: 1, maximum: 12 },
  maxSeconds: { type: 'integer', minimum: 10, maximum: 90 },
  maxTokens: { type: 'integer', minimum: 4000, maximum: 30000 },
}, ['goal', 'maxSteps', 'maxSeconds', 'maxTokens']);
const valid = ajv.compile(agentScopeSchema);
export const profileApps = Object.freeze({ font_size: ['com.android.settings'], sms_draft: ['com.android.messaging', 'com.google.android.apps.messaging', 'com.android.mms'], alarm: ['com.android.deskclock', 'com.google.android.deskclock'] });
export const profileOperations = Object.freeze({ font_size: ['open', 'tap', 'scroll_up', 'scroll_down', 'input', 'back', 'font_set'], sms_draft: ['compose'], alarm: ['set_alarm'] });
export function prepareAgentTask(s, actor, args, env) {
  if (!valid(args)) throw new DomainError('목표와 단계·시간·토큰 예산을 확인해 주세요.', 400);
  new PolicyEngine(s).request(actor, actor, 'phone');
  if (!member(s, actor).cloudAI.enabled || env.MOLLA_ALLOW_ANDROID_AGENT !== '1') throw new DomainError('AI 화면 실행 동의와 서버 설정이 필요해요.', 403);
  const device = phoneBinding(actor, env);
  if (!device) throw new DomainError('먼저 내 Android를 연결해 주세요. 자동으로 VM을 시작하지 않아요.', 409);
  let recipient = null, goalText;
  if (args.goal === 'font_size') {
    if (!Object.hasOwn(args, 'targetScale') || ['contactId', 'body', 'hour', 'minute', 'label'].some(k => Object.hasOwn(args, k))) throw new DomainError('글씨 크기만 지정해 주세요.', 400);
    goalText = `설정의 글씨 크기를 ${args.targetScale}배로 변경`;
  } else if (args.goal === 'sms_draft') {
    new PolicyEngine(s).request(actor, actor, 'message');
    if (!args.body?.trim() || /[\u0000-\u001f]/.test(args.body) || ['targetScale', 'hour', 'minute', 'label'].some(k => Object.hasOwn(args, k))) throw new DomainError('문자 초안과 등록된 연락처를 지정해 주세요.', 400);
    recipient = resolveContact(s, actor, args.contactId);
    if (!recipient) throw new DomainError('등록된 연락처를 먼저 확인해 주세요.', 409);
    goalText = `${recipient.name} (${recipient.phone})에게 문자 초안: ${args.body} — 전송 금지`;
  } else {
    if (!Number.isInteger(args.hour) || !Number.isInteger(args.minute) || !args.label?.trim() || /[\u0000-\u001f]/.test(args.label) || ['targetScale', 'body', 'contactId'].some(k => Object.hasOwn(args, k))) throw new DomainError('알람 시각과 이름을 지정해 주세요.', 400);
    goalText = `${String(args.hour).padStart(2, '0')}:${String(args.minute).padStart(2, '0')} 알람 (${args.label}), 반복 없음`;
  }
  const scope = { ...structuredClone(args), allowedApps: [...profileApps[args.goal]], allowedActions: [...profileOperations[args.goal]], version: 1 };
  const description = `${goalText}. 허용 앱: ${scope.allowedApps.join(', ')}. 허용 동작: ${scope.allowedActions.join(', ')}. 최대 ${args.maxSteps}단계 / ${args.maxSeconds}초 / ${args.maxTokens}토큰. 민감 화면·범위 변경 시 중단하고 새 승인을 요청해요.`;
  const task = { id: id(), owner: actor, requester: actor, kind: args.goal === 'sms_draft' ? 'message' : 'phone', text: goalText, title: '화면을 보며 도와드리기', summary: description, status: 'awaiting_approval', createdAt: now(), demo: false, steps: ['승인 범위 확인', '화면 관찰·실행·검증', '결과 확인'], step: 0,
    action: { type: 'agent.run', execution: 'android-agent', body: description, recipient, device, scope, risk: args.goal === 'sms_draft' ? 'compose_only_no_send' : 'bounded_device_change' } };
  enableLifecycle(s, task); s.tasks.unshift(task); return task;
}

export const stepSchema = object({ operation: choice(['open', 'tap', 'scroll_up', 'scroll_down', 'input', 'back', 'font_set', 'compose', 'set_alarm', 'finish', 'ask']), elementId: { type: 'string', maxLength: 100 }, reason: string(200) });
export const validateStep = ajv.compile(stepSchema);
export const stepTools = [{ type: 'function', function: { name: 'android_step', description: 'Choose one offered operation and current elementId. No coordinates, shell, new text or goal changes. Reason is a short action description, not private reasoning. ask stops for fresh owner review; finish cannot assert success.', strict: true, parameters: stepSchema } }];
