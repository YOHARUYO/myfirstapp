# 기획 업무 보고서 — 2026-04-21

> 작성 주체: 기획 세션
> 대상 기간: 2026-04-21 (세 번째 기획 세션)
> 이전 보고서: `reports/PLAN-REPORT-20260420.md`

---

## 1. 오늘 수행한 작업 요약

Sprint 4 개발 완료 상태에서 시작. **Slack UX 개선 2건 기획**, 실사용 중 발견된 **오류/개선 5건 검토 및 설계 반영**, 그리고 **리포트 체계 정비**를 수행했습니다.

| 카테고리 | 건수 | 요약 |
|---------|------|------|
| 현황 파악 | 7건 | CLAUDE.md, HANDOVER.md, decisions.md, technical-design.md, design-system.md, DEV-REPORT-20260420.md, planning-log-20260417.md 전문 확인 |
| Slack UX 개선 기획 | 2건 | 스레드 메시지 카드 UI 설계, 전송 후 메시지 삭제 기능 설계 |
| 버그 기획 대응 | 2건 | Slack 메시지 수정 미반영(6단계 저장 API 누락 보완), 복구 플로우 충돌 재설계 |
| UI 개선 기획 | 2건 | 녹음 컨트롤 sticky bottom 재배치, 반응형 Stepper 모바일 대응 |
| 리포트 체계 정비 | 3건 | reports/ 폴더 생성 및 기존 리포트 이동, 네이밍 통일(PLAN/DEV/QA-REPORT), HANDOVER.md에 리포트 규칙 섹션 추가 |
| 문서 반영 | 4건 | decisions.md 5곳, technical-design.md 4곳, HANDOVER.md 4곳, design-system-dark.md 신규 |

---

## 2. 변경된 파일 목록

| 파일 | 변경 유형 | 상세 |
|------|----------|------|
| `decisions.md` | 5곳 수정 | Slack 스레드 카드 UI, 전송 후 삭제, 3단계 레이아웃 재배치, 반응형 Stepper, 복구 플로우 재설계 |
| `technical-design.md` | 4곳 수정 | 6단계 저장 API 추가(4-5절 신규), Slack 메시지 카드 응답+삭제 API(4-8절), 복구 API 재설계(4-10절), 섹션 번호 재정렬 |
| `design-system-dark.md` | 신규 생성 | 다크모드 전체 기획 (색상 토큰 매핑, CSS 구현 방식, 화면별 적용 포인트, 체크리스트) |
| `HANDOVER.md` | 4곳 수정 | 9절 파일 구조(reports/ + design-system-dark.md 추가), 10절 역할 정의(QA 세션 추가), 11절 리포트 규칙(신규), 12절 시작 방법(리포트 작성 단계+QA 세션 추가) |
| `reports/PLAN-REPORT-20260417.md` | 신규 생성 | 기존 planning-log-20260417.md를 통일 양식으로 재작성 |
| `reports/PLAN-REPORT-20260421.md` | 신규 생성 | 본 리포트 |
| `planning-log-20260417.md` | 삭제 | PLAN-REPORT-20260417.md로 대체 |

### 건드리지 않은 파일
- `CLAUDE.md` — 변경 불필요
- `frontend/`, `backend/` — 코드 영역, 개발 세션 책임

---

## 3. 주요 결정 사항

### 3-1. Slack 스레드 메시지 카드 UI (신규 기획)

**배경**: 스레드 답장 선택 시 raw 텍스트만 표시되어 어떤 메시지인지 식별 불가.

**결정**:
- 메시지를 카드 형태로 표시: 발신자(🤖봇/👤사람 아이콘) + 시각 + 본문 미리보기(~50자) + 답글 수 + 첨부 여부
- 서버에서 Slack mrkdwn 스트립 + display_name 매핑하여 가공된 데이터 전달
- technical-design.md에 `GET /api/slack/channels/{id}/messages` 응답 스키마 추가

### 3-2. Slack 전송 후 메시지 삭제 (신규 기획)

**배경**: 잘못된 채널 전송, 요약 오류 발견 시 메시지 철회 불가.

**결정**:
- 제공 위치 2곳: 7단계 완료 화면 `[삭제]` + 히스토리 상세 `[메시지 삭제]`
- 확인 모달 → `chat.delete` API → 성공/실패 피드백
- Meeting 모델에 `deleted`, `deleted_at` 필드 추가
- technical-design.md에 `DELETE /api/slack/message` 엔드포인트 추가

### 3-3. Slack 메시지 수정 미반영 (설계 누락 보완)

**배경**: 6단계에서 요약/액션 아이템 편집 후 7단계 Slack 전송 시 수정 내용이 반영되지 않음.

**원인**: 6단계 편집 결과를 서버에 저장하는 API가 설계에 누락.

