# 개발 업무 보고서 — 2026-04-20

> 작성 주체: 개발 세션
> 대상 기간: 2026-04-20 (두 번째 + 세 번째 개발 세션)
> 이전 보고서: `reports/DEV-REPORT-20260417.md`

---

## 1. 오늘 수행한 작업 요약

### 세션 2 (오전)
Web Speech 안정화 + 기획 변경 반영 + Wizard 네비게이션 구현.

| 카테고리 | 건수 | 요약 |
|---------|------|------|
| Web Speech 안정화 | 4건 | interim 합산, 중복 블록 해결(abort 방식 확정), VB-Cable 환경 진단, 클로저 문제 해결 |
| 기획 변경 반영 | 3건 | is_edited 조건 명확화, interim 클릭 강제 확정, 싱글클릭 분할 삭제 |
| Wizard 네비게이션 | 1건 | 홈 아이콘, 이전 단계 버튼, 모달, 단계별 규칙 |
| UI 개선 | 1건 | 가로 스크롤 제거 |
| 인프라 | 1건 | GitHub CLI 설치, git 업로드 준비 |

### 세션 3 (오후)
Sprint 3 구현 복구 + QA 수정 4건 + 다크모드 구현 + Sprint 4 구현.

| 카테고리 | 건수 | 요약 |
|---------|------|------|
| 상태 안정화 | 2건 | 포트 정리, 서버 기동 확인 (강제 종료 후 복구) |
| 버그 수정 | 3건 | 녹음 stop/resume API 미연결, TagInput prop 이름 불일치(`value`→`values`), 좀비 프로세스로 인한 라우트 미등록 |
| QA 수정 | 4건 | `QA-SPRINT3-FIX.md` 4건 반영 (처리 중복 방지, split 타임스탬프 버그, 재시도 미작동, 키보드 입력 간섭) |
| 다크모드 | 1건 | `design-system-dark.md` 기반 전체 구현 (CSS 변수 오버라이드, FOUC 방지, `bg-white` 하드코딩 전수 교체) |
| Sprint 4 (6단계) | 4건 | 요약 API(`summarize`), `summary_assembler.py`, `claude_service.py` 요약 함수, `Summary.tsx` 전체 UI |
| Sprint 4 (7단계) | 4건 | Slack API(`slack.py` 라우터), `export-md` API, `slack.ts` 클라이언트, `SendSave.tsx` 전체 UI |

---

## 2. 변경된 파일 목록

### 세션 2 프론트엔드

| 파일 | 변경 내용 |
|------|----------|
| `src/hooks/useWebSpeech.ts` | abort 기반 중복 방지 확정, `flush()` 추가 |
| `src/pages/Recording.tsx` | is_edited 원본 비교, interim 클릭→flush, 네비게이션 props |
| `src/components/wizard/WizardStepper.tsx` | 홈 아이콘 추가 |
| `src/components/wizard/WizardLayout.tsx` | 홈 확인 모달, prevRoute/prevDisabled props |
| `src/components/common/Modal.tsx` | **신규** — 공통 모달 컴포넌트 |
| `src/pages/MeetingSetup.tsx` | prevRoute 연결 |
| `src/index.css` | overflow-x: hidden 추가 |

### 세션 3 백엔드

| 파일 | 변경 유형 | 상세 |
|------|----------|------|
| `main.py` | 수정 | `processing`, `ai`, `slack` 라우터 등록, 등록 순서 조정 |
| `models/session.py` | 수정 | `summary_markdown`, `action_items`, `keywords` 필드 추가 |
| `routers/sessions.py` | 수정 | 블록 편집 API 7개, `summarize`, `export-md`, `complete`에 summary 전달, split 타임스탬프 버그 수정 |
| `routers/processing.py` | **신규** | 4단계 처리 파이프라인 (audio merge → Whisper → block merge → AI tagging), 진행률 폴링, 중복 실행 방지 수정 |
| `routers/ai.py` | **신규** | AI 태깅 API (`POST /{id}/tag`) |
| `routers/slack.py` | **신규** | Slack 채널 목록, 메시지 목록, 전송, 연결 테스트 API |
| `services/audio_service.py` | **신규** | ffmpeg 청크 병합, 업로드 파일 감지 |
| `services/whisper_service.py` | **신규** | Whisper 모델 로드/캐시/전사 (미설치 — Sprint 5에서 설치 예정) |
| `services/merger_service.py` | **신규** | Web Speech + Whisper 블록 병합 (잠금 우선, ±2초 tolerance) |
| `services/claude_service.py` | **신규** | Claude Haiku 중요도 태깅 + Claude Sonnet 요약 생성 |
| `services/summary_assembler.py` | **신규** | 회의 개요 자동 조립, Keywords 분리, F/U 자동 추출 |

### 세션 3 프론트엔드

