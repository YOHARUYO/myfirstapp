# 기술 설계서 (Technical Design)

> 마지막 업데이트: 2026-04-16
> 참조: decisions.md (프로덕트/UX 기획서)

---

## 1. 기술 스택 확정

### 백엔드
| 항목 | 기술 | 비고 |
|------|------|------|
| 런타임 | Python 3.11+ | |
| 웹 프레임워크 | FastAPI | 비동기 지원, WebSocket 내장 |
| ASGI 서버 | Uvicorn | |
| STT | openai-whisper (또는 faster-whisper) | 로컬 실행, medium 모델 기본 |
| AI 요약/태깅 | Anthropic Python SDK | Claude API 호출 |
| Slack | slack-sdk | Bot API |
| 데이터 검증 | Pydantic v2 | 모델 정의 + JSON 직렬화 |
| 오디오 처리 | ffmpeg | 청크 병합, 포맷 변환 |

### 프론트엔드


| 항목 | 기술 | 선택 이유 |
|------|------|----------|
| 프레임워크 | React 18 + TypeScript | 블록 편집, 상태 관리, 실시간 업데이트 등 복잡한 UI |
| 빌드 | Vite | 빠른 HMR, 경량 |
| 라우팅 | React Router v6 | wizard 단계 관리 |
| 상태 관리 | Zustand | 단순, 보일러플레이트 최소 |
| WYSIWYG 에디터 | Tiptap (ProseMirror 기반) | 블록 편집, 마크다운 입력 규칙, 커스텀 노드 확장 |
| 스타일링 | Tailwind CSS | 유틸리티 기반, 빠른 프로토타이핑 |
| HTTP 클라이언트 | Axios | |

### Tiptap 선택 이유
- 블록 단위 편집이 핵심 → ProseMirror 기반이라 블록(Node) 개념이 내장
- 마크다운 입력 규칙 (`**bold**` → 즉시 렌더링) 플러그인 제공
- 커스텀 Node 확장으로 전사 블록(타임스탬프+중요도+화자) 구현 가능
- 6단계 WYSIWYG 요약 편집에도 동일 에디터 재사용
- **Undo/Redo 히스토리가 내장** (ProseMirror history 플러그인)

### 디자인 시스템

#### 디자인 톤
- **Vercel/Stripe 스타일**: 극도로 절제된 색상, 모노톤 기조 + 최소한의 포인트 컬러
- 타이포그래피와 여백으로 구분, 그림자·장식 최소
- 다색 요소(중요도 태깅)는 작은 세로 바에만 한정하여 모노톤 톤 유지

#### 색상 모드
- **라이트 모드 기본** (다크 모드는 향후 확장)

#### 색상 팔레트
| 역할 | 색상 코드 | 용도 |
|------|----------|------|
| 기본 배경 | `#FFFFFF` | 전체 배경 |
| 보조 배경 | `#F8F9FA` | 블록 배경, 카드, interim 블록 |
| 텍스트 | `#1A1A1A` | 본문 |
| 보조 텍스트 | `#6B7280` | 타임스탬프, 부가 정보 |
| 테두리 | `#E5E7EB` | 구분선, 카드 테두리 |
| Primary | `#059669` | 주요 버튼, 링크, 활성 상태 (그린 계열) |
| 녹음 중 | `#EF4444` | 녹음 dot(pulse), 중지 버튼 |
| 성공/완료 | `#10B981` | 완료 표시, 녹음 시작 |
| 중요도 상 | `#EF4444` | 중요도 바 (빨강) |
| 중요도 중 | `#F59E0B` | 중요도 바 (앰버) |
| 중요도 하 | `#D1D5DB` | 중요도 바 (연회색) |
| 중요도 최하 | 투명 | 바 없음 |
| 수정됨 표시 | `#059669` | ✎ 연필 아이콘 + 세로 바 (Primary와 동일) |
| 템플릿 채움 | `#ECFDF5` | 템플릿 자동 채움 필드 배경 (연한 그린) |
| 미입력 강조 | `#FFFBEB` | 빈 필드 강조 배경 |

#### 타이포그래피
| 용도 | 폰트 | 크기 | 비고 |
|------|------|------|------|
| 본문 | Pretendard (1순위), Inter (fallback) | 15px | |
| 헤딩 | 동일, weight 600 | 18-24px | |
| 보조 텍스트 | 동일, `#6B7280` | 13px | |
| 타임스탬프 | JetBrains Mono | 12px | 모노스페이스, 숫자 정렬 |

- Pretendard: 한글·영문 모두 커버하는 1순위 폰트
- Inter: Pretendard 미지원 문자(특수 언어)에 대한 fallback
- `font-family: 'Pretendard', 'Inter', -apple-system, sans-serif`

#### 컴포넌트 스타일
| 요소 | 스타일 |
|------|--------|
| 모서리 | `border-radius: 8px` |
| 그림자 | 거의 없음, 모달에만 `shadow-lg` |
| 버튼 (Primary) | 배경 채움 (`#059669`, 흰 텍스트) |
| 버튼 (Secondary) | 테두리만 (`#E5E7EB`, 검정 텍스트) |
| 버튼 (Danger) | 배경 채움 (`#EF4444`, 흰 텍스트) |
| 입력 필드 | `#E5E7EB` 테두리 → 포커스 시 `#059669` |
| 카드 | `#F8F9FA` 배경 or `#E5E7EB` 테두리, 그림자 없음 |
| 구분선 | `1px solid #E5E7EB`, 여백으로 대체 가능하면 생략 |
| 툴바 | 상단 고정, `#FFFFFF` 배경 + 하단 `1px` 테두리 |
| 토스트 | 하단 중앙, `#1A1A1A` 배경 + 흰 텍스트, 3초 후 사라짐 |

#### Tailwind CSS 설정
```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: '#059669',
        recording: '#EF4444',
        success: '#10B981',
        importance: {
          high: '#EF4444',
          medium: '#F59E0B',
          low: '#D1D5DB',
        },
        template: '#EFF6FF',
        missing: '#FFFBEB',
      },
      fontFamily: {
        sans: ['Pretendard', 'Inter', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
}
```

---

## 2. 프로젝트 구조

