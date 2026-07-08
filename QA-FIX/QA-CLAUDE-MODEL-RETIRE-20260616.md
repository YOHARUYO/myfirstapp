# QA-FIX — Claude 모델 retire 대응 + leftover 정리

> 작성일: 2026-06-16
> 작성 주체: 검수 세션
> 심각도: 🟡 **Medium** — 본 PM 환경 운영은 Settings UI 모델 ID 갱신으로 임시 복구 완료. 단 placeholder·코드 default·에러 안내의 leftover가 남아 있어 다음 retire 또는 다른 환경(맥북 production 셋업) 첫 가동 시 동일 장애 재발 확실 → 본 fix로 영구 차단
> 선행 의존: 옵션 B Phase 1A (06-05 `1a5b570`) 완료 상태 전제. 호출 흐름·factory·provider 구조는 그대로 유지하고 leftover 문자열만 갱신
> 관련 문서: `reports/PLAN-REPORT-20260601.md` §2-4 (별도 발견 사항, "옵션 B 도입 시 자연 해결" 미뤄둔 항목)

---

## 개발 세션 전달 지시사항 (복붙용)

```
QA-FIX/QA-CLAUDE-MODEL-RETIRE-20260616.md 읽고 반영 부탁해.
오늘 PM이 회의 직전에 LLM API 404로 운영 차단(블록 병합 실패 토스트 + cloudflare 502)을 겪었고,
Settings UI에서 모델 ID를 현행 Sonnet으로 갱신해 즉시 복구는 끝났어. 단 placeholder/코드 default가
여전히 retire된 `claude-sonnet-4-20250514`를 안내하고 있어 다음 retire 또는 다른 환경(맥북 신규
셋업)에서 재발 확실 — 그 leftover 4곳 + 사용자 안내 보강 1건이 본 fix 범위.

핵심:
- placeholder 2곳(Settings.tsx:517, 528) 갱신
- 코드 default 2곳(claude.py:15, settings.py:14) 갱신 — 현행 ID는 백엔드 venv에서 `models.list()` 호출로 확보
- LLM 호출 404(model) → 한국어 안내로 변환 (claude_service.py:_safe_call)
- 회의 데이터/세션/Phase 1A·1B 영역 무영향. 단독 commit 권장.

세션 종료 시 reports/DEV-REPORT-20260616.md 작성 부탁해.
```

---

## 1. 배경 — 무엇이 일어났나

2026-06-16 PM 회의 직전 보고가 검수 세션으로 들어옴:

- cloudflared 응답: "The origin web server returned an invalid or incomplete response"
- 백엔드 콘솔: `POST /api/meetings/mtg_20260616_9cfbfb4e/resummarize HTTP/1.1 502 Bad Gateway`
- 5174 직접 요약 시도: `LLM API 오류 (404): Error code: 404 - {'type': 'error', 'error': {'type': 'not_found_error', 'message': 'model: claude-sonnet-4-20250514'}}`
- 블록 병합 실패 토스트 — 동일 모델을 호출하는 재태깅 경로 연쇄

### 진단 체인

```
Anthropic API: claude-sonnet-4-20250514 retire → 404 not_found_error
   ↓
services/llm/claude.py:ClaudeProvider.summarize → anthropic.APIStatusError
   ↓
services/claude_service.py:_safe_call → HTTPException(502, "LLM API 오류 (404)...")
   ↓
Vite proxy → cloudflared → "incomplete response" / 502 Bad Gateway 사용자 표시
```

### PM 조치 (운영 복구 완료)

1. 백엔드 venv에서 `models.list()` 호출 → 현행 Sonnet 모델 ID 확인
2. Settings 화면 → LLM Provider "Claude" → 요약 모델 칸에 현행 ID 입력 → 저장
3. `factory.py:get_provider`가 매 호출 settings.json 재로딩 → **백엔드 재시작 없이 즉시 적용**
4. 재요약 200 정상 확인

---

## 2. 본 fix가 잡아야 하는 잔존 위험

| # | 위치 | 현재 값 | 위험 |
|---|------|--------|------|
| 1 | `frontend/src/pages/Settings.tsx:517` 요약 모델 placeholder | `'claude-sonnet-4-20250514 (비워두면 기본값)'` | 다음 retire 시 PM이 placeholder를 그대로 입력 → 또 같은 장애. retire 모델 문자열을 사용자에게 안내하는 본질적 결함 |
| 2 | `frontend/src/pages/Settings.tsx:528` 태깅 모델 placeholder | `'claude-haiku-4-5-20251001 (비워두면 기본값)'` | Haiku는 현재 유효하지만 동일 패턴 — Haiku도 언젠가 retire |
| 3 | `backend/services/llm/claude.py:15` `DEFAULT_SUMMARY_MODEL` | `"claude-sonnet-4-20250514"` | settings.json이 비어있는 환경(맥북 신규 셋업, 다른 기기)에서 fallback으로 retire 모델 사용 → 동일 장애 |
| 4 | `backend/models/settings.py:14` `ClaudeSettings.summary_model` default | `"claude-sonnet-4-20250514"` | `factory.py:26-27`의 legacy `claude` 필드 fallback 경로 → 동일 |
| 5 | `backend/services/claude_service.py:32-36` `_safe_call` `APIStatusError` 분기 | anthropic 에러 detail 그대로 502 전파 (`f"LLM API 오류 ({e.status_code}): {e!s}"`) | 사용자가 토스트에서 보는 메시지가 영문 + 코드 — 본 사건처럼 retire가 또 나면 원인 파악·복구까지 시간 소요 |

