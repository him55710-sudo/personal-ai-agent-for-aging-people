# 제한된 Android 화면 에이전트

2026-11-09. 최신 main `d394e33`의 **소유자 API (`apps/api`, 기본 4319)** 위에 구현했다. 기존 4318 서버의 단일 설정 앱 열기 시연과 별개다. 병합 중 main의 `cb3881d` 변경(카카오 목업을 단일 제품 UI로 유지)을 함께 반영했다. 인증, 가족 관계, VM 견적과 시작/종료 흐름을 유지한다. 카카오 목업과 이 실제 실행 API의 연결은 별도 작업이다.

## 구현과 실제 검증을 구분

| 시나리오 | 구현 / 무료 UI fixture | 실제 Letsur + VM |
|---|---|---|
| A. 설정 → Display → Font size → 승인한 배율 | 통과. 요소 ID 탐색 뒤 고정된 `font_scale` 쓰기와 읽기, 글씨 크기 화면을 함께 확인 | 미실행 |
| B. 등록 연락처의 문자 초안 | 통과. 고정 SENDTO Intent, 명시적 작성 필드의 번호·본문 일치 확인. Send 도구 없음 | 미실행 |
| C. 알람 Intent | 통과. SET_ALARM Intent 및 동일 행의 24시간 시각·이름·켜짐·반복 없음 확인 | 미실행 |

이번 작업에서는 외부 AI 호출, VM 생성/시작, 유료 테스트를 하지 않았다. [fixture 기록](live/bounded-agent-fixtures.json)의 모델·토큰·화면은 모두 합성 값이며 실제 성능/비용 증거가 아니다. 이전 Terra 대화 검증은 이 새로운 도구 루프의 실환경 성공을 의미하지 않는다.

## 실행 구조

1. 기존 `/chat`에서 모델이 `phone_agent_prepare`로 목표/정확한 값/예산을 제안한다. VM은 자동으로 켜지지 않는다. 문자 연락처는 기존 조회 도구에서 얻은 ID만 사용한다.
2. 서버는 프로필에서 허용 앱·동작을 정하고 `android-agent` 승인 대기 작업을 만든다. 소유자 API의 작업 응답에 전체 범위가 표시된다. 가족은 요청만 할 수 있고 소유자가 승인한다.
3. 기존 `/task/decision`의 승인 해시가 목표·연락처·본문·앱·기기·동작·예산 전체를 고정한다. 동일 소유자의 Android 작업은 한 번에 하나만 승인된다.
4. **Observe:** 실제 전경 앱과 UI hierarchy를 읽고 전후 전경 일치를 확인한다. 비밀번호/인증 화면과 오버레이를 거부한다. 모델에는 허용된 요소의 불투명 ID, 짧은 라벨, 가능한 동작, 화면 해시만 전달한다. 전체 XML/스크린샷/메시지 목록/계정명은 모델이나 보고서에 저장하지 않는다.
5. **Reason:** Letsur의 도구 호출에서 `android_step` 하나를 스키마 검증한다. 간단한 동작 설명만 기록한다. 모델은 셸·좌표·새 본문·새 수신자·새 배율을 입력할 수 없다.
6. **Act:** 모델 응답 뒤 재관찰한 해시가 같을 때만 서버가 현재 요소의 bounds로 명령을 구성한다. 화면 변화 시 실행하지 않고 한 번 재관찰하며, 반복 변화는 새 사용자 확인이 필요하다.
7. **Verify:** 매 동작 뒤 실제 hierarchy를 다시 읽는다. 화면이 바뀌었다는 사실만으로 목표 완료를 인정하지 않는다. 고정 목표 검증기가 정확한 상태를 확인해야 `completed`가 된다. 알람·초안·배율 쓰기는 결과 불명 시 재시도하지 않는다.

## 승인 범위와 지원 한계

- `font_size`: 배율 0.85/1/1.15/1.3, Settings의 알려진 preference title/검색/목록. `tap`, `scroll_up/down`, `input`, `back`, `open`, `font_set`만 가능하다. 검색 입력은 서버의 고정 `font size`이고 한 번만 입력한다. 변경은 슬라이더 위치 추측 대신 고정 Android 설정 키만 쓴다. 플랫폼 권한 부족은 불확실/실패로 기록한다.
- `sms_draft`: 지원 목록에 있는 기본 SMS 앱의 resolve 결과를 명시적 component로 고정한다. SENDTO만 지원하며 UI 클릭·Send·키보드 Enter는 불가능하다. 연락처 이름만 보이거나 번호가 숨겨진 앱은 검증 실패로 남는다.
- `alarm`: 지원 DeskClock 앱의 resolve 결과에만 SET_ALARM을 보낸다. `SKIP_UI=false`, 승인 시각·이름만 사용한다. 앱이 저장 화면만 보여 주면 완료로 간주하지 않는다. 12시간 표시, 반복 설정 미표시, 알려지지 않은 OEM resource ID는 사람이 확인해야 한다.
- 범용성은 **버전 관리되는 화면 프로필 안에서 다음 동작을 모델이 선택하는 것**이다. 임의 앱/금융/결제/로그인/OTP/메시지 전송을 실행하는 범용 원격 제어가 아니다. 새로운 앱은 허용 프로필·검증기·부정 테스트를 함께 추가해야 한다.

