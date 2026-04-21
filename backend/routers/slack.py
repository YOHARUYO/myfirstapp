import re
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from config import SESSIONS_DIR, SLACK_BOT_TOKEN, EXPORT_DIR
from models.session import Session

router = APIRouter(prefix="/api/slack", tags=["slack"])


def _get_slack_client():
    from slack_sdk import WebClient
    if not SLACK_BOT_TOKEN:
        raise HTTPException(status_code=500, detail="Slack Bot Token이 설정되지 않았습니다")
    return WebClient(token=SLACK_BOT_TOKEN)


def _load_session(session_id: str) -> Session:
    if not re.match(r'^[a-zA-Z0-9_-]+$', session_id):
        raise HTTPException(status_code=400, detail="유효하지 않은 세션 ID")
    path = SESSIONS_DIR / session_id / "session.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Session not found")
    return Session.model_validate_json(path.read_text(encoding="utf-8"))


@router.get("/channels")
def list_channels():
    """List channels the bot has joined."""
    client = _get_slack_client()
    try:
        result = client.conversations_list(types="public_channel,private_channel", limit=200)
        channels = [
            {"id": ch["id"], "name": ch["name"]}
            for ch in result.get("channels", [])
            if ch.get("is_member")
        ]
        return {"channels": channels}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Slack API 오류: {str(e)}")


@router.get("/channels/{channel_id}/messages")
def list_messages(channel_id: str, limit: int = 20):
    """List recent messages in a channel (for thread selection)."""
    client = _get_slack_client()
    try:
        result = client.conversations_history(channel=channel_id, limit=limit)
        messages = [
            {
                "ts": msg["ts"],
                "text": msg.get("text", "")[:100],
                "user": msg.get("user", ""),
            }
            for msg in result.get("messages", [])
            if msg.get("subtype") is None  # Skip system messages
        ]
        return {"messages": messages}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Slack API 오류: {str(e)}")


class SlackSendRequest(BaseModel):
    session_id: str
    channel_id: str
    thread_ts: Optional[str] = None
    attach_md: bool = True


def _build_slack_message(session: Session, greeting: str = "") -> str:
    """Build Slack message text from session summary."""
    header = f"[{session.metadata.date or ''} {session.metadata.title}]"

    # Extract topic summaries: ### N. 주제 아래 첫 번째 논의 불릿만
    summary_bullets = []
    if session.summary_markdown:
        sections = session.summary_markdown.split("### ")
        for section in sections[1:]:
            lines = section.strip().split("\n")
            for line in lines:
                if line.strip().startswith("- ") and "F/U" not in line:
                    summary_bullets.append(f"• {line.strip()[2:]}")
                    break

    # F/U bullets from action_items
    fu_bullets = []
    for item in session.action_items:
        line = f"• [@{item.get('assignee', '')}] {item.get('task', '')}" if item.get('assignee') else f"• {item.get('task', '')}"
        if item.get('deadline'):
            line += f" ~{item['deadline']}"
        fu_bullets.append(line)

    parts = [header]
    if greeting:
        parts.append(greeting)
    parts.append("")

    if summary_bullets:
        parts.append("📋 *핵심 요약*")
        parts.extend(summary_bullets)
        parts.append("")

    if fu_bullets:
        parts.append("✅ *F/U 필요 사항*")
        parts.extend(fu_bullets)
        parts.append("")

    parts.append("📎 전체 회의록 첨부")

    return "\n".join(parts)


@router.post("/send")
def send_slack_message(req: SlackSendRequest):
    """Send meeting summary to Slack channel."""
    import json as _json
    from config import DATA_DIR

    client = _get_slack_client()
    session = _load_session(req.session_id)

    greeting = ""
    settings_path = DATA_DIR / "settings.json"
    if settings_path.exists():
        try:
            settings_data = _json.loads(settings_path.read_text(encoding="utf-8"))
            greeting = settings_data.get("slack_greeting", "")
        except Exception:
            pass

    message_text = _build_slack_message(session, greeting)

    try:
        kwargs = {
            "channel": req.channel_id,
            "text": message_text,
        }
        if req.thread_ts:
            kwargs["thread_ts"] = req.thread_ts

        result = client.chat_postMessage(**kwargs)
        message_ts = result.get("ts", "")

        # Upload .md file if requested
        if req.attach_md:
            title_safe = re.sub(r'[<>:"/\\|?*]', '_', session.metadata.title or 'meeting')
            date_str = (session.metadata.date or '').replace('-', '')
            filename = f"{title_safe}_{date_str}.md"
            export_path = EXPORT_DIR / filename

            if export_path.exists():
                client.files_upload_v2(
                    channel=req.channel_id,
                    file=str(export_path),
                    filename=filename,
                    thread_ts=message_ts,
                )

        # Get channel info for response
        channel_info = client.conversations_info(channel=req.channel_id)
        channel_name = channel_info.get("channel", {}).get("name", req.channel_id)

        return {
            "success": True,
            "channel_name": f"#{channel_name}",
            "message_ts": message_ts,
            "thread_ts": req.thread_ts,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Slack 전송 실패: {str(e)}")


@router.get("/test")
def test_connection():
    """Test Slack bot connection."""
    client = _get_slack_client()
    try:
        result = client.auth_test()
        return {
            "ok": True,
            "bot_name": result.get("user", ""),
            "team": result.get("team", ""),
        }
    except Exception as e:
        return {"ok": False, "error": str(e)}
