# 기획 업무 보고서 — 2026-06-02

> 작성 주체: 기획 세션
> 대상 기간: 2026-06-02 (열두 번째 기획 세션의 06-02 연장)
> 이전 보고서: `reports/PLAN-REPORT-20260601.md` (LLM 확장성 검토 본문)
> 상태: **최종** (Phase 1A + 1B 두 핸드오프 작성 완료, 발주 시퀀스 확정)

---

## 0. 세션 흐름

본 세션은 06-01에 시작하여 06-02로 연장됨. 06-01에는 LLM 확장성 검토(`PLAN-REPORT-20260601.md`)를, 06-02에는 PM 결정 수신 + Phase 분할 확정 + 슬랙 포맷 변경 결정 + 추가 버그 2건 + 두 핸드오프 작성을 수행함.

---

## 1. 오늘 수행한 작업 요약

| 카테고리 | 건수 | 요약 |
|---------|------|------|
| **PM 결정 수신 — LLM 확장성** | 5건 | 옵션 B 채택 / 별도 fix 함께 / Local 우선 / Phase 묶음 전략 / 설정에서만 변경 UX |
| **추가 요청 수신 — 슬랙 포맷** | 4건 | ① F/U 표기 ② 3종 분할 전송 ③ `[***님]` 태그 ④ prefill 기능 |
| **추가 요청 수신 — 버그** | 2건 | 가) 회의 제목 변경 미반영 / 나) 참여자 "~님" 중복 입력 |
| **기획 분석** | 4건 | 슬랙 코드 정독 / 1번 메시지 형태 분석 / prefill 옵션 도출 / IME 버그 원인 진단 |
| **PM 결정 추가 수신** | 5건 | F/U 평탄+인접정렬 / 회의록도 `[xxx님]` / 2번 메시지 범위 / prefill 1번+2번 / 서버 저장 |
| **핸드오프 작성** | 2건 | Phase 1A(LLM 추상화) + Phase 1B(슬랙·버그) |
| **세션 산출물** | 3건 | 본 리포트 + RESUME + (PLAN-REPORT-20260601 갱신 보류) |

---

## 2. 변경된 파일 목록

| 파일 | 변경 유형 | 상세 |
|------|----------|------|
| `reports/PLAN-DEV-HANDOFF-20260602.md` | 신규 | Phase 1B — 슬랙 포맷 4건 + prefill + 버그 2건 |
| `reports/PLAN-DEV-HANDOFF-20260602-2.md` | 신규 | Phase 1A — LLM 추상화 + 모델 ID 동적 fix |
| `reports/PLAN-REPORT-20260602.md` | 신규 | 본 리포트 |
| `reports/PLAN-SESSION-RESUME-20260602.md` | 신규 (예정) | 다음 기획 세션 인수인계 |

> 코드 변경 없음. 본 세션은 순수 기획·핸드오프 작성 세션.

---

## 3. 주요 결정 사항

### 3-1. Phase 분할 확정

| Phase | 범위 | 환경 | 묶음 | 핸드오프 |
|-------|------|------|------|---------|
| **1A** | LLM 추상화 골격 + Claude provider + 모델 ID 동적 fix | Windows | 단독 | `PLAN-DEV-HANDOFF-20260602-2.md` ✅ |
| **1B** | 슬랙 포맷 4건 + prefill + 회의 제목 fix + IME 버그 fix | Windows | 단독 | `PLAN-DEV-HANDOFF-20260602.md` ✅ |
| **2** | Local provider(Ollama) + 요약 포맷·프롬프트 + MacBook Whisper 설치 | **MacBook** | 환경 사이클 | 미작성 |
| **3** | Gemini provider | Windows | 단독 | 미작성 |
| **4** | OpenAI provider (선택, 생략 가능) | Windows | 미정 | 미작성 |

### 3-2. 발주 시퀀스 (PM 결정 — 옵션 Y 별도 발주)

```
[현재] 1번 audio merge (PLAN-DEV-HANDOFF-20260515) — 진행 중, PM "정상" 확인
   ↓ 완료 + commit
[다음] Phase 1A 발주 — 핸드오프 PLAN-DEV-HANDOFF-20260602-2.md
   ↓ 완료 + commit
[그 다음] Phase 1B 발주 — 핸드오프 PLAN-DEV-HANDOFF-20260602.md
   ↓ 완료 + commit
[그 후] Phase 2 (MacBook 환경 사이클)
   ↓
[그 후] Phase 3 (Gemini) → Phase 4 (OpenAI, 선택)
```

