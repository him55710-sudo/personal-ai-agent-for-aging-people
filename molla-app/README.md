# 치즈 소유자 API와 Android 실행 서버

제품 화면은 [카카오톡형 치즈 가족 채팅](../fa-kakao-demo/README.md)에서 실행한다. 이 디렉터리에는 실제 모델 연결, 소유자 인증, 작업 승인, Android 실행을 검증하는 서버와 도구가 있다. 카카오톡 목업의 샘플 작업과 실제 Android 실행은 별도 경로다.

## 서버 선택

| 구성 | 실행 위치와 기본 주소 | 역할 |
| --- | --- | --- |
| [소유자 API](apps/api/README.md) | `apps/api`에서 `pnpm start`, `127.0.0.1:4319` | 만료·철회 가능한 소유자 인증, 사용자별 SQLite, 가족 관계, 승인 해시, 허용된 모델 도구와 Android 실행 |
| 호환 API | 이 디렉터리에서 `pnpm start`, `127.0.0.1:4318` | 기존 HTTP 계약과 모델·VM 검증에 쓰는 서버. `pnpm dev:api`도 같은 서버를 실행 |

두 서버 모두 화면을 제공하지 않는다. 포트 변경과 HTTPS·운영 배포는 각각의 서버 설정을 따른다. 실제 모델과 Android의 [검증 범위](docs/STATUS.md)를 확인할 수 있다.

## 호환 API 준비

Node.js 24 이상과 pnpm이 필요하다. 아래 환경 파일 복사는 최초 설정에만 실행한다.

```sh
cd molla-app
pnpm install --frozen-lockfile
cp .env.example .env
node scripts/enable-live.mjs
pnpm start
```

Windows PowerShell에서는 `Copy-Item .env.example .env`와 `& ./scripts/enable-live.ps1`을 사용할 수 있다. 활성화 도구는 최초 1회 개인 토큰과 토큰 해시를 만든다. `.data/owner-access.txt`는 서버 운영자가 해당 소유자에게만 개별 전달하는 비공개 파일이다. 새 소유자 API의 토큰과 저장소는 [별도 안내](apps/api/README.md)를 따른다.

실제 모델을 사용하려면 서버의 `.env`에서 `MOLLA_LLM_ENABLED=1`과 제공자를 지정한다. Letsur 설정은 `MOLLA_LLM_PROVIDER=letsur`, `LETSUR_API_KEY`, `LETSUR_MODEL`이고 Vercel 설정은 `MOLLA_LLM_PROVIDER=vercel`, `AI_GATEWAY_API_KEY`, `MOLLA_MODEL`이다. Terra의 기본 추론 설정은 `LETSUR_REASONING_EFFORT=medium`이다. [호환 요청과 모델 검증](docs/live/TERRA-MODEL.md)

## Android Cloud 준비

Python 3.10 이상, Phone Harness 계정 및 공식 ADB가 필요하다. 서버를 실행해도 VM은 시작되지 않는다. VM을 사용하는 시점에 소유자가 실행 시간과 비용을 확인하고 시작을 승인한다.

```powershell
node scripts/setup-phone-harness.mjs
# 공식 Android SDK Platform Tools를 설치하고 adb를 PATH에 추가
& ./scripts/phone-cloud.ps1 login
& ./scripts/phone-cloud.ps1 ls
node scripts/cloud-bind.mjs --help
```

`setup-phone-harness.mjs`는 지정 커밋을 저장소 루트의 `phone-harness/`에 준비한다. `cloud-bind.mjs`로 각 소유자에게 서로 다른 저장형 기기를 배정한다. `MOLLA_ADB`로 ADB 경로를 지정할 수 있다. 지원 범위는 승인된 앱 열기, 전경 앱 확인, 문자 작성 화면 열기, 소유자가 권한을 부여한 화면 캡처다. 실제 로그인은 계정 주인이 직접 완료한다.

## 검증

```sh
pnpm test
node scripts/verify-live-server.mjs
```

공유 HTTP 도구는 `client/runtime.ts`에 있다. 실제 모델 호출은 별도 승인 범위에서 `scripts/verify-letsur-live.mjs` 또는 `scripts/verify-gateway-model.mjs`로 확인한다. VM이 포함된 검증에는 별도의 시간·비용 한도가 필요하다. [실제 연결 설정](docs/real-connections.md) · [소유자 API 검증](docs/real-agent-verification.md)

개발 도구인 [eve 계획 에이전트](docs/agent-runtime.md)와 [이전 촬영 기록](docs/demo-recording.md)도 보존한다.