```
myfirstapp/
├── backend/
│   ├── main.py                    # FastAPI 앱 엔트리, CORS, 라우터 등록
│   ├── config.py                  # 환경 설정 로드
│   ├── routers/
│   │   ├── sessions.py            # 세션 CRUD + 블록 편집
│   │   ├── audio.py               # WebSocket 오디오 스트리밍
│   │   ├── processing.py          # Whisper 처리 + 진행률
│   │   ├── ai.py                  # Claude 태깅/요약/키워드
│   │   ├── slack.py               # Slack 채널/스레드/전송
│   │   ├── history.py             # 히스토리 목록/검색/상세
│   │   ├── templates.py           # 회의 템플릿 CRUD
│   │   ├── contacts.py            # 참여자/장소 주소록
│   │   ├── settings.py            # 앱 설정
│   │   └── recovery.py            # 세션 복구
│   ├── services/
│   │   ├── whisper_service.py     # Whisper 모델 로드/실행
│   │   ├── claude_service.py      # Claude API 호출 (태깅/요약/키워드)
│   │   ├── slack_service.py       # Slack Bot 연동
│   │   ├── merger_service.py      # Web Speech + Whisper 병합 로직
│   │   ├── summary_assembler.py   # 회의 개요 조립 + Claude 요약 결합
│   │   ├── audio_service.py       # 오디오 청크 관리 + ffmpeg 병합
│   │   └── search_service.py      # 히스토리 전문 검색
│   ├── models/
│   │   ├── base.py                # 공통 BaseModel (Session/Meeting 공유)
│   │   ├── session.py             # 세션 Pydantic 모델
│   │   ├── meeting.py             # 완료된 회의 모델 (BaseModel 상속)
│   │   ├── block.py               # 전사 블록 모델
│   │   ├── template.py            # 템플릿 모델
│   │   └── settings.py            # 설정 모델
│   └── data/                      # 런타임 데이터 (git 제외)
│       ├── sessions/              # 활성 세션
│       │   └── {session_id}/
│       │       ├── session.json   # 세션 메타데이터 + 블록
│       │       └── chunks/        # 오디오 청크 파일들
│       │           ├── chunk_000.webm
│       │           ├── chunk_001.webm
│       │           └── ...
│       ├── meetings/              # 완료된 회의 (JSON + 병합 오디오)
│       ├── exports/               # .md 내보내기 파일
│       ├── settings.json
│       ├── templates.json
│       └── contacts.json
│
├── frontend/
│   ├── index.html
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   ├── package.json
│   └── src/
│       ├── App.tsx                # 라우팅 설정
│       ├── main.tsx               # 엔트리
│       ├── pages/
│       │   ├── Home.tsx           # 1단계 홈
│       │   ├── MeetingSetup.tsx   # 2단계 회의 정보 입력
│       │   ├── Recording.tsx      # 3단계 녹음 & 실시간 전사
│       │   ├── Processing.tsx     # 4단계 Whisper 후처리
│       │   ├── Editing.tsx        # 5단계 회의록 편집
│       │   ├── Summary.tsx        # 6단계 요약 & 액션 아이템
│       │   ├── SendSave.tsx       # 7단계 전송 & 저장
│       │   ├── History.tsx        # 히스토리 목록
│       │   ├── HistoryDetail.tsx  # 히스토리 상세
│       │   └── Settings.tsx       # 설정
│       ├── components/
│       │   ├── wizard/
│       │   │   ├── WizardStepper.tsx
│       │   │   └── WizardLayout.tsx
│       │   ├── transcript/
│       │   │   ├── TranscriptBlock.tsx
│       │   │   ├── ImportanceBar.tsx
│       │   │   ├── SpeakerSlot.tsx
│       │   │   ├── InterimBlock.tsx
│       │   │   └── GapIndicator.tsx
│       │   ├── editor/
│       │   │   ├── SummaryEditor.tsx
│       │   │   ├── ActionItemList.tsx
│       │   │   └── SearchReplace.tsx
│       │   ├── recording/
│       │   │   ├── StatusBar.tsx
│       │   │   ├── ControlBar.tsx
│       │   │   └── MicLevelMeter.tsx
│       │   ├── common/
│       │   │   ├── Toast.tsx
│       │   │   ├── Modal.tsx
│       │   │   ├── Toolbar.tsx
│       │   │   └── CollapsiblePanel.tsx
│       │   └── settings/
│       │       ├── TemplateModal.tsx
│       │       └── ContactManager.tsx
│       ├── hooks/
│       │   ├── useRecording.ts
│       │   ├── useAudioStream.ts
│       │   ├── useWebSpeech.ts
│       │   ├── useWakeLock.ts
│       │   ├── useVisibility.ts
│       │   └── useTimer.ts
│       ├── stores/
│       │   ├── sessionStore.ts
│       │   ├── wizardStore.ts
│       │   └── settingsStore.ts
│       ├── api/
│       │   ├── client.ts
│       │   ├── sessions.ts
│       │   ├── history.ts
│       │   ├── slack.ts
│       │   ├── ai.ts
│       │   └── settings.ts
│       ├── types/
│       │   └── index.ts
│       └── utils/
│           ├── formatTime.ts
│           ├── markdown.ts
│           └── audio.ts
│
├── CLAUDE.md
├── decisions.md
├── technical-design.md
└── README.md
```

---

## 3. 데이터 모델

