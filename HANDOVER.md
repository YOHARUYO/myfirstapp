# 인수인계 문서 (Handover)

> 작성일: 2026-04-17
> 목적: 새 세션에서 이 프로젝트의 맥락을 완전히 파악하고 이어서 작업할 수 있도록 함

---

## 1. 프로젝트 한 줄 요약

**대면 회의를 자동 기록·요약하고 Slack으로 전송하는 개인용 회의록 자동화 앱** (로컬 실행)

---

## 2. 현재 상태

| 항목 | 상태 | 비고 |
|------|------|------|
| UX/기능 기획 | ✅ 완료 | `decisions.md` |
| 기술 설계 | ✅ 완료 | `technical-design.md` |
| 디자인 시스템 | ✅ v2 개편 완료 (기획) / ⏳ 개발 반영 대기 | `design-system.md` (v2 Toss-style Bold Editorial) / v1 백업: `backups/design-system-v1-20260417/` |
| 개발 환경 | ✅ 완료 | Python 3.14.4, Node 24.13.1, ffmpeg 8.1, Windows 11 |
| API 키/토큰 | ✅ 완료 | `backend/.env` (Anthropic API Key + Slack Bot Token) |
| Slack Bot | ✅ 완료 | `@meetingRecorder`, "전략팀" 채널 참여 확인됨 |
| **코드 구현** | **Sprint 2 완료** | 아래 "현재 구현 완료 항목" 참조 |

---

## 3. 핵심 문서 가이드

### 반드시 읽어야 하는 문서 (순서대로)

1. **`CLAUDE.md`** — AI에 대한 행동 지침. 프로젝트 개요, 스택, 협업 규칙.
2. **`decisions.md`** — 프로덕트/UX 기획서. 화면 7단계 + 히스토리 + 설정 화면의 모든 결정.
3. **`technical-design.md`** — 기술 설계서. 데이터 모델, API 40+개, WebSocket 프로토콜, Claude 프롬프트, 디자인 시스템.

### 문서 간 관계
```
CLAUDE.md          → AI 행동 지침 (새 세션 시작 시 자동 로드)
  ↓ 참조
decisions.md       → "무엇을 만드는가" (UX, 기능, 화면 설계)
  ↓ 기반
technical-design.md → "어떻게 만드는가" (구조, 모델, API, 코드)
  ↓ 기반
코드 구현           → 아직 미착수
```

---

## 4. 기획 과정 요약 (논의 히스토리)

### 논의 순서 및 주요 결정

**Phase 1: 프로젝트 방향 설정**
- 목적: 대면 회의 → 자동 기록 → AI 요약 → Slack 전송
- 개인용 로컬 앱 (혼자 사용)
- 스택: FastAPI + 브라우저 UI + 로컬 Whisper + Claude API

**Phase 2: 기능 목록 확정**
- MVP 1단계: 녹음, 전사, Whisper 재처리, 수정 잠금, 중요도 태깅, 요약, Slack 전송, 히스토리
- 2단계: Slack Canvas, 주간 트렌드 리포트
- 3단계: 화자 분리 (pyannote), Google Calendar

**Phase 3: UI 설계 (가장 긴 논의)**
- wizard 스타일 7단계 확정
- 3단계(녹음) 상세 설계: 하이브리드 전사 표시, 인라인 편집 UX, 3상태(idle/recording/post-recording), 단일 변형 슬롯 컨트롤, 중요도 단축키
- 5단계(편집) 상세 설계: 블록 병합·분할, Shift+Enter, 호버 메뉴는 병합만, 일괄 치환 (잠금 구간 제외), WYSIWYG
- 6단계(요약) 상세 설계: 실제 회의록 샘플 기반 템플릿(주제별 논의+F/U), 불릿 액션 아이템, F/U 자동 집계
- 7단계(전송) 상세 설계: Slack 스레드 선택 (MVP 포함), 메시지 템플릿, 인사 문구 커스터마이징
- 1단계(홈), 2단계(정보 입력), 4단계(Whisper 처리) 설계
- 히스토리: 전문 검색 포함 (JSON 브루트포스 스캔, 개인용 규모 충분)
- 설정: 단일 페이지, 템플릿 모달 편집

