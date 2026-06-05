# 개발 업무 보고서 — 2026-06-05

> 작성 주체: 개발 세션
> 대상 기간: 2026-06-05 (Phase 1A — LLM provider 추상화)
> 이전 보고서: `reports/DEV-REPORT-20260602.md`
> 발주 문서: `reports/PLAN-DEV-HANDOFF-20260602-2.md`

---

## 0. 30초 요약

- **Phase 1A (LLM provider 추상화 골격) working tree 반영 완료**
- `services/llm/{base, claude, factory}.py` 신규 + `claude_service.py`를 호환 래퍼로 축소 + `models/settings.py`에 `LLMSettings`/`ProviderConfig` 추가 + `routers/settings.py` PATCH 확장 + frontend types + Settings.tsx에 provider 드롭다운
- **호출처 6곳(ai.py·processing.py·history.py·sessions.py) 코드 변경 0** — git diff --stat 결과가 비어있음으로 확인
- **모델 ID 하드코딩 사일런트 버그 해소**: 설정에서 summary/tagging model 변경 → 다음 호출부터 즉시 반영
- **PM 시연 결함 2건 fix (기획 명시 외 신규 동작)**:
  (a) PATCH api_key 자동 검증 — `anthropic.models.list()`로 인증 검증, 실패 시 400 + 토스트, 저장 거부
  (b) `claude_service._safe_call` 안전망 — anthropic 401/APIStatusError를 HTTPException(502)로 변환해 cloudflare Basic Auth 자격증명 무한 프롬프트 차단
- 자동 검증 10종 통과. 사용자 시각 확인 1건은 PM 액션 필요(Settings UI 드롭다운 UX)
- 다음 액션: Phase 1A 단독 commit → 검수 세션 / Phase 1B 발주. 기획 명시 외 동작 4건은 별도 메시지로 기획 세션에 전달

---

## 1. 오늘 수행한 작업 요약

| 카테고리 | 건수 | 요약 |
|---------|------|------|
| 신규 파일 | 4 | `services/llm/{__init__, base, claude, factory}.py` |
| 수정 파일 (backend) | 3 | `models/settings.py`, `routers/settings.py`, `services/claude_service.py` |
| 수정 파일 (frontend) | 2 | `types/index.ts`, `pages/Settings.tsx` |
| 자동 검증 | 7 | 회귀 3 + 신규 3 + type check 1 |
| 호출처 무변경 확인 | 6 | ai.py 1 + processing.py 1 + history.py 2 + sessions.py 1 (시그니처 보존) |

---

## 2. 변경된 파일 목록

| 파일 | 변경 유형 | 핵심 |
|------|---------|------|
| `backend/services/llm/__init__.py` | 신규 | 패키지 마커 |
| `backend/services/llm/base.py` | 신규 | `LLMProvider` ABC — `tag`/`summarize` 두 메서드 |
| `backend/services/llm/claude.py` | 신규 | `ClaudeProvider` — 기존 `claude_service` 본문 이전 + 모델 ID 동적(config fallback → DEFAULT) |
| `backend/services/llm/factory.py` | 신규 | `get_provider()` — settings에서 매 호출 재로딩, 미구현 provider는 `NotImplementedError(Phase N)` |
| `backend/models/settings.py` | 수정 | `ProviderConfig` + `LLMSettings`(provider + providers 4종) 추가. `ClaudeSettings` 호환 유지 |
| `backend/routers/settings.py` | 수정 (2회) | `UpdateLLMSettings`/`UpdateProviderConfig` PATCH, `_mask_response`에 `llm.providers.*` 마스킹(claude는 .env fallback), `llm.providers.claude.api_key` 변경 시 `.env`(ANTHROPIC_API_KEY) 동기화. **`_verify_claude_api_key`로 저장 전 자동 검증** — AuthenticationError는 400 raise 저장 거부, 네트워크/일시 오류는 저장 허용 + `_warning` 필드로 안내 |
| `backend/services/claude_service.py` | 수정 (2회) | 185줄 → 호환 래퍼 약 65줄. `tag_blocks`/`summarize_blocks` 시그니처·반환 무변경. user 태그 필터링 책임 보존. **`_safe_call`로 anthropic 401/APIStatusError → HTTPException(502) 변환** (cloudflare Basic Auth 자격증명 무한 프롬프트 차단) |
| `frontend/src/types/index.ts` | 수정 | `LLMProviderName`, `ProviderConfig`, `LLMSettings` 추가 |
| `frontend/src/pages/Settings.tsx` | 수정 (2회) | 기존 "Claude API" 카드를 "LLM" 카드로 확장: provider 드롭다운 + 미지원 안내 배지 + provider별 API 키 + summary/tagging model 입력. **`handleSaveApiKey`가 백엔드 400 detail 메시지를 토스트로 노출** + `_warning` 응답 시 "저장됨 — <warning>" 형태로 표시 |
| `reports/DEV-REPORT-20260605.md` | 신규 | 본 문서 |