### 3-1. 전사 블록 (Block)
```json
{
  "block_id": "blk_001",
  "timestamp_start": 0.0,
  "timestamp_end": 3.5,
  "text": "안녕하세요 오늘 회의 시작하겠습니다",
  "source": "web_speech",
  "is_edited": false,
  "importance": null,
  "importance_source": null,
  "speaker": null
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `block_id` | string | 고유 식별자 |
| `timestamp_start` | float | 블록 시작 시점 (초, 녹음 시작 기준 상대시각) |
| `timestamp_end` | float | 블록 종료 시점 |
| `text` | string | 전사 텍스트 |
| `source` | enum | `"web_speech"` / `"whisper"` / `"user_edit"` |
| `is_edited` | bool | 사용자가 수정했는지 (✎ 표시 + Whisper 재처리 잠금) |
| `importance` | enum \| null | `"high"` / `"medium"` / `"low"` / `"lowest"` / `null` |
| `importance_source` | enum \| null | `"user"` / `"ai"` / `null` |
| `speaker` | string \| null | 화자 이름 (MVP: null, 향후 pyannote 또는 수동 태깅) |

> **타임스탬프 추정 (Web Speech)**: Web Speech API는 타임스탬프를 제공하지 않음. 프론트엔드에서 `Date.now() - recordingStartTime` 으로 상대시각을 추정하여 `timestamp_start`/`timestamp_end` 생성. 이 값은 근사치이며, Whisper 재처리 시 정확한 타임스탬프로 교체됨.

### 3-2. 세션 (Session) — 활성 상태의 회의
```json
{
  "session_id": "session_20260416_143022",
  "status": "recording",
  "created_at": "2026-04-16T14:30:22",
  "input_mode": "realtime",
  "metadata": {
    "title": "정기 회의",
    "date": "2026-04-16",
    "start_time": "14:30:22",
    "end_time": null,
    "duration_seconds": null,
    "language": "ko-KR",
    "participants": ["김OO", "박OO", "이OO"],
    "location": "3층 회의실 A",
    "template_id": "tpl_weekly_team"
  },
  "audio_chunks_dir": "data/sessions/session_20260416_143022/chunks/",
  "audio_chunk_count": 0,
  "blocks": [ ... ],
  "recording_gaps": [
    {
      "after_block_id": "blk_015",
      "gap_seconds": 300
    }
  ],
  "ai_tagging_skipped": false
}
```

| 필드 | 설명 |
|------|------|
| `status` | `"idle"` → `"recording"` → `"post_recording"` → `"processing"` → `"editing"` → `"summarizing"` → `"completed"` |
| `input_mode` | `"realtime"` / `"upload"` |
| `audio_chunks_dir` | 오디오 청크 파일들이 저장된 디렉토리 경로 |
| `audio_chunk_count` | 현재까지 저장된 청크 수 |
| `recording_gaps` | 녹음 재개 시 빈 구간 정보 (⏸ N분 경과 표시용) |
| `ai_tagging_skipped` | 사용자가 AI 태깅 스킵을 선택했는지 |

### 3-3. 완료된 회의 (Meeting) — 히스토리 저장
```json
{
  "meeting_id": "mtg_20260416_143022",
  "created_at": "2026-04-16T14:30:22",
  "completed_at": "2026-04-16T15:30:00",
  "metadata": { ... },
  "blocks": [ ... ],
  "summary_markdown": "# 260416(수) 정기 회의\n\n## 회의 개요\n...",
  "action_items": [
    {
      "fu_id": "fu_001",
      "assignee": "김OO",
      "task": "보고서 초안 작성",
      "deadline": "2026-04-20",
      "source_topic": "1. AI Agent 개발 현황"
    }
  ],
  "keywords": ["AI Agent", "디자인 리뷰", "출시일", "Slack 연동"],
  "slack_sent": {
    "channel_id": "C1234567",
    "channel_name": "#team-meeting",
    "thread_ts": null,
    "message_ts": "1713267000.000100",
    "sent_at": "2026-04-16T15:30:00"
  },
  "local_file_path": "C:\\...\\meetings\\정기_회의_20260416.md",
  "merged_audio_path": "data/meetings/mtg_20260416_143022.webm"
}
```

> **Session ↔ Meeting 관계**: 두 모델은 `models/base.py`의 공통 BaseModel을 상속하여 코드 중복을 방지. Session은 활성 작업 중 상태, Meeting은 완료된 결과물. `POST /api/sessions/{id}/complete` 호출 시 Session → Meeting 변환.

> **요약 저장 구조**: `summary_markdown`(마크다운 원문)이 **유일한 정본(source of truth)**. 6단계 UI에서 블록 편집한 결과는 최종적으로 마크다운 문자열로 직렬화되어 이 필드에 저장. 렌더링 시 마크다운을 `##`/`###` 기준으로 파싱하여 블록을 구성. `sections` 배열을 별도 저장하지 않음으로써 동기화 문제를 원천 차단.

> **action_items와 요약 내 F/U의 관계**: `action_items`는 `summary_markdown` 내의 "F/U 필요 사항" 항목들을 **파싱하여 추출한 구조화된 사본**. 6단계에서 사용자가 F/U를 수정하면 action_items도 재추출. 사용자가 action_items를 직접 추가·삭제하면 이 항목은 `summary_markdown`과 독립적으로 관리 (요약 본문에는 자동 반영 안 됨, 전체 F/U 요약 영역에서만 관리).

**action_items 개별 항목 스키마**:
| 필드 | 타입 | 설명 |
|------|------|------|
| `fu_id` | string | 고유 식별자 |
| `assignee` | string \| null | 담당자 (없으면 null) |
| `task` | string | 할 일 내용 |
| `deadline` | string \| null | 기한 (YYYY-MM-DD 또는 null) |
| `source_topic` | string \| null | 출처 주제명 (요약에서 추출 시 자동 부여, 수동 추가 시 null) |

### 3-4. 템플릿 (Template)
```json
{
  "template_id": "tpl_weekly_team",
  "name": "주간 팀 미팅",
  "defaults": {
    "title": "정기 회의",
    "participants": ["김OO", "박OO", "이OO"],
    "location": "3층 회의실 A",
    "language": "ko-KR",
    "slack_channel_id": "C1234567"
  },
  "created_at": "2026-04-10T10:00:00",
  "updated_at": "2026-04-10T10:00:00"
}
```

### 3-5. 설정 (Settings)
```json
{
  "slack": {
    "bot_token": "xoxb-...",
    "connected": true
  },
  "claude": {
    "api_key": "sk-ant-...",
    "summary_model": "claude-sonnet-4-20250514",
    "tagging_model": "claude-haiku-4-5-20251001"
  },
  "whisper": {
    "model": "medium"
  },
  "slack_greeting": "오늘 진행된 회의 회의록 공유드립니다~!",
  "export_path": "C:\\Users\\...\\meetings",
  "summary_template": "default"
}
```

### 3-6. 주소록 (Contacts)
```json
{
  "participants": [
    { "id": "p_001", "name": "김OO", "created_at": "2026-04-10" },
    { "id": "p_002", "name": "박OO", "created_at": "2026-04-10" }
  ],
  "locations": [
    { "id": "l_001", "name": "3층 회의실 A", "created_at": "2026-04-10" },
    { "id": "l_002", "name": "12층 Klimt", "created_at": "2026-04-10" }
  ]
}
```

