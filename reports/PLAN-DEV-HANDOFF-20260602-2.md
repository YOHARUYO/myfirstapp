# 기획→개발 핸드오프 — LLM Provider 추상화 골격 + 모델 ID 동적 로딩 (Phase 1A)

> 작성일: 2026-06-02
> 작성 주체: 기획 세션 (12번째)
> 심각도: 🟢 **Medium** — 운영 차단 없음. 설정 UI에서 모델 변경 미적용 사일런트 버그 해소 + 향후 provider 추가 비용 절감
> 관련 문서: `reports/PLAN-REPORT-20260601.md`(검토 본문)
> 선행 의존: 없음 (1번 audio merge / Phase 1B 모두와 영역 분리)
> 묶음 ID: Phase 1A

---

## 개발 세션 전달 지시사항 (복붙용)

```
PLAN-DEV-HANDOFF-20260602-2.md 읽고 반영 부탁해.
LLM 호출을 provider 추상화 골격(services/llm/{base, claude, factory})으로 분리하고,
현재 Claude 로직을 그쪽으로 이전. claude_service.py는 호환 래퍼로 유지(호출처 변경 0).
설정 모델에 provider 필드 + provider별 설정 영역 추가. 기본값 provider=claude로
회귀 무손.

같이 처리할 별도 fix: 현재 claude_service.py가 모델 ID를 하드코딩
("claude-haiku-4-5-20251001" / "claude-sonnet-4-20250514")해서 설정 UI에서
모델을 바꿔도 실제 호출 모델이 안 바뀜 → 설정의 summary_model/tagging_model을
동적으로 읽도록 수정.

핵심 설계 (기획 확정):
- Phase 1A는 Claude provider만 구현. Gemini/Local/OpenAI는 추후 Phase에서 추가
  (단 base 인터페이스·factory·settings 구조는 처음부터 확장 가능하게)
- 설정 UI에 provider 드롭다운 + 선택된 provider 영역만 노출. 비활성 provider
  설정값은 보존(재선택 시 재입력 불필요)
- "현재 활성 1개" UX — 모든 회의는 활성 provider로 동작. 변경하려면 설정 다녀오기
- 회귀 무손이 1순위. 기본 동작이 현재와 같아야 함 (provider=claude 미선택 시 동일)

검증 필수:
- 기본 설정(provider 미설정)에서 신규 회의 1건 생성 → 요약/태깅 동작 = 현재와 동일
- 설정에서 summary_model을 다른 Claude 모델로 변경 → 신규 요약 호출이 변경된
  모델 ID로 호출됨 (로그 또는 응답 확인)
- claude_service.py의 tag_blocks / summarize_blocks 함수 시그니처·반환값 무변경
  → 호출처 6곳(ai.py, processing.py, history.py 2곳, sessions.py) 코드 변경 0

세션 종료 시 reports/DEV-REPORT-20260602.md 작성 부탁해. 같은 날 1B도 진행될
가능성 있으니 본 작업은 별도 commit으로 마무리.
```

---

## 1. 배경 — 왜 지금 추상화인가

PM 결정 (`PLAN-REPORT-20260601.md` §8 회신):
1. **옵션 B 채택** — Provider 추상화 도입 (옵션 A 단순 모델 ID 동적화는 다른 provider 지원 불가, 옵션 C는 운영 기능 과함)
2. **provider 후보**: Claude / Gemini / Local / OpenAI(선택)
3. **"섞어 쓰고 싶다" 의도 명확화**: 사용자가 설정에서 자유롭게 변경하면서 사용하고 싶다는 의미. 한 시점 활성 1개
4. **별도 fix(모델 ID 하드코딩) 함께 진행** — 본 핸드오프에 포함

본 핸드오프는 **Phase 1A: 추상화 골격 + Claude만 구현**이다. Phase 2(Local), Phase 3(Gemini), Phase 4(OpenAI 선택)는 후속.

---