> 호출처(`ai.py`, `processing.py`, `history.py`, `sessions.py`)는 **변경 없음** — git diff --stat 결과 비어있음.

---

## 3. 주요 기술 결정

### 3-1. `user 태그 필터링` 위치 — provider가 아닌 호환 래퍼에

기획 §4.4 권고를 따름. provider 구현은 순수(주어진 블록 전부 처리), `importance_source != "user"` 필터링은 `claude_service.tag_blocks` 래퍼가 담당. 이유: importance_source 의미는 도메인이라 provider 책임 밖.

### 3-2. factory 매 호출 settings 재로딩

기획 §4.3 권고대로 캐시 없음. settings.json은 작은 파일이라 재로딩 부담 무시 가능. 회의 중 PATCH로 모델 변경하면 다음 호출부터 즉시 반영 — 검증 §4 #5에서 확인됨.

### 3-3. claude provider config fallback 우선순위

```
config.api_key → ANTHROPIC_API_KEY (env)
config.summary_model → DEFAULT_SUMMARY_MODEL (= 현재 하드코딩 값)
config.tagging_model → DEFAULT_TAGGING_MODEL (= 현재 하드코딩 값)
```

factory에서는 `llm.providers.claude`가 비어있으면 legacy `settings.claude`(=구 ClaudeSettings 기본값 'claude-sonnet-4-20250514'/'claude-haiku-4-5-20251001')로 fallback → ClaudeProvider config에 default 값으로 들어가 byte-identical 호출.

### 3-4. Settings UI에 모델 ID 입력 추가

기획 §4.8은 "provider 드롭다운 + 입력 영역"만 명시했지만 검증 §5.2 #4 "summary_model 변경" 시연을 위해 모델 ID 입력 필드도 추가. 사용자가 빈 값으로 두면 default 사용. claude 외 provider는 placeholder만 변경.

### 3-5. .env 동기화 — `llm.providers.claude.api_key` 변경 시에도 ANTHROPIC_API_KEY 갱신

기존 `claude.api_key` PATCH 경로의 동기화 로직과 동일한 동작. 신규 UI에서도 PATCH가 `llm.providers.claude.api_key`로 가지만 `.env`가 같이 갱신되어 cloudflared 인프라(05-29) 패턴과 충돌 없음.

---

## 4. 검증 결과

### 4-1. 자동 검증 (TestClient로 시뮬레이션)