---

## 4. API 엔드포인트 설계

### 4-1. 세션 관리
| Method | Endpoint | 설명 |
|--------|----------|------|
| `POST` | `/api/sessions` | 새 세션 생성 (동시 세션 방지: 미완료 세션 있으면 거부) |
| `GET` | `/api/sessions/{id}` | 세션 조회 |
| `PATCH` | `/api/sessions/{id}/metadata` | 메타데이터 수정 (회의 정보 변경) |
| `POST` | `/api/sessions/{id}/stop` | 녹음 중지 (status → post_recording) |
| `POST` | `/api/sessions/{id}/resume` | 녹음 재개 (status → recording, gap 기록) |
| `POST` | `/api/sessions/{id}/complete` | 세션 완료 → Meeting으로 변환 + JSON 히스토리 저장만. Slack 전송/.md 저장은 별도 API |
| `POST` | `/api/sessions/{id}/export-md` | .md 파일 생성 및 저장 (7단계 체크박스 선택 시) |
| `DELETE` | `/api/sessions/{id}` | 세션 취소/삭제 |

> **동시 세션 방지**: `POST /api/sessions` 호출 시 서버가 `status`가 `completed`가 아닌 기존 세션이 있는지 확인. 있으면 409 Conflict 반환. 즉 `recording`, `post_recording`, `processing`, `editing`, `summarizing` 상태 모두 활성 세션으로 간주하여 새 세션 생성을 차단.

### 4-2. 오디오 스트리밍
| Method | Endpoint | 설명 |
|--------|----------|------|
| `WS` | `/api/sessions/{id}/audio` | WebSocket: 오디오 청크 + Web Speech 결과 전송 |
| `POST` | `/api/sessions/{id}/upload` | 파일 업로드 (업로드 경로, multipart/form-data) |

**파일 업로드 검증**:
- 지원 형식: `.webm`, `.mp3`, `.wav`, `.m4a`
- 최대 파일 크기: 500MB (2시간 회의 기준 충분)
- 검증 실패 시: 422 Unprocessable Entity + 에러 메시지 ("지원하지 않는 파일 형식입니다" 등)

### 4-3. 블록 편집
| Method | Endpoint | 설명 |
|--------|----------|------|
| `PATCH` | `/api/sessions/{id}/blocks/{block_id}` | 블록 텍스트 수정 |
| `POST` | `/api/sessions/{id}/blocks/{block_id}/split` | 블록 분할 |
| `POST` | `/api/sessions/{id}/blocks/{block_id}/merge` | 다음 블록과 병합 |
| `PATCH` | `/api/sessions/{id}/blocks/{block_id}/importance` | 중요도 태그 설정 |
| `POST` | `/api/sessions/{id}/blocks/search-replace` | 일괄 치환 |

**블록 분할 요청 바디**:
```json
{
  "cursor_position": 15
}
```

**일괄 치환 요청 바디**:
```json
{
  "search": "검색어",
  "replace": "치환어",
  "options": {
    "case_sensitive": false,
    "whole_word": false,
    "skip_edited_blocks": true
  }
}
```
- `skip_edited_blocks`: decisions.md의 "잠금 구간 제외 (기본 ON)" 반영. 사용자가 수정한 블록(`is_edited: true`)은 치환 대상에서 제외

**일괄 치환 응답 바디**:
```json
{
  "replaced_count": 5,
  "skipped_locked_count": 2,
  "affected_block_ids": ["blk_003", "blk_007", "blk_012", "blk_018", "blk_025"]
}
```

> **블록 편집 서버 동기화 정책**: 프론트엔드에서는 블록을 로컬 상태로 편집하고, **편집 확정 시점(Enter / 블록 밖 클릭)**에만 서버로 PATCH 전송. 매 키 입력마다 호출하지 않음. 이는 decisions.md의 메타데이터 "blur 시 자동 저장" 패턴과 동일한 원칙.

> **"핵심만 보기" 토글 구현**: **클라이언트 사이드 필터링**. 서버 호출 없이 프론트엔드 Zustand 스토어에 `showImportance: "all" | "high_medium"` 상태를 두고, `"high_medium"` 선택 시 블록 목록에서 `importance`가 `"low"`, `"lowest"`, `null`인 블록을 CSS `display: none`으로 숨김. 블록 데이터 자체는 삭제하지 않음. 토글 전환은 즉시 반영.

### 4-4. Whisper 처리
| Method | Endpoint | 설명 |
|--------|----------|------|
| `POST` | `/api/sessions/{id}/process` | Whisper 처리 시작 (백그라운드 태스크) |
| `GET` | `/api/sessions/{id}/process/status` | 처리 진행률 조회 (polling, 2초 간격 권장) |

**처리 진행률 응답**:
```json
{
  "status": "processing",
  "stage": "whisper",
  "stages": {
    "audio_merge": { "status": "completed" },
    "whisper": { "status": "in_progress", "progress": 0.43 },
    "block_merge": { "status": "pending" },
    "ai_tagging": { "status": "pending" }
  },
  "estimated_remaining_seconds": 180
}
```

### 4-5. AI (Claude)
| Method | Endpoint | 설명 |
|--------|----------|------|
| `POST` | `/api/sessions/{id}/tag` | AI 중요도 태깅 (미태깅 블록만, 사용자 태그 불변, idempotent — 초기 태깅과 재태깅 동일 엔드포인트) |
| `POST` | `/api/sessions/{id}/summarize` | AI 요약 생성 + 회의 개요 자동 조립 |

### 4-6. 히스토리
| Method | Endpoint | 설명 |
|--------|----------|------|
| `GET` | `/api/meetings` | 회의 목록 (최신순) |
| `GET` | `/api/meetings/{id}` | 회의 상세 |
| `GET` | `/api/meetings/search?q=...&from=...&to=...` | 검색 (전문 검색 포함) |
| `PATCH` | `/api/meetings/{id}` | 재편집 저장 (partial update, 아래 요청 바디 참조) |

> **재편집 흐름**: Meeting을 Session으로 재변환하지 않음. 히스토리에서 "재편집" 클릭 시 Meeting 데이터를 5단계 편집 UI에 로드하고, 수정 완료 시 `PATCH /api/meetings/{id}`로 직접 저장. 재요약이 필요하면 `POST /api/meetings/{id}/resummarize` 호출 (Meeting 대상 요약 재생성).

