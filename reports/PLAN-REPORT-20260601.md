# 기획 업무 보고서 — 2026-06-01

> 작성 주체: 기획 세션
> 대상 기간: 2026-06-01 (열두 번째 기획 세션)
> 이전 보고서: `reports/PLAN-REPORT-20260529.md`
> 상태: **초안** (PM 검토 후 도입 옵션 확정 필요)

---

## 0. 세션 개요

PM이 다음 4개 작업의 안전한 처리 순서를 문의 → 분석 후 다음 순서 합의:

1. **🔴 1번 (15일 audio handoff)** — 개발 세션 단독 발주 (이 세션 시작 시점에 발주됨)
2. **🟢 3번 (LLM 확장성 검토)** — 본 세션에서 진행 (본 리포트가 산출물)
3. **🟢 2번 (Slack/요약 포맷)** — 3번 결과 반영 후 발주
4. **🟢 4번 (MacBook Whisper 설치)** — 환경 작업, 독립 진행

선행 작업: 4분할 일괄 커밋 완료 (`b0004fd` / `1d0a8d7` / `e9244ed` / `3fca07b`). working tree clean.

---

## 1. 검토 범위 — "다른 LLM API로 변경해도 작동하는지"

PM 의도 해석:
- 단순 모델 ID 변경(Claude 4.6 → 4.7)이 아니라 **다른 provider**(OpenAI/Gemini/Local LLM 등) 전환 가능성 확인
- 목적: **벤더 락인 회피 + 비용·성능 비교 가능성 + 장애 시 폴백**

본 검토는 코드 변경 0인 **조사 단계**. 도입 결정은 본 리포트 기반 PM 판단.

---

## 2. 현재 상태 — Claude SDK 결합도 분석

### 2-1. 코드 위치 및 규모

| 파일 | 줄수 | 역할 |
|------|------|------|
| `backend/services/claude_service.py` | 185 | **유일한 LLM 호출 진입점**. `tag_blocks`, `summarize_blocks` 2함수 |
| 호출처 (6 import / 4 실호출) | — | `ai.py`, `processing.py`, `history.py`(2곳), `sessions.py` |
| `backend/models/settings.py` | `ClaudeSettings(api_key, summary_model, tagging_model)` | provider 개념 없음, Claude 전용 |
| `backend/config.py` | `ANTHROPIC_API_KEY`만 환경변수에서 로드 |
| `backend/routers/settings.py` | `UpdateClaudeSettings` + .env 동기화 (Claude 한정) |
| `frontend/src/pages/Settings.tsx` | Claude API 키 입력 + Whisper 모델 드롭다운 |

### 2-2. Anthropic SDK 의존 항목

```python
import anthropic                                    # SDK 직접
anthropic.Anthropic(api_key=...)                    # 클라이언트
client.messages.create(model=..., max_tokens=...,
                        system=[{..., "cache_control": {"type":"ephemeral"}}],
                        messages=[...])             # Anthropic Messages API
response.content[0].text                            # 응답 구조
```

표준 LLM 기능(system+user prompt, max_tokens, JSON 응답)만 사용 → **공통 추상화 난이도 낮음**.

### 2-3. Anthropic 고유 기능 사용 항목

- **Prompt caching (`cache_control: ephemeral`)** — system prompt 캐싱. 비용 ~90% 절감
  - OpenAI: 자동 캐싱 (별도 코드 불필요)
  - Gemini: `cachedContent` API (다른 호출 패턴)
  - Local LLM: 미지원
- **모델 ID 하드코딩** — `claude-haiku-4-5-20251001`, `claude-sonnet-4-20250514`

### 2-4. 🚨 별도 발견 사항 — 설정 UI 단절

> 본 검토 중 발견. LLM 확장성과 별개이지만 짚어둠.

- `models/settings.py`에 `summary_model`, `tagging_model` 필드 존재 (line 12-13)
- 그러나 `claude_service.py`가 이 설정을 **읽지 않고 모델 ID를 하드코딩** (line 70, 174)
- 즉 **설정 화면에서 모델을 바꿔도 실제 호출 모델은 변경되지 않음**
- 또한 모델 ID가 옛 버전(Sonnet 4.0, Haiku 4.5) — 현재 최신은 Opus 4.7 / Sonnet 4.6 / Haiku 4.5
- **권장**: 옵션 A 도입 시 함께 수정. 단독 fix 가치도 있음 (1줄 변경 X 2곳)

