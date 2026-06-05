from services.llm.base import LLMProvider
from services.llm.claude import ClaudeProvider


_PHASE_BY_PROVIDER = {"local": 2, "gemini": 3, "openai": 4}


def get_provider() -> LLMProvider:
    """Load active provider from settings.json + env fallback. Called per invocation.

    settings.json은 작은 파일이라 매 호출 재로딩 부담 무시 가능.
    회의 중 설정 변경도 다음 호출부터 즉시 반영된다.
    """
    # lazy import — routers.settings는 services를 import할 수 있어 circular 회피
    from routers.settings import _load_settings

    settings = _load_settings()
    llm = getattr(settings, "llm", None)
    provider = (llm.provider if llm else None) or "claude"

    if provider == "claude":
        config: dict = {}
        if llm and llm.providers and "claude" in llm.providers:
            config = llm.providers["claude"].model_dump()
        # 신규 llm.providers.claude가 비어있으면 호환용 claude 필드 fallback
        if not any(config.values()) and settings.claude:
            config = settings.claude.model_dump()
        return ClaudeProvider(config)

    if provider in _PHASE_BY_PROVIDER:
        phase = _PHASE_BY_PROVIDER[provider]
        raise NotImplementedError(
            f"Provider '{provider}' is not yet implemented (Phase {phase})."
        )

    raise ValueError(f"Unknown provider: {provider}")