**Phase 4: 기술 설계**
- 프론트엔드 스택 업그레이드: HTML/JS → React + Tiptap + Zustand (UI 복잡도 반영)
- 데이터 모델: Block, Session, Meeting, Template, Settings, Contacts
- API 40+개 설계
- 오디오 보존: MediaRecorder → WebSocket → 서버 개별 청크 파일 → ffmpeg 병합
- Whisper + Web Speech 병합 로직 (타임스탬프 기반, 잠금 우선)
- Claude 프롬프트: 태깅(Haiku) + 요약(Sonnet)

**Phase 5: 검토 (3라운드)**
- 1차: 10건 발견 → 전부 수정
- 2차: 10건 추가 발견 → 전부 수정 (summary_markdown 단일 정본 등)
- 3차: 1건 발견 (Slack 메시지 코드의 구 sections 참조) → 수정 완료

**Phase 6: 디자인 시스템**
- Vercel 스타일 (모노톤 + 최소 포인트 컬러)
- Primary: `#059669` (그린)
- Pretendard + Inter (fallback) + JetBrains Mono (타임스탬프)

**Phase 7: 환경 설정**
- Python, Node, ffmpeg, Anthropic API Key, Slack Bot Token 설정 완료
- 개발: Windows 11 / 실행: M3 MacBook (크로스 플랫폼)

---

## 5. 사용자 특성 및 협업 스타일

### 의사결정 스타일
- 선택지를 제시하면 빠르게 결정함
- 결정 후 "이거 왜 이렇게 했지?" 라고 되물으며 근거를 확인하는 습관 → 결정 사유를 함께 기록해야 함
- 실제 사용 경험에서 느낀 불편함을 기반으로 요구사항을 추가함 (PoC HTML 사용 후 백그라운드 탭 문제 제기)
- 개발 결과물을 브라우저에서 직접 확인하고 피드백하는 스타일 (결과물 기반 판단)
- "마음에 안 드는 부분"을 직접 보고 나서 구체적으로 요청함 — 사전에 모든 걸 지시하기보다 **반복적 피드백 루프** 선호

### 선호
- 간결한 소통, 불필요한 설명 최소화
- 논의할 때 선택지 + 추천 형태로 제시하는 것을 선호
- 기능을 과하게 넣기보다 MVP를 빠르게 만들고 불편함이 확인되면 추가하는 방식
- "유저에게 불안감을 주지 않는 UX" 중시 (조건부 토스트 — 문제 발생 시에만 경고)
- 디자인: 깔끔하되 한눈에 들어오는 것
- 개발 결과를 **가시적으로 직접 확인**할 수 있는 창구를 중시 (dev server 항상 띄워둘 것)
- 세션 간 맥락 유실을 걱정함 → **문서화된 인수인계**에 높은 가치를 둠

### 주의사항
- decisions.md의 기획을 임의로 변경하지 말 것 — 변경 필요 시 사유 설명 후 승인받기
- **기존 파일 변경 시 반드시 사유를 먼저 설명**한 뒤 진행 (여러 파일 동시 수정 시 한꺼번에 밀어넣지 말고, 무엇이 왜 바뀌는지 투명하게)
- API 키·토큰을 채팅에 노출하지 말 것
- 한국어로 소통, 코드 변수명·주석은 영문

---

## 6. 개발 착수 시 권장 순서

### 추천 구현 순서 (의존성 기반)

**Sprint 1: 기반 구조**
1. 백엔드 FastAPI 기본 세팅 (main.py, config.py, CORS)
2. 프론트엔드 React + Vite + Tailwind + Pretendard 세팅
3. 데이터 모델 Pydantic 정의 (models/)
4. 프로젝트 구조 생성 (technical-design.md 2절 참조)

**Sprint 2: 핵심 플로우 (녹음 → 전사)**
5. Wizard 라우팅 + Stepper 컴포넌트
6. 1단계 홈 화면
7. 2단계 회의 정보 입력 (세션 생성 API)
8. 3단계 녹음 — MediaRecorder + Web Speech + WebSocket 오디오 스트리밍
9. 전사 블록 실시간 표시

**Sprint 3: Whisper + 편집**
10. 4단계 Whisper 처리 (ffmpeg 병합 + Whisper 실행 + 블록 병합)
11. 5단계 편집 화면 (블록 편집, 중요도 태깅, 일괄 치환)

**Sprint 4: AI 요약 + 전송**
12. Claude API 연동 (태깅 + 요약)
13. 6단계 요약 화면 (Tiptap WYSIWYG + 액션 아이템)
14. 7단계 전송 & 저장 (Slack 전송 + .md 생성)

