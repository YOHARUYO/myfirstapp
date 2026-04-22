# 개발 업무 보고서 — 2026-04-22

> 작성 주체: 개발 세션
> 대상 기간: 2026-04-22 (여섯 번째 + 일곱 번째 개발 세션)
> 이전 보고서: `reports/DEV-REPORT-20260421.md`

---

## 1. 오늘 수행한 작업 요약

### 세션 6 (오전)

| 카테고리 | 건수 | 요약 |
|---------|------|------|
| QA 수정 (Sprint 5 추가) | 5건 | `QA-SPRINT5-FIX2` — export-md 404, 복구 배너 CTA 비활성, 탭 복귀 조건부 토스트, useVisibility deps, 검색 스니펫 |
| Web Speech 안정화 | 4건 | `QA-WEBSPEECH-FIX` — onerror 분기, no-speech backoff, 재시작 실패 안내, instanceIdRef |
| 버그 수정 | 1건 | useVisibility 호출 위치 (webSpeech 선언 전 참조) |

### 세션 7 (오후)

| 카테고리 | 건수 | 요약 |
|---------|------|------|
| 기획 변경 반영 | 6건 | AI 로딩 스피너, 키보드 명령어(Shift+Enter=줄바꿈/Ctrl+Enter=분할), 섹션 위계 강화, Slack textarea, 히스토리 삭제, 미리보기 최신 fetch |
| 버그 수정 | 7건 | Slack 유저 ID 치환, 재편집 API 분기, API 설정 표시, 복구 데이터 로드, 3→5단계 블록 미반영, 첫 블록 Backspace, 요약 미반영 |
| 기획 핸드오프 누락 | 4건 | `QA-HANDOFF-MISSING` — Recording 키보드+서버 저장, Slack 멘션 치환, Summary 오버레이 |
| 전수조사 (즉시 수정) | 5건 | `QA-FULL-AUDIT` — beforeunload, resummarize API, resend-slack 확장, 회의 정보 접힘 |
| 전수조사 (최종 품질) | 20건 | `QA-FINAL-AUDIT` — split 재작성, uuid block ID, 화이트리스트, asyncio.Lock, 로깅, ArrowUp 인덱스, 빈 배열 가드, 에러 UI, importance 롤백, 더블 클릭 가드, 버전 가드, NaN 방어, 파싱 방어, popover 정리 |
| 코드 정리 | 10건 | `QA-LOW-RISK-CLEANUP` — config 경고, 데드코드 제거, formatTs 통합, Undo 스택, DOM 정리, Modal 포커스 복귀, mrkdwn 확장 |
| 이전 세션 미착수 | 2건 | 반응형 Stepper (768px 축약), 3단계 sticky 상태바/컨트롤 바 |

---

## 2. 변경된 파일 목록

### 백엔드

| 파일 | 변경 유형 | 상세 |
|------|----------|------|
| `config.py` | 수정 | API 키 미설정 시 시작 경고 로그 |
| `routers/audio.py` | 수정 | block_counter → uuid4 (동시 연결 ID 중복 방지) |
| `routers/contacts.py` | 수정 | asyncio.Lock 추가 (동시 쓰기 보호), async 엔드포인트 |
| `routers/history.py` | 수정 | split 전면 재작성, update 화이트리스트, export-md escape, resummarize API, DELETE /meetings/{id}, Meeting 블록 편집 API 4종 |
| `routers/recovery.py` | 수정 | 손상된 세션 파싱 실패 시 skip |
| `routers/sessions.py` | 수정 | export-md action_items escape (_escape_md) |
| `routers/slack.py` | 수정 | _load_session sessions+meetings 양쪽 탐색, _build_slack_message 유저 멘션 치환, _strip_mrkdwn emoji/codeblock 확장, delete glob→list |
| `routers/templates.py` | 수정 | asyncio.Lock 추가, async 엔드포인트 |
| `services/claude_service.py` | 수정 | JSON 파싱 로깅 + importance 값 검증 (VALID_IMPORTANCE) |
| `services/merger_service.py` | 수정 | _overlap 데드코드 제거 |

### 프론트엔드

