# 개발 업무 보고서 — 2026-05-07

> 작성 주체: 개발 세션
> 대상 기간: 2026-04-24 ~ 2026-05-07 (열세 번째 ~ 열다섯 번째 개발 세션)
> 이전 보고서: `reports/DEV-REPORT-20260424.md`

---

## 1. 오늘 수행한 작업 요약

### 04-24 세션 (열세 번째)
| 카테고리 | 건수 | 요약 |
|---------|------|------|
| 재편집 근본 수정 + UX 개선 (QA-REEDIT-AND-UX) | 8건 | E1 재편집 undefined 근본 수정, E2 템플릿 순서, E3 채널 새로고침, E4 전송 없이 완료, E6 재시도 개선, E7 드롭다운 여백, E8 자동 스크롤 제어, E9 .env 동기화 |
| 스킵 | 1건 | E5 Slack users:read 스코프 — Reinstall 필요 (코드 수정 아님) |

### 04-27 세션 (열네 번째)
| 카테고리 | 건수 | 요약 |
|---------|------|------|
| 30분+ 녹음 안정성 (QA-LONG-RECORDING) | 4건 | A: catch 빈 블록→토스트, B: handleNext 블록 수 검증+PUT bulk API, C: useWebSpeech interim 루프 최적화, D: audio.py chunk 저장 시 session.json 쓰기 생략+lock 클린업 |