**`PATCH /api/meetings/{id}` 요청 바디** (partial update — 포함된 필드만 수정):
```json
{
  "metadata": { "title": "수정된 제목", "participants": [...] },
  "blocks": [ ... ],
  "summary_markdown": "# 260416(수) ...",
  "action_items": [ ... ]
}
```
- 각 최상위 필드는 선택적 (보내지 않으면 기존 값 유지)
- `blocks` 전송 시 전체 블록 배열 교체 (개별 블록 patch가 아님)

> **메타데이터 저장 API 분기**: 프론트엔드는 현재 모드에 따라 다른 API 호출.
> - 세션 편집 중 (3·5단계): `PATCH /api/sessions/{id}/metadata`
> - 히스토리 재편집 중: `PATCH /api/meetings/{id}` (metadata 필드 포함)
> - wizardStore에 `editMode: "session" | "meeting"` 상태를 두어 컴포넌트가 분기

| Method | Endpoint | 설명 |
|--------|----------|------|
| `POST` | `/api/meetings/{id}/resummarize` | 기존 Meeting 대상 요약 재생성 |
| `POST` | `/api/meetings/{id}/export-md` | .md 파일 재생성 (재편집 후) |
| `POST` | `/api/meetings/{id}/resend-slack` | Slack 재전송 (다른 채널/스레드 선택 가능) |

### 4-7. Slack
| Method | Endpoint | 설명 |
|--------|----------|------|
| `GET` | `/api/slack/channels` | 봇이 참여한 채널 목록 |
| `GET` | `/api/slack/channels/{id}/messages?limit=20` | 채널 최근 메시지 (스레드 선택용) |
| `POST` | `/api/slack/send` | 메시지 전송 (+ .md 파일 첨부, 아래 요청 바디 참조) |
| `GET` | `/api/slack/test` | 연결 테스트 |

**`POST /api/slack/send` 요청 바디**:
```json
{
  "session_id": "session_20260416_143022",
  "channel_id": "C1234567",
  "thread_ts": null,
  "attach_md": true
}
```
- `session_id` 또는 `meeting_id`: 전송 대상 (세션 완료 전 전송 시 session_id, 재전송 시 meeting_id)
- `channel_id`: Slack 채널 ID
- `thread_ts`: 스레드 답장 시 부모 메시지 타임스탬프 (새 메시지면 null)
- `attach_md`: .md 파일 첨부 여부
- 서버가 해당 세션/미팅의 요약·액션 아이템·메타데이터를 읽어 메시지를 조립하고 인사 문구(설정)를 삽입

**`POST /api/slack/send` 응답 바디**:
```json
{
  "success": true,
  "channel_name": "#team-meeting",
  "message_ts": "1713267000.000100",
  "thread_ts": null
}
```

### 4-8. 템플릿 / 주소록 / 설정
| Method | Endpoint | 설명 |
|--------|----------|------|
| `GET/POST/PATCH/DELETE` | `/api/templates[/{id}]` | 템플릿 CRUD |
| `GET/POST/PATCH/DELETE` | `/api/contacts/participants[/{id}]` | 참여자 CRUD |
| `GET/POST/PATCH/DELETE` | `/api/contacts/locations[/{id}]` | 장소 CRUD |
| `GET/PATCH` | `/api/settings` | 설정 조회/수정 |

### 4-9. 복구
| Method | Endpoint | 설명 |
|--------|----------|------|
| `GET` | `/api/recovery` | 복구 가능 세션 목록 (status가 completed가 아닌 세션) |
| `POST` | `/api/recovery/{session_id}/restore` | 세션 복구 → 오디오 청크 병합 후 4단계로 진입 |

---

## 5. WebSocket 프로토콜 (오디오 스트리밍)

### 연결
```
ws://localhost:8000/api/sessions/{session_id}/audio
```

### 클라이언트 → 서버

**오디오 청크 전송 (5초 단위, 바이너리 프레임)**
- WebSocket **binary message**로 전송 (base64 인코딩 하지 않음, ~33% 효율 개선)
- 서버는 수신 즉시 `data/sessions/{id}/chunks/chunk_{NNN}.webm` 으로 저장
- 청크 인덱스는 서버가 순서대로 자동 부여

**Web Speech 결과 전송 (JSON 텍스트 프레임)**
```json
{
  "type": "speech_result",
  "text": "안녕하세요 오늘 회의 시작하겠습니다",
  "is_final": true,
  "timestamp_start": 14.2,
  "timestamp_end": 17.8
}
```
> `timestamp_start`/`timestamp_end`는 프론트엔드에서 `(Date.now() - recordingStartTime) / 1000` 으로 추정한 상대시각(초). Web Speech API 자체는 타임스탬프를 제공하지 않으므로 근사치. Whisper 처리 후 정확한 값으로 교체됨.

**녹음 재개 알림 (JSON 텍스트 프레임)**
```json
{
  "type": "recording_resumed",
  "gap_seconds": 300
}
```

### 서버 → 클라이언트

**청크 수신 확인**
```json
{
  "type": "chunk_ack",
  "chunk_index": 42
}
```

**블록 생성 확인**
```json
{
  "type": "block_created",
  "block_id": "blk_001",
  "timestamp_start": 14.2,
  "timestamp_end": 17.8
}
```

### 메시지 구분
- **바이너리 프레임** = 오디오 청크
- **텍스트 프레임** = JSON (speech_result, recording_resumed, chunk_ack, block_created)
- 타입 구분이 프레임 레벨에서 이루어지므로 추가 파싱 불필요

---

## 6. 오디오 캡처 및 저장

### MediaRecorder (프론트엔드)
```javascript
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

const mediaRecorder = new MediaRecorder(stream, {
  mimeType: 'audio/webm;codecs=opus',
  audioBitsPerSecond: 128000
});

// 5초 단위 청크 생성
mediaRecorder.start(5000);

mediaRecorder.ondataavailable = (event) => {
  if (event.data.size > 0) {
    // WebSocket binary frame으로 전송
    websocket.send(event.data);
  }
};
```

