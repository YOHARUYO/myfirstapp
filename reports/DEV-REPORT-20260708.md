# 개발 업무 보고서 — 2026-07-08

> 작성 주체: 개발 세션
> 대상 기간: 2026-07-08 (Phase 1B commit 정리 + QA-FIX 모델 retire 대응)
> 이전 보고서: `reports/DEV-REPORT-20260605-2.md`
> 발주 문서: PM 직접 지시 (Phase 1B 2분할 commit) + `QA-FIX/QA-CLAUDE-MODEL-RETIRE-20260616.md`

---

## 0. 30초 요약

- **작업 1 — Phase 1B 미커밋분 commit 정리 완료 (코드 변경 0)**: 06-05 2회차 개발분이 한 달간 working tree에 남아 있던 것을 코드/문서 2분할로 commit. git status 대조 결과 지시 목록과 실제 변경 파일 완전 일치 확인 후 진행
- **작업 2 — QA-FIX 모델 retire 대응 5건 반영 + 단독 commit 완료**: placeholder 2곳 + 코드 default 2곳(`claude-sonnet-4-6`) + `_safe_call` 404(model)→한국어 안내. 자동 검증 9종 통과 (§4 참조)
- **현행 Sonnet ID 확보**: `models.list()` 실호출로 `claude-sonnet-4-6` 유효 확인 + `backend/data/settings.json`의 `llm.providers.claude.summary_model` 값(PM이 06-16 갱신, 재요약 200 검증됨)과 **정확히 일치** — 교차 확인 통과. Haiku(`claude-haiku-4-5-20251001`)는 여전히 유효 목록에 있어 QA 문서대로 변경하지 않음
- **commit 해시 3건**:

| # | 해시 | 내용 |
|---|------|------|
| ① | `6a55ebd` (`6a55ebd387d8474dcc62feb839c006bea69cee18`) | Phase 1B 코드 10개 파일 |
| ② | `279dfc2` (`279dfc2f68500e6198a2162dc5afdda59d0da91d`) | 06-01~06-16 세션 문서 12건 |
| ③ | `8d1a78c` (`8d1a78c623c882e4387050d0663c90811958ae4a`) | QA-FIX 모델 retire 대응 4개 파일 |

- **보고 사항**: 세션 도중 `reports/PLAN-DEV-HANDOFF-20260708.md`(untracked, 목록 외 신규 파일)가 생성됨 — 지시 원칙("목록에 없는 변경 파일은 commit하지 말 것")에 따라 어느 commit에도 포함하지 않음. `_to_delete/` 역시 전체 commit에서 제외

---

## 1. 오늘 수행한 작업 요약

| 카테고리 | 건수 | 요약 |
|---------|------|------|
| commit 정리 (작업 1) | 2 | Phase 1B 코드 10파일 commit ① / 문서 12건(HANDOVER 수정 + AGENTS.md + QA-FIX 1건 + reports 신규 9건) commit ② |
| 코드 수정 (작업 2) | 5 | placeholder 2곳(Settings.tsx:517·528) / DEFAULT_SUMMARY_MODEL(claude.py:15) / ClaudeSettings.summary_model(settings.py:14) / _safe_call 404 한국어 안내(claude_service.py) |
| 검증 | 9 | _safe_call 분기 유닛테스트 5종 + pydantic 기본값 + fallback 경로 + 신규 default 모델 실호출 200 + frontend tsc --noEmit |
| commit (작업 2) | 1 | 단독 commit ③ (QA 문서 §6·7 "다른 fix와 묶지 말 것" 준수) |

## 2. 변경된 파일 목록

### commit ① `6a55ebd` — Phase 1B 코드 (06-05 작업분, 상세는 `DEV-REPORT-20260605-2.md` §2)

`backend/models/meeting.py`, `backend/routers/slack.py`, `backend/services/llm/claude.py`, `backend/services/summary_assembler.py`, `frontend/src/api/slack.ts`, `frontend/src/components/common/TagInput.tsx`, `frontend/src/pages/Editing.tsx`, `frontend/src/pages/HistoryDetail.tsx`, `frontend/src/pages/SendSave.tsx`, `frontend/src/types/index.ts` (10 files, +347 −83)

### commit ② `279dfc2` — 세션 문서 일괄 (12 files, +2344 −57)

`HANDOVER.md`(수정), `AGENTS.md`, `QA-FIX/QA-CLAUDE-MODEL-RETIRE-20260616.md`, `reports/` 신규 9건 (DEV-REPORT-20260602, DEV-REPORT-20260605-2, PLAN-DEV-HANDOFF-20260602, PLAN-DEV-HANDOFF-20260602-2, PLAN-REPORT-20260601, PLAN-REPORT-20260602, PLAN-REPORT-20260610, PLAN-SESSION-RESUME-20260602, QA-REPORT-20260616)

