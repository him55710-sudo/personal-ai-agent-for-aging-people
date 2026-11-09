# 실제 연결 상태와 사용 방법

제품 화면은 [카카오톡형 치즈](../../fa-kakao-demo/README.md)에서 실행한다. 아래 절차는 독립 소유자 API와 Android 실행의 운영·검증용이다.

## 로컬 실행

1. [소유자 API 안내](../apps/api/README.md)에 따라 개인 접속 키를 발급하고 `molla-app/apps/api`에서 `pnpm start`를 실행한다. 기본 로컬 API 주소는 `http://127.0.0.1:4319`다.
2. 인증된 HTTP 클라이언트에서 소유자의 접속 키로 `/api/runtime`과 `/api/state`를 확인한다. 실제 모델 키는 서버 설정에만 둔다. [HTTP 계약](live-api-handoff.md)
3. 소유자가 가족 도움 수락, AI 처리, 기억 사용, Android 권한을 각각 결정한다. 저장형 Android VM을 실행하려면 별도로 시간과 비용이 명시된 견적을 확인하고 승인한다.

기존 HTTP 계약을 검증하려면 `molla-app`에서 `pnpm start`로 호환 API(`127.0.0.1:4318`)를 실행한다. `node scripts/verify-live-setup.mjs`는 해당 서버의 읽기 전용 확인에 사용한다. 공개 또는 LAN 배포에는 [소유자 API의 HTTPS 설정](../apps/api/README.md#environment)이 필요하다.

## 확인한 범위

- 호환 API의 Letsur `gpt-6.1-terra`와 추론 `medium`으로 실제 한국어 응답과 메시지 초안을 확인했다. [Terra 요청 설정과 검증](live/TERRA-MODEL.md)
- 이전 설정 앱 검증은 엄마에게 배정된 저장형 Android에서 전경 앱과 화면 캡처를 확인했고 VM을 종료했다. 당시 아빠·자녀에게 VM은 배정하지 않았다. [이전 실검증](live/MOBILE-VERIFICATION.md)
- 새 소유자 API에서는 모델 대화를 확인했다. 실제 카카오톡 앱 실행·문자 작성·T world 로그인은 아직 확인되지 않았다. [소유자 API 검증 기록](real-agent-verification.md)

공식 API 참고 [Letsur 첫 API 호출](https://docs.platform.letsur.ai/ai-gateway/getting-started) · [Phone Harness 세션 생성](https://phone-harness.com/docs/api-reference/sessions/create-session)