**결정**:
- `PATCH /api/sessions/{id}/summary` + `PATCH /api/sessions/{id}/action-items` 신규 추가
- Slack 전송 시 최신 데이터 실시간 읽기 원칙 명시

### 3-4. 녹음 컨트롤 접근성 (레이아웃 변경)

**배경**: 전사가 길어지면 녹음 중지/재개 버튼이 화면 밖으로 밀려남.

**결정**:
| 요소 | 변경 전 | 변경 후 |
|------|---------|---------|
| 컨트롤 바 | 전사 영역 위 (일반 흐름) | **sticky bottom** |
| 상태바 | 일반 흐름 | **sticky top** |
| 회의 정보 요약 | 기본 펼침 | **기본 접힘** |

### 3-5. 반응형 Stepper (모바일 대응)

**배경**: 7단계 dot + 홈 아이콘이 모바일 가로 폭 초과.

**결정**:
| 화면 | 표시 |
|------|------|
| 데스크탑 (768px+) | 전체 dot + 라벨 (기존) |
| 모바일 (<768px) | `[🏠]  ◉ 4/7 편집` (축약형) |

### 3-6. 복구 플로우 재설계

**배경**: 복구 시 새 세션 생성을 시도 → 기존 미완료 세션과 409 충돌 → 진행 불가.

**결정**:
- **복구 = 기존 세션 재개** (새 세션 생성 안 함)
- status별 진입 단계 매핑: idle→2, recording/post_recording→3, processing→4, editing→5, summarizing→6
- `POST /api/recovery/{id}/restore` 제거
- 복구 배너를 카드 형태로 재설계: [이어서 진행] / [삭제하고 새로 시작]

### 3-7. 다크모드 디자인 시스템 (신규 기획)

**결정 요약**:
- 3-way 전환: 시스템 설정 / 라이트 / 다크
- CSS 변수 오버라이드 방식 (기존 시맨틱 토큰 코드 자동 전환)
- 배경 `#1A1B1E`, 텍스트 `#ECEDF0`, Primary `#4A9AFF`
- 설정 화면에 세그먼트 컨트롤 (Sun/Moon/Monitor)
- 상세: `design-system-dark.md`

### 3-8. 리포트 체계 정비

**결정**:
- `reports/` 폴더로 모든 리포트 통합 관리
- 네이밍: `PLAN-REPORT-YYYYMMDD.md` / `DEV-REPORT-YYYYMMDD.md` / `QA-REPORT-YYYYMMDD.md`
- 공통 양식: 작업 요약 표 → 변경 파일 → 결정 사항 → 전달 사항 → 다음 확인
- HANDOVER.md 11절에 규칙 명시, 12절 시작 방법에 "세션 종료 시 리포트 작성" 단계 추가

---

## 4. 전달 사항

### 개발 세션에 전달

**우선순위 높음 (버그):**
1. **6단계 저장 API 구현**: `PATCH /api/sessions/{id}/summary`, `PATCH /api/sessions/{id}/action-items` — technical-design.md 4-5절
2. **복구 플로우 수정**: 기존 세션 재개 방식, restore API 제거, status별 라우팅 — technical-design.md 4-10절 + decisions.md 복구 UX
3. **복구 배너 UI 변경**: 카드 형태 + [이어서 진행]/[삭제하고 새로 시작] — decisions.md 복구 배너

**우선순위 중간 (UX 개선):**
4. **Slack 스레드 카드 UI**: 메시지 카드 표시 + 서버 가공 — decisions.md 스레드 선택 + technical-design.md 4-8절
5. **Slack 메시지 삭제**: DELETE API + 완료 화면/히스토리 UI — decisions.md 전송 후 삭제 + technical-design.md 4-8절
6. **3단계 레이아웃 재배치**: 컨트롤 바 sticky bottom, 상태바 sticky top, 회의 정보 기본 접힘 — decisions.md 3단계 레이아웃
7. **반응형 Stepper**: 768px 미만 축약형 — decisions.md 반응형 Stepper

**우선순위 낮음 (신규 기능):**
8. **다크모드 구현**: design-system-dark.md 전문 참조

### QA 세션에 전달
- 리포트 양식이 `reports/QA-REPORT-YYYYMMDD.md`로 통일됨 — HANDOVER.md 11절 참조

---

## 5. 다음 세션에서 확인할 것

- 개발 세션 복구 플로우 수정 결과 확인
- 6단계 저장 → 7단계 Slack 전송 시 수정 내용 반영 확인
- Slack 스레드 카드 UI / 삭제 기능 구현 확인
- 3단계 sticky bottom 컨트롤 바 시각 확인
- 모바일 Stepper 축약형 시각 확인
- 다크모드 구현 착수 여부 확인
