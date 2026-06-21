# 역량 기반 완강률 MVP — 구현 계획 (태스크 관리)

## Context (왜 이 작업을 하는가)

온라인 강의 "완강률 개선" MVP 기획 프로젝트에서, 핵심 가설 **"강의를 '역량 목표'로 재구성하고 진척에 맞춰 푸시 알림을 주면 완주율이 올라간다"** 를 실제로 검증할 작동하는 웹앱을 만든다. 이미 `push-test` 로 OneSignal 웹 푸시가 Android에서 정상 수신됨을 확인했다. 이제 와이어프레임 수준의 UI에 **기능은 모두 동작**하는 멀티페이지 MVP를 구축한다 — 여러 참여자가 닉네임+핀으로 들어와 강의를 역량 목표로 등록하고, 설정한 요일·시간에 개인화 푸시를 받는 한 바퀴 루프 전체.

이 파일은 **단계별 태스크 체크리스트**다. plan 승인 후 프로젝트 루트 `archaive/mvp-app/TASKS.md` 로 복제해 진행 상황을 추적한다.

---

## 확정된 의사결정

| 항목 | 결정 |
|------|------|
| 기술 스택 | **순수 HTML/CSS/JS 멀티페이지** (빌드 없음, 화면당 파일 1개) |
| 데이터·백엔드 | **Supabase** (Postgres + Edge Functions + pg_cron) |
| 푸시 | **OneSignal** (App ID `1a1a5412-8959-4c86-8245-eb505749125f`, 기존 앱 재사용) |
| 인증 | **Edge Function 경유** — 닉네임+핀 6자리, 핀은 해시 저장, 클라이언트 직접 노출 없음 |
| 세션 유지 | localStorage 토큰, 페이지 로드 시 가드 |
| 호스팅 | **Vercel** (`push-test-omega` 프로젝트 또는 신규 프로젝트, CLI 배포) |
| 영상 | 유튜브 iframe 임베드 + "완료" 버튼 → DB 기록 |
| 역량 매핑 | 강사용 도구 없음. **수작업 시드(컨시어지)** 로 DB에 미리 삽입 |
| 역량 완료 처리 | **보류** (사용자 확인됨) — 데이터상 status=completed만 기록, 축하 화면 생략 |

---

## 데이터 모델 (Supabase 스키마)

docs/07 근거: `목표(=역량)` ↔ `세션(레슨)` **N:M**, 강의는 중간 수단. 진척률은 단순 세션 카운트 비율.

```
users
  id (uuid pk) · nickname (unique) · pin_hash · created_at

lectures
  id · title · instructor · description · thumbnail_url · created_at

sections                         -- 강의 내 섹션(챕터)
  id · lecture_id (fk) · title · order_no

sessions                         -- 레슨(개별 강의 영상)
  id · lecture_id (fk) · section_id (fk) · title · youtube_video_id · order_no · duration_sec

goals                            -- 역량(목표). 강사가 강의에 매핑
  id · lecture_id (fk) · purpose_category · title · subtitle · order_no
  -- purpose_category: 이직·커리어 / 업무 효율화 / 취미·자기개발 / 시험·자격증

goal_session_map                 -- 역량 ↔ 세션 N:M (수작업 시드)
  goal_id (fk) · session_id (fk)

user_goals                       -- 유저가 등록한 역량 목표
  id · user_id (fk) · goal_id (fk) · status(in_progress/completed/paused) · created_at

user_lesson_progress             -- 세션 완료 기록
  id · user_id (fk) · session_id (fk) · completed_at
  unique(user_id, session_id)

notification_settings            -- 알림 설정
  id · user_id (fk, unique) · enabled · days(text[]) · send_time(time)
  · night_consent · onesignal_external_id · updated_at
```

**진척률 계산** (홈/수강 배너 공용 함수):
`해당 user_goal의 goal_session_map 세션 중 user_lesson_progress 완료 수 / 전체 매핑 세션 수`
→ Postgres view 또는 RPC `get_user_goal_progress(user_id)` 로 제공.

---

## 화면 목록 (각 HTML 파일 1개)