**Sprint 5: 보조 기능**
15. 히스토리 화면 (목록, 검색, 상세, 재편집/재전송)
16. 설정 화면 (템플릿, 주소록, API 설정)
17. 복구 기능 (홈 배너 + 세션 복구)
18. 백그라운드 탭 대응 (무음 오디오, 탭 복귀 재연결)

---

## 7. 알려진 제약 및 주의사항

| 항목 | 내용 |
|------|------|
| Web Speech API | Chrome/Edge 전용, 타임스탬프 미제공(프론트에서 추정), 백그라운드 탭에서 중단 가능 |
| Whisper medium | M3 기준 1시간 회의 ~5-8분 처리, 메모리 ~2GB 사용 |
| JSON 파일 저장 | 개인용 규모(수백 건)에서는 문제없음, 수천 건 이상 시 SQLite 전환 검토 |
| 크로스 플랫폼 | pathlib 사용 필수, 하드코딩 경로 금지, .env로 경로 설정 |
| Slack Bot | 채널에 `/invite` 해야 메시지 전송 가능 |
| 프론트엔드 스택 | decisions.md 기술 스택 표에는 "React 18 + TypeScript"로 업데이트됨 (원래 HTML/JS였으나 UI 복잡도로 변경) |
| 디자인 시스템 버전 | 현재 v2. v1 상태로 돌아가야 할 경우 `backups/design-system-v1-20260417/` + `backups/frontend-v1-20260417/` 복원 |

---

## 8. 현재 구현 완료 항목 (2026-04-22 기준)

> **마지막 업데이트**: 2026-04-22 개발 세션 종료 시점
> **최신 커밋**: `47027ca`

### Sprint 1~5 전체 완료 ✅

모든 스프린트 구현이 완료되었으며, QA 전수 조사 + 기획 변경 반영까지 마무리된 상태.

### 1단계 홈 (~98%)
- 복구 카드형 배너 (status별 라우팅 + "이어서 진행" + "삭제하고 새로 시작")
- 복구 세션 존재 시 "새 회의 시작" 비활성 + 안내
- 최근 회의 5건 표시, API 에러 상태 + 다시 시도

### 2단계 회의 정보 (~97%)
- 템플릿 선택 + 빠른 시작, 마이크 권한 사전 체크
- 입력 소스 세그먼트 (실시간/업로드), 파일 드롭존
- 하단 네비 바 (WizardLayout nextSlot)

### 3단계 녹음 (~97%)
- Web Speech 안정화: onerror 분기, no-speech 지수 backoff, instanceIdRef, onStatusChange 콜백
- 녹음 FAB (sticky bottom-16 좌측, idle/recording/post_recording 상시 표시)
- 마이크 민감도 슬라이더 (GainNode 파이프라인, 실시간 조절)
- 블록 편집: 더블클릭, Shift+Enter=줄바꿈, Ctrl+Enter=분할, Backspace/Delete 병합 (첫/마지막 가드)
- 편집 확정 시 서버 PATCH 호출 (block_id 동기화)
- 수정 마크: 타임스탬프 색상 변경 + 아이콘 세로 스택
- whitespace-pre-wrap으로 줄바꿈 렌더링
- 복구 진입 시 기존 블록 로드 + 인라인 배너
- sticky 상태바(top) + beforeunload + popstate 차단
- 백그라운드 탭: useSilentAudio + useVisibility + 조건부 토스트

### 4단계 Whisper (~90%)
- Whisper 스킵 선택 화면 (realtime 모드: [처리 시작] / [건너뛰기], upload 모드: 자동 시작)
- 진행률 단계별 체크리스트, 예상 잔여 시간
- 에러 재시도 + "Web Speech 결과만으로 계속" 폴백
- Whisper 패키지 미설치 (MacBook 배포 시 설치 예정)

### 5단계 편집 (~97%)
- 블록 편집/분할/병합, 중요도 태깅 (팝오버 + 키보드 1/2/3/4/0)
- AI 재태깅 로딩 스피너, 5→6 전환 로딩 오버레이
- 요약 생략 모달 (5→7 직행 옵션)
- 일괄 치환 (잠금 제외), Undo/Redo
- 메타데이터 편집 (blur 저장), 핵심만 토글
- 5단계 진입 시 서버 최신 블록 fetch
- editMode 분기 (session/meeting API 경로 자동 전환)
- 섹션 위계 강화 (서브텍스트 + bg-bg-subtle 래핑)
- importance API 실패 시 롤백

