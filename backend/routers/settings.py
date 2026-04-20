import copy
import json

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

from config import DATA_DIR
from models.settings import AppSettings, SlackSettings, ClaudeSettings, WhisperSettings

router = APIRouter(prefix="/api/settings", tags=["settings"])

SETTINGS_FILE = DATA_DIR / "settings.json"


def _load_settings() -> AppSettings:
    if not SETTINGS_FILE.exists():
        return AppSettings()
    raw = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
    return AppSettings(**raw)


def _save_settings(settings: AppSettings) -> None:
    SETTINGS_FILE.write_text(
        json.dumps(settings.model_dump(), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _mask_response(settings: AppSettings) -> dict:
    data = settings.model_dump()
    token = data.get("slack", {}).get("bot_token", "")
    if token and len(token) > 12:
        data["slack"]["bot_token"] = f"{token[:8]}...{token[-4:]}"
    key = data.get("claude", {}).get("api_key", "")
    if key and len(key) > 14:
        data["claude"]["api_key"] = f"{key[:10]}...{key[-4:]}"
    return data


@router.get("")
def get_settings():
    return _mask_response(_load_settings())


class UpdateSlackSettings(BaseModel):
    bot_token: Optional[str] = None
    connected: Optional[bool] = None


class UpdateClaudeSettings(BaseModel):
    api_key: Optional[str] = None
    summary_model: Optional[str] = None
    tagging_model: Optional[str] = None


class UpdateWhisperSettings(BaseModel):
    model: Optional[str] = None


class UpdateSettingsRequest(BaseModel):
    slack: Optional[UpdateSlackSettings] = None
    claude: Optional[UpdateClaudeSettings] = None
    whisper: Optional[UpdateWhisperSettings] = None
    slack_greeting: Optional[str] = None
    export_path: Optional[str] = None
    summary_template: Optional[str] = None


@router.patch("")
def update_settings(req: UpdateSettingsRequest):
    settings = _load_settings()

    if req.slack:
        update = req.slack.model_dump(exclude_none=True)
        settings.slack = settings.slack.model_copy(update=update)
    if req.claude:
        update = req.claude.model_dump(exclude_none=True)
        settings.claude = settings.claude.model_copy(update=update)
    if req.whisper:
        update = req.whisper.model_dump(exclude_none=True)
        settings.whisper = settings.whisper.model_copy(update=update)

    flat_update = req.model_dump(exclude_none=True, exclude={"slack", "claude", "whisper"})
    for key, value in flat_update.items():
        setattr(settings, key, value)

    _save_settings(settings)
    return _mask_response(settings)