---

## 3. 도입 옵션 (3안 비교)

### 옵션 A — 최소 변경 (모델 ID 동적화)

| 항목 | 내용 |
|------|------|
| 범위 | `claude_service.py`만. 설정의 `summary_model`/`tagging_model`을 동적으로 읽기 |
| 가능한 것 | Claude 모델 간 전환 (Haiku ↔ Sonnet ↔ Opus, 4.5 ↔ 4.6 ↔ 4.7) |
| 불가능한 것 | **다른 provider 전환 불가**. PM 목적 미달 |
| 변경 파일 | 1 (claude_service.py) |
| 위험 | 최소. 모델 ID 검증 실패 시 즉시 에러 |
| 기간 | 1일 |

→ PM 의도(다른 LLM API)와 부합하지 않음. **2-4 별도 발견 fix 용도로만 유효**.

### 옵션 B — Provider 추상화 도입 ⭐ 권장

| 항목 | 내용 |
|------|------|
| 범위 | LLM 호출을 provider별 클래스로 분리. 설정에서 provider 선택 |
| 가능한 것 | Claude / OpenAI / Gemini / Local(Ollama) 전환 |
| 구조 | `services/llm/{base.py, claude.py, openai.py, gemini.py}` + factory |
| 변경 파일 | 백엔드 5~7 (services/llm/* 신규, claude_service 래퍼, settings 모델, config, routers/settings) + 프론트 1~2 (Settings.tsx, settings API) |
| 위험 | 중간. provider별 응답 차이, prompt caching 호환성, JSON 응답 보정 필요 |
| 기간 | 1~2주 |
| 호출처 영향 | **0** (claude_service.py 함수 시그니처 유지 → 호출처 변경 불필요) |

### 옵션 C — 풀 멀티프로바이더 + 운영 기능

| 항목 | 내용 |
|------|------|
| 범위 | B + 비용 추적 + retry/fallback + 모델 카탈로그 + provider 헬스체크 |
| 위험 | 큼. 운영 복잡도 증가 |
| 기간 | 2~3주 |

→ 개인용 회의록 앱 규모에 과함. **현 시점 비권장**. 추후 운영 안정화 후 검토.

---

## 4. 권장안 — 옵션 B + 단계 분리

### 4-1. Phase 1: 추상화 골격 도입 (1주)
- `services/llm/base.py` — 추상 클래스 `LLMProvider` (`tag(blocks, ...) -> dict`, `summarize(blocks, ...) -> str`)
- `services/llm/claude.py` — 현재 `claude_service.py` 로직 이전
- `services/llm/factory.py` — settings의 `provider` 필드로 분기. 미설정 시 default=claude
- `services/claude_service.py` — Phase 1 동안 호환 래퍼 유지 (호출처 변경 0)
- `models/settings.py` — `LLMSettings(provider, providers: dict[str, ProviderConfig])` 도입
- `routers/settings.py` — provider별 키 입력 받기
- 프론트 `Settings.tsx` — provider 드롭다운 (Claude / OpenAI / Gemini)
- **검증**: 기본값(claude)로 회귀 무손 — 현재와 동일 동작
- **이 단계만으로도 PM 목적 부분 달성** — 추상화 골격이 있어 향후 provider 추가 비용 낮아짐

### 4-2. Phase 2: 2nd provider 1개 추가 (3~5일)
- OpenAI **또는** Gemini 중 하나 (PM 선택)
- 실제 회의 1건으로 품질 비교 (한국어 회의록, F/U 추출 정확도)
- 결과 보고서로 다음 provider 추가 여부 판단

### 4-3. Phase 3: 다음 provider (선택, 보류 가능)
- Phase 2 만족 시 종료
- 추가 비교 필요 시 다른 provider 1개 더

---

## 5. 후보 Provider 정리 (PM 선택용)

| Provider | 한국어 품질 | JSON 응답 | 비용 (1M tokens) | Prompt cache | 특이사항 |
|----------|-----------|----------|-----------------|--------------|---------|
| **Claude 4.7/4.6** (현재) | ★★★★★ | 프롬프트 지시 | Sonnet $3/$15 | ✅ ephemeral | 기준선 |
| **OpenAI GPT-4o / o-series** | ★★★★☆ | `response_format=json_object` 네이티브 | $2.5/$10 (4o) | 자동 | 가장 안정적, 호환성 최고 |
| **Google Gemini 1.5/2.0 Pro** | ★★★★★ | `response_mime_type` 네이티브 | $1.25/$5 | `cachedContent` | 한국어 강세 + 저렴 |
| **Mistral Large** | ★★★☆☆ | JSON mode | $2/$6 | 미지원 | EU 기반, 사양 보수적 |
| **Local (Ollama + Llama 3 70B)** | ★★★☆☆ | 프롬프트 지시 | $0 | 자체 캐시 | M3 MacBook에서 ~40GB 메모리, 추론 느림. **이슈 3(백엔드 호스팅)과 시너지** |

### Phase 2 권장 선택지 (3안)
- **A안: OpenAI** — 호환성 최고, 코드 단순, 자동 캐싱. 검증 케이스로 안전
- **B안: Gemini** — 한국어 강세, 가장 저렴, Anthropic과 다른 패러다임 → 추상화 검증력 큼
- **C안: Local(Ollama)** — 비용 0 + 이슈 3(백엔드 호스팅) PoC와 시너지. 단 성능 검증 필요

→ **권장**: **B안 (Gemini)**. 사유: 한국어 회의록이라는 도메인 정합 + 저비용 + provider 패러다임 차이로 추상화 골격 검증력 큼.

---

## 6. 위험 및 주의사항

| 항목 | 위험 | 대응 |
|------|------|------|
| Prompt caching 호환성 | provider별 다름 | base 인터페이스에서 캐싱 책임 추상화. 미지원 provider는 캐시 무시 |
| JSON 응답 안정성 | provider별 strict/loose 차이 | tag 응답 파싱은 현재도 fallback 로직 있음. 유지 |
| 모델 ID 라이프사이클 | provider마다 deprecation 일정 다름 | 설정 + .env 동기화 패턴 그대로 활용 |
| 비용 추적 부재 | 옵션 C 보류로 미해결 | 본 검토 범위 밖. 운영 안정화 후 별건 |
| 회귀 위험 | Phase 1 도입 시 기본 동작이 현재와 다를 수 있음 | factory default=claude + 회귀 시나리오 (단일 요약 + 단일 태깅) 필수 |
| 1번 audio merge 작업과 충돌 | 없음 | claude_service / audio_service 영역 완전 분리 |

---

## 7. 2번(Slack/요약 포맷) 작업과의 의존 관계

PM이 처음 제시한 4개 중 2번(요약 화면 포맷 수정)은 **요약 프롬프트 수정**을 동반할 가능성 큼.
- 옵션 B Phase 1 진행 중 요약 프롬프트도 함께 변경 → provider 간 동일 결과 비교 가능
- 따라서 2번을 옵션 B Phase 2와 함께 묶는 것이 효율적

→ 작업 묶음 권장:
- **묶음 X**: 옵션 B Phase 1 + 2번(슬랙 포맷)
- **묶음 Y**: 옵션 B Phase 2 + 2번(요약 포맷 + 프롬프트)

---

## 8. PM 결정 필요 항목

1. **옵션 A / B / C 중 선택** — 권장 B
2. **2-4 별도 발견 fix 시점** — B 도입 시 자연 해결 / 단독 fix / 보류
3. **Phase 2 provider 선택** — OpenAI / Gemini / Local 중 1개 (권장 Gemini)
4. **2번 작업 묶음 방식** — 본 §7 묶음 X/Y 채택 여부
5. **착수 시점** — 1번 audio merge 검수 통과 후 / 병행

---

## 9. 다음 단계

- [ ] PM 결정 수신 → 결정 시 `reports/PLAN-DEV-HANDOFF-20260601.md` 작성하여 개발 발주
- [ ] 1번 audio merge 개발 반영 결과 수신 (병행)
- [ ] 4번 MacBook Whisper 설치는 1번 검수 통과 후 자연 진행
- [ ] `reports/PLAN-SESSION-RESUME-20260601.md` 작성 (세션 종료 시)

---

## 10. 산출물 목록

| 파일 | 유형 |
|------|------|
| `reports/PLAN-REPORT-20260601.md` | 본 리포트 |
| (대기) `reports/PLAN-DEV-HANDOFF-20260601.md` | PM 옵션 확정 후 |
| (대기) `reports/PLAN-SESSION-RESUME-20260601.md` | 세션 종료 시 |