### 6단계 요약 (~97%)
- Claude Sonnet 요약 생성 + 회의 개요 자동 조립
- 전체 화면 로딩 오버레이
- 블록 편집 (더블클릭, WYSIWYG-like)
- 액션 아이템 CRUD (@assignee ~deadline 파싱)
- 재요약 버튼 + 6→5→6 재진입 모달
- 전사 참조 패널 (접힘)
- 전용 저장 API (PATCH /summary + /action-items)

### 7단계 전송 (~97%)
- Slack 채널/스레드 선택 (카드형 메시지 목록 + 로딩 스피너)
- .md export + 폴더 선택 (showDirectoryPicker, 미지원 시 prompt 폴백)
- 체크박스 실행 (.md → Slack → complete 순서)
- 미입력 메타데이터 모달
- 완료 화면: 결과 표시 + Slack 메시지 삭제 버튼 + 재시도 + 건너뛰기
- 미리보기 최신 데이터 fetch
- 더블 클릭 가드

### 히스토리 (~97%)
- 목록 (카드 리스트, 최신순) + 전문 검색 + 기간 필터
- 검색 스니펫 (±30자, 필드별 하이라이트)
- 상세: 요약+F/U, 전사 원본 (절대/상대 시각 토글)
- Slack 전송 이력 + 메시지 삭제
- 재편집 (Meeting→Session 변환 + editMode 분기)
- 재전송, .md 다운로드
- 회의록 삭제 (DELETE /meetings/{id} + 확인 모달)
- Meeting 블록 편집 API 4종 (split, merge, patch, importance)
- resummarize API

### 설정 (~95%)
- 테마 3-way 세그먼트 (시스템/라이트/다크 + Sun/Moon/Monitor 아이콘)
- 템플릿 CRUD (모달 + Slack 채널 드롭다운 + 삭제 확인 모달)
- 주소록 (참여자/장소 추가/삭제)
- 연동 (Slack 토큰 변경/연결 테스트, Claude API 키 변경, Whisper 모델 드롭다운)
- 토큰 마스킹 표시
- Slack 인사 문구 textarea (여러 줄 + 이모티콘)
- 기본 저장 경로 (showDirectoryPicker)
- 마이크 민감도 기본값 (settings.json mic_sensitivity)

### 다크모드 (~95%)
- CSS 변수 오버라이드 (prefers-color-scheme + data-theme)
- FOUC 방지 인라인 스크립트
- theme.ts 유틸 (getTheme/setTheme/applyTheme)
- bg-white 하드코딩 전수 교체 → 시맨틱 토큰
- toast/backdrop 전용 토큰

### 공통 인프라
- WizardLayout: nextSlot (하단 네비 Secondary+Primary 대칭), prevRoute, homeDisabled
- 반응형 Stepper (768px 미만 축약)
- Web Speech: onerror 분기, no-speech backoff, instanceIdRef
- useAudioStream: GainNode 파이프라인
- useSilentAudio + useVisibility
- formatTs 공통 함수 (4파일 통합)
- Modal 포커스 복귀
- asyncio.Lock (contacts, templates)
- block_id 클라이언트-서버 동기화

### 알려진 미구현/미완
| 항목 | 상태 |
|------|------|
| Whisper 패키지 설치 | MacBook 배포 시 |
| 마이크 끊김 → 자동 post_recording | 미구현 |
| B-2 ④ 타이머 보정 | useTimer가 Date.now() 기반이면 불필요 |
| B-2 ⑤ Web Worker | MVP 선택적 |

### 기획→개발 전달 사항

**(2026-04-22 기준 모든 기획 변경 사항이 코드에 반영 완료)**

이전 전달 사항 3건:
1. `reports/PLAN-DEV-HANDOFF-20260422.md` — ✅ 반영 완료
2. `reports/PLAN-DEV-HANDOFF-20260422-2.md` — ✅ 반영 완료
3. `reports/PLAN-REPORT-20260422.md` 8절 — ✅ 반영 완료

새 기획 변경이 있으면 이 섹션에 기록.

### 개발→기획 전달 사항

(현재 없음)

---

## 9. 파일 구조 현재 상태