| 파일 | 변경 유형 | 상세 |
|------|----------|------|
| `src/index.css` | 수정 | 다크모드 CSS 변수 오버라이드 (media query + data-theme), toast/backdrop 토큰 추가 |
| `index.html` | 수정 | FOUC 방지 인라인 스크립트 |
| `src/main.tsx` | 수정 | `initTheme()` 호출 |
| `src/utils/theme.ts` | **신규** | getTheme/setTheme/applyTheme/initTheme |
| `src/api/sessions.ts` | 수정 | `stopRecording`, `resumeRecording`, `summarizeSession`, `retagBlocks` 등 추가 |
| `src/api/slack.ts` | **신규** | Slack API 클라이언트 |
| `src/types/index.ts` | 수정 | Session에 summary 관련 필드 추가 |
| `src/pages/Recording.tsx` | 수정 | 서버 stop/resume API 호출 추가, `bg-white` → `bg-bg` 다크모드 교체 |
| `src/pages/Processing.tsx` | 수정 (이전 신규) | 4단계 전체 UI, `kickOff` useCallback 분리로 재시도 수정 |
| `src/pages/Editing.tsx` | 수정 (이전 신규) | 5단계 전체 UI, TagInput prop 수정(`value`→`values`), 입력 필드 키보드 가드, 다크모드 교체 |
| `src/pages/Summary.tsx` | 수정 (이전 placeholder) | 6단계 전체 UI — 요약 블록 편집, 액션 아이템 CRUD, 전사 참조 패널, 재요약 |
| `src/pages/SendSave.tsx` | 수정 (이전 placeholder) | 7단계 전체 UI — Slack 채널/스레드 선택, .md 저장, 체크박스 실행, 미입력 확인 모달, 완료 화면 |
| `src/pages/MeetingSetup.tsx` | 수정 | `bg-white` → `bg-bg` 다크모드 교체 |
| `src/components/common/Toast.tsx` | 수정 | `bg-text text-white` → `bg-toast-bg text-toast-text` |
| `src/components/common/Modal.tsx` | 수정 | `bg-black/30` → `bg-backdrop` 토큰 |
| `src/components/common/TagInput.tsx` | 수정 | `focus-within:bg-white` → `focus-within:bg-bg` |

---

## 3. 주요 기술 결정

### 녹음 stop/resume 서버 동기화 누락 발견 및 수정
- Recording.tsx에서 녹음 중지/재개 시 로컬 상태만 변경하고 서버 API를 호출하지 않아 세션이 `recording` 상태로 잔류
- `stopRecording()`, `resumeRecording()` API 함수 추가 후 핸들러에서 호출

### 다크모드 구현 방식
- CSS 변수 오버라이드 (`@media prefers-color-scheme` + `data-theme` 속성) 이중 구조
- `bg-white` 하드코딩 전수 검색 → 시맨틱 토큰(`bg-bg`)으로 교체 (11개 파일, 20+ 개소)
- 토스트/모달 backdrop 전용 토큰 추가

### 라우터 등록 순서 이슈
- 같은 prefix(`/api/sessions`)를 가진 `ai.py`와 `sessions.py`에서 라우트 충돌 발생
- `summarize` 엔드포인트를 `sessions.py`로 통합하여 해결
- 좀비 프로세스로 인한 코드 미반영 문제도 동시 발견 → 전체 python 프로세스 kill 후 재시작

---

## 4. 현재 코드 상태

### 구현 완료 (전 단계)

| 페이지 | 완성도 | 비고 |
|--------|--------|------|
| 1단계 홈 | ~95% | 복구 "이어가기" 라우팅만 연결 |
| 2단계 회의 정보 | ~95% | 파일 업로드 서버 전송 구현 완료 |
| 3단계 녹음 | ~90% | 회의 정보 패널, 중요도 팝오버, interim 강제 확정, 서버 stop/resume 연동 |
| 4단계 Whisper | ~85% | UI 완성, Whisper 패키지 미설치 (Web Speech 폴백으로 테스트 가능) |
| 5단계 편집 | ~95% | 블록 편집/분할/병합, 중요도 태깅, 일괄 치환, Undo/Redo |
| 6단계 요약 | ~90% | Claude 요약 생성, 블록 편집, 액션 아이템 CRUD, 전사 참조 패널 |
| 7단계 전송 | ~90% | Slack 채널/스레드 선택, .md 저장, 완료 화면 |
| 다크모드 | ~95% | CSS 변수 + theme 유틸 완성, 설정 UI 세그먼트 컨트롤은 Sprint 5 |

### 미구현

| 항목 | 예정 |
|------|------|
| 히스토리 화면 | Sprint 5 |
| 설정 화면 | Sprint 5 |
| 복구 로직 (실제) | Sprint 5 |
| 백그라운드 탭 대응 | Sprint 5 |
| Whisper 패키지 설치 | MacBook 배포 시 |
| 6→5→6 재요약 모달 | Sprint 5 |
| 브라우저 뒤로가기 동기화 | Sprint 5 |

---

## 5. 다음 세션에서 해야 할 일

### Sprint 5 착수
1. 히스토리 화면 (목록, 검색, 상세, 재편집/재전송)
2. 설정 화면 (템플릿 모달, 주소록, API 설정, **테마 세그먼트 컨트롤**)
3. 복구 기능 (실제 복구 로직)
4. 백그라운드 탭 대응 (무음 오디오, 탭 복귀 재연결)

### 기타
- 6→5→6 재요약 모달 구현
- 브라우저 뒤로가기 동기화
- Whisper 설치 및 4단계 실제 테스트 (MacBook 배포 시)

---

## 6. 알아둘 사항

### dev server 실행
```bash
cd backend && python -m uvicorn main:app --reload --port 8000
cd frontend && npm run dev
```

### 다크모드 테스트
- 시스템 설정 연동: Windows 개인 설정 → 색 → 다크 선택 시 자동 전환
- 수동 테스트: 브라우저 콘솔에서 `document.documentElement.setAttribute('data-theme', 'dark')`
- 복원: `document.documentElement.removeAttribute('data-theme')`

### Whisper 미설치 상태에서 테스트
- 4단계에서 "Web Speech 결과만으로 계속" 클릭 → 5→6→7단계 테스트 가능

### 주의: uvicorn 좀비 프로세스
- 포트 정리 시 `taskkill //F //IM python.exe`로 전체 종료 후 재시작 권장
- `__pycache__` 삭제 후 재시작하면 확실함