### 3-3. F/U 표기 구조 확정 (Phase 1B 영향)

- 주제 헤딩 유지 + `**F/U 필요 사항**` 평탄 bullet
- 인물 태그 `[xxx님]` (회의록 .md / 슬랙 모두). `@` 완전 제거
- 같은 주제 내에서 **같은 인물의 task가 인접하도록 정렬**
- 신규 회의·재요약부터 적용. 기존 회의록은 무이전

### 3-4. 슬랙 메시지 3종 분할 (Phase 1B 영향)

| # | 내용 | thread 위치 |
|---|------|------------|
| 1번 (메인) | 현재 메시지 형태 + 인물 태그 변환 + 인물별 정렬 | 사용자가 선택한 thread (또는 채널) |
| 2번 (회신) | 주요 논의 + F/U만 (개요·기타 메모·Keywords 제외) | 1번 메시지의 ts를 thread로 |
| 3번 (회신) | .md 파일 첨부 | 1번 메시지의 ts를 thread로 |

### 3-5. prefill 신규 기능 (Phase 1B 영향)

- 대상: 1번 + 2번 두 메시지 (3번 .md는 첨부라 대상 아님)
- 데이터 소스: **서버 저장 방식** (`slack_sent.messages.{main,topics}.text`)
- 기존 데이터: 무이전 (구 슬랙 전송분은 prefill 시 안내 문구)

### 3-6. LLM Provider UX 확정 (Phase 1A 영향)

- 설정 화면에서 provider 선택 → 활성 1개로 모든 회의 동작
- "원할 때 변경" = 설정 다녀와서 바꾸면 즉시 다음 회의부터 적용
- 비활성 provider 입력값은 보존 (재선택 시 재입력 불필요)
- Phase 1A 범위는 Claude만 실제 구현. Gemini/Local/OpenAI는 자리만 마련 (Phase 2~4에서 구현)

### 3-7. 버그 2건 진단 (Phase 1B 영향)

- **가) 회의 제목 변경 미반영**: 백엔드 PATCH는 동작 확인. **frontend 호출/state 동기화 원인 추정**. 개발 세션이 재현 후 진단
- **나) "님 님" 중복 입력**: `TagInput.tsx` 코드에 자동 부착 로직 없음 확인. **한글 IME 조합 중 Enter 클래식 버그** 강력 후보. `e.nativeEvent.isComposing` 가드 추가 필요

---

## 4. PM 결정 수신 시퀀스 (참조)

| 결정 시점 | 항목 | 결과 |
|----------|------|------|
| 1차 | 옵션 B 채택, provider 다중, 별도 fix 포함, Local 우선, Phase 분할 OK | → §3-1, §3-2, §3-6 |
| 2차 | "섞어 쓰고 싶다" = 설정에서 자유 변경 | → §3-6 |
| 3차 | F/U 형태 — 해석 A 잘못된 비교에서 C안 선택 → 재확인 필요 | → §3-3 재확정 |
| 4차 | 해석 A (task별 인물 태그 평탄) | → §3-3 |
| 5차 | 회의록 .md도 `[xxx님]` | → §3-3 |
| 6차 | 2번 메시지 범위 = 주요 논의 + F/U만 | → §3-4 |
| 7차 | prefill 대상 = 1번 + 2번 | → §3-5 |
| 8차 | prefill 소스 = 서버 저장 | → §3-5 |
| 9차 | 별도 발주 (옵션 Y) | → §3-2 |
| 10차 | Phase 1A 먼저 작성 + 정리 후 다음 세션은 1B부터 | → 본 세션 마무리 흐름 |

---

## 5. 영향 범위 매트릭스 (3개 작업 동시 존재 시)

| 파일 | 1번 audio merge | Phase 1A | Phase 1B |
|------|----------------|----------|----------|
| `audio_service.py` | ✅ | — | — |
| `routers/history.py` | _resolve_meeting_audio | — | update_meeting 확인 |
| `services/llm/*` | — | **신규** | — |
| `services/claude_service.py` | — | 호환 래퍼 | **프롬프트 텍스트** |
| `models/settings.py` | — | LLMSettings | — |
| `routers/settings.py` | — | LLM PATCH | — |
| `routers/slack.py` | — | — | 빌더·전송 |
| `models/meeting.py` | — | — | SlackSentInfo 확장 |
| `Settings.tsx` | — | provider 드롭다운 | — |
| `TagInput.tsx` | — | — | IME 가드 |
| `HistoryDetail.tsx` | — | — | prefill + 제목 fix |