| # | 시나리오 | 결과 |
|---|---------|------|
| 1 | **§5.1 #1** 기존 settings.json 그대로 로드 → AppSettings validation 통과 | ✅ `llm` 필드는 default로 채워짐 (`provider=claude`, 4개 providers 빈 ProviderConfig) |
| 2 | **§5.1 #2** provider 미설정 시 `get_provider()` → `ClaudeProvider` + 모델 ID 현재와 동일 | ✅ `ClaudeProvider.config = {api_key: '', summary_model: 'claude-sonnet-4-20250514', tagging_model: 'claude-haiku-4-5-20251001'}` (legacy fallback 정상) |
| 3 | **§5.1 #3** 호출처 6곳 코드 변경 0 | ✅ `git diff --stat -- backend/routers/{ai,processing,history,sessions}.py` 결과 비어있음 |
| 4 | **§5.2 #4** PATCH `llm.providers.claude.summary_model='claude-sonnet-4-5-20250929'` → factory 즉시 반영 | ✅ `get_provider().config['summary_model'] == 'claude-sonnet-4-5-20250929'` |
| 5 | **§5.2 #6** PATCH `llm.provider='local'` → `get_provider()` raises `NotImplementedError("Provider 'local' is not yet implemented (Phase 2).")` | ✅ 정확한 에러 + Phase 번호 |
| 6 | revert PATCH 후 다시 ClaudeProvider + 기본 모델 ID로 복원 | ✅ |
| 7 | **frontend TypeScript type check** (`tsc --noEmit`) | ✅ 에러 없음 |
| 8 | **PM 결함 fix #1**: PATCH `llm.providers.claude.api_key='sk-ant-INVALID-KEY-XYZ'` → 400 응답 "유효하지 않은 API 키입니다. 다시 확인해주세요." + settings.json byte-identical (저장 거부) | ✅ |
| 9 | **PM 결함 fix #1**: PATCH `llm.providers.claude.api_key=<env real key>` → 200, 마스킹 정상, `_warning=None` | ✅ |
| 10 | **PM 결함 fix #2**: `_safe_call(boom_AuthenticationError)` → `HTTPException(status=502, detail='LLM 인증 실패 (설정의 API 키를 확인해주세요): ...')` + `_safe_call(boom_APIStatusError)` → 502 + 정상 호출 통과 sanity | ✅ |

### 4-2. 마스킹 응답 확인

```
legacy claude.api_key = 'sk-ant-api...ygAA'
llm.providers.claude.api_key = 'sk-ant-api...ygAA'  (settings.json에 키 없으면 .env fallback)
llm.providers.local.api_key = ''
```

신규 UI는 `llm.providers[provider].api_key`를 읽으므로 사용자에게 정상 마스킹 노출.

### 4-3. PM 시각 확인 필요 (자동 검증 불가)

| # | 시나리오 | 상태 |
|---|---------|------|
| §5.2 #4 실호출 | 변경된 모델 ID로 실제 Anthropic API 응답이 오는지 | ✅ PM 06-05 확인 통과 |
| §5.2 #5 | 잘못된 api_key 입력 시 즉시 거부 | ✅ PM 06-05 보고 → 코드 fix 후 자동 검증 #8·#10 통과. PM 재확인 필요 |
| §5.4 #9~11 | Settings 화면 provider 드롭다운 UX | ✅ PM 06-05 "잘 반영된 것 같아" |

dev server 기동 (기존 절차):
```
backend:  cd backend && uvicorn main:app --reload --port 8000
frontend: cd frontend && npm run dev
```

---

## 5. 전달 사항

### 개발 → 검수

- **중점 검수 영역**: `get_provider()`의 매 호출 settings 재로딩 + legacy fallback 분기 + 호출처 6곳 무변경 + 미구현 provider 안내
- `claude_service.py` 시그니처·반환 byte-identical 보장 (호출자 코드는 변하지 않았으니 모델 호출 결과도 변하지 않아야 함)
- Settings.tsx provider 드롭다운 + 모델 ID 입력 UI는 디자인 시스템 토큰 준수 여부 확인

### 개발 → 기획

- **모델 ID 입력 UI를 추가했음**(§4.8 명세 외). 사유: 검증 §5.2 #4 시연이 UI 없이는 PATCH 직접 호출이 필요해 PM 확인 부담. 빈 값 = default라 회귀 위험 0
- **기획 결정 권한 영역**: `LLMSettings.providers`의 키를 `"claude"/"gemini"/"local"/"openai"`로 고정. 향후 provider 추가 시 이 4개 외 필요하면 enum 확장 결정 필요
- **PM 시연 결함 2건 fix로 기획 명시 외 신규 동작 4건 추가** (PM이 기획 세션에 별도 전달):
  1. PATCH api_key 자동 검증 (`anthropic.models.list()`로 인증 검증 → 실패 시 400 + 토스트, 저장 거부). 기획 §5.2 #5의 "잘못된 키 입력 시 401 에러 즉시 확인" 표현은 "잘못된 키는 저장 단계에서 거부 (400 + 토스트)"로 명확화 권장
  2. anthropic 에러 안전망 — `claude_service._safe_call`이 401/APIStatusError/APIError를 모두 HTTPException(502)로 변환. 이유: `main.py` Basic Auth 미들웨어가 401에 WWW-Authenticate Basic 헤더를 붙이는 구조라 anthropic 401이 그대로 전파되면 브라우저가 cloudflared 자격증명 만료로 오해해 무한 프롬프트
  3. 네트워크 에러 처리 정책 — PATCH 검증 호출이 네트워크 오류(`anthropic.APIError`)이면 저장 허용 + 응답에 `_warning` 필드. 인증 실패만 저장 거부
  4. 검증 적용 범위 — provider=claude의 api_key만 검증. local/gemini/openai는 Phase 2~4에서 각자 검증 메서드 정의 시 추가

