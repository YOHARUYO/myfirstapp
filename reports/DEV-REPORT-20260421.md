# 개발 업무 보고서 — 2026-04-21

> 작성 주체: 개발 세션
> 대상 기간: 2026-04-21 (네 번째 + 다섯 번째 개발 세션)
> 이전 보고서: `reports/DEV-REPORT-20260420.md`

---

## 1. 오늘 수행한 작업 요약

### 세션 4 (오전)

| 카테고리 | 건수 | 요약 |
|---------|------|------|
| QA 수정 (Sprint 4) | 11건 | `QA-FIX/QA-SPRINT4-FIX-20260421.md` 전량 반영 (🔴 5건 + 🟡 6건) |
| Git/배포 | 3건 | GitHub push, ngrok 설치·업데이트·터널 설정, Vite allowedHosts |
| 인프라 | 1건 | ngrok v3.3.1 → v3.38.0 업데이트 |

### 세션 5 (오후)

| 카테고리 | 건수 | 요약 |
|---------|------|------|
| 기획 변경 반영 | 3건 | 스레드 메시지 카드 UI, Slack 메시지 삭제 API+UI, SlackSentInfo 모델 확장 |
| QA 수정 (Sprint 4 추가) | 5건 | `QA-FIX/QA-SPRINT4-FIX2-20260421.md` — 요약 저장 전용 API 신설 등 |
| 기획 누락 보완 | 3건 | 카드 날짜 요일 추가, Slack 실패 "건너뛰기" 옵션, 재시도 message_ts 갱신 |
| Sprint 5 구현 | 3건 | 히스토리 (목록+검색+상세), 설정 (템플릿·주소록·연동·테마), 커밋+push |
| QA 수정 (Sprint 5) | 13건 | `QA-FIX/QA-SPRINT5-FIX-20260421.md` Part A 10건 + Part B 3건 |

---

## 2. 변경된 파일 목록

### 백엔드

| 파일 | 변경 유형 | 상세 |
|------|----------|------|
| `routers/sessions.py` | 수정 | `PATCH /summary`, `PATCH /action-items` API 신설, UpdateMetadataRequest 확장, export-md 경로 노출 제거, split 버그 수정 |
| `routers/slack.py` | 수정 | 메시지 목록 가공(user_name/is_bot/text_preview/reply_count), `DELETE /message` 삭제 API, mrkdwn strip, 인사 문구 로드, 요약 불릿 추출 정확화 |
| `models/meeting.py` | 수정 | SlackSentInfo에 `deleted`, `deleted_at` 필드 추가 |
| `models/session.py` | 수정 | summary_markdown, action_items, keywords 필드 추가 (이전 세션) |

### 프론트엔드 — 신규

| 파일 | 상세 |
|------|------|
| `hooks/useSilentAudio.ts` | 무음 오디오 재생 (탭 활성 유지) |
| `hooks/useVisibility.ts` | visibilitychange 감지 (탭 복귀 시 콜백) |

### 프론트엔드 — 수정

| 파일 | 상세 |
|------|------|
| `pages/Home.tsx` | 복구 배너 카드형 교체 + status별 라우팅(STATUS_ROUTES) + getSession→setSession→navigate |
| `pages/History.tsx` | 전체 구현 — 카드 리스트, 전문 검색, 기간 필터(date input) |
| `pages/HistoryDetail.tsx` | 전체 구현 — 메타데이터, 요약+F/U, 전사 원본(절대/상대 토글), Slack 삭제 버튼, 재편집(Meeting→Session 변환) |
| `pages/Settings.tsx` | 전체 구현 — 테마 3-way 세그먼트, 템플릿 CRUD+Slack 채널, 주소록, API키/Whisper 변경 UI, 인사 문구, 삭제 확인 모달, 토큰 마스킹, AppSettings 타입 |
| `pages/Recording.tsx` | silentAudio 연동, useVisibility 탭 복귀 재연결+조건부 토스트, popstate 뒤로가기 차단 |
| `pages/Processing.tsx` | popstate 뒤로가기 차단 추가 |
| `pages/Summary.tsx` | 저장 API를 전용 엔드포인트로 변경(PATCH /summary + /action-items), XSS 제거, 재요약 모달, F/U 파싱 |
| `pages/SendSave.tsx` | 미리보기 불릿 추출 정확화, 실행 순서 변경, Slack 건너뛰기 옵션, 재시도 message_ts 갱신, 메시지 삭제 모달, 스레드 카드 UI(날짜 요일) |
| `pages/Editing.tsx` | editedAfterSummary 플래그 설정 |
| `stores/sessionStore.ts` | editMode + editingMeetingId 추가 |
| `stores/wizardStore.ts` | editedAfterSummary 플래그 |
| `api/sessions.ts` | updateSummaryMarkdown, updateActionItems 전용 함수 |
| `api/slack.ts` | SlackMessage 타입 가공, deleteSlackMessage 함수 |
| `types/index.ts` | SlackSentInfo deleted/deleted_at, Session summary 필드 |
| `vite.config.ts` | allowedHosts: true |