## 2. 기획 결정 (확정)

| 항목 | 결정 | 사유 |
|------|------|------|
| 추상화 형태 | `services/llm/` 디렉토리에 base + provider별 파일 + factory | 확장성·격리·테스트 용이 |
| Phase 1A 범위 | **Claude provider만 구현** + 골격 | 회귀 검증 단순화. provider 추가 비용은 골격 도입 후 작아짐 |
| 호환 래퍼 | `claude_service.py`의 `tag_blocks`/`summarize_blocks` 시그니처·반환 **유지** | 호출처 6곳 코드 변경 0 |
| factory 기본값 | 미설정 시 `provider="claude"` | 회귀 무손 |
| 설정 UI | provider 드롭다운 + 선택된 provider만 입력 영역 노출 | 단순. 비활성 설정값은 보존 |
| 모델 ID 동적 로딩 | settings의 `summary_model`/`tagging_model`을 매 호출 시 읽기 | 사일런트 버그 해소 |
| 모델 기본값 | 현재 하드코딩 값 그대로 (Sonnet 4.0 / Haiku 4.5) | 회귀 위험 0. 사용자가 설정에서 최신으로 업그레이드 가능 |
| API 키 관리 | `backend/.env` + `settings.json` 둘 다 지원 (settings 우선, env fallback) | 현재 Claude 패턴 확장 |
| 다른 provider 자리만 만들기 | Gemini/Local/OpenAI는 `base.py` 인터페이스 호환되도록 자리만 마련, 실제 구현은 Phase 2~4 | 골격 검증 우선 |

---

## 3. 현재 코드 상태 (수정 대상)

| 파일 | 현재 | 변경 |
|------|------|------|
| `backend/services/claude_service.py` | 185줄, `anthropic` SDK 직접 호출, 모델 ID 하드코딩 | **호환 래퍼**로 축소 (factory 호출 + 결과 반환) |
| `backend/services/llm/` | 디렉토리 없음 | 신규 생성 — `base.py`, `claude.py`, `factory.py`, `__init__.py` |
| `backend/models/settings.py` | `ClaudeSettings(api_key, summary_model, tagging_model)` 단독 | `LLMSettings` 추가 + 기존 `ClaudeSettings` 유지(호환) |
| `backend/routers/settings.py` | `UpdateClaudeSettings`, .env 동기화 (Claude 한정) | `UpdateLLMSettings` 추가, provider별 .env 동기화 확장 |
| `backend/config.py` | `ANTHROPIC_API_KEY`만 로드 | provider별 키 로드 자리 마련 (Phase 1A는 Anthropic만 실제 사용) |
| `frontend/src/pages/Settings.tsx` | Claude API 키 입력 + 모델 드롭다운 | provider 드롭다운 + 선택된 provider 영역 노출 |
| `frontend/src/types/index.ts` | `ClaudeSettings` 타입 | `LLMSettings` 추가 |
| `frontend/src/api/...` | settings GET/PATCH | LLM 필드 포함 |

> **호출처(`ai.py`, `processing.py`, `history.py`, `sessions.py`)는 변경 없음**. `claude_service.tag_blocks` / `summarize_blocks` 시그니처와 반환을 유지하는 것이 1A의 핵심 안전장치.

---

## 4. 수정 명세

### 4.1 `services/llm/base.py` (신규)

```python
from abc import ABC, abstractmethod
from typing import List
from models.block import Block

class LLMProvider(ABC):
    """LLM provider 추상 인터페이스. tag/summarize 두 책임."""

    @abstractmethod
    def tag(
        self,
        blocks: List[Block],
        title: str = "",
        participants: List[str] | None = None,
    ) -> dict[str, str]:
        """Returns {block_id: importance}. user 태그 보존 책임은 호출자."""

    @abstractmethod
    def summarize(
        self,
        blocks: List[Block],
        title: str = "",
        participants: List[str] | None = None,
        date: str = "",
    ) -> str:
        """Returns raw markdown response. Keywords 줄 포함, ## 회의 개요 미포함."""
```