### 개발 → PM

- **dev server에서 시각 확인 후 피드백** 부탁드립니다. 특히 LLM 카드의 provider 드롭다운 동작과 미지원 provider 선택 시 안내 배지가 잘 보이는지
- 사용자 메모리(존댓말 + 결과물 직접 확인 스타일)에 따라 자동 commit 안 함 — **PM 확인 후 commit 부탁드립니다**

---

## 6. 다음 세션에서 확인할 것

### 즉시 (개발)

1. PM 시각 확인 결과 수신 → 필요 시 UI 보정
2. **Phase 1A 단독 commit** (PLAN-DEV-HANDOFF-20260602-2 명시). Phase 1B(`PLAN-DEV-HANDOFF-20260602.md`)는 별 묶음
3. Phase 1B 발주 시 작업 개시

### 후속

- 검수 세션 진행 → 검수 결과 수신
- 다음 주 cloudflared 실회의 검증 결과 (PM 자체)
- 잔여 🟡 5건 재배치 (Part D 2 / 환경 의존 2 / 미리보기 1) — Phase 1A/1B 완료 후

---

## 7. 잔여 working tree (미커밋)

```
M  backend/models/settings.py
M  backend/routers/settings.py
M  backend/services/claude_service.py
M  frontend/src/pages/Settings.tsx
M  frontend/src/types/index.ts
?? backend/services/llm/
?? reports/DEV-REPORT-20260605.md
?? reports/DEV-REPORT-20260602.md          ← 직전 개발 세션 산출물 (미커밋 잔존)
?? reports/PLAN-REPORT-20260601.md         ← 06-01 기획 산출물
?? reports/PLAN-REPORT-20260602.md         ← 06-02 기획 산출물
?? reports/PLAN-DEV-HANDOFF-20260602.md    ← Phase 1B 핸드오프
?? reports/PLAN-DEV-HANDOFF-20260602-2.md  ← Phase 1A 핸드오프 (본 작업 발주서)
?? reports/PLAN-SESSION-RESUME-20260602.md ← 06-02 기획 인수인계
M  HANDOVER.md                              ← 직전 기획 세션이 06-02 기준 갱신 (본 세션 무변경)
```

### 권장 분할 커밋

기획 §7 권고 + DEV-REPORT-20260602 §3-3 분리 권장에 부합:

1. **본 Phase 1A 단독 commit** (코드 + DEV-REPORT-20260605):
   ```
   Phase 1A: LLM provider 추상화 골격 + 모델 ID 동적 로딩 (PLAN-DEV-HANDOFF-20260602-2)
   ```
   대상: `backend/services/llm/**`, `backend/{models,routers,services}/{settings.py,claude_service.py}`, `frontend/src/{types/index.ts,pages/Settings.tsx}`, `reports/DEV-REPORT-20260605.md`

2. **06-01·02 기획 산출물 + 직전 개발 세션 DEV-REPORT** (별 commit, 기획 세션이 발주 시 함께 처리):
   - `reports/{PLAN-REPORT-20260601,PLAN-REPORT-20260602,PLAN-DEV-HANDOFF-20260602,PLAN-DEV-HANDOFF-20260602-2,PLAN-SESSION-RESUME-20260602,DEV-REPORT-20260602}.md`
   - `HANDOVER.md` (06-02 갱신분)

3. **Phase 1B** (별도 발주 후 진행)