→ **상호 충돌 영역 0**. 동일 sprint 병행도 기술적 가능하나 PM 결정으로 순차 발주.

---

## 6. 전달 사항

### 개발 세션에 전달
- **다음 발주**: Phase 1A (`PLAN-DEV-HANDOFF-20260602-2.md`). 1번 audio merge 완료·commit 후
- **그 다음 발주**: Phase 1B (`PLAN-DEV-HANDOFF-20260602.md`). Phase 1A 완료·commit 후
- 각 Phase는 별도 commit 명시 (commit 메시지에 "Phase 1A" / "Phase 1B" 명시 권장)

### 검수 세션에 전달
- Phase 1A 검증 핵심: **회귀 무손** (provider 미설정/claude 기본값 동작이 현재와 byte-identical)
- Phase 1B 검증 핵심: 신규 회의 슬랙 전송 = 3개 메시지 thread + 인물 태그 `[xxx님]` + 회의록 .md 일치 + prefill 정상

### PM에 전달
- 발주는 시간 차로. 한 번에 묶지 마실 것 (이미 결정됨)
- Phase 2(MacBook Whisper + Local) 시점은 Phase 1A·1B 검증 통과 + MacBook 환경 준비 후

---

## 7. 잠재 위험 모니터링

| 위험 | 발현 시 대응 |
|------|------------|
| Phase 1A factory가 매 호출 settings 재로딩 → 성능 저하 | 호출 빈도 측정. 문제 시 캐시 + 변경 알림 패턴 |
| 모델 ID 동적 fix 후 사용자가 잘못된 모델 ID 입력 → 401/404 | 백엔드 검증 (Anthropic SDK 응답 status 명확히 전달) |
| Phase 1B의 슬랙 메시지 분할 후 rate limit | 1 회의당 3 메시지 + 1 첨부 = 4회. Slack tier1 OK |
| Phase 1B의 2번 메시지 빌더가 summary_markdown 파싱 실패 | 빈 경우 2번 생략, 1번/3번만 전송으로 폴백 (핸드오프 §4.4 명세) |
| 한글 IME 가드 도입 후 영문 입력 회귀 | 영문 "Sam" Enter 정상 동작 검증 (5.4 #10) |
| Phase 1A의 호환 래퍼가 user 태그 필터링 누락 | claude_service 래퍼에 명시 (핸드오프 §4.4) + 검증 §5.1 #2 |

---

## 8. 다음 세션 시작 안내

다음 기획 세션은 **Phase 1B 진행 가능 상태**부터 시작.

조건:
- 1번 audio merge 검수 통과 + commit 완료
- Phase 1A 발주 → 개발 반영 → 검수 통과 + commit 완료

위 조건 충족 시 다음 기획 세션의 첫 액션:
1. Phase 1B 발주 (`PLAN-DEV-HANDOFF-20260602.md` 그대로 사용)
2. Phase 1B 개발 결과 수신 + 검수 발주
3. Phase 2 핸드오프 작성 검토 (Local provider + 요약 포맷·프롬프트 + MacBook Whisper)

조건 미충족 (예: Phase 1A 검수 보류) 시:
- Phase 1A 결과 확인 후 진행

---

## 9. 산출물 목록 (06-02 기준)

| 파일 | 유형 | 발주 가능 여부 |
|------|------|--------------|
| `reports/PLAN-DEV-HANDOFF-20260602-2.md` | Phase 1A 핸드오프 | **즉시 발주 가능** |
| `reports/PLAN-DEV-HANDOFF-20260602.md` | Phase 1B 핸드오프 | Phase 1A 완료 후 발주 |
| `reports/PLAN-REPORT-20260602.md` | 본 리포트 | — |
| `reports/PLAN-SESSION-RESUME-20260602.md` | 다음 기획 세션 인수인계 | — |

---

## 10. 미결 / 보류 항목

- [ ] **1번 audio merge 발주 결과 commit 대기** (PM "정상" 확인 받음, 최종 결과 미수신)
- [ ] Phase 2 PLAN-DEV-HANDOFF 작성 — 1A·1B 통과 후
- [ ] Phase 3 PLAN-DEV-HANDOFF 작성 — Phase 2 통과 후
- [ ] Phase 4 (OpenAI) 진행 여부 결정 — PM 의향에 따라
- [ ] 잔여 🟡 5건 재배치 (이전 보고서 인수)
- [ ] 이슈 3 (백엔드 호스팅) PoC — `memory/project_issue3_pending.md`
- [ ] HANDOVER.md 8·10절 갱신 — 본 세션 산출물 반영(다음 세션 시작 시점에 함께 가능)