단계 수 1–12, 실행 시간 10–90초, 토큰 예산 4,000–30,000을 승인 전에 정한다. 시간은 첫 관찰부터 계산한다. 모델 호출 전 UTF-8 입력 크기와 충분한 프로토콜 여유, 출력 상한을 예약한다. 보고된 실제 입력/출력 사용량도 기록한다. 사용량 누락/예약 초과 시 후속 동작을 막는다. 공급자의 잘못된 과금 보고까지 제어할 수는 없으며 요청 토큰 상한과 남은 예산으로 다음 호출을 제한한다. 이 실행 예산은 최초 대화의 계획 생성 비용과 별개이며, 기존 일일 대화 제한은 그대로 유지한다.

소유자의 `/task/decision` (`decision=cancel`) 또는 동의 철회는 기존 상태 전이로 즉시 접수된다. 실행기는 100ms 간격 및 모든 비동기 경계에서 권한을 확인하고 모델/ADB 요청을 중단한다. 이미 Android에 전달된 동작을 되돌렸다고 주장하지 않는다. 중간 중단·재시작·시간 초과는 재실행 없이 `needs_verification` 또는 취소로 남는다. 범위 변경은 새 작업·새 해시·새 승인을 필요로 한다.

VM의 기존 비용 승인·만료·종료는 `CloudVMManager`가 계속 담당한다. 에이전트는 VM 시작/연장 도구를 갖지 않는다. 실행 완료가 VM 종료를 대신하지 않으며, 기존 종료 버튼/공급자 만료가 유지된다.

## 실행과 검증

소유자 API의 `.env`에 `MOLLA_ALLOW_ANDROID_AGENT=1`을 **명시적으로** 설정한다(기본 꺼짐). 기존 UI/APPS 또는 COMPOSE 설정과 소유자의 AI·phone·message 동의도 필요하다. Letsur는 기존 provider 설정을 사용한다. Terra에는 `max_completion_tokens`와 `LETSUR_REASONING_EFFORT`를 사용하지만, 이 루프의 실제 Terra 도구 응답 호환성은 유료 테스트 전에 별도 확인 대상이다.

예: `/chat`에 “설정에서 글씨 크기를 1.15배로 바꿔줘. 최대 8단계, 60초, 30000토큰 안에서.”를 보낸다. 응답의 승인 내용을 읽고 소유자가 `/task/decision`에 `expectedActionHash`와 함께 승인한다. 지원 목표가 아닌 요청은 기존 대화/확인 흐름으로 남는다.

무료 검증:

```powershell
cd molla-app/apps/api
pnpm install --frozen-lockfile
pnpm test
$env:MOLLA_WRITE_FIXTURE_REPORT='1'
node --test tests/bounded-agent.test.mjs
```

각 작업의 `agentReport`는 관찰/재관찰, 모델 동작 설명, 도구 선택, 동작 시작, 이후 화면 해시·최소 요소·검증 값, 성공/불확실 사유, 소요 시간, 실제/예약 토큰을 단계별로 SQLite에 저장한다. 모델 응답 대기 전과 외부 동작 직전에도 저장하므로 중간 장애가 성공으로 둔갑하지 않는다. 소유자의 `/state`에서만 볼 수 있다. 원문 화면/연락처가 필요하면 기존 소유자 인증 `/phone/screen`에서 직접 확인한다.

실제 VM 테스트는 **새로 승인된 누적 예산** 안에서만 별도로 진행한다. 세 시나리오의 Intent 처리기·hierarchy ID·언어·알람 표시·font_scale 권한을 확인하고 종료/과금까지 기록해야 실환경 통과로 변경할 수 있다.

참고: [Android AlarmClock Intent 계약](https://developer.android.com/reference/android/provider/AlarmClock), [Android 공통 Intent](https://developer.android.com/guide/components/intents-common).