| # | 파일 | 화면 | 핵심 기능 | 레퍼런스 |
|---|------|------|-----------|----------|
| 1 | `login.html` | 로그인 | 닉네임+핀6자리 → Edge Function 검증/자동생성, OneSignal.login | 명세 [1] |
| 2 | (공통) `tabbar.js` | 하단 탭 | 홈/강의목록/설정 3탭, 모든 페이지 주입 | 명세 [2] |
| 3 | `home.html` | 홈/대시보드 | 목적 관리 보드: 진행중/완수/보류 그룹, 프로그레스 바, "N강 중 M강", "목표까지 N강 남음", 빈 상태 | 명세 [3] + 대시보드.png |
| 4 | `lectures.html` | 강의목록 | 강의 카드 목록, 수강중 필터, 클릭→상세 | 명세 [4] |
| 5 | `lecture-detail.html` | 강의 상세 | 설명 + 커리큘럼(섹션·세션), 등록 버튼 | 명세 [5] |
| 6 | `goal-setup.html` | 목적→역량 설정 | 등록 컨펌→목적 선택→역량 선택→알림 설정 유도 | 명세 [6] + 목적&역량설정.png |
| 7 | `learn.html` | 강의 수강 | 유튜브 iframe, 완료 버튼→DB기록, 종료시 다음 자동재생, 역량 현황 배너 | 명세 [7] |
| 8 | `settings.html` | 설정 | 내정보(닉네임), 알림설정 모달, 로그아웃 | 명세 [8] + 알림설정.png |

공통 모듈: `supabase-client.js`(SDK 초기화), `auth-guard.js`(세션 체크·리다이렉트), `api.js`(Edge Function/RPC 래퍼), `styles.css`(와이어프레임 톤 공통).

---

## Edge Functions

| 함수 | 역할 |
|------|------|
| `auth-login` | 닉네임+핀 수신 → 존재하면 핀 해시 검증, 없으면 신규 생성. 세션 토큰 반환 |
| `send-notifications` | pg_cron이 매 분 호출. `현재 요일·시간 == notification_settings` 인 유저 조회 → OneSignal REST API로 해당 external_id에 개인화 푸시("{역량명}까지 N강 남았어요") 발송 |

스케줄러: `pg_cron` 으로 `send-notifications` 를 매 분 트리거 (`net.http_post`).

---

## 태스크 체크리스트 (단계별)

> 의존 순서대로. 각 단계 끝에 검증 포함. ☐=대기 ☑=완료

### T0. 프로젝트 셋업
- ☐ `archaive/mvp-app/` 폴더 구조 생성 (`public/` 하위 화면 파일, `js/`, `functions/`, `db/`)
- ☐ 이 계획을 `mvp-app/TASKS.md` 로 복제
- ☐ Supabase 프로젝트 생성(MCP) + URL·anon key 확보
- ☐ OneSignal REST API Key 확보(대시보드)

### T1. DB 스키마 + 시드
- ☐ 위 스키마 마이그레이션 적용 (`apply_migration`)
- ☐ 진척률 RPC/view 작성
- ☐ **시드 데이터 생성** (아래 "시드 데이터 설계" 참조)
- ☐ 검증: SQL로 진척률 계산 결과 수동 확인

---

## 시드 데이터 설계 (영어 학습 플랫폼)

**플랫폼 정체성**: 언어 학습 서비스. MVP는 **영어** 단일 언어. 강의·역량 모두 영어 학습 맥락으로 임의 생성하되 그럴듯하게.
**규모 방침**: 섹션·세션을 넉넉히. 각 세션 `duration_sec`은 **최소 20분(1200초)~35분**의 롱폼 단위 (데이터상 값일 뿐, 실제는 유튜브 iframe + 완료 버튼으로 동작).

### 강의 (lectures) — 4개

| 강의 | 강사 | 섹션 수 | 섹션당 세션 | 총 세션 |
|------|------|---------|-------------|---------|
| 비즈니스 영어 회화 (Business English) | Sarah K. | 5 | 4~5 | ~22 |
| 여행 영어 마스터 (Travel English) | Mike Chen | 4 | 4 | ~16 |
| 토익 실전 800+ (TOEIC 800+) | 박지훈 | 6 | 4~5 | ~26 |
| 기초 영문법 완성 (English Grammar Basics) | Emma L. | 4 | 4~5 | ~18 |

섹션 예시 (비즈니스 영어 회화):
`인사·스몰토크` → `회의 진행` → `이메일·메신저` → `프레젠테이션` → `협상·컨퍼런스콜`
각 세션 제목 예: "회의를 여는 표현", "안건 정리하고 발언권 넘기기" 등 그럴듯하게. duration 1200~2100초.

### 역량 (goals) — 목적 카테고리별, 강의에 매핑

| purpose_category | 역량(goal) 예시 | 매핑 강의 |
|------------------|-----------------|-----------|
| 업무 효율화 | 영어로 회의 주도하기 / 영어 이메일·메신저 능숙하게 | 비즈니스 영어 회화 |
| 이직·커리어 준비 | 영어 화상 면접 통과하기 / 해외 출장에서 영어로 협업하기 | 비즈니스 영어 회화 |
| 취미·자기개발 | 여행에서 영어로 자유롭게 소통하기 / 공항·호텔 영어 막힘없이 | 여행 영어 마스터 |
| 시험·자격증 대비 | 토익 800점 돌파하기 / 토익 LC 집중 공략 | 토익 실전 800+ |
| 취미·자기개발 | 영문법 기초 탄탄히 다지기 | 기초 영문법 완성 |

