import json
import logging

import anthropic
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

logger = logging.getLogger(__name__)

from config import DATA_DIR
from models.settings import (
    AppSettings,
    SlackSettings,
    ClaudeSettings,
    WhisperSettings,
    LLMSettings,
    ProviderConfig,
)

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


def _mask_api_key(key: str) -> str:
    if not key:
        return ""
    if len(key) > 14:
        return f"{key[:10]}...{key[-4:]}"
    return f"{key[:4]}..."


def _mask_response(settings: AppSettings) -> dict:
    from config import ANTHROPIC_API_KEY, SLACK_BOT_TOKEN

    data = settings.model_dump()

    # Slack
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

    # Legacy claude field (호환)
    legacy_key = data.get("claude", {}).get("api_key", "") or ANTHROPIC_API_KEY
    data["claude"]["api_key"] = _mask_api_key(legacy_key)

    # LLM providers — api_key 마스킹 (현재 보유 키 + env fallback)
    llm_data = data.get("llm", {})
    providers = llm_data.get("providers", {})
    for name, cfg in providers.items():
        raw_key = cfg.get("api_key", "")
        if name == "claude" and not raw_key:
            raw_key = ANTHROPIC_API_KEY
        cfg["api_key"] = _mask_api_key(raw_key)

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
    claude: Optional[UpdateClaudeSettings] = None
    whisper: Optional[UpdateWhisperSettings] = None
    slack_greeting: Optional[str] = None
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


def _verify_claude_api_key(api_key: str) -> tuple[bool, Optional[str]]:
    """Verify an Anthropic API key with a cheap models.list() call.

    Returns (verified, warning_message).
    - (True, None) on success
    - Raises HTTPException(400) on AuthenticationError (caller will propagate)
    - (False, "<msg>") on network/transient errors (caller decides to allow save with warning)
    """
    try:
        client = anthropic.Anthropic(api_key=api_key)
        client.models.list(limit=1)
        return True, None
    except anthropic.AuthenticationError:
        raise HTTPException(
            status_code=400,
            detail="유효하지 않은 API 키입니다. 다시 확인해주세요.",
        )
    except anthropic.APIError as e:
        logger.warning(f"[settings] API key verify network/transient error: {e!s}")
        return False, f"키 검증 실패(네트워크): {e!s}"
    except Exception as e:
        logger.warning(f"[settings] API key verify unexpected error: {e!s}")
        return False, f"키 검증 실패: {e!s}"


def _apply_llm_update(settings: AppSettings, req_llm: UpdateLLMSettings) -> Optional[str]:
    """Merge UpdateLLMSettings into AppSettings.llm. Returns new claude api_key if it changed (for .env sync)."""
    if req_llm.provider is not None:
        settings.llm.provider = req_llm.provider

    new_claude_key: Optional[str] = None
    if req_llm.providers:
        for name, update in req_llm.providers.items():
            current = settings.llm.providers.get(name) or ProviderConfig()
            patch = update.model_dump(exclude_none=True)
            merged = current.model_copy(update=patch)
            settings.llm.providers[name] = merged
            if name == "claude" and "api_key" in patch:
                key = patch["api_key"]
                if key and "..." not in key:
                    new_claude_key = key

    return new_claude_key


def _extract_new_claude_key(req: UpdateSettingsRequest) -> Optional[str]:
    """Pull a plaintext (non-masked) new claude api_key from either legacy claude.* or llm.providers.claude.*"""
    if req.claude and req.claude.api_key and "..." not in req.claude.api_key:
        return req.claude.api_key
    if req.llm and req.llm.providers:
        cfg = req.llm.providers.get("claude")
        if cfg and cfg.api_key and "..." not in cfg.api_key:
            return cfg.api_key
    return None


@router.patch("")
def update_settings(req: UpdateSettingsRequest):
    settings = _load_settings()

    # 1) Claude API 키가 새로 들어왔다면 저장 전 인증 검증.
    #    인증 실패 → 400 raise(저장 거부). 네트워크 오류 → 저장 허용 + 경고 메시지.
    new_claude_key = _extract_new_claude_key(req)
    verify_warning: Optional[str] = None
    if new_claude_key:
        _, verify_warning = _verify_claude_api_key(new_claude_key)

    if req.slack:
        update = req.slack.model_dump(exclude_none=True)
        settings.slack = settings.slack.model_copy(update=update)
    if req.claude:
        update = req.claude.model_dump(exclude_none=True)
        settings.claude = settings.claude.model_copy(update=update)
    if req.whisper:
        update = req.whisper.model_dump(exclude_none=True)
        settings.whisper = settings.whisper.model_copy(update=update)

    if req.llm:
        _apply_llm_update(settings, req.llm)

    flat_update = req.model_dump(
        exclude_none=True,
        exclude={"slack", "llm", "claude", "whisper"},
    )
    for key, value in flat_update.items():
        setattr(settings, key, value)

    _save_settings(settings)

    # .env 동기화 (마스킹된 값은 제외)
    if req.slack and req.slack.bot_token and "..." not in req.slack.bot_token:
        _sync_env("SLACK_BOT_TOKEN", req.slack.bot_token)
    if new_claude_key:
        _sync_env("ANTHROPIC_API_KEY", new_claude_key)

    response = _mask_response(settings)
    if verify_warning:
        response["_warning"] = verify_warning
    return response
