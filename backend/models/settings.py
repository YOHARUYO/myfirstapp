from pydantic import BaseModel, Field
from typing import Optional


class SlackSettings(BaseModel):
    bot_token: str = ""
    connected: bool = False


class ClaudeSettings(BaseModel):
    """Legacy settings — kept for backward compatibility with existing settings.json.
    신규 코드는 LLMSettings.providers["claude"]를 사용한다."""
    api_key: str = ""
    summary_model: str = "claude-sonnet-4-6"
    tagging_model: str = "claude-haiku-4-5-20251001"


class ProviderConfig(BaseModel):
    api_key: str = ""
    summary_model: str = ""
    tagging_model: str = ""


def _default_providers() -> dict[str, ProviderConfig]:
    return {
        "claude": ProviderConfig(),
        "gemini": ProviderConfig(),
        "local": ProviderConfig(),
        "openai": ProviderConfig(),
    }


class LLMSettings(BaseModel):
    provider: str = "claude"
    providers: dict[str, ProviderConfig] = Field(default_factory=_default_providers)


class WhisperSettings(BaseModel):
    model: str = "medium"


class AppSettings(BaseModel):
    slack: SlackSettings = Field(default_factory=SlackSettings)
    llm: LLMSettings = Field(default_factory=LLMSettings)
    claude: ClaudeSettings = Field(default_factory=ClaudeSettings)
    whisper: WhisperSettings = Field(default_factory=WhisperSettings)
    slack_greeting: str = "오늘 진행된 회의 회의록 공유드립니다~!"
    summary_template: str = "default"
    mic_sensitivity: float = 1.0