### goal_session_map (역량 ↔ 세션, 수작업 N:M)
- 각 역량은 해당 강의의 **세션 일부만 선별** 매핑 (docs/07: 강의 전체가 아니라 목표에 필요한 세션만).
  - 예: "영어로 회의 주도하기" = `회의 진행` 섹션 4세션 + `협상·컨퍼런스콜` 일부 2세션 = 6세션
  - 예: "영어 이메일·메신저 능숙하게" = `이메일·메신저` 섹션 전체
- 이렇게 해야 "N강 중 M강 완료 / 목표까지 N강 남음" 진척 표현이 자연스럽게 동작.

### youtube_video_id
- 실제 임의의 공개 유튜브 영어 학습 영상 ID 사용 (재생만 되면 됨). 동일 ID 재사용 허용 — MVP라 콘텐츠 정합성보다 동작이 우선.

### T2. 인증 + 로그인 화면
- ☐ `auth-login` Edge Function 배포 (핀 해시, 신규 자동생성)
- ☐ `login.html` + `supabase-client.js` + `api.js`
- ☐ `auth-guard.js` (localStorage 세션, 미로그인 시 리다이렉트)
- ☐ OneSignal `login(user_id)` 연동
- ☐ 검증: 로그인→세션 유지→새로고침 유지

### T3. 공통 레이아웃
- ☐ `tabbar.js` 하단 3탭, 활성 표시
- ☐ 모든 화면에 가드+탭바 적용
- ☐ 검증: 탭 이동·미로그인 차단

### T4. 강의 목록 + 상세
- ☐ `lectures.html` (목록·수강중 필터)
- ☐ `lecture-detail.html` (커리큘럼·등록 버튼)
- ☐ 검증: 시드 강의 표시·상세 진입

### T5. 목적→역량 설정 + 등록
- ☐ `goal-setup.html` 2단계 플로우(목적→역량)
- ☐ 등록 컨펌 팝업, user_goals 생성, 알림 미설정 시 설정 유도
- ☐ 검증: 등록 후 user_goals 기록 확인

### T6. 홈 대시보드
- ☐ `home.html` 진행중/완수/보류 그룹, 진척 바, 잔여 강수, 빈 상태
- ☐ 검증: 등록·완료에 따라 진척률 갱신

### T7. 강의 수강
- ☐ `learn.html` 유튜브 iframe + 완료 버튼 → user_lesson_progress
- ☐ 영상 종료 시 다음 세션 자동재생, 역량 현황 배너
- ☐ 검증: 완료 기록·다음 재생·진척 반영

### T8. 설정 + 알림설정
- ☐ `settings.html` 내정보·로그아웃
- ☐ 알림설정 모달(ON/OFF·요일·시간·야간동의) → notification_settings 저장
- ☐ 검증: 저장값 DB 반영·재진입 시 표시

### T9. 스케줄 푸시 발송
- ☐ `send-notifications` Edge Function (요일·시간 매칭→OneSignal API)
- ☐ pg_cron 매 분 트리거 설정
- ☐ 검증: 가까운 시간 설정 후 실제 모바일 수신

### T10. 통합 E2E + 배포
- ☐ Vercel 배포 (mvp-app)
- ☐ 모바일 전체 흐름: 로그인→강의 등록(역량)→수강 완료→대시보드 갱신→예약 시간 푸시 수신
- ☐ 검증 결과 정리

---

## 핵심 리스크·메모

- **iOS 미지원 주의**: 현재 타겟 Android. iOS는 PWA 설치 필요 — MVP 범위 밖으로 둠.
- **역량 모델 vs 완강률 모델**: docs/02·04는 완강률 KPI(안01)가 공식, docs/07은 역량 모델(H1 미검증). 이 앱은 **역량 모델로 진행**(명세·이미지가 역량 기반 확정). 계획에 명시만 하고 추후 인터뷰로 검증.
- **핀 보안**: 실제 비밀번호 아님(6자리 임의 핀). 그래도 해시 저장 + Edge Function 경유로 평문 노출 방지.
- **수작업 시드**: 강사 매핑 UI 없음. 역량↔세션 매핑은 SQL로 직접 입력.

## 검증(전체 완료 기준)

1. 두 개 이상 닉네임으로 각각 로그인 → 세션 분리 유지
2. 각 유저가 서로 다른 역량 등록 → 대시보드 진척률 독립 계산
3. 강의 수강 완료 → 진척률·"목표까지 N강" 실시간 반영
4. 유저별 다른 요일·시간 알림 설정 → 해당 시간에 **그 유저 기기에만** 개인화 푸시 도착