- 반환 타입은 현재 `claude_service`의 두 함수와 동일
- importance 필터링(`importance_source != "user"`)은 호출자(`ai.py` 등)가 이미 처리 → provider는 **모든 블록을 입력받고 모두에 대해 결과 반환** 권장
  - 또는 base에서 필터 책임을 명시(현재 claude_service.tag_blocks가 내부에서 필터링). 둘 중 하나 선택, 단 호환 래퍼 동작은 변하지 말 것

### 4.2 `services/llm/claude.py` (신규)

- 현재 `claude_service.py`의 본문을 `ClaudeProvider(LLMProvider)` 클래스로 이전
- `_get_client()`를 인스턴스 메서드로 (또는 모듈 캐시 유지)
- `TAGGING_SYSTEM_PROMPT`, `SUMMARY_SYSTEM_PROMPT`는 그대로 (Phase 1A에서 프롬프트 변경 없음. Phase 1B에서 슬랙 포맷 변경 시 일부 수정 예정)
- 모델 ID는 **settings에서 동적 로딩**:
  ```python
  class ClaudeProvider(LLMProvider):
      def __init__(self, config: dict):
          # config = {"api_key", "summary_model", "tagging_model"}
          self.config = config
          self._client = None

      def _get_client(self):
          if self._client is None:
              key = self.config.get("api_key") or ANTHROPIC_API_KEY
              self._client = anthropic.Anthropic(api_key=key)
          return self._client

      def tag(self, blocks, title="", participants=None) -> dict[str, str]:
          # 현재 claude_service.tag_blocks 본문을 이쪽으로 이전
          # model = self.config.get("tagging_model") or "claude-haiku-4-5-20251001"
          ...

      def summarize(self, blocks, title="", participants=None, date="") -> str:
          # 현재 claude_service.summarize_blocks 본문 이전
          # model = self.config.get("summary_model") or "claude-sonnet-4-20250514"
          ...
  ```

- API 키 fallback 우선순위: `config.api_key` → `ANTHROPIC_API_KEY` (env) → 빈 문자열(에러)
- 모델 ID fallback: `config.summary_model` → 코드 기본값(현재 하드코딩 값)

### 4.3 `services/llm/factory.py` (신규)

```python
from services.llm.base import LLMProvider
from services.llm.claude import ClaudeProvider

def get_provider() -> LLMProvider:
    """Load active provider from settings.json + env fallback."""
    from routers.settings import _load_settings  # 또는 별도 모듈로 이동 고려
    settings = _load_settings()
    llm = getattr(settings, "llm", None)

    # Phase 1A: provider 미설정 시 claude 기본
    provider = (llm.provider if llm else None) or "claude"

    if provider == "claude":
        config = (llm.providers.get("claude").model_dump() if llm and llm.providers.get("claude") else {})
        # 호환: 구 ClaudeSettings도 fallback
        if not config and settings.claude:
            config = settings.claude.model_dump()
        return ClaudeProvider(config)

    # Phase 2~4 자리만
    if provider in ("gemini", "local", "openai"):
        raise NotImplementedError(f"Provider '{provider}' is not yet implemented (Phase {2 if provider=='local' else 3}).")

    raise ValueError(f"Unknown provider: {provider}")
```

- **factory는 매 호출 시 settings 읽기**(매 호출 호출자 → factory → settings 재로딩). 회의 중 설정 변경도 다음 호출부터 즉시 반영
- 성능 우려: settings.json은 작은 JSON. 재로딩 부담 무시 가능. 캐싱은 Phase 1A에서 불필요
- 미구현 provider 선택 시: `NotImplementedError` raise → 사용자에게 명확한 메시지

### 4.4 `services/claude_service.py` 호환 래퍼

