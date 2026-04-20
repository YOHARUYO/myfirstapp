from pydantic import BaseModel, Field
from typing import Optional


class SlackSettings(BaseModel):
    bot_token: str = ""
    connected: bool = False


class ClaudeSettings(BaseModel):
    api_key: str = ""
    summary_model: str = "claude-sonnet-4-20250514"
    tagging_model: str = "claude-haiku-4-5-20251001"


class WhisperSettings(BaseModel):
    model: str = "medium"


class AppSettings(BaseModel):
    slack: SlackSettings = Field(default_factory=SlackSettings)
    claude: ClaudeSettings = Field(default_factory=ClaudeSettings)
    whisper: WhisperSettings = Field(default_factory=WhisperSettings)
    slack_greeting: str = "오늘 진행된 회의 회의록 공유드립니다~!"
    export_path: str = ""
    summary_template: str = "default"
