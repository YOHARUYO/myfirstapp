# 기획 세션 인수인계 — 2026-07-08

> 이 파일은 기획 세션 재개 시 첫 메시지로 사용

---

## 새 세션 시작 프롬프트

```
HANDOVER.md를 읽어줘. 난 이 프로젝트의 사용자이자 PM이야, 너는 기획 담당이고.
reports/PLAN-REPORT-20260708.md와 reports/PLAN-SESSION-RESUME-20260708.md도
읽고 작업 준비 해줘.

이전 기획 세션 진행 내용 (2026-07-08):
1. 3주 적체 미결 일괄 해소 — Phase 1B commit(6a55ebd) + QA-FIX 모델 retire(8d1a78c)
2. 슬랙 포맷 v2 결정 7건 확정 (PM 실사용 피드백 기반) → 핸드오프 작성 →
   개발(a311651) + PM 검수까지 당일 완결
   - 핵심 요약 LLM 직접 생성 / F/U 안건별 그룹핑(변형 A, 기한 (~7/6)) /
     첨부 안내 initial_comment 이동 / 2번 메시지 주제별 분할 / md→mrkdwn 변환 /
     프롬프트 보강 2건
3. decisions.md 3개 절 + HANDOVER 8·10절 갱신, 문서 일괄 commit

미결 (가장 가까운 것부터):
- 모델명 등록 논의 (검증 UI / placeholder 동적화) — 다음 첫 안건으로 예약됨
- Phase 2 핸드오프 작성 (Local provider + MacBook Whisper) — PM의 MacBook 시점 결정 대기
- v2 실사용 피드백 수집 / legacy 호환 스팟 체크 (검수)
- 잔여 🟡 5건 / 이슈 3 PoC / HANDOVER 7-A 회수

이어서 기획 작업 진행해줘.
```

---

## 현재 상태 요약

| 항목 | 상태 |
|------|------|
| Sprint 1~5 | ✅ 전체 완료 |
| Phase 1A (LLM 추상화) | ✅ commit `1a5b570` — 06-16 retire 장애 대응에서 가치 실증 |
| Phase 1B (슬랙 3종 thread 등) | ✅ commit `6a55ebd` (07-08 정리 — 한 달 미커밋 상태였음) |
| QA-FIX 모델 retire 5건 | ✅ commit `8d1a78c` (default `claude-sonnet-4-6`, 한국어 404 안내) |
| **슬랙 포맷 v2** | ✅ commit `a311651` — 자동 검증 25건 + PM 검수 완료 |
| decisions.md / HANDOVER.md | ✅ v2 반영 갱신 완료 |
| Phase 2 핸드오프 | ⏳ 미작성 — MacBook 시점 결정 대기 |
| Phase 3 (Gemini) / 4 (OpenAI) | 보류 |

---

## 핵심 결정 (07-08) — 슬랙 포맷 v2

전송 구조: **1번 메인 + 주제별 thread 회신 N개(+기타 메모 1개) + .md 첨부(initial_comment)**

| # | 결정 | 비고 |
|---|------|------|
| 1 | 핵심 요약 = `## 핵심 요약` 섹션 LLM 직접 생성 (2~4 bullet, 결정>방향>기한) | 기계 추출 폐기, legacy는 fallback |
| 2 | F/U 변형 A — `*N. 안건명*` 라벨 + 같은 인물 ` / ` 병합 + 기한 `(~7/6)` 각 task 뒤 | PM이 예시 직접 확정 |
| 3 | 첨부 안내 → `initial_comment: "📎 전체 회의록 첨부합니다"` | 1번 메시지에서 제거 |
| 4 | 2번 메시지 **항상** 주제별 분할 | `slack_sent.messages.topics` 배열형 (legacy 단일 dict 읽기 호환) |
| 5 | md→mrkdwn 변환 — 전송 계층 전용 | .md·summary_markdown 저장본은 원본 유지 |
| 6 | 프롬프트: "(담당자 미명시)" 접두어 금지 + 날짜 추정·계산 금지 | 7/7→7/6 오류 재발 방지 |
| 7 | topic 필드는 기존 `source_topic` 활용 (개발 구현 노트, 기획 승인) | 신규 필드 없음 |

상세: `reports/PLAN-DEV-HANDOFF-20260708.md` / 구현: `reports/DEV-REPORT-20260708-2.md`

---

## 다음 할 일 (가까운 순서)

### 즉시 (다음 기획 세션 첫 안건)
1. **모델명 등록 논의** — PM이 예약한 안건. 재료:
   - 모델 ID 저장 시 `models.list()` 매칭 검증 (현재는 저장만 하고 검증 없음 — 오타 시 다음 요약에서야 발견)
   - placeholder 동적화 (backend가 `models.list()` 일부를 frontend에 전달 — 네트워킹 비용·외부 환경 트레이드오프)
   - 출처: `reports/QA-REPORT-20260616.md` §5-3
2. 결정 시 핸드오프 작성 → 발주

### Phase 2 (PM의 MacBook 시점 결정 후)
3. **Phase 2 PLAN-DEV-HANDOFF 작성** — Local provider(Ollama) + 요약 포맷·프롬프트 + MacBook Whisper 설치
   - MacBook 사이클에 이월 검증 2건(cloudflared 실회의 누적 / multi-segment 실회의) 동시 수행 검토
   - QA-FIX retire 반영 완료로 MacBook 신규 셋업의 retire 재발 위험은 해소된 상태
4. Phase 2 발주 → Phase 3 (Gemini) → Phase 4 (OpenAI, 선택)

### 관찰·보류
- v2 실사용 피드백 — 다음 실회의 전송분에서 핵심 요약 품질·그룹핑 확인 (프롬프트 미세조정 가능성)
- v2 legacy 호환 스팟 체크 — 다음 검수 세션 (구 회의 재전송 / 단일 topics 수정·삭제 / 요약 생략)
- 잔여 🟡 5건 재배치 / 이슈 3 (Whisper.wasm) PoC / HANDOVER 7-A ngrok 폐기 회수

---

## 잠재 회귀 모니터링

| 위험 | 발현 시 대응 |
|------|------------|
| v2 핵심 요약 품질이 프롬프트 기준과 다르게 나옴 | 실회의 1~2건 관찰 후 프롬프트 우선순위 문구 조정 (코드 구조 무관) |
| 구 회의 재전송에서 fallback 미작동 | `_build_main_message` 기계 추출 fallback + 평탄 F/U fallback 경로 확인 (`DEV-REPORT-20260708-2.md` §4) |
| Phase 1B 저장본(단일 topics dict)의 수정 모달 회귀 | `normalizeTopics` 정규화 경로 확인 |
| 다음 모델 retire 발생 | 이제 한국어 안내 토스트로 즉시 인지 가능. Settings UI에서 모델 ID 갱신 (재시작 불필요) — `QA-REPORT-20260616.md` §7 절차 재사용 |

---

## 산출물 인덱스 (07-08 세션)

| 파일 | 유형 |
|------|------|
| `reports/PLAN-DEV-HANDOFF-20260708.md` | 슬랙 포맷 v2 핸드오프 (반영 완료) |
| `reports/PLAN-REPORT-20260708.md` | 기획 리포트 |
| `reports/PLAN-SESSION-RESUME-20260708.md` | 본 인수인계 |
| `reports/DEV-REPORT-20260708.md` | 개발 1회차 (1B commit 정리 + QA-FIX) |
| `reports/DEV-REPORT-20260708-2.md` | 개발 2회차 (v2 구현) |
| `decisions.md` | v2 반영 갱신 |
| `HANDOVER.md` | 8·10절 갱신 |