```
myfirstapp/
├── CLAUDE.md                ← AI 행동 지침
├── HANDOVER.md              ← 이 파일 (인수인계 문서)
├── decisions.md             ← UX/기능 기획서
├── technical-design.md      ← 기술 설계서
├── design-system.md         ← 디자인 시스템 (라이트, v2)
├── design-system-dark.md    ← 디자인 시스템 (다크모드)
├── .gitignore
├── reports/                 ← 세션별 리포트 + 핸드오프 문서
│   ├── DEV-REPORT-YYYYMMDD.md
│   ├── PLAN-REPORT-YYYYMMDD.md
│   ├── QA-REPORT-YYYYMMDD.md
│   └── PLAN-DEV-HANDOFF-*.md  ← 기획→개발 상세 프롬프트
├── QA-FIX/                  ← QA 수정 프롬프트
├── backend/
│   ├── .env                 ← API 키, Slack 토큰
│   ├── main.py              ← FastAPI 앱 엔트리
│   ├── config.py            ← 환경 설정 + 시작 시 경고 로그
│   ├── requirements.txt
│   ├── models/              ← Pydantic (block, session, meeting, template, settings, base)
│   ├── routers/             ← sessions, audio, processing, ai, slack, history, templates, contacts, recovery, settings
│   └── services/            ← audio_service, whisper_service, merger_service, claude_service, summary_assembler
└── frontend/
    ├── index.html           ← lang="ko", 폰트 CDN, FOUC 방지 스크립트
    ├── vite.config.ts       ← Vite + Tailwind + proxy + allowedHosts
    ├── package.json
    └── src/
        ├── index.css        ← Tailwind v4 + 시맨틱 색상 토큰 + 다크모드 오버라이드
        ├── App.tsx           ← React Router 라우팅
        ├── main.tsx          ← BrowserRouter + initTheme()
        ├── types/            ← TypeScript 타입
        ├── api/              ← sessions, history, slack, templates, contacts, recovery, client
        ├── stores/           ← sessionStore (editMode), wizardStore (editedAfterSummary)
        ├── hooks/            ← useTimer, useAudioStream (GainNode), useWebSpeech (instanceIdRef), useSilentAudio, useVisibility
        ├── pages/            ← Home, MeetingSetup, Recording, Processing, Editing, Summary, SendSave, History, HistoryDetail, Settings
        ├── components/       ← wizard/(WizardStepper, WizardLayout), common/(Toast, TagInput, Modal)
        └── utils/            ← formatTime (formatTs, formatDuration, formatTimestamp), theme
```

---

## 10. 세션 역할 구분

이 프로젝트는 **기획 세션**, **개발 세션**, **검수(QA) 세션** 3개의 Claude Code 세션으로 운영됩니다.

### 역할 정의

| 세션 | 역할 | 주요 작업 | 수정 대상 파일 |
|------|------|----------|---------------|
| **기획 세션** | 기획·설계 | UX 결정, 설계 변경, 디자인 시스템 조정, 기능 논의 | `decisions.md`, `technical-design.md`, `design-system.md` |
| **개발 세션** | 코드 구현 | 기획 문서 기반 코드 작성, 테스트, 디버깅 | `backend/`, `frontend/` |
| **검수(QA) 세션** | 품질 검증 | 기획 문서 기준 코드 전수 검사, 불일치·버그 보고 | `reports/QA-REPORT-*.md` (코드 직접 수정 안 함) |

### 인수인계 방향

**기획 → 개발** (기획 세션이 설계 문서를 수정한 경우)
- 기획 세션은 변경 내용을 아래 "기획→개발 전달 사항"에 기록
- 개발 세션은 시작 시 이 섹션을 확인하고, 코드에 반영 후 항목을 지움

**개발 → 기획** (구현 중 설계 이슈를 발견한 경우)
- 개발 세션은 아래 "개발→기획 전달 사항"에 기록
- 기획 세션은 시작 시 이 섹션을 확인하고, 설계 검토 후 항목을 지움

### 기획→개발 전달 사항

#### [2026-04-17] 디자인 시스템 v2 개편

**개요:**
디자인 시스템을 v1 "Vercel 스타일"에서 v2 "Toss-style Bold Editorial"로 개편함.
상세 규격은 `design-system.md` 참조.

**개발 세션이 수행해야 할 작업:**

