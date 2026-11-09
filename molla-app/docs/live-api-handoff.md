# Owner API contract

The current owner API is `apps/api`; see its README and `real-agent-verification.md`. All task approvals now include `expectedActionHash` from `Task.approvalHash`. Mutations carry `Idempotency-Key`; chat/family requests also carry the same stable `requestId`. The server rejects mismatches and unknown actor/owner/device fields. The older contract below describes compatible routes; the current approval hash is mandatory for execution.

Additional lifecycle states are `created`, `planned`, `approved`, `executing`, `verifying`. Completion requires verified evidence. `prepared` remains a local-text artifact only. Task actions include a safe device label and server-assessed risk; raw session IDs and ADB serials are not returned. Family invite/join/decision/request routes grant request-only access with explicit parent acceptance, never shared account administration.

The shared HTTP client at `client/runtime.ts` is used by headless verification. The [current owner API](../apps/api/README.md) and the compatibility implementation in `server/` run separately from the [Cheese KakaoTalk mockup](../../fa-kakao-demo/README.md), the repository's product UI. The independent `molla-cli` package does not serve these routes. See [verification status](STATUS.md).

## Identity and transport

Every private request sends `Authorization: Bearer <owner-app-token>` to the exact configured HTTPS origin. Tokens identify the owner on the server; the client never sends an actor override. The owner obtains an access key from the backend operator and supplies it directly to their authorized client.

`GET /api/runtime` and `GET /api/state` must agree on the authenticated owner. Live verification requires `runtime.mode='live'`. Model processing and memory sharing require separate consent.

## Endpoints

| Route | Input | Result |
| --- | --- | --- |
| `GET /api/runtime` | None | `mode`, `me`, `llm`, `phone`, `limits` |
| `GET /api/state` | None | Owner `me`, `messages`, `tasks`, `memories`, `contacts`, allowed family `members` |
| `POST /api/consent` | `{value:'active'|'revoked'}` | Owner acceptance/withdrawal |
| `POST /api/ai/consent` | `{enabled,includeMemories}` | Explicit processing choices |
| `POST /api/chat` | `{text,requestId}` | Reply and optional reviewable task; UUID deduplicates retries |
| `POST /api/preferences` | `{agentName,scopes}` | Owner preferences; `phone` scope gates Android actions |
| `POST /api/contacts` | `{name,relation,phone}` | Owner-scoped contact |
| `POST /api/task/decision` | `{id,decision:'approve'|'reject'|'cancel',expectedActionHash}` | Applies the reviewed decision; client refreshes state |
| `POST /api/phone/quote` | `{durationMinutes}` | `{quoteId,durationMinutes,estimatedMaxUsd,expiresAt}` |
| `POST /api/phone/start` | `{quoteId}` | Explicitly accepted, owner-scoped start; no automatic retry |
| `POST /api/phone/stop` | `{}` | Stop owner's running session |
| `POST /api/phone/diagnose` | `{}` | Refresh owner's connection information |
| `GET /api/phone/screen` | None | Owner-authorized `{dataUrl,width,height,capturedAt,refreshAfterMs}` PNG; no serial/viewer credentials; no-store |

`llm` reports `enabled`, `configured`, `model`, `consented`, `includeMemories` and `ready`. `phone` reports `configured`, `state`, optional `provider`, `phoneId`, `expiresAt` and `actions`. `limits` reports `vmMaxMinutes` and `vmPricePerMinuteUsd`.

`Task.action` contains the exact `type`, `body`, `recipient`, `appId` and `execution` the person reviews. Supported execution modes are `local`, `android-compose`, and `android-app`. A successful decision POST does not establish completion: the refreshed task must include verified evidence. Draft preparation, unverified state, actual app opening and message sending must not be conflated.

## Verification

Screen capture requires active owner consent and phone scope, binds to the owner's current device, rechecks identity/permissions after capture and rate limits requests. The endpoint returns a fresh still image and metadata to an authorized caller.

From `molla-app`, run `node --test tests/client-runtime.test.mjs` and `node scripts/verify-live-server.mjs`. Both use temporary local servers. For actual model or VM checks, use the bounded procedures in [verification](real-agent-verification.md).