### 오디오 청크 저장 (서버)
```
data/sessions/{session_id}/chunks/
  chunk_000.webm    # 첫 5초 (WebM 헤더 포함)
  chunk_001.webm    # 5~10초
  chunk_002.webm    # 10~15초
  ...
```

> **WebM 파일 무결성**: WebM 포맷은 헤더 + 클러스터 구조이므로 단순 바이너리 append 시 깨진 파일이 됨. 따라서 **청크를 개별 파일로 저장**하고, Whisper 처리 직전에 **ffmpeg로 병합**.

### 오디오 병합 (Whisper 처리 전, 서버)
```python
# audio_service.py
import subprocess

def merge_audio_chunks(chunks_dir: str, output_path: str):
    chunk_files = sorted(Path(chunks_dir).glob("chunk_*.webm"))
    
    # ffmpeg concat demuxer 사용
    list_file = chunks_dir / "chunks.txt"
    with open(list_file, "w") as f:
        for chunk in chunk_files:
            f.write(f"file '{chunk.absolute()}'\n")
    
    subprocess.run([
        "ffmpeg", "-f", "concat", "-safe", "0",
        "-i", str(list_file),
        "-c", "copy",  # 재인코딩 없이 병합 (빠름)
        str(output_path)
    ], check=True)
```

### Web Speech API (프론트엔드)
```javascript
const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
recognition.lang = 'ko-KR';
recognition.interimResults = true;
recognition.continuous = true;

let blockStartTime = null;

recognition.onresult = (event) => {
  const elapsed = (Date.now() - recordingStartTime) / 1000;
  
  for (let i = event.resultIndex; i < event.results.length; i++) {
    if (event.results[i].isFinal) {
      const timestampEnd = elapsed;
      sendSpeechResult({
        text: event.results[i][0].transcript,
        is_final: true,
        timestamp_start: blockStartTime ?? timestampEnd - 3,
        timestamp_end: timestampEnd
      });
      blockStartTime = null;
    } else {
      if (blockStartTime === null) blockStartTime = elapsed;
      updateInterimDisplay(event.results[i][0].transcript);
    }
  }
};

recognition.onend = () => {
  if (isRecording) recognition.start();
};
```

### 무음 오디오 재생 (탭 활성 유지)
```javascript
function startSilentAudio() {
  const audioContext = new AudioContext();
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  
  gainNode.gain.value = 0.001;
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  oscillator.start();
  
  return () => {
    oscillator.stop();
    audioContext.close();
  };
}
```

---

## 7. Claude API 프롬프트

### 7-1. 중요도 태깅 프롬프트

**모델**: Claude Haiku (비용 절감, 단순 분류 작업)

```
시스템 프롬프트:
당신은 회의 전사 텍스트의 중요도를 분류하는 전문가입니다.
각 블록에 다음 4단계 중 하나를 부여하세요:

- high: 핵심 결정사항, 액션 아이템, 중요 논의 포인트
- medium: 관련 맥락, 배경 설명, 보조 논의
- low: 부가적 내용, 간접 관련 사항
- lowest: 사담, 인사말, 잡담, 주제 이탈

JSON 배열로 응답하세요. 다른 텍스트는 포함하지 마세요.

사용자 프롬프트:
회의 제목: {title}
참여자: {participants}

전사 블록:
{blocks를 block_id + text 형태로 나열}

응답 형식:
[
  {"block_id": "blk_001", "importance": "medium"},
  {"block_id": "blk_002", "importance": "high"},
  ...
]
```

### 7-2. 요약 생성 프롬프트

**모델**: Claude Sonnet (품질 중요)

```
시스템 프롬프트:
당신은 회의 전사 텍스트를 구조화된 회의록으로 정리하는 전문가입니다.
아래 템플릿 구조를 정확히 따르세요.

## 주요 논의 사항 & F/U 필요 요소 섹션 작성 규칙:
1. 전사 내용에서 주요 주제를 식별하여 번호를 매깁니다
2. 각 주제 안에서 "주요 논의"와 "F/U 필요 사항"을 분리합니다
3. F/U 항목에는 담당자(@이름)와 기한(~날짜)을 포함합니다 (전사에서 확인된 경우만)
4. 주제에 속하지 않는 부가 내용은 "기타 메모"에 포함합니다

응답 시 "## 회의 개요" 섹션은 생성하지 마세요 (메타데이터에서 자동 삽입됩니다).
마지막에 keywords 줄을 추가하세요.

사용자 프롬프트:
회의 제목: {title}
참여자: {participants}
회의 날짜: {date}

전사 텍스트 (중요도 상+중 블록만):
{filtered_blocks}

---
다음 형식으로 응답하세요:

## 주요 논의 사항 & F/U 필요 요소

### 1. [주제명]
**주요 논의**
- ...

**F/U 필요 사항**
- [@담당자] 할 일 (~기한)

### 2. [주제명]
...

---

## 기타 메모
- ...

Keywords: [키워드1, 키워드2, ...]
```

### 7-3. Whisper 언어 처리

- 세션 메타데이터의 `language` 필드를 Whisper에 전달하여 정확도 향상
- `language`가 설정된 경우: `whisper.transcribe(audio, language="ko")` — 감지 단계 스킵, 처리 속도 향상
- `language`가 null인 경우 (드문 케이스): Whisper 자동 감지 사용
- decisions.md의 "다국어 지원 (Whisper 자동 감지)" 반영

### 7-4. 회의 개요 자동 조립 (서버 로직)

Claude가 생성하지 않는 "## 회의 개요" 섹션은 서버(`summary_assembler.py`)에서 메타데이터를 기반으로 조립:

```python
# summary_assembler.py
def build_overview_section(metadata):
    lines = ["## 회의 개요"]
    lines.append(f"- 회의 시간: {metadata.start_time} ~ {metadata.end_time} ({format_duration(metadata.duration_seconds)})")
    lines.append(f"- 장소: {metadata.location or '미입력'}")
    
    participants_str = ", ".join(metadata.participants) if metadata.participants else "미입력"
    lines.append(f"- 참여자: {participants_str}")
    lines.append(f"- 언어: {metadata.language}")
    
    return "\n".join(lines)

def assemble_full_summary(metadata, claude_response, date_str, title):
    overview = build_overview_section(metadata)
    header = f"# {date_str} {title}"
    
    # Claude 응답에서 Keywords 줄 분리
    body, keywords = split_keywords(claude_response)
    
    full_markdown = f"{header}\n\n{overview}\n\n{body}"
    return full_markdown, keywords
```