```python
# 기존 본문 전부 제거. 호환 래퍼로:
from typing import List
from models.block import Block
from services.llm.factory import get_provider

def tag_blocks(blocks: List[Block], title: str = "", participants: List[str] | None = None) -> dict[str, str]:
    # 현재 함수의 user 태그 필터링 보존
    untagged = [b for b in blocks if b.importance_source != "user"]
    if not untagged:
        return {}
    provider = get_provider()
    return provider.tag(untagged, title, participants)

def summarize_blocks(blocks, title="", participants=None, date="") -> str:
    provider = get_provider()
    return provider.summarize(blocks, title, participants, date)
```

- 호출처 6곳 코드 변경 0
- `user 태그 필터링`을 claude_service에 두는지 base.py에 두는지: **claude_service 래퍼에 두는 게 안전** (provider 구현은 순수, importance_source 의미는 도메인이라 호출자/래퍼 책임)

### 4.5 `models/settings.py`

```python
class ProviderConfig(BaseModel):
    api_key: str = ""
    summary_model: str = ""
    tagging_model: str = ""
    # Local provider 전용 필드는 Phase 2에서 추가 (host, port, model_name)

class LLMSettings(BaseModel):
    provider: str = "claude"  # "claude" | "gemini" | "local" | "openai"
    providers: dict[str, ProviderConfig] = Field(default_factory=lambda: {
        "claude": ProviderConfig(),
        "gemini": ProviderConfig(),
        "local": ProviderConfig(),
        "openai": ProviderConfig(),
    })

class AppSettings(BaseModel):
    slack: SlackSettings = Field(default_factory=SlackSettings)
    llm: LLMSettings = Field(default_factory=LLMSettings)
    claude: ClaudeSettings = Field(default_factory=ClaudeSettings)  # 호환용 유지 (구 데이터)
    whisper: WhisperSettings = Field(default_factory=WhisperSettings)
    slack_greeting: str = "오늘 진행된 회의 회의록 공유드립니다~!"
    summary_template: str = "default"
    mic_sensitivity: float = 1.0
```

- `claude` 필드는 호환용 유지 (기존 settings.json은 그대로 동작). 신규 저장 시에는 `llm.providers.claude`에 쓰기 권장
- `providers.local`은 Phase 2에서 `host`, `port`, `model_name` 등 추가 시 `ProviderConfig` 서브클래스 또는 dict 확장으로 처리 (Phase 1A에서는 빈 필드)

### 4.6 `routers/settings.py`

```python
class UpdateProviderConfig(BaseModel):
    api_key: Optional[str] = None
    summary_model: Optional[str] = None
    tagging_model: Optional[str] = None

class UpdateLLMSettings(BaseModel):
    provider: Optional[str] = None
    providers: Optional[dict[str, UpdateProviderConfig]] = None

class UpdateSettingsRequest(BaseModel):
    slack: Optional[UpdateSlackSettings] = None
    llm: Optional[UpdateLLMSettings] = None
    claude: Optional[UpdateClaudeSettings] = None  # 호환
    whisper: Optional[UpdateWhisperSettings] = None
    slack_greeting: Optional[str] = None
    summary_template: Optional[str] = None
    mic_sensitivity: Optional[float] = None
```

- PATCH 흐름: `req.llm`이 있으면 `settings.llm` 부분 갱신
- `.env` 동기화는 Claude API 키만 (Phase 1A). Phase 2부터 provider별 env 키 추가
- `_mask_response`: `llm.providers.claude.api_key`도 마스킹 처리 추가

### 4.7 모델 ID 하드코딩 fix — 별도 fix

- `services/llm/claude.py`에서 모델 ID를 settings에서 읽도록 (4.2 명세에 이미 포함)
- 신규 회의 생성 시 즉시 적용 확인 — 검증 §5.2 #5
- **결과적으로 별도 fix는 Phase 1A 안에서 자연 해결**됨 (단독 별건 발주 불필요)

### 4.8 Frontend `Settings.tsx`