> #3·#4는 **본 PM Windows 환경에는 영향 없음**(이미 settings.json에 갱신값 들어감). 다른 환경(맥북 production 셋업)에서만 재발. 따라서 본 PM 회의 진행에는 직접 영향 없지만 다음 환경 셋업 직전에는 반드시 처리되어 있어야 함.

---

## 3. 수정 명세

### 3.1 placeholder 갱신 (frontend, 2곳)

`frontend/src/pages/Settings.tsx`:

```tsx
// Line 517 — 요약 모델
placeholder={llmProvider === 'claude' ? '예: claude-sonnet-4-5-xxxxxxxx (비워두면 최신 기본값)' : '(provider별 모델 ID)'}

// Line 528 — 태깅 모델
placeholder={llmProvider === 'claude' ? '예: claude-haiku-4-5-xxxxxxxx (비워두면 최신 기본값)' : '(provider별 모델 ID)'}
```

- 정확한 ID 대신 **"예:" 형식 + 패턴만** 안내 → retire 시점에 placeholder가 사용자를 잘못 인도하는 위험 차단
- 진짜 최신 ID는 코드 default(3.2)가 잡으므로 placeholder는 입력 형식 가이드 용도로 충분
- `xxxxxxxx` 자리표시자는 사용자가 그대로 입력하지 않도록 명백히 형식임을 드러냄

### 3.2 코드 default 갱신 (backend, 2곳)

본 fix 진행 직전 백엔드 venv에서 한 번 더 `models.list()` 호출해 현행 Sonnet 모델 ID 확보 후 두 곳 동시 교체:

```python
# backend/services/llm/claude.py:15
DEFAULT_SUMMARY_MODEL = "<현행 Sonnet 모델 ID — 본 fix 시점에 models.list()로 확보>"

# backend/models/settings.py:14
class ClaudeSettings(BaseModel):
    api_key: str = ""
    summary_model: str = "<현행 Sonnet 모델 ID — 위와 동일 값>"
    tagging_model: str = "claude-haiku-4-5-20251001"  # 현재 유효, 변경 불필요
```

- 두 곳 모두 같은 값으로 갱신 (factory의 우선순위 두 경로 모두 안전)
- 정확한 ID는 PM 환경 `backend/data/settings.json`의 `llm.providers.claude.summary_model`에 이미 저장된 값과 일치하는지 교차 확인 권장

### 3.3 에러 메시지 한국어 안내 보강 (🟢 Low이지만 본 fix에 포함 권장)

`backend/services/claude_service.py:_safe_call`:

```python
except anthropic.APIStatusError as e:
    detail = f"LLM API 오류 ({e.status_code}): {e!s}"
    # 모델 retire / 미존재 케이스를 한국어 안내로 변환
    error_str = str(e).lower()
    if e.status_code == 404 and ("model" in error_str or "not_found" in error_str):
        detail = (
            "요약·태깅 모델이 더 이상 제공되지 않거나 잘못된 ID입니다. "
            "설정 → 연동 → LLM에서 모델 ID를 최신으로 갱신해주세요. "
            f"(원본: {e!s})"
        )
    raise HTTPException(status_code=502, detail=detail)
```

- 404 + "model"/"not_found" 키워드 매칭에만 swap (다른 404는 영문 그대로 유지)
- 원본 에러 문자열은 detail 끝에 보존 (디버그 정보 손실 0)
- frontend 토스트가 이 detail을 그대로 표시 → PM이 다음 retire 시 즉시 원인 인지 가능

---

## 4. 검증 시나리오

### 4.1 회귀 — 기본 동작 무변경

1. 기존 정상 회의 1건에서 [재요약] → 200 + 요약 정상 (현재 PM settings.json 갱신값 사용 경로)
2. **Settings 화면에서 요약 모델 입력란을 비우고 저장** → 백엔드 콘솔에서 `DEFAULT_SUMMARY_MODEL` 사용 확인 → 재요약 200 (3.2 default 갱신 효과 직접 검증)
3. placeholder가 새 텍스트로 표시되는지 시각 확인 (3.1)

### 4.2 에러 안내 변환 (3.3)