### commit ③ `8d1a78c` — QA-FIX 모델 retire 대응 (4 files, +14 −8)

| 파일 | 변경 |
|------|------|
| `frontend/src/pages/Settings.tsx` | 517·528행 placeholder → `'예: claude-sonnet-4-5-xxxxxxxx (비워두면 최신 기본값)'` / `'예: claude-haiku-4-5-xxxxxxxx (비워두면 최신 기본값)'` (QA 명세 §3.1 그대로 — 정확 ID 대신 형식 예시만 안내) |
| `backend/services/llm/claude.py` | 15행 `DEFAULT_SUMMARY_MODEL = "claude-sonnet-4-6"` (상수만 변경, provider 본문 무변경) |
| `backend/models/settings.py` | 14행 `ClaudeSettings.summary_model = "claude-sonnet-4-6"` (legacy fallback 경로용, tagging_model 무변경) |
| `backend/services/claude_service.py` | `_safe_call`의 `APIStatusError` 분기 내부에 404 + "model"/"not_found" 매칭 시 한국어 안내로 detail 교체 (원본 에러 문자열은 `(원본: ...)`으로 보존, 시그니처·타 분기 무변경) |

## 3. 주요 결정/기술 사항

### 3-1. 현행 Sonnet ID = `claude-sonnet-4-6` 채택 근거

- `models.list()` 실호출 결과 유효 목록에 존재 (조회 시점 목록에 `claude-sonnet-5`, `claude-sonnet-4-6`, `claude-sonnet-4-5-20250929` 등 확인)
- QA 문서 §3.2 "settings.json 값과 일치하는지 교차 확인 권장" → `llm.providers.claude.summary_model`의 현재값과 **정확히 일치**. PM이 06-16 장애 복구 때 입력해 재요약 200으로 운영 검증까지 끝난 ID
- 최신인 `claude-sonnet-5`가 아닌 `claude-sonnet-4-6`을 택한 이유: 교차 확인 기준 충족 + 본 앱 프롬프트로 실운영 검증된 값. 더 상위 모델 채택은 기획 판단 영역이라 default는 검증값으로 보수적으로 고정

### 3-2. 원격 세션 환경 제약과 우회 (다음 원격 세션 참고)

- 이번 세션은 클라우드 원격 환경 + 로컬 폴더 마운트 구조. **백엔드 venv 실행이 불가**해 `models.list()`는 동일 API(`GET /v1/models`)를 컨테이너에서 직접 호출하는 방식으로 대체 (`backend/.env`의 키 사용, 키 비노출)
- **git 조작 시 마운트 제약**: lock 파일 삭제(unlink)가 차단되어 stale lock이 남음 → rename으로 치우고 진행. `.git/` 내부에 `*.lock.stale.*`, `objects/*/tmp_obj_*` 잔재 다수 남음 — **동작에는 무해**하나 로컬(Windows)에서 `git status` 확인 후 지워도 됨
- **마운트 캐시 이슈로 파일 1건 오염 발생 → 검출·복구 완료**: Settings.tsx 전송 과정에서 주석 1글자 오염("증폭"→"증돭")이 생겼으나, commit 전 파일 전체 md5 대조로 검출하여 바이트 단위 복구 후 commit. **commit ③에 들어간 4개 파일 전부 의도한 내용과 md5 일치 최종 확인 완료** (580c0294/aa08d57b/1824363e/82770b89)
- `_to_delete/tsc-check-frontend.tgz`: tsc 검증용 임시 tar. `_to_delete/` 폴더째 삭제 시 함께 정리됨

### 3-3. settings.json의 legacy `claude` 블록은 손대지 않음

`backend/data/settings.json`의 구식 `claude.summary_model`에는 retire된 ID가 남아 있으나, `factory.py`가 `llm.providers.claude`(갱신값)를 우선하므로 실호출에 영향 없음. QA 문서 §5 "settings.json 무변경" 명시에 따라 그대로 둠.

## 4. 검증 결과 (QA-FIX §4 시나리오 8건 대응)

### 4-1. 자동 검증 (원격 환경에서 수행)

