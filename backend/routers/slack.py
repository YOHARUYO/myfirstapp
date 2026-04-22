import re
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from config import SESSIONS_DIR, MEETINGS_DIR, SLACK_BOT_TOKEN, EXPORT_DIR
from models.session import Session
from models.meeting import Meeting

router = APIRouter(prefix="/api/slack", tags=["slack"])

# Cache user_id → display_name to avoid repeated API calls within a request
_user_cache: dict[str, str] = {}


def _get_slack_client():
    from slack_sdk import WebClient
    if not SLACK_BOT_TOKEN:
        raise HTTPException(status_code=500, detail="Slack Bot Token이 설정되지 않았습니다")
    return WebClient(token=SLACK_BOT_TOKEN)


def _load_session(session_id: str) -> Session | Meeting:
    """Load session or meeting by ID (sessions first, then meetings)."""
    if not re.match(r'^[a-zA-Z0-9_-]+$', session_id):
        raise HTTPException(status_code=400, detail="유효하지 않은 ID")
    # Try sessions first
    session_path = SESSIONS_DIR / session_id / "session.json"
    if session_path.exists():
        return Session.model_validate_json(session_path.read_text(encoding="utf-8"))
    # Try meetings
    meeting_path = MEETINGS_DIR / f"{session_id}.json"
    if meeting_path.exists():
        return Meeting.model_validate_json(meeting_path.read_text(encoding="utf-8"))
    raise HTTPException(status_code=404, detail="Session or meeting not found")


def _strip_mrkdwn(text: str, client=None) -> str:
    """Strip Slack mrkdwn formatting to plain text. Optionally resolve user mentions."""
    # Remove bold/italic
    text = re.sub(r'[*_~`]', '', text)
    # Replace user mentions <@U1234> with display_name
    def resolve_mention(match):
        uid = match.group(1)
        if client:
            name, _ = _resolve_user_name(client, uid)
            return f"@{name}"
        return "@user"
    text = re.sub(r'<@(\w+)>', resolve_mention, text)
    # Replace channel mentions <#C1234|name> with #name
    text = re.sub(r'<#\w+\|([^>]+)>', r'#\1', text)
    # Replace URLs <http://...|label> with label, or <http://...> with URL
    text = re.sub(r'<(https?://[^|>]+)\|([^>]+)>', r'\2', text)
    text = re.sub(r'<(https?://[^>]+)>', r'\1', text)
    # Remove emoji shortcodes :emoji_name:
    text = re.sub(r':[\w+-]+:', '', text)
    # Remove code blocks
    text = re.sub(r'```[\s\S]*?```', '[code]', text)
    text = re.sub(r'`([^`]+)`', r'\1', text)
    return text.strip()


def _resolve_user_name(client, user_id: str) -> tuple[str, bool]:
    """Resolve Slack user_id to (display_name, is_bot)."""
    if user_id in _user_cache:
        return _user_cache[user_id], False

    try:
        info = client.users_info(user=user_id)
        user = info.get("user", {})
        is_bot = user.get("is_bot", False)
        name = (
            user.get("profile", {}).get("display_name")
            or user.get("real_name")
            or user.get("name")
            or user_id
        )
        _user_cache[user_id] = name
        return name, is_bot
    except Exception:
        return user_id, False


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
    """List recent messages as structured card data for thread selection."""
    client = _get_slack_client()
    try:
        result = client.conversations_history(channel=channel_id, limit=limit)
        messages = []
        for msg in result.get("messages", []):
            if msg.get("subtype") is not None:
                continue

            user_id = msg.get("user", "")
            is_bot = msg.get("bot_id") is not None or msg.get("subtype") == "bot_message"

            if is_bot:
                user_name = msg.get("username", "Bot")
            elif user_id:
                user_name, is_bot = _resolve_user_name(client, user_id)
            else:
                user_name = "Unknown"

            # Strip mrkdwn and truncate to 50 chars
            raw_text = msg.get("text", "")
            text_preview = _strip_mrkdwn(raw_text, client)
            if len(text_preview) > 50:
                text_preview = text_preview[:50] + "…"

            # Reply count
            reply_count = msg.get("reply_count", 0)

            # Attachments
            has_attachments = bool(msg.get("files"))

            # Timestamp → datetime string
            try:
                ts_float = float(msg["ts"])
                sent_at = datetime.fromtimestamp(ts_float).isoformat()
            except (ValueError, KeyError):
                sent_at = ""

            messages.append({
                "ts": msg["ts"],
                "user_name": user_name,
                "is_bot": is_bot,
                "text_preview": text_preview,
                "reply_count": reply_count,
                "has_attachments": has_attachments,
                "sent_at": sent_at,
            })

        return {"messages": messages}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Slack API 오류: {str(e)}")


class SlackSendRequest(BaseModel):
    session_id: str
    channel_id: str
    thread_ts: Optional[str] = None
    attach_md: bool = True


def _build_slack_message(session: Session, greeting: str = "", client=None) -> str:
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

    fu_bullets = []
    for item in session.action_items:
        assignee = item.get("assignee")
        task = item.get("task", "")
        line = f"• [@{assignee}] {task}" if assignee else f"• {task}"
        if item.get("deadline"):
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

    raw_message = "\n".join(parts)

    # <@UXXXXXX> → @display_name 치환
    if client:
        def resolve_mention(match):
            uid = match.group(1)
            name, _ = _resolve_user_name(client, uid)
            return f"@{name}"
        raw_message = re.sub(r'<@(\w+)>', resolve_mention, raw_message)

    return raw_message


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

    message_text = _build_slack_message(session, greeting, client=client)

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


class SlackDeleteRequest(BaseModel):
    channel_id: str
    message_ts: str


@router.delete("/message")
def delete_slack_message(req: SlackDeleteRequest):
    """Delete a bot-sent Slack message. Updates Meeting JSON if found."""
    import json as _json

    client = _get_slack_client()

    try:
        client.chat_delete(channel=req.channel_id, ts=req.message_ts)
    except Exception as e:
        error_str = str(e)
        if "message_not_found" in error_str:
            raise HTTPException(status_code=404, detail="이미 삭제되었거나 메시지를 찾을 수 없습니다")
        if "cant_delete_message" in error_str or "not_authed" in error_str:
            raise HTTPException(status_code=403, detail="삭제 권한이 없습니다 (봇이 보낸 메시지만 삭제 가능)")
        raise HTTPException(status_code=500, detail=f"삭제 실패: {error_str}")

    # Update Meeting JSON if exists
    if MEETINGS_DIR.exists():
        meeting_files = list(MEETINGS_DIR.glob("*.json"))
        for mf in meeting_files:
            try:
                data = _json.loads(mf.read_text(encoding="utf-8"))
                slack_sent = data.get("slack_sent")
                if slack_sent and slack_sent.get("message_ts") == req.message_ts:
                    slack_sent["deleted"] = True
                    slack_sent["deleted_at"] = datetime.now().isoformat()
                    mf.write_text(_json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
                    break
            except Exception:
                continue

    return {"success": True, "deleted_ts": req.message_ts}


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
