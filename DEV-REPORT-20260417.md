# 개발 업무 보고서 — 2026-04-17

> 작성 주체: 개발 세션
> 대상 기간: 2026-04-17 (첫 개발 세션)

---

## 1. 오늘 수행한 작업 요약

이 세션은 Sprint 2까지 구현된 상태를 인수받아, **설계 문서 정합성 확보 + 디자인 시스템 v2 전환 + 버그 수정 + 코드 품질 개선**을 수행했습니다. Sprint 3(Whisper+편집) 신규 구현에는 진입하지 않았습니다.

### 작업 카테고리별 정리

| 카테고리 | 건수 | 요약 |
|---------|------|------|
| 디자인 시스템 v2 전환 | 5건 | index.css 토큰 교체, index.html 폰트, Home/MeetingSetup/Recording 재스타일링 |
| Web Speech 버그 수정 | 3건 | 문장 분리, interim 합산 표시, 중복 블록 생성 해결 |
| 설계 불일치 수정 (1차 검수) | 11건 | 회의 정보 요약 패널, 중요도 팝오버, 더블클릭 편집, 마이크 권한 체크 등 |
| 코드 품질/안전성 (2차 검수) | 17건 | AudioContext 누수, 마지막 청크 유실, OOM 방지, 동시 쓰기 Lock, path traversal 등 |
| 3단계 녹음 UX 신규 구현 | 6건 | 화자 슬롯, 중요도 바, 빈 구간 표시, 마이크 레벨 미터, 키보드 단축키, 인라인 편집 |

---

## 2. 변경된 파일 목록

### 프론트엔드

| 파일 | 변경 내용 |
|------|----------|
| `frontend/src/index.css` | primary `#3182F6`, primary-hover `#1B64DA`, bg-hover `#F0F2F5` 신규, template `#EFF6FF` |
| `frontend/index.html` | Inter weight에 `700` 추가 |
| `frontend/src/pages/Home.tsx` | v2 재스타일링 (Display 40px/700, max-w-md, 카드 bg-bg-subtle/rounded-xl), 복구 배너 참여자+이어가기 |
| `frontend/src/pages/MeetingSetup.tsx` | v2 재스타일링 (입력 bg-bg-subtle+focus ring, 세그먼트 배경색 기반), 마이크 권한 사전 체크, 장소 inline creation, 파일 업로드 서버 전송 |
| `frontend/src/pages/Recording.tsx` | **대폭 개편** — 회의 정보 요약 패널(접기/편집/blur 저장), 화자 슬롯, 중요도 바+팝오버, 마이크 레벨 미터, 빈 구간 표시, 키보드 단축키(1/2/3/4/0/↑/↓/Enter), 더블클릭 편집, AudioContext 리소스 관리, 재개 시 mic level, async stop |
| `frontend/src/hooks/useWebSpeech.ts` | 침묵 타이머 1.5초, 전체 pending results 합산, abort 기반 중복 방지 |
| `frontend/src/hooks/useAudioStream.ts` | audioBitsPerSecond 128000, stopRecording Promise화(마지막 청크 대기), getStream 노출 |
| `frontend/src/components/common/Toast.tsx` | onHide ref 패턴으로 무한 리셋 방지 |
| `frontend/src/components/common/TagInput.tsx` | v2 스타일 (bg-bg-subtle + focus:ring-2) |
| `frontend/src/types/index.ts` | SlackSentInfo 인터페이스 추가, Meeting.merged_audio_path 추가 |
| `frontend/src/api/sessions.ts` | uploadAudioFile 함수 추가 |

### 백엔드

| 파일 | 변경 내용 |
|------|----------|
| `backend/routers/audio.py` | asyncio.to_thread 비동기 I/O, 세션별 Lock, 업로드 청크 단위 읽기(OOM 방지), 업로드 파일을 chunks/ 디렉토리에 저장, 응답에서 서버 경로 제거 |
| `backend/routers/sessions.py` | uuid4 기반 ID, path traversal 검증, complete_session에서 duration_seconds 계산 |
| `backend/routers/contacts.py` | PATCH 엔드포인트 추가, uuid4 ID, DELETE 404 처리 |
| `backend/routers/templates.py` | uuid4 ID, DELETE 404 처리 |
| `backend/routers/settings.py` | AppSettings 모델 활용(중첩 구조), 응답 시 API 키/토큰 마스킹 |

### 기타

| 파일 | 변경 내용 |
|------|----------|
| `backups/frontend-v1-20260417/` | 디자인 시스템 v1 상태 백업 (index.css, index.html, Home/MeetingSetup/Recording.tsx, README.md) |
| `HANDOVER.md` | "개발→기획 전달 사항"에 v2 적용 결과 기록 |

---

## 3. 해결한 주요 버그