1. **백업 (필수 선행)**
   - `backups/frontend-v1-20260417/` 디렉토리 생성
   - `frontend/src/index.css` 현재 파일을 해당 디렉토리에 복사
   - 이미 구현된 컴포넌트 중 v1 스타일이 하드코딩된 것이 있다면 주요 파일도 함께 백업
   - 백업 디렉토리에 README.md 작성 (복원 방법 명시)

2. **`frontend/src/index.css` 업데이트**
   - `--color-primary`: `#059669` → `#3182F6`
   - `--color-primary-hover`: `#047857` → `#1B64DA`
   - `--color-bg-hover` 신규 추가: `#F0F2F5`
   - `--color-template`: `#ECFDF5` → `#EFF6FF`
   - 타이포 관련 커스텀 클래스 또는 설정이 있다면 `design-system.md`의 크기 규칙대로 갱신

3. **`frontend/index.html` 폰트 로드 수정**
   - Google Fonts URL의 Inter weight에 `700` 추가
   - 기존: `family=Inter:wght@400;500;600`
   - 변경: `family=Inter:wght@400;500;600;700`

4. **구현 완료된 컴포넌트 재스타일링** (Sprint 1-2 산출물)
   - `HomePage`, `MeetingSetup`, `Recording` 등 구현된 페이지/컴포넌트에 새 디자인 시스템 적용
   - 주요 변경:
     - Display 크기를 40px/700로
     - 카드의 테두리를 배경색(`bg-bg-subtle`)으로 전환, 라운드 xl, 패딩 p-5
     - 입력 필드를 배경색 기반으로 전환
     - 페이지 상단 여백 `pt-20`, 섹션 간 `mt-20`
     - 홈 화면 최대 폭 `max-w-md`
   - `design-system.md`의 "v1 → v2 변경 요약 (체크리스트)" 를 항목별로 따라가며 확인

5. **시각 확인 후 피드백 보고**
   - dev server를 띄운 상태에서 사용자가 직접 확인할 수 있도록 준비
   - 구현 후 "개발→기획 전달 사항"에 적용 결과 또는 이슈 보고

**롤백 방법:**
- `backups/frontend-v1-20260417/` 의 파일들을 원래 경로로 복사하면 v1 상태로 복원
- `backups/design-system-v1-20260417/` 의 문서도 함께 복원 필요

**주의:**
- 중요도 태깅 색상 체계(`#EF4444` / `#F59E0B` / `#D1D5DB` / 투명)는 **변경하지 말 것** — 사용자가 명시적으로 유지 요청
- 기존 Status 색상(recording/success/warning)도 유지
- 기능·인터랙션 로직은 변경 없음 — 순수 스타일 변경

#### [2026-04-21~22] 실사용 피드백 기반 기획 변경 (대량)

**개요:**
Sprint 4 완료 후 사용자 실사용에서 발견된 오류 및 개선 요청을 반영하여 decisions.md, technical-design.md, design-system.md를 대폭 수정함.

**개발 세션이 수행해야 할 작업:**
아래 3개 프롬프트 파일에 상세 지시가 있음. 순서대로 확인하고 ��영할 것.

1. **`reports/PLAN-DEV-HANDOFF-20260422.md`** — 기획 변경 6건 + 버그 7건 + 이전 미착수 확인 5건
2. **`reports/PLAN-DEV-HANDOFF-20260422-2.md`** — 기획 변경 10건 + 디자인 1건 + 확인 1건
3. **`reports/PLAN-REPORT-20260422.md` 8절** — FAB 좌하단 + 폴더 선택 + 네비 바 디자인 통일 (3건)

**주의:**
- decisions.md의 변경 부분을 반드시 읽고 코드에 반영할 것
- 특히 키보드 명령어 변경(Shift+Enter→줄바꿈, Ctrl+Enter→분할)은 Recording.tsx + Editing.tsx 모두 적용
- 복구 플로우는 technical-design.md 4-10절 참조 (기존 세션 재개 방식, restore API 제거)

### 개발→기획 전달 사항

