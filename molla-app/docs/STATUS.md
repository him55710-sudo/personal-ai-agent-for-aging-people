# 구현·검증 상태

새 [소유자 API](../apps/api/README.md)는 별도의 인증과 작업 승인을 사용한다. 아래 설정 앱 결과는 기존 서버에서 확인했다. 새 API의 연결 복구는 로컬 테스트로 검증했으며, 실제 카카오톡 실행·문자 작성·T world 로그인은 별도 검증 항목이다. [소유자 API 검증](real-agent-verification.md)

제품 화면은 [카카오톡형 치즈](../../fa-kakao-demo/README.md) 하나다. 아래 표는 유지하는 소유자·Android API와 2026-11-09의 과거 검증을 구분한다. [현재 실행 안내](../README.md)

| 기능 | 구현·검증 |
|---|---|
| 제한된 화면 에이전트 | [Observe → Reason → Act → Verify 구현](bounded-android-agent.md). 설정 글씨 크기·문자 초안·알람 가상 UI 통과. 새 루프의 실제 Letsur/VM 검증 미실행, 기본 꺼짐 |
| 카카오톡형 치즈 | Node.js 브라우저 목업으로 가족 채팅·권한·승인·보안 프로필 시연 |
| Letsur 모델 | 기본 `gpt-6.1-terra`, 추론 `medium`. 실제 한국어 응답·승인 대기 초안 검증. `live/terra-model-smoke-report.json` |
| Vercel Gateway 모델 | 실제 `openai/gpt-5-mini` 응답·초안·중복 요청 방지 검증. `live/gateway-model-smoke-report.json` |
| 가족·기억·동의·승인·화면 접근 | 서버 테스트 68개 통과. 다른 소유자의 기기·화면에 접근하지 않음 |
| 이전 독립 모바일 화면 | 과거 테스트 API로 인증·승인·견적·화면 흐름 9개를 확인했다. `live/ui-contract-report.json` 보존 |
| 클라우드 Android | 엄마의 저장형 VM에서 실제 Letsur 계획·승인·설정 앱 실행 및 종료 검증. 아빠·자녀 VM은 미배정. `live/letsur-android-live-report.json` |
| 실제 Android 화면 캡처 | 인증·권한을 검사하는 캡처 API 확인. 이전 검증 화면에 설정 앱 캡처가 표시됐고 다른 소유자는 접근이 거부됐다. |
| 일반 휴대폰 원격 제어 | ADB로 승인·연결된 Android 어댑터만 구현. 임의의 상대방 휴대폰을 인터넷으로 제어하는 제품은 아님 |
| 공개 배포 | 로컬 API 검증. 운영 HTTPS 서버 미검증 |

실제 모델 검증은 합성 사용자와 임시 DB를 사용했다. 실제 가족의 동의를 대신하거나 메시지·구매·결제를 실행하지 않았다. UI fixture의 Android 결과와 과거 촬영 영상은 실제 VM 실행 증거가 아니다.

2026-11-09 실제 VM 검증은 3분 제한으로 한 세션만 실행했으며, 시작 약 100초 후 종료 확인, 최종 활성 세션 0, VM 크레딧 US$0.05 차감이었다. 화면은 React Native Web에서 확인했으며 APK/IPA 설치나 실제 개인 휴대폰 제어를 검증한 것은 아니다.

## 실제 실행 검증

현재 실행 경로는 [소유자 API 설정](real-connections.md)을 따른다. 소유자가 실행 범위와 비용을 확인하고 승인해야 한다. 계정에 로그인해야 하는 경우 인증은 계정 주인이 직접 완료한다. 2026-11-09의 설정 앱·화면 캡처는 [이전 모바일 검증 기록](live/MOBILE-VERIFICATION.md)에 보존한다.

## 비용과 외부 소스

Phone Harness의 [공식 요금](https://phone-harness.com/#pricing)은 Basic Android 분당 US$0.05, 신규 크레딧 US$5다. 계정 잔액·프로모션은 변경될 수 있다. Vercel AI 크레딧과 Letsur 사용료는 VM 크레딧과 서로 별개다. 일반 CI는 외부 모델이나 유료 VM을 호출하지 않는다.

Phone Harness는 MIT 라이선스 커밋 `4bebff105af853215fb74c958c2c5e78bc275be2`를 별도 설치한다. REA(MIT, `c78c8aed403b955680a342f5ad38680867e3858f`)는 개발 참고 소스이며 앱 실행 의존성이 아니다. 대용량 원본 체크아웃, 서브모듈 아카이브 및 도구 설치 파일은 이 제품 저장소에 포함하지 않는다.