### 7-5. 프롬프트 캐싱

- 태깅(Haiku)과 요약(Sonnet)은 **다른 모델**이므로 시스템 프롬프트 캐시를 공유하지 못함
- 캐싱이 유효한 케이스: **동일 모델 내 반복 호출** — 예) 5단계에서 "AI 재태깅" 버튼을 여러 번 누르는 경우
- 시스템 프롬프트에 `cache_control: {"type": "ephemeral"}` 설정하되, 실질 절감은 재태깅 시에만 발생

---

## 8. Whisper + Web Speech 병합 로직

### 병합 원칙
1. 사용자가 수정한 블록(`is_edited: true`)은 **무조건 보존** (잠금)
2. 수정하지 않은 블록은 Whisper 결과로 교체
3. 타임스탬프 기반 매칭: 블록의 `timestamp_start`~`timestamp_end` 구간으로 대응

> **주의**: Web Speech 타임스탬프는 추정치이므로, 매칭 시 ±2초 허용 범위를 두고 가장 겹치는 구간이 큰 Whisper 세그먼트를 선택.

### 병합 알고리즘
```python
TOLERANCE = 2.0  # 초

def merge_blocks(web_speech_blocks, whisper_segments):
    merged = []
    
    for ws_block in web_speech_blocks:
        if ws_block.is_edited:
            merged.append(ws_block)
        else:
            matching = find_best_overlap(
                whisper_segments, 
                ws_block.timestamp_start, 
                ws_block.timestamp_end,
                tolerance=TOLERANCE
            )
            if matching:
                new_block = create_block_from_whisper(matching)
                new_block.block_id = ws_block.block_id  # ID 유지
                merged.append(new_block)
            else:
                merged.append(ws_block)
    
    return merged
```

### 겹치는 구간 처리 (보수적 규칙)
- 사용자 수정 블록과 Whisper 세그먼트가 시간적으로 겹치면 **사용자 수정 우선**
- 겹치는 Whisper 세그먼트는 잘라서 나머지 부분만 사용하거나 폐기

---

## 9. Slack 메시지 생성 로직

### 메시지 조립
```python
import re

def build_slack_message(meeting, settings):
    header = f"[{format_date(meeting.metadata.date)} {meeting.metadata.title}]"
    greeting = settings.slack_greeting
    
    # summary_markdown에서 ### 주제 헤딩의 첫 번째 논의 불릿 추출
    summary_bullets = []
    topic_pattern = re.compile(r"### \d+\. (.+)")
    bullet_pattern = re.compile(r"^- (.+)", re.MULTILINE)
    
    sections = meeting.summary_markdown.split("### ")
    for section in sections[1:]:  # 첫 번째는 헤딩 앞 내용
        lines = section.strip().split("\n")
        topic_name = lines[0] if lines else ""
        # "주요 논의" 아래 첫 번째 불릿 찾기
        for line in lines:
            if line.startswith("- ") and "F/U" not in line:
                summary_bullets.append(f"• {line[2:]}")
                break
    
    # action_items에서 F/U 불릿 생성
    fu_bullets = []
    for item in meeting.action_items:
        line = f"• [@{item.assignee}] {item.task}" if item.assignee else f"• {item.task}"
        if item.deadline:
            line += f" ~{item.deadline}"
        fu_bullets.append(line)
    
    text = f"{header}\n{greeting}\n\n"
    text += "📋 *핵심 요약*\n" + "\n".join(summary_bullets) + "\n\n"
    if fu_bullets:
        text += "✅ *F/U 필요 사항*\n" + "\n".join(fu_bullets) + "\n\n"
    text += "📎 전체 회의록 첨부"
    
    return text
```

### .md 파일 생성 및 첨부

**.md export 파일 내용 구조**:
```markdown
# [날짜(요일)] [회의 제목]

## 회의 개요
(메타데이터에서 자동 조립)

## 주요 논의 사항 & F/U 필요 요소
(Claude 요약 결과)

## 기타 메모
(Claude 요약 결과)

---

## 전체 F/U 요약
(action_items 일괄 표시)

---

## 전사 원본
(전체 블록 텍스트, 타임스탬프 포함)
```
- `summary_markdown` + action_items 목록 + 전사 원본을 하나의 .md로 결합
- Slack 첨부: `files.upload` API로 메시지와 함께 전송
- 로컬 저장: `export_path` 설정 경로에 `{제목}_{날짜}.md` 파일명으로 저장

---

## 10. Undo/Redo 전략

### 전사 블록 편집 (3·5단계)
- **Tiptap(ProseMirror) 내장 history 플러그인** 사용
- 블록 텍스트 수정, 분할, 병합이 모두 ProseMirror 트랜잭션으로 처리됨 → 자동으로 Undo/Redo 스택에 쌓임
- **일괄 치환**: 서버에서 affected_block_ids를 반환받고, 프론트에서 해당 블록들의 변경을 **하나의 트랜잭션으로 묶어** 실행 → Ctrl+Z 한 번에 전체 원복 (decisions.md: "치환 전체가 하나의 Undo 단위")

### 요약 편집 (6단계)
- 동일하게 Tiptap history 플러그인 사용

### 중요도 태깅
- 태깅 변경은 Tiptap 외부 상태 (블록 메타데이터)이므로 별도 관리
- Zustand 스토어에 간단한 변경 이력 스택 유지
- MVP에서는 태깅 Undo 미지원도 가능 (편집 Undo만 우선)

---

## 11. 주요 의존성

### 백엔드 (requirements.txt)
```
fastapi>=0.104
uvicorn[standard]>=0.24
websockets>=12.0
python-multipart>=0.0.6
pydantic>=2.5
openai-whisper>=20231117  # 또는 faster-whisper>=0.10
anthropic>=0.39
slack-sdk>=3.27
python-dotenv>=1.0
```
> **ffmpeg**: 시스템 패키지로 설치 필요 (`brew install ffmpeg` / `apt install ffmpeg` / `choco install ffmpeg`)