### Web Speech API 중복 블록 생성
- **원인**: `forceFinalize()`와 Web Speech API `isFinal` 이벤트가 독립적으로 블록을 생성. 특히 여러 pending result를 합쳐서 강제 확정한 뒤, API가 개별 result를 isFinal로 발생시키면 텍스트 비교로 잡을 수 없었음.
- **해결**: forceFinalize 후 `recognition.abort()`로 pending result 폐기, stop 시에도 `.abort()` 사용. 단일 블록 생성 경로 보장.

### Web Speech API 단어 단위만 표시 (문장이 안 보이는 문제)
- **원인**: `continuous` 모드에서 한국어는 단어마다 새 result를 생성. 코드가 마지막 result 하나의 transcript만 표시.
- **해결**: `event.results` 전체를 순회하여 모든 non-final result의 transcript를 합산 표시.

### 마지막 오디오 청크 유실
- **원인**: `MediaRecorder.stop()`이 비동기적으로 마지막 `dataavailable`를 발생시키는데, 즉시 WebSocket을 닫아버림.
- **해결**: `stopRecording`을 Promise로 변경, `onstop` 이벤트까지 대기 후 disconnect.

---

## 4. 현재 코드 상태

### 구현 완료 (3개 페이지 + 백엔드 API)

| 페이지 | decisions.md 기준 완성도 | 비고 |
|--------|------------------------|------|
| 1단계 홈 (Home.tsx) | ~95% | 복구 "이어가기"는 라우팅만 연결, 실제 복구 로직은 Sprint 5 |
| 2단계 회의 정보 (MeetingSetup.tsx) | ~95% | 파일 업로드 서버 전송 구현 완료 |
| 3단계 녹음 (Recording.tsx) | ~90% | 마이크 끊김→자동 post_recording 전환 미구현 (Sprint 5 백그라운드 탭 대응과 함께) |

### 미구현 (placeholder 상태)

| 페이지 | 해당 Sprint |
|--------|------------|
| 4단계 Processing.tsx | Sprint 3 |
| 5단계 Editing.tsx | Sprint 3 |
| 6단계 Summary.tsx | Sprint 4 |
| 7단계 SendSave.tsx | Sprint 4 |
| History.tsx / HistoryDetail.tsx | Sprint 5 |
| Settings.tsx | Sprint 5 |

### 백엔드 services/ (아직 비어있음)

Sprint 3에서 구현 예정:
- `whisper_service.py` — Whisper 모델 로드/실행
- `audio_service.py` — ffmpeg 청크 병합
- `merger_service.py` — Web Speech + Whisper 블록 병합
- `claude_service.py` — AI 중요도 태깅 (Haiku)

---

## 5. 다음 세션에서 해야 할 일

### 우선순위 1: Sprint 3 착수

HANDOVER.md "6. 개발 착수 시 권장 순서" 기준:

1. **`backend/services/audio_service.py`** — ffmpeg 청크 병합 (technical-design.md 6절)
2. **`backend/services/whisper_service.py`** — Whisper 모델 로드/실행 (technical-design.md 7-3절)
3. **`backend/services/merger_service.py`** — Web Speech + Whisper 블록 병합 (technical-design.md 8절)
4. **`backend/routers/processing.py`** — POST /api/sessions/{id}/process + GET status (technical-design.md 4-4절)
5. **`frontend/src/pages/Processing.tsx`** — 4단계 진행률 UI (decisions.md 4단계)
6. **`backend/services/claude_service.py`** (태깅만) — AI 중요도 1차 태깅 (technical-design.md 7-1절)
7. **`frontend/src/pages/Editing.tsx`** — 5단계 블록 편집 + 툴바 + 일괄 치환 (decisions.md 5단계)

### 우선순위 2: HANDOVER.md 업데이트

Sprint 3 구현 완료 후:
- "8. 현재 구현 완료 항목"에 Sprint 3 내역 추가
- "기획→개발 전달 사항" 확인 (기획 세션에서 추가 사항이 있을 수 있음)
- "개발→기획 전달 사항"에 구현 중 발견한 설계 이슈 기록

---

## 6. 알아둘 사항

### VB-Cable 테스트 환경
- VB-Cable 설치 완료 (CABLE Input/Output 정상 작동)
- 테스트 방법: Windows 볼륨 믹서에서 Chrome 출력을 CABLE Input으로 설정 → 유튜브 회의 영상 재생 → 앱에서 CABLE Output을 마이크로 선택

### 디자인 시스템 v2
- v1 백업: `backups/frontend-v1-20260417/` + `backups/design-system-v1-20260417/`
- 중요도 태깅 색상(빨강/앰버/회색/투명)과 Status 색상(recording/success/warning)은 v1에서 유지

### dev server 실행
```bash
# 백엔드
cd backend && python -m uvicorn main:app --reload --port 8000

# 프론트엔드
cd frontend && npm run dev
```

### 검수 세션 운영
- 별도 검수 세션이 코드를 문서 기준으로 전수 검사하는 구조
- 검수 결과는 개발 세션에 항목 리스트로 전달됨
- 이번 세션에서 1차 검수(11건) + 2차 검수(17건) 모두 수정 완료