4. 요약 모델 입력란에 일부러 `bogus-model-xxx` 입력 후 저장 (저장 자체는 통과 — 모델 ID는 검증 단계 없음)
5. [재요약] 시도 → 토스트에 한국어 안내 표시: "요약·태깅 모델이 더 이상 제공되지 않거나 잘못된 ID입니다..."
6. 입력란 다시 비우고 저장 → DEFAULT 적용으로 복구 확인

### 4.3 영역 분리

7. 회의 데이터(`backend/data/sessions/`, `backend/data/meetings/`) 무변경 (직접 git diff 확인)
8. Phase 1A/1B 영역 회귀 없음:
   - Slack 포맷 (`[xxx님]` 태그 + 인물별 인접 정렬) 신규 회의 1건으로 확인
   - 재편집 모드 회의 제목 변경 fix (Editing.tsx saveMetadata)
   - TagInput IME 가드

---

## 5. 영향 범위 / 비변경 항목

| 영역 | 영향 |
|------|------|
| `services/llm/factory.py`, `base.py`, `claude.py` 호출 흐름 | ✅ 무변경 (claude.py는 DEFAULT 상수만) |
| `claude_service.py` 함수 시그니처 | ✅ 무변경 (_safe_call 내부 분기만) |
| 회의 데이터 / 세션 / 히스토리 / settings.json | ✅ 무변경 |
| Phase 1B 산출물 (Slack, IME, 회의 제목 fix) | ✅ 무변경 |
| audio_service / merge 로직 (PLAN-DEV-HANDOFF-20260515 산출물) | ✅ 무관 |
| placeholder 텍스트 / DEFAULT 상수 / 에러 메시지 텍스트 | ⚠ 본 fix 변경 표면 |

---

## 6. 권장 작업 순서

1. 백엔드 venv에서 `models.list()` 한 번 호출 → 현행 Sonnet 모델 ID 확보 (정확 ID 1회 확인)
   ```powershell
   cd backend
   python -c "from dotenv import load_dotenv; load_dotenv(); import anthropic; [print(f'{m.id:45s} {m.display_name}') for m in anthropic.Anthropic().models.list(limit=20).data]"
   ```
2. **3.2 default 2곳 갱신** → 4.1 #2 (입력란 비우고 저장 후 재요약 200)
3. **3.1 placeholder 갱신** → frontend `npm run dev`로 시각 확인 (4.1 #3)
4. **3.3 에러 안내 보강** → 4.2 #4·#5 (bogus 모델 입력)
5. 회귀 4.1 #1 + 영역 분리 4.3 #7·#8 (Phase 1B 회귀가 가장 중요)
6. `reports/DEV-REPORT-20260616.md` 작성
7. **단독 commit 권장**. 메시지 예:
   ```
   Claude 모델 retire 대응 — placeholder/default 갱신 + 한국어 안내 (QA-FIX-CLAUDE-MODEL-RETIRE-20260616)
   ```

---

## 7. 우선순위

🟡 **Medium** — PM 본 환경 운영은 임시 복구되어 당장 회의 진행에 직접 영향은 없습니다. 다만:

- 다른 환경(맥북 production 셋업) 첫 가동 시 재발 확실 (#3·#4)
- 다음 Sonnet retire 시 placeholder가 retire 모델을 안내해 PM 혼란 (#1·#2)
- 본 사건처럼 토스트에 영문 에러만 떠 PM이 원인 파악까지 시간 소모 (#5)

→ **1주 내 처리 권장**. 다른 fix와 묶지 말고 단독 commit (인프라성 leftover 정리라 진단 경위가 다른 작업과 분리되어야 추적 명확).

---

## 8. 기획 맥락 — 본 사건의 사전 경고

`reports/PLAN-REPORT-20260601.md` §2-4에서 기획 세션이 이미 짚어둔 위험:

> "claude_service.py가 모델 ID를 하드코딩 → 설정 화면에서 모델을 바꿔도 실제 호출 모델은 변경되지 않음. 또한 모델 ID가 옛 버전 — 옵션 B 도입 시 자연 해결."

옵션 B Phase 1A (06-05 `1a5b570`)에서 **"설정 화면 ↔ 실제 모델 연결"**은 해결되어 본 사건의 즉시 복구가 가능했음. 단 **default/placeholder의 retire 모델 문자열 leftover**는 정리되지 않고 잔존 → 본 fix가 그 잔존을 정리합니다.

본 사건은 옵션 B Phase 1A 도입 가치의 강력한 실증 케이스이기도 합니다 — Phase 1A 이전 구조였다면 코드 변경 + 재시작 없이는 회의 직전 복구가 불가능했습니다.

---

## 9. 비변경 항목 (명시)

- `services/llm/` 내부 구조 (base / factory / claude provider 책임 분할)
- `claude_service.py` 시그니처 (호출처 6곳 무영향)
- settings.json 스키마
- `_verify_claude_api_key` 동작 (API 키 검증 흐름)
- `backend/data/` 전체
- Phase 2 (Local provider) 영역 — 본 fix는 Phase 1 leftover만 정리하며 Phase 2 발주와 독립