- **provider 드롭다운** 추가 (Claude / Gemini / Local / OpenAI)
- 선택된 provider의 입력 영역만 표시
- 미구현 provider 선택 시 안내 배지 "Phase 2 도입 예정 (현재 미지원)" 표시 + 저장은 가능하나 실제 호출 시 에러 발생
- 마스킹 표시 유지 (현재 `_mask_response` 패턴)
- 기본값은 Claude

> 미구현 provider 선택 후 회의 진행 시 호출 시점에 NotImplementedError 발생 — 사용자 UX 보호를 위해 frontend가 저장 직전에 "이 provider는 아직 사용할 수 없습니다. Claude를 선택해주세요" 안내 다이얼로그 권장 (또는 backend가 PATCH 시점에 400 응답)

### 4.9 `types/index.ts`

```typescript
export interface ProviderConfig {
  api_key?: string;
  summary_model?: string;
  tagging_model?: string;
}

export interface LLMSettings {
  provider: 'claude' | 'gemini' | 'local' | 'openai';
  providers: {
    claude: ProviderConfig;
    gemini: ProviderConfig;
    local: ProviderConfig;
    openai: ProviderConfig;
  };
}

export interface AppSettings {
  slack: SlackSettings;
  llm: LLMSettings;
  claude: ClaudeSettings; // 호환
  whisper: WhisperSettings;
  // ...
}
```

---

## 5. 검증 시나리오

### 5.1 회귀 (최우선, 반드시 통과)
1. **기존 settings.json 그대로 로드** → `AppSettings` validation 통과 (호환 필드 덕분)
2. **provider 미설정 상태에서 신규 회의 생성 → 요약 + 태깅** → 현재와 byte-identical 결과 (모델 호출 모델 ID·system prompt 동일)
3. **호출처 6곳 코드 변경 0 확인** — git diff에서 `claude_service.py`만 변경, `ai.py`/`processing.py`/`history.py`/`sessions.py` 무변경

### 5.2 신규 동작
4. **설정에서 provider=claude + summary_model 변경 (예: 다른 Claude 모델 ID)** → 신규 요약 호출이 변경된 모델로 호출됨 (로그 또는 SDK 응답 model 필드로 확인)
5. **설정에서 api_key 변경** → 신규 호출이 변경된 키로 인증됨 (잘못된 키 입력 시 401 에러 즉시 확인)
6. **설정에서 provider=gemini 또는 local 또는 openai 선택 후 저장 → 회의 요약 시도** → 명확한 에러 메시지 ("Phase 2 도입 예정") 또는 PATCH 시점 400 응답

### 5.3 회귀 추가
7. **history 재요약, ai 태깅, 신규 세션 요약** 모든 경로에서 회귀 무손
8. **factory가 매 호출 시 settings 재로딩** → 회의 중 설정 변경 시 다음 호출부터 즉시 반영(테스트 케이스: 회의 진행 중 설정 변경 → 다음 태깅 호출이 새 키로)

### 5.4 UI
9. **Settings 화면 진입** → provider 드롭다운 + Claude 영역 노출
10. **drop down 다른 provider 선택** → 안내 배지 + 입력 영역 노출(저장 시 미구현 안내)
11. **드롭다운 Claude 재선택** → 기존 입력값 유지 (보존)

---

## 6. 영향 범위