---

## 3. 주요 기술 결정

### 요약 저장 API 분리
- 기존: `PATCH /metadata`에 summary_markdown을 같이 전송 (UpdateMetadataRequest 확장)
- 최종: `PATCH /summary` + `PATCH /action-items` 전용 엔드포인트 신설 (QA 피드백 반영)

### 재편집 로직
- Meeting → Session 변환: meeting 데이터를 Session 형태로 sessionStore에 세팅
- `editMode: 'meeting'` + `editingMeetingId` 로 저장 API 분기 가능 (PATCH /meetings/{id})

### 복구 기능
- status별 라우팅 매핑: `recording/post_recording` → `/recording`, `editing` → `/editing` 등
- getSession으로 전체 데이터 로드 후 sessionStore에 세팅 → 해당 단계로 navigate

### 백그라운드 탭 대응
- ① 무음 오디오(useSilentAudio): 녹음 시작 시 start, 중지 시 stop
- ② 탭 복귀(useVisibility): Web Speech 재시작 + 조건부 토스트
- ③ 조건부 토스트: 탭 복귀 시에만 "일부 전사가 누락됐을 수 있습니다" 표시
- ④ 타이머 보정 / ⑤ Web Worker: 다음 라운드

---

## 4. 현재 코드 상태

### 전 단계 구현 완료

| 영역 | 완성도 | 비고 |
|------|--------|------|
| 1단계 홈 | ~98% | 복구 배너 카드형 + status별 라우팅 |
| 2단계 회의 정보 | ~95% | |
| 3단계 녹음 | ~93% | 백그라운드 탭 대응 ①②③ 추가 |
| 4단계 Whisper | ~85% | Whisper 미설치 (Web Speech 폴백 동작) |
| 5단계 편집 | ~95% | |
| 6단계 요약 | ~95% | 전용 저장 API 연동 |
| 7단계 전송 | ~95% | 메시지 삭제 + 카드형 스레드 선택 |
| 히스토리 | ~90% | 목록+검색+기간필터+상세(절대/상대 토글)+재편집/재전송 |
| 설정 | ~90% | 테마·템플릿·주소록·연동·메시지 |
| 다크모드 | ~95% | CSS + 설정 세그먼트 컨트롤 |

### 미구현/미완

| 항목 | 상태 |
|------|------|
| A-4 검색 스니펫 하이라이트 | 다음 라운드 |
| B-2 ④ 타이머 보정 | useTimer가 Date.now() 기반이면 불필요 — 확인 필요 |
| B-2 ⑤ Web Worker | MVP 선택적 |
| Whisper 패키지 설치 | MacBook 배포 시 |
| Meeting 재편집 시 PATCH /meetings/{id} 저장 분기 | editMode 상태는 준비됨, Editing/Summary 분기 로직 미적용 |

### 커밋 이력

| 커밋 | 내용 |
|------|------|
| `b03da01` | Initial commit: Sprint 2 완료 상태 |
| `437b568` | Sprint 3+4 완료: 전체 7단계 Wizard + 다크모드 + QA 15건 |
| `3f8747f` | QA 16건 + 기획 변경 반영 + 요약 저장 API + ngrok |
| (미커밋) | Sprint 5 전체 + QA Sprint 5 수정 13건 + 기획 변경 보완 |

---

## 5. 다음 세션에서 확인할 것

### 즉시
- 미커밋 변경사항 커밋 + push
- 브라우저에서 전체 플로우 재확인 (1→7단계 + 히스토리 + 설정)

### 추후
- A-4 검색 스니펫: 백엔드 search API에 snippet 필드 추가
- Meeting 재편집 저장 분기: editMode === 'meeting' 시 PATCH /meetings/{id} 호출
- Whisper 설치 + 4단계 실제 테스트
- 외부 접속 테스트 (ngrok URL + 다른 기기)