| 파일 | 변경 유형 | 상세 |
|------|----------|------|
| `utils/formatTime.ts` | 수정 | formatTs 공통 함수 추가 |
| `components/common/Modal.tsx` | 수정 | 포커스 복귀 (triggerRef) |
| `hooks/useWebSpeech.ts` | 전면 교체 | onerror 분기, no-speech backoff, instanceIdRef, onStatusChange 콜백 |
| `pages/Recording.tsx` | 수정 | 서버 PATCH 호출, handleSplit/handleMerge 추가, 키보드 명령어(Ctrl+Enter 분할/Shift+Enter 줄바꿈), beforeunload, sticky 상태바/컨트롤 바, silentAudio/useVisibility 연동, popover setTimeout, 참여자 저장 버전 가드, formatTs import, 빈 콜백 제거, 회의 정보 기본 접힘 |
| `pages/Editing.tsx` | 수정 | 키보드 명령어 변경, 첫/마지막 블록 가드, AI 재태깅 로딩 스피너, 5→6 전환 오버레이, 5단계 진입 시 서버 fetch, editMode API 분기(apiBase), ArrowUp 인덱스 수정, 빈 배열 가드, importance 롤백, Undo slice(-49), formatTs import, 서브텍스트+위계 강화 |
| `pages/Summary.tsx` | 수정 | 로딩 전체 화면 오버레이(fixed), parseSummaryBlocks 방어적 파싱, formatTs import, 서브텍스트 |
| `pages/SendSave.tsx` | 수정 | 더블 클릭 가드, 7단계 진입 시 최신 데이터 fetch, 서브텍스트+위계 래핑 |
| `pages/HistoryDetail.tsx` | 수정 | 재편집 Meeting→Session 변환, .md 다운로드 onClick, 히스토리 삭제 모달, 타임스탬프 NaN 가드, formatTs import, 서브텍스트+위계 래핑 |
| `pages/Home.tsx` | 수정 | API 에러 상태+다시 시도, 복구 CTA 비활성 안내 |
| `pages/Processing.tsx` | 수정 | kickOff deps 제거 |
| `pages/MeetingSetup.tsx` | 수정 | 파일 input DOM 정리 (input.remove()) |
| `pages/Settings.tsx` | 수정 | Slack 인사 문구 textarea |
| `components/wizard/WizardStepper.tsx` | 수정 | 반응형 (768px 미만 축약) |

---

## 3. 주요 기술 결정

### Web Speech 안정화 — 최종 아키텍처

| 문제 | 해결 |
|------|------|
| no-speech 무한 루프 | 지수 backoff (1s base, 1.5x, max 5s) + 10회 초과 시 전사 일시중지 |
| 에러 사용자 안내 없음 | `onStatusChange` 콜백으로 에러별 토스트 |
| 탭 복귀 시 인스턴스 2중 실행 | `instanceIdRef` — onend에서 현재 ID 아니면 재시작 안 함 |
| 재시작 실패 무시 | try-catch + onStatusChange + setIsListening(false) |

### 키보드 명령어 통일 (Recording + Editing)

| 키 | 동작 |
|----|------|
| Enter | 편집 확정 |
| Shift+Enter | 줄바꿈 (기본 동작 허용) |
| Ctrl+Enter (Cmd+Enter) | 블록 분할 |
| Backspace (블록 시작) | 위 블록과 병합 (첫 블록 가드) |
| Delete (블록 끝) | 아래 블록과 병합 (마지막 블록 가드) |
| Esc | 편집 취소 |

### 동시성 보호

| 대상 | 방법 |
|------|------|
| contacts.json | asyncio.Lock (_contacts_lock) |
| templates.json | asyncio.Lock (_templates_lock) |
| audio block_id | uuid4 기반 (순서 의존 제거) |

### 코드 정리 성과
- formatTs 중복 제거: 4파일 로컬 함수 → formatTime.ts 공통 함수 1개
- merger_service.py 데드코드 2줄 제거
- Modal 포커스 복귀 UX 개선
- _strip_mrkdwn emoji/codeblock 처리 확장

---

## 4. 현재 코드 상태

### 전체 구현 완성도

| 영역 | 완성도 | 비고 |
|------|--------|------|
| 1단계 홈 | ~98% | 복구 카드 + CTA 비활성 + API 에러 표시 |
| 2단계 회의 정보 | ~95% | |
| 3단계 녹음 | ~97% | Web Speech 안정화, sticky 레이아웃, 키보드 통일, beforeunload, 서버 PATCH |
| 4단계 Whisper | ~85% | Whisper 미설치 |
| 5단계 편집 | ~97% | AI 로딩 스피너, importance 롤백, editMode 분기 |
| 6단계 요약 | ~97% | 전체 화면 로딩 오버레이, 방어적 파싱 |
| 7단계 전송 | ~97% | 더블 클릭 가드, 최신 데이터 fetch |
| 히스토리 | ~97% | 삭제, 재편집 Meeting 변환, NaN 가드, resummarize API |
| 설정 | ~95% | textarea 인사 문구, asyncio.Lock |
| 다크모드 | ~95% | |

### 미구현/미완

| 항목 | 상태 |
|------|------|
| B-2 ④ 타이머 보정 | useTimer가 Date.now() 기반이면 불필요 |
| B-2 ⑤ Web Worker | MVP 선택적 |
| Whisper 설치 | MacBook 배포 시 |

### 커밋 이력

| 커밋 | 내용 |
|------|------|
| `b03da01` | Initial commit: Sprint 2 |
| `437b568` | Sprint 3+4 + 다크모드 + QA 15건 |
| `3f8747f` | QA 16건 + 기획 변경 + 요약 저장 API |
| `c13ec58` | Sprint 5 + QA 27건 + Web Speech 안정화 |
| `5426c9c` | QA 전수조사 37건 + 기획 변경 6건 + 버그 7건 + 코드 정리 10건 |

---

## 5. 다음 세션에서 확인할 것

### 즉시
- 브라우저에서 전체 플로우 재검증 (1→7단계 + 히스토리 + 설정)
- 녹음 플로우 Web Speech 안정화 동작 확인

### 추후
- Whisper 설치 + 4단계 실제 테스트
- MacBook 크로스 플랫폼 배포 확인
- 외부 접속 테스트 (ngrok URL + 다른 기기)