### 프론트엔드 (package.json 주요 의존성)
```json
{
  "dependencies": {
    "react": "^18.3",
    "react-dom": "^18.3",
    "react-router-dom": "^6.20",
    "@tiptap/react": "^2.1",
    "@tiptap/starter-kit": "^2.1",
    "@tiptap/extension-placeholder": "^2.1",
    "@tiptap/extension-history": "^2.1",
    "zustand": "^4.4",
    "axios": "^1.6"
  },
  "devDependencies": {
    "vite": "^5.0",
    "@vitejs/plugin-react": "^4.2",
    "typescript": "^5.3",
    "tailwindcss": "^3.4",
    "autoprefixer": "^10.4",
    "postcss": "^8.4"
  }
}
```

---

## 12. 앱 실행 방법

### 사전 요구사항
- Python 3.11+
- Node.js 18+
- ffmpeg (시스템에 설치)

### 개발 환경 시작
```bash
# 백엔드
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# 프론트엔드 (별도 터미널)
cd frontend
npm install
npm run dev    # Vite dev server (port 5173)
```

### 환경 변수 (.env)
```
ANTHROPIC_API_KEY=sk-ant-...
SLACK_BOT_TOKEN=xoxb-...
WHISPER_MODEL=medium
DATA_DIR=./data
EXPORT_DIR=./data/exports
```

---

## 13. 세션 라이프사이클

```
[생성] POST /api/sessions
  ↓  동시 세션 체크 (completed가 아닌 미완료 세션 있으면 거부)
  ↓
[녹음] WS /api/sessions/{id}/audio (status: recording)
  ↓  오디오: 5초 청크 → 개별 파일로 서버 저장
  ↓  텍스트: Web Speech final → 블록 생성 (추정 타임스탬프)
  ↓
[중지] POST /api/sessions/{id}/stop (status: post_recording)
  ↓  사용자 검토·편집·태깅
  ↓  녹음 재개 가능 (POST /resume → recording, gap 기록)
  ↓
[처리] POST /api/sessions/{id}/process (status: processing)
  ↓  1. ffmpeg로 오디오 청크 병합
  ↓  2. Whisper 전사 (정확한 타임스탬프 포함)
  ↓  3. Web Speech 블록 + Whisper 결과 병합 (잠금 구간 보존)
  ↓  4. AI 중요도 태깅 (스킵 아닌 경우, 사용자 태그 불변)
  ↓
[편집] (status: editing)
  ↓  블록 편집, 태깅 수정, 일괄 치환
  ↓  서버 동기화: 편집 확정 시점에만 PATCH 호출
  ↓
[요약] POST /api/sessions/{id}/summarize (status: summarizing)
  ↓  Claude 요약 생성 (상+중 블록만 입력)
  ↓  서버에서 회의 개요 섹션 자동 조립 + Claude 결과 결합
  ↓  F/U 항목 자동 추출 → action_items 생성
  ↓
[완료] POST /api/sessions/{id}/complete (status: completed)
  ↓  Session → Meeting 변환
  ↓  JSON 히스토리 저장
  ↓  Slack 전송 / .md 저장 (선택)
```

### 업로드 경로 차이
```
[생성] POST /api/sessions (input_mode: "upload")
  ↓
[업로드] POST /api/sessions/{id}/upload
  ↓  3단계 스킵, 업로드 파일이 곧 오디오 소스
  ↓
[처리] POST /api/sessions/{id}/process
  ↓  ffmpeg 병합 불필요 (단일 파일), Whisper 처리 (잠금 없음, 전체 교체)
  ... 이후 동일
```

### 7단계 전송·저장 흐름 (complete와 send/export 분리)
```
[요약 완료] (status: summarizing → completed 직전)
  ↓
[7단계 UI] 사용자가 체크박스로 선택
  ↓
  ├─ ☑ Slack 전송 → POST /api/slack/send
  ├─ ☑ .md 저장  → POST /api/sessions/{id}/export-md
  └─ ✓ JSON 히스토리 (항상)
  ↓
[완료] POST /api/sessions/{id}/complete
  ↓  Session → Meeting 변환 + JSON 저장
  ↓  Slack 전송 결과·.md 경로를 Meeting에 기록
```
> `complete`는 변환+저장만 담당. Slack 전송과 .md 생성은 별도 API로 분리되어 체크박스 선택에 따라 호출 여부 결정. 7단계 UI에서 "실행" 버튼 클릭 시 선택된 항목의 API를 순차 호출 후 마지막에 complete 호출.

---

## 14. 향후 확장 (Phase 2/3) 기술 영향도

decisions.md에 정의된 Phase 2/3 기능이 현재 아키텍처에 미치는 영향을 미리 정리.

### Phase 2

| 기능 | 필요한 추가 작업 | 현재 설계 영향 |
|------|-----------------|---------------|
| **Slack Canvas 생성** | `slack_service.py`에 Canvas API 호출 추가, 7단계 UI에 "Canvas 생성" 체크박스 | Slack send API에 `mode: "message" \| "canvas"` 파라미터 추가 |
| **주간 키워드 트렌드 리포트** | `services/trend_service.py` 신규, 주간 스케줄러(cron), Meeting JSON의 keywords 필드 집계 | 현재 Meeting 모델의 `keywords` 필드가 이미 준비됨. 새 API `GET /api/reports/weekly-trend` + `POST /api/reports/weekly-trend/send` 추가 |

### Phase 3

| 기능 | 필요한 추가 작업 | 현재 설계 영향 |
|------|-----------------|---------------|
| **화자 분리 (pyannote.audio)** | `services/diarization_service.py` 신규, 4단계 processing에 화자 분리 단계 추가, Block 모델의 `speaker` 필드 활용 | Block 모델에 `speaker` 필드 이미 존재 (현재 null). 4단계 stages에 `diarization` 단계 추가, 5단계 UI 화자 슬롯 활성화 |
| **Google Calendar 연동** | `services/calendar_service.py` 신규, Google OAuth 설정, 7단계 UI에 "캘린더 기록" 체크박스 | Settings 모델에 `google_calendar` 설정 추가, 새 API `POST /api/calendar/create-event` |

### 확장 시 현재 모델 변경 불필요 확인
- Block.speaker: ✅ 이미 null로 준비
- Meeting.keywords: ✅ 이미 배열로 준비
- Settings: Google Calendar, Canvas 설정 필드 추가 필요 (하위 호환)