#### [2026-04-17] 디자인 시스템 v2 적용 완료
- v1 백업 완료: `backups/frontend-v1-20260417/` (index.css, index.html, Home.tsx, MeetingSetup.tsx, Recording.tsx, README.md)
- `index.css`: Primary `#3182F6`, primary-hover `#1B64DA`, bg-hover `#F0F2F5` 신규, template `#EFF6FF`
- `index.html`: Inter weight에 `700` 추가
- Home.tsx: Display 40px/700, max-w-md, pt-20, 카드 bg-bg-subtle/rounded-xl/p-5, hover:bg-bg-hover, 버튼 px-5 py-3 font-semibold, 아이콘 size={32/20}
- MeetingSetup.tsx: Display 40px/700 제목, 입력 필드 bg-bg-subtle + focus:ring-2, 세그먼트 컨트롤 배경색 기반, 드롭존 rounded-xl
- Recording.tsx: 회의 제목을 Display 40px/700 주인공으로, 상태바를 Small(13px), ���사 블록 space-y-3, interim에 bg-bg-subtle 배경, ���튼 크기 상향
- 중요도 태깅 색상·Status 색상은 유지됨 (지시대로)
- **브라우저 확인 필요**: http://localhost:5173/ 에서 시각 확인 부탁드립니다

---

## 11. 리포트 규칙

### 파일 위치
모든 세션 리포트는 `reports/` 폴더에 저장.

### 네이밍 컨벤션

| 세션 | 파일명 패턴 | 예시 |
|------|------------|------|
| 기획 | `PLAN-REPORT-YYYYMMDD.md` | `PLAN-REPORT-20260420.md` |
| 개발 | `DEV-REPORT-YYYYMMDD.md` | `DEV-REPORT-20260420.md` |
| 검수(QA) | `QA-REPORT-YYYYMMDD.md` | `QA-REPORT-20260420.md` |

### 공통 양식

```markdown
# {기획/개발/검수} 업무 보고서 — YYYY-MM-DD

> 작성 주체: {기획/개발/검수} 세션
> 대상 기간: YYYY-MM-DD (N번째 {기획/개발/검수} 세션)
> 이전 보고서: `reports/{TYPE}-REPORT-YYYYMMDD.md`

---

## 1. 오늘 수행한 작업 요약
(카테고리 | 건수 | 요약 표)

## 2. 변경된 파일 목록
(파일 | 변경 유형 | 상세 표)

## 3. 주요 결정/변경 사항
(세션 유형에 따라: 기획=결정 사항, 개발=기술 결정, QA=발견 이슈)

## 4. 전달 사항
(다른 세션에 전달할 내용)

## 5. 다음 세션에서 확인할 것
(후속 작업 목록)
```

### 작성 시점
- **세션 종료 시** 반드시 리포트 작성
- 같은 날짜에 동일 세션이 2회 이상이면 `-2` 접미사 (`DEV-REPORT-20260420-2.md`)

---

## 12. 새 세션에서 시작하는 방법

### 기획 세션
1. 이 프로젝트 폴더에서 Claude Code를 열면 `CLAUDE.md`가 자동 로드됨
2. 첫 메시지: **"HANDOVER.md를 읽어줘. 기획 세션이야."**
3. "기획→개발 전달 사항"을 확인하고, "개발→기획 전달 사항"에 답변
4. 기획 논의 후 변경사항을 decisions.md / technical-design.md에 반영
5. 개발에 전달할 내용이 있으면 "기획→개발 전달 사항"에 기록
6. **세션 종료 시 `reports/PLAN-REPORT-YYYYMMDD.md` 작성** (11절 양식 참조)

### 개발 세션
1. 이 프로젝트 폴더에서 Claude Code를 열면 `CLAUDE.md`가 자동 로드됨
2. 첫 메시지: **"HANDOVER.md를 읽고 이어서 개발해줘"**
3. "기획→개발 전달 사항"을 확인하고 코드에 반영
4. dev server 시작: 백엔드 `cd backend && uvicorn main:app --reload --port 8000`, 프론트엔드 `cd frontend && npm run dev`
5. 구현 중 설계 이슈 발견 시 "개발→기획 전달 사항"에 기록
6. **세션 종료 시 `reports/DEV-REPORT-YYYYMMDD.md` 작성** (11절 양식 참조)

### 검수(QA) 세션
1. 이 프로젝트 폴더에서 Claude Code를 열면 `CLAUDE.md`가 자동 로드됨
2. 첫 메시지: **"HANDOVER.md를 읽어줘. 검수 세션이야."**
3. 기획 문서(decisions.md, technical-design.md) 기준으로 코드 전수 검사
4. 발견 이슈를 심각도별로 분류하여 보고
5. **세션 종료 시 `reports/QA-REPORT-YYYYMMDD.md` 작성** (11절 양식 참조)