| # | 시나리오 (QA §4 매핑) | 방법 | 결과 |
|---|---------------------|------|------|
| 1 | 404(model) → 한국어 안내 + 원본 보존 (§4.2 #5 핵심 로직) | 합성 `anthropic.APIStatusError`(404, not_found_error, model)로 `_safe_call` 유닛테스트 | ✅ 502 + "요약·태깅 모델이 더 이상 제공되지..." + 원본 포함 |
| 2 | 모델 무관 404는 기존 영문 detail 유지 | 합성 404(invalid_request) | ✅ `LLM API 오류 (404):` 유지 |
| 3 | 429 등 타 상태코드 경로 무변경 (§4.1 회귀) | 합성 429 | ✅ |
| 4 | 401 인증 실패 분기 회귀 무손 (§4.1 회귀) | 합성 `AuthenticationError` | ✅ "LLM 인증 실패" 유지 |
| 5 | 정상 호출 passthrough (§4.1 #1 로직) | `_safe_call(lambda)` | ✅ |
| 6 | `ClaudeSettings`/`AppSettings` 기본값·스키마 인스턴스화 (§4.1 #2) | pydantic 로드 | ✅ summary=claude-sonnet-4-6, tagging 무변경 |
| 7 | 빈 설정 → DEFAULT fallback 표현식 (§4.1 #2) | `(cfg.get() or "").strip() or DEFAULT` 경로 확인 | ✅ |
| 8 | **DEFAULT 모델 실호출** (§4.1 #2 핵심) | `claude-sonnet-4-6`으로 messages API 1토큰 실호출 | ✅ 200 |
| 9 | frontend 타입 회귀 (§4.1 #3 보조) | 수정본 포함 전체 `tsc --noEmit` | ✅ exit 0 |

### 4-2. 영역 분리 (§4.3)

- **#7 회의 데이터 무변경**: `git diff HEAD~1 HEAD -- backend/data/` = 0건. sessions/meetings/settings.json 미접촉 (settings.json은 읽기만)
- **#8 Phase 1A·1B 영역**: commit ③ diff가 QA 명세 표면 4곳뿐. `services/llm/` 구조·factory·base 무변경(claude.py는 상수 1행), `claude_service.py` 시그니처 무변경(호출처 6곳 무영향), Phase 1B 산출물(slack.py, TagInput, Editing 등) 미접촉

### 4-3. PM 시각 확인 필요 (dev server 필요 — 원격 세션에서 수행 불가)

| # | 시나리오 | 비고 |
|---|---------|------|
| §4.1 #1 | 기존 회의 [재요약] → 200 | 현재 settings.json 경로. 참고: uvicorn --reload가 새 코드 자동 반영됨(재시작 불요) |
| §4.1 #2 | Settings에서 요약 모델 입력란 비우고 저장 → 재요약 200 | DEFAULT 갱신 효과 직접 확인 (모델 자체는 실호출 200 검증 완료) |
| §4.1 #3 | placeholder 신규 문구 시각 확인 | frontend dev server |
| §4.2 #4~6 | `bogus-model-xxx` 입력 → 재요약 → 한국어 토스트 → 입력란 비워 복구 | 안내 로직은 유닛테스트 통과, 토스트 표시만 확인하면 됨 |
| §4.3 #8 | Slack `[xxx님]` 포맷 / 재편집 제목 fix / TagInput IME 회귀 | Phase 1B 회귀 (신규 회의 1건 전송으로 일괄 확인 가능) |

## 5. 전달 사항

### 개발 → 기획

1. **`reports/PLAN-DEV-HANDOFF-20260708.md`가 세션 도중 untracked로 생성됨** — 본 세션 commit 범위에서 제외해 둠. 기획 세션에서 HANDOVER 8·10절 갱신 시 함께 commit 처리 권장
2. HANDOVER 8·10절 갱신은 지시대로 미수행 (기획 세션 담당). 갱신 시 반영할 사실관계: Phase 1B commit `6a55ebd` 완료 / QA-CLAUDE-MODEL-RETIRE 반영 commit `8d1a78c` 완료(검수→개발 전달 사항 소화) / 최신 커밋 `8d1a78c`
3. 본 리포트 자체는 관례(PM 확인 후 commit)에 따라 **미커밋** 상태로 둠

### 개발 → 검수

- 중점 확인: §4-3 표의 PM/검수 시나리오 5건. 특히 §4.2 #4~6 (bogus 모델 → 한국어 토스트)이 신규 표면
- `.git/` 내 `*.stale.*` 잔재는 원격 세션 환경 제약 산물로 결함 아님 (3-2 참조)

## 6. 다음 세션에서 확인할 것

1. PM: §4-3 시각 확인 5건 (한 번의 dev server 기동으로 일괄 가능)
2. 기획 세션: HANDOVER 8·10절 갱신 + `PLAN-DEV-HANDOFF-20260708.md` 처리 + 본 리포트 commit
3. origin push 여부 결정 (이번 세션은 로컬 commit까지만 — push 지시 없었음. 현재 로컬이 origin/master보다 3 commit 앞섬)
4. 맥북 production 셋업 시: 이제 default가 현행 모델이라 QA-FIX #3·#4 재발 위험 해소 — 첫 가동 검증만