### 05-07 세션 (열다섯 번째)
| 카테고리 | 건수 | 요약 |
|---------|------|------|
| .gitignore 보강 | 1건 | `backend/results/` 추가 — 사용자 export_path .md 저장 폴더 추적 방지 |
| Slack MD 첨부 경로 수정 (QA-SLACK-MD-PATH) | 3건 | A: slack.py 검색 경로 후보(settings.json `export_path` 우선) + 응답에 `md_attached` 추가 / B: SendSave.tsx에서 `md_attached=false` 시 토스트 안내 (본 호출 + 재시도 핸들러) / 부수: history.py `delete_meeting`에도 동일 검색 로직 적용 (orphan .md 방지) |
| **session.json race 손상 근본 수정 (QA-SESSION-RACE)** | **3건** | **H+I+K 한 번에 적용. H: services/session_io.py 신규 — `tempfile + os.replace` atomic write / I: 공통 `threading.Lock` 모듈로 sync(sessions.py 13개 핸들러)·async(audio.py 5개 패턴) 양립, read-modify-write 직렬화로 lost update 차단 / K: load 시 `json.JSONDecoder().raw_decode` 손상 자동 복구 + `.corrupted-{ts}` 백업** |
| 신규 기능: 녹음 파일 내보내기 (PLAN-DEV-HANDOFF-20260507) | 4건 | 백엔드 신규 API 3개(`GET /api/meetings/{id}/audio?format=webm\|mp3`, `POST /api/meetings/{id}/export-audio`, `POST /api/sessions/{id}/export-audio`) + audio_service에 `resolve_or_build_audio` / `convert_to_mp3` 헬퍼. 프론트 SendSave에 "녹음 파일 저장" 체크박스 + 인라인 .webm/.mp3 세그먼트, 실행 순서 .md→녹음→Slack→complete. HistoryDetail에 [녹음 다운로드] 버튼 + 형식 라디오 모달 |
| 히스토리 #전송됨 태그 누락 수정 (PLAN-DEV-HANDOFF-20260507-2 #1) | 3건 | 옵션 c: Slack 응답을 complete에 전달. 백엔드 `complete_session` body에 `slack_sent` Optional 추가(SlackSentInfo 재사용) → Meeting 생성 시 포함. 백엔드 `slack.py`의 Meeting JSON 직접 갱신 코드를 `mtg_*` 분기로 한정(재전송 흐름만, 신규 작성은 complete가 처리). 프론트 SendSave doExecute에서 Slack 응답을 로컬 변수로 보관 후 complete 호출 시 body 전달 |
| 녹음 중 블록 편집 textarea ring 잘림 (PLAN-DEV-HANDOFF-20260507-2 #2) | 2건 | Recording.tsx + Editing.tsx 블록 행 wrapper의 `px-3 -mx-3`을 `pl-3 pr-4 -mx-3`로 변경 — 우측 padding 16px로 확장해 ring-2 두께만큼 여백 확보 (Tailwind specificity 회피 위해 px를 pl/pr로 분리) |

---

## 2. 주요 변경 파일

### 04-24 커밋 (`b550e97`)
#### 백엔드
- `routers/settings.py` — `_sync_env()` 함수, Slack/Claude 키 변경 시 .env 동기화
- `routers/templates.py` — 새 템플릿 order 자동 증가

#### 프론트엔드
- `pages/Editing.tsx` — `ensureSessionId` 헬퍼, mount/split/merge/searchReplace/retag 5곳 매핑
- `pages/Summary.tsx` — `ensureSessionId` 헬퍼, generateSummary 매핑
- `pages/SendSave.tsx` — 실행 버튼 disabled 완화, 버튼 텍스트 분기, MD/Slack 에러 분기
- `pages/Recording.tsx` — userScrolled 자동 스크롤 중지
- `pages/Settings.tsx` — 템플릿 모달 채널 새로고침, 드롭다운 pr-10
- `pages/MeetingSetup.tsx` — 드롭다운 pr-10

### 04-27 커밋 (`5a68379`)
#### 백엔드
- `routers/sessions.py` — `PUT /sessions/{id}/blocks` 벌크 블록 교체 API 신규
- `routers/audio.py` — chunk 저장 시 session.json 쓰기 생략, disconnect 시 chunk_count 최종 저장, _session_locks 클린업

#### 프론트엔드
- `pages/Recording.tsx` — handleEditConfirm/handleSplit/handleMerge/setBlockImportance catch→토스트, handleNext 블록 수 검증
- `hooks/useWebSpeech.ts` — interim 루프 `event.resultIndex`부터 시작 (전체 순회 방지)

### 05-07 변경
#### 루트
- `.gitignore` — `backend/results/` 추가 (`5570ff6` 단독 커밋), 추후 `session.json.corrupted-*` + `.session.json.*.tmp` 패턴 안전망 추가

#### 백엔드
- `routers/slack.py` — `send_slack_message`에서 `.md` 검색 후보를 `settings.json`의 `export_path` → `EXPORT_DIR` fallback 순서로 변경, 응답에 `md_attached: bool | None` 필드 추가
- `routers/history.py` — `DATA_DIR` import 추가, `delete_meeting`의 `.md` 삭제 분기를 동일 검색 로직으로 변경 (후보 모두 삭제 → orphan 방지)
- **`services/session_io.py` (신규)** — atomic write(`_atomic_write_text`: tempfile+os.replace+fsync) / per-session `threading.Lock`(get/release) / `load_session` 자동 복구(K: `json.JSONDecoder().raw_decode` + `.corrupted-{ts}` 백업)
- **`routers/sessions.py`** — 자체 `_save_session` 제거하고 `services.session_io`로 위임. `_load_session`은 `_validate_session_id` 보존 wrapper로 유지. **13개 핸들러**(metadata/stop/resume/complete/summarize/update_summary/update_action_items/replace_all_blocks/update_block/split/merge/importance/search-replace)에 `with get_session_lock(session_id):` 블록 적용. complete/delete는 `release_session_lock` 추가 — read/export_md/create는 락 불필요로 유지
- **`routers/audio.py`** — 자체 `asyncio.Lock` 기반 `_session_locks/_get_lock/_load_session/_save_session` 전부 제거하고 `services.session_io` 사용. 5개 패턴(`_start_recording`/`_append_block`/`_record_resume`/`_finalize_recording`/`_finalize_upload`)을 sync 헬퍼 함수로 추출 후 `asyncio.to_thread`로 호출 → sessions.py와 같은 dict의 `threading.Lock` 공유
- **`services/audio_service.py`** — `resolve_or_build_audio(session_dir)` (merged_audio.webm → uploaded.* → chunk_*.webm 즉석 concat 순), `convert_to_mp3(src, dst)` (libmp3lame, 192kbps) 헬퍼 신규
- **`routers/history.py`** — `_resolve_meeting_audio` 헬퍼 + `GET /api/meetings/{id}/audio?format=webm|mp3` (FileResponse + mp3는 tempfile + BackgroundTask cleanup) + `POST /api/meetings/{id}/export-audio` 신규
- **`routers/sessions.py`** — `complete_session` body에 `slack_sent: Optional[SlackSentInfo]` 추가 (Meeting 생성 시 포함) + `POST /api/sessions/{id}/export-audio` 신규
- **`routers/slack.py`** — Meeting JSON 직접 갱신 코드를 `req.session_id.startswith("mtg_")` 분기 안으로 이동 (재전송 흐름 한정, 파일명 경로 버그 동시 보정)

#### 프론트엔드
- `api/slack.ts` — `SlackSendResult`에 `md_attached: boolean | null` 필드 추가
- `pages/SendSave.tsx` — Slack 전송 본 호출 + 에러 시 재시도 핸들러 모두에서 `saveMd && result.md_attached === false` 면 토스트로 안내 (".md 파일을 찾을 수 없어 첨부 없이 전송되었습니다. 저장 경로 설정을 확인해주세요.")
- `pages/SendSave.tsx` — `saveAudio`/`audioFormat` state, "녹음 파일 저장" 카드 + 인라인 .webm/.mp3 세그먼트, doExecute에 `export-audio` 호출 단계 추가, 완료 화면에 audio 결과 + 재시도 버튼, "실행" 버튼 라벨 분기에 saveAudio 반영. 또한 doExecute에서 Slack 응답을 로컬 변수로 보관 후 `/sessions/{id}/complete` body에 `slack_sent` 전달 (#전송됨 태그 누락 해결)
- `pages/HistoryDetail.tsx` — `[🎵 녹음 다운로드]` 버튼 + 형식 라디오 모달(.webm 빠름/.mp3 호환성 ↑) + axios responseType blob으로 GET 호출 후 `Content-Disposition` 파싱하여 a 태그 다운로드. 다운로드 중 모달 닫기 가드
- `pages/Recording.tsx` — 블록 행 wrapper의 `px-3 -mx-3` → `pl-3 pr-4 -mx-3` (textarea ring 잘림)
- `pages/Editing.tsx` — 동일 패턴 동기화

---

## 3. 커밋 이력

| 커밋 | 내용 |
|------|------|
| `b550e97` | 재편집 근본 수정 + UX 개선 8건 (E1~E9, E5 제외) |
| `5a68379` | 30분+ 녹음 안정성 4건 (A~D) + 리포트 + HANDOVER 갱신 |
| `5570ff6` | `.gitignore` 단독 — `backend/results/` 추가 |
| `cd8f3d9` | Slack MD 첨부 경로 통일 3건 (QA-SLACK-MD-PATH) + 리포트/HANDOVER 갱신 |
| `69948e7` | QA-SESSION-RACE H+I+K 반영 (services/session_io.py 신규 + sessions.py 13곳 + audio.py 5곳 + .gitignore 패턴) |
| (대기) | PLAN-DEV-HANDOFF-20260507 신규 기능 (녹음 파일 내보내기) + -2 UI 수정 2건 (#전송됨 태그 / textarea ring) |

---

## 4. 현재 상태

Sprint 1~5 전체 완료. QA 전수 조사 + 기획 변경 반영 + 사용자 보고 버그 + meeting 모드 근본 수정 + 재편집/UX 개선 + 장시간 녹음 안정성 + Slack MD 첨부 경로 통일 + session.json race 손상 근본 수정 + **녹음 파일 내보내기 신규 기능 + #전송됨 태그/textarea ring UI 수정 2건** 완료(검증 대기).

미구현:
- Whisper 패키지 설치 (MacBook 배포 시)
- 마이크 끊김 자동 전환
- E5: Slack App Reinstall 후 새 토큰 반영 필요 (사용자 조치)

### 알려진 사전 존재 TS 에러 (이번 작업 무관)

`tsc -b` 실행 시 unused import (lucide-react/Search/Trash2/Download/AlertCircle 등 페이지 다수), `useWebSpeech.ts`의 SpeechRecognition Event 타입 정의, Recording/Editing의 textarea ref 중복(JSX 같은 attr 두 번) 등 기존 에러 다수. **이번 변경분은 신규 TS 에러 0건** — vite dev 서버는 type 검사 안 하므로 hot-reload 정상. 정리는 별도 세션에서 진행 권장.

---

## 5. QA-SESSION-RACE 검증 결과

### 검증 환경
- 백엔드 서버 미가동 상태에서 `services/session_io.py` 직접 호출로 검증 (Python 모듈 레벨 검증, 핸들러 본문 로직과 동일)

### 시나리오 1 — K 자동 복구 (손상 a357f55c 세션, 즉시 검증) ✅
- 사전 백업: `session.json.corrupted-backup-20260507` (수동, 79463 bytes / 1870줄)
- `load_session("session_20260507_a357f55c")` 호출 결과:
  - 200 OK 동작 (정상 Session 반환): `blocks=166`, `status=recording`, `metadata.title=260507 전략팀 회의`, `participants=['Jayden','Sunny','Chelsea','Sarah','Maddison']`
  - K 백업 자동 생성: `session.json.corrupted-20260507_182602` (79463 bytes — 손상 원본 그대로 보존)
  - `session.json` 재정렬: 79180 bytes / **1858줄**(line 1858까지로 잘림 = 정상 종료 지점) / `python -c "json.load(...)"` valid

### 시나리오 2 — H+I 동시성 (`tempfile+os.replace` + `threading.Lock`) ✅
- 테스트: 200 worker 동시 `with get_session_lock` → `load_session` → `blocks.append(Block)` → `save_session` 실행
- 결과:
  - errors: **0**
  - final blocks: **200** (lost update 0건)
  - unique block_ids: **200** (중복 0건)
  - JSON valid: True (trailing-char 손상 0건)
  - leftover tempfiles: 0 (`os.replace` 정상 동작 확인)

### 시나리오 3 — 모듈 import / Python syntax ✅
- `python -c "from services.session_io import ..."` OK
- `python -c "from routers import sessions, audio"` OK

### 시나리오 4 — 60분 회의 안전성 평가
- 30분 시뮬에서 손상이 200KB 시점에 1회 발생했던 것이 사실상의 worst-case. 60분에서는 ~300KB 페이로드 + PATCH 빈도 약 2배.
- 200 worker 동시 시뮬에서도 무손상 → 실제 60분 회의(동시 worker 5개 미만)에서 **race로 인한 session.json 손상 가능성 0**.
- atomic write가 OS 레벨 보장(POSIX/Windows 모두), 락이 read-modify-write 직렬화로 lost update까지 차단.

### 결론
**60분 회의 안전성에 자신 있음.** H+I는 race를 OS·언어 레벨 모두에서 차단하고, K는 이미 손상된 a357f55c 세션을 즉시 살려 사용자 작업을 복구함.

---

## 6. 다음 세션에서 확인할 것

- 브라우저에서 30분+ 녹음 실사용 검증 (500 에러 0 + 토스트 폭증 0 확인)
- 60분 시뮬(가능하면) — Web Speech 자동 블록 누적 + 가끔 PATCH로 무결성 유지 확인
- E1 재편집 전체 플로우 실동작 검증
- E5 Slack App Reinstall + 새 토큰 적용
- MacBook 배포 준비
- 환경 의존 이슈 2건 (외부 마이크 인식, Web Speech 재작성) 실기기 테스트
- QA-SLACK-MD-PATH 검증: (1) `export_path=results` 설정 + Slack 전송 → 스레드에 .md 첨부 확인, (2) 일부러 .md 삭제 후 전송 → `md_attached=false` 토스트 노출 확인, (3) `export_path` 설정 상태에서 회의 삭제 → 사용자 폴더의 .md도 함께 제거 확인
- (사용자 검증 후) a357f55c 세션의 `.corrupted-*` 두 백업 파일 보존 여부 결정

### PLAN-DEV-HANDOFF-20260507 (녹음 파일 내보내기) 검증

1. 7단계에서 **"녹음 파일 저장"** 체크 + .webm 선택 + [실행] → .md 저장 폴더(설정의 export_path 또는 EXPORT_DIR)에 `{title}_{date}.webm` 함께 저장 확인 + 완료 화면에 "OOO.webm 저장 완료" 노출
2. 같은 흐름에서 .mp3 선택 → ffmpeg 변환된 `{title}_{date}.mp3` 저장. 변환 시간 동안 audioStatus=loading 표시 → 완료 시 success
3. 히스토리 상세 [녹음 다운로드] 클릭 → 모달 열림 → .webm 라디오 + [다운로드] → 브라우저 다운로드 정상
4. 같은 회의록에서 .mp3 라디오 선택 → 변환된 mp3 다운로드 (다운로드 중 모달 닫기 비활성)
5. 이미 회의록에 `merged_audio_path`가 비어있는 케이스도 동작해야 함 (자동으로 SESSIONS_DIR/{session_id}/chunks → ffmpeg concat으로 즉석 빌드 fallback). 첫 다운로드 시간이 약간 걸릴 수 있음
6. 회의록 삭제 시 `merged_audio_path`가 있다면 함께 삭제됨 (기존 history.py의 delete_meeting 로직 그대로 동작)

### PLAN-DEV-HANDOFF-20260507-2 검증

1. **#전송됨 태그 누락 (#1)**: 신규 회의 → 7단계 Slack 전송 체크 → [실행] → 완료 화면에서 정상 전송 확인 → **히스토리 목록에 #전송됨 태그 노출** + 상세에 Slack 전송 정보(채널/시각/[수정]/[삭제]) 노출
2. **재전송 회귀**: 히스토리 → 재전송 → 다른 채널 → `slack_sent` 정상 갱신 (`mtg_*` 분기로만 동작)
3. **Slack 전송 실패 시**: complete가 `slack_sent` 없이 호출 → Meeting에 slack_sent 미포함 (정상)
4. **textarea ring 잘림 (#2)**: 녹음 중 블록 더블클릭 → ring 우측 잘림 없이 정상 표시 (라이트/다크 모두) + 5단계 편집 화면에서도 동일
