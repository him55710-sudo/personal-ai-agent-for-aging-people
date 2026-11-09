import test from 'node:test';
import assert from 'node:assert/strict';

import { seedFamily } from '../src/family.js';
import { replyScripted } from '../src/agent.js';

function gatewayReturning(say) {
  const calls = [];
  return {
    calls,
    requestAction: async (request) => {
      calls.push(request);
      return { say };
    },
  };
}

test('scripted routing sends a family subscription request to the named owner', async () => {
  const gateway = gatewayReturning('routed');
  const result = await replyScripted({
    family: seedFamily(),
    requester: 'son',
    text: '엄마 구독 정리해줘',
    requestAction: gateway.requestAction,
  });

  assert.deepEqual(gateway.calls, [
    { action: 'scan_subscriptions', input: { owner: 'mom' } },
  ]);
  assert.equal(result, 'routed');
});

test('scripted routing parses a Korean transfer amount and keeps the named source owner', async () => {
  const gateway = gatewayReturning('routed');
  const result = await replyScripted({
    family: seedFamily(),
    requester: 'son',
    text: '엄마 계좌에서 50만원 내 계좌로 송금해줘',
    requestAction: gateway.requestAction,
  });

  assert.deepEqual(gateway.calls, [
    { action: 'transfer_money', input: { owner: 'mom', to: 'son', amount: 500_000 } },
  ]);
  assert.equal(result, 'routed');
});
