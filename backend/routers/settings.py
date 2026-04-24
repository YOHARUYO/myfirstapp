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
    from config import ANTHROPIC_API_KEY, SLACK_BOT_TOKEN

    data = settings.model_dump()

    # settings.json에 없으면 .env 값 fallback
    token = data.get("slack", {}).get("bot_token", "") or SLACK_BOT_TOKEN
    if token and len(token) > 12:
        data["slack"]["bot_token"] = f"{token[:8]}...{token[-4:]}"
        data["slack"]["connected"] = True
    elif token:
        data["slack"]["bot_token"] = f"{token[:4]}..."
        data["slack"]["connected"] = True
    else:
        data["slack"]["bot_token"] = ""
        data["slack"]["connected"] = False

    key = data.get("claude", {}).get("api_key", "") or ANTHROPIC_API_KEY
    if key and len(key) > 14:
        data["claude"]["api_key"] = f"{key[:10]}...{key[-4:]}"
    elif key:
        data["claude"]["api_key"] = f"{key[:4]}..."
    else:
        data["claude"]["api_key"] = ""

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
    mic_sensitivity: Optional[float] = None


def _sync_env(key: str, value: str):
    """Update a key in backend/.env file."""
    from pathlib import Path
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if not env_path.exists():
        return
    lines = env_path.read_text(encoding="utf-8").splitlines()
    updated = False
    for i, line in enumerate(lines):
        if line.startswith(f"{key}="):
            lines[i] = f"{key}={value}"
            updated = True
            break
    if not updated:
        lines.append(f"{key}={value}")
    env_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


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

    # .env 동기화 (마스킹된 값은 제외)
    if req.slack and req.slack.bot_token and "..." not in req.slack.bot_token:
        _sync_env("SLACK_BOT_TOKEN", req.slack.bot_token)
    if req.claude and req.claude.api_key and "..." not in req.claude.api_key:
        _sync_env("ANTHROPIC_API_KEY", req.claude.api_key)

    return _mask_response(settings)
