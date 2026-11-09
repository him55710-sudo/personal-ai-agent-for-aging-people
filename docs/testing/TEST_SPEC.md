# Unit-test specification

## Purpose and scope

Add deterministic tests for documented safety and routing behavior that existing tests do not assert at the same input boundary. Keep tests local: use the fake clock and member devices already in `fa-trust/test/trust.test.ts`, and a stub `requestAction` for the scripted agent. Do not call live model, payment, messaging, or Android services.

## Test cases

| ID | Input/setup | Expected result | Coverage |
| --- | --- | --- | --- |
| SAFE-1 | `FamilyTrust.request(mom, {owner:'mom', kind:'loan', amountKRW:1_000_000})`; then try valid approvals from mom, dad, and son. | Request remains `blocked` at T3; the approval list does not advance and there is no receipt. | Added stateful guard test in `fa-trust/test/trust.test.ts`; the existing policy test covered classification only. |
| AUTH-1 | Request a transfer to first-time payee `하나 000` for 200,000 KRW; approve with the eligible family member. | It schedules with a 180-minute cooling-off period and executes only after the period. | Already covered by `fa-trust/test/trust.test.ts`. |
| AUTH-2 | Dad requests 500,000 KRW from mom to dad's own account, then dad, mom, and son attempt approval. | Dad is excluded; mom and son are required; execution waits for the cooling-off period. | Already covered by `fa-trust/test/trust.test.ts`. |
| PHISH-1 | Mom requests a 3,000,000 KRW transfer with text `검찰이 안전계좌로 옮기래, 가족한테 말하지 말래`. | Status is `held`, the decision cooling-off is 1,440 minutes, evidence is sealed, and a family alert says it is held as suspected fraud. | Added the missing cooling-off and alert assertions to `fa-trust/test/trust.test.ts`. |
| ISOLATION-1 | As mom, submit a request that tries to name dad as the actor; then write mom's memory and read dad's state. | Identity injection is rejected; dad sees no mom memory; the owners use separate SQLite files. | Already covered by `molla-app/apps/api/tests/api.test.mjs`. |
| ROUTE-1 | Call `replyScripted` with `family=seedFamily()`, `requester='son'`, text `엄마 구독 정리해줘`, and a stub gateway returning `{say:'routed'}`. | Gateway is called once with `{action:'scan_subscriptions', input:{owner:'mom'}}`; the helper returns `routed`. | Added in `fa-engine/test/agent.test.js`. |
| ROUTE-2 | Same fixture, text `엄마 계좌에서 50만원 내 계좌로 송금해줘`. | Gateway is called once with `{action:'transfer_money', input:{owner:'mom', to:'son', amount:500000}}`; the helper returns the gateway's `say` value. | Added in `fa-engine/test/agent.test.js`. |

## Dependency-ordered work

1. Compare the input boundary and expected result with source and existing test assertions; add only uncovered checks.
2. Trace the chosen input through the existing function and identify the externally visible output and state side effects.
3. Add the smallest unit test at the package's existing test entry point, using local fakes.
4. Independently review the cited source branch, assertion, and final diff; run the focused test and affected package suite.

## Acceptance criteria

- Tests assert externally meaningful output and state changes, not only that a helper was called.
- Tests run without network access, real credentials, persistent user data, or physical devices.
- Coverage claims are limited to the exact input and expectation asserted by the cited test.
- No product source change is needed for coverage-only work; report a discovered behavior defect separately unless a minimal fix is required to make the specified contract true.