| 영역 | 변화 | 위험 |
|------|------|------|
| LLM 호출 진입점 | `claude_service`가 호환 래퍼로 축소 | ✅ 시그니처 무변경, 회귀 위험 낮음 |
| 호출처 6곳 | 변화 없음 | ✅ |
| settings.json 스키마 | `llm` 필드 추가, `claude` 호환 유지 | ⚠ 기존 데이터 호환 검증(§5.1 #1) |
| .env | Phase 1A는 ANTHROPIC_API_KEY 그대로 | ✅ |
| 신규 회의 요약·태깅 | 모델 ID·system prompt 동일 → byte-identical 결과 | ✅ |
| Settings UI | provider 드롭다운 + 영역 분기 | ⚠ 디자인 시스템 토큰 준수 |
| Phase 1B / 1번 audio merge | 영역 분리 | ✅ 충돌 없음 |

---

## 7. 권장 작업 순서

1. `services/llm/base.py` + `services/llm/__init__.py` 신규 — 인터페이스부터
2. `services/llm/claude.py` — `claude_service.py` 본문 이전 + 모델 ID 동적
3. `services/llm/factory.py` — provider 분기 + claude 기본값
4. `models/settings.py` `LLMSettings` 추가 — 호환 유지
5. `services/claude_service.py` 호환 래퍼로 축소 → **5.1 회귀 시나리오 #2~3 확인 (필수 통과)**
6. `routers/settings.py` PATCH 확장 + `_mask_response` 갱신
7. `frontend/types/index.ts` + `Settings.tsx` — provider 드롭다운
8. 5.2~5.4 검증
9. `reports/DEV-REPORT-20260602.md` 작성. 같은 날 1B도 진행될 수 있으니 본 작업은 **별도 commit**으로 마무리(commit 메시지에 "Phase 1A" 명시 권장)

---

## 8. 우선순위

🟢 **Medium** — 사용자가 명시한 "여러 LLM 변경하면서 사용" 의도의 1단계 골격. Phase 2(Local)·3(Gemini)이 의존. 회귀 위험은 낮으나 LLM 호출 전체 영역 변경이라 단독 검증 가치 큼 (PM이 별도 발주 결정).

---

## 9. 비변경 항목 (명시)

- `tag_blocks` / `summarize_blocks` 함수 시그니처·반환 — **유지** (호출처 6곳 무영향)
- `TAGGING_SYSTEM_PROMPT` / `SUMMARY_SYSTEM_PROMPT` 텍스트 — Phase 1A에서 무변경 (Phase 1B의 슬랙 포맷 작업에서 일부 변경 예정)
- `models/block.py` / `Block` 구조 — 무변경
- `models/session.py` / `models/meeting.py` — 무변경
- `routers/ai.py` / `processing.py` / `history.py` / `sessions.py` — 무변경 (LLM 호출처)
- 기존 settings.json 데이터 — 호환 (호환 필드로 처리)
- Slack / Whisper / Audio 영역 — 본 핸드오프 범위 아님

---

## 10. Phase 1B / 1번 audio merge와의 영역 분리

| 영역 | Phase 1A (본건) | Phase 1B | 1번 audio merge |
|------|----------------|----------|----------------|
| `services/llm/` | **신규** | 변경 없음 | 변경 없음 |
| `services/claude_service.py` | 호환 래퍼로 축소 | **프롬프트 텍스트만 변경** (1A의 ClaudeProvider 내부) | 변경 없음 |
| `models/settings.py` | `LLMSettings` 추가 | 변경 없음 | 변경 없음 |
| `routers/settings.py` | LLM 필드 PATCH | 변경 없음 | 변경 없음 |
| `Settings.tsx` | provider 드롭다운 | 변경 없음 | 변경 없음 |
| `routers/slack.py` | 변경 없음 | **빌더·전송 흐름 변경** | 변경 없음 |
| `models/meeting.py` | 변경 없음 | SlackSentInfo 확장 | 변경 없음 |
| `TagInput.tsx` / `HistoryDetail.tsx` | 변경 없음 | IME / prefill / 제목 fix | 변경 없음 |
| `services/audio_service.py` | 변경 없음 | 변경 없음 | **multi-segment 분기** |
| `routers/history.py` `_resolve_meeting_audio` | 변경 없음 | 변경 없음 | 손상 감지 분기 |

→ 세 작업이 **상호 충돌 영역 0**. 발주는 PM 순서 결정에 따라 (현재: 1번 → 1A → 1B).
