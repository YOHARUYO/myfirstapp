import re
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from config import SESSIONS_DIR, MEETINGS_DIR, SLACK_BOT_TOKEN, EXPORT_DIR, DATA_DIR
from models.session import Session
from models.meeting import Meeting

router = APIRouter(prefix="/api/slack", tags=["slack"])

# Cache user_id → display_name to avoid repeated API calls within a request
_user_cache: dict[str, str] = {}


def _get_slack_client():
    from slack_sdk import WebClient
    import json as _json

    # settings.json 우선, .env fallback
    token = SLACK_BOT_TOKEN
    settings_path = DATA_DIR / "settings.json"
    if settings_path.exists():
        try:
            s = _json.loads(settings_path.read_text(encoding="utf-8"))
            saved = s.get("slack", {}).get("bot_token", "")
            # WARNING: 마스킹된 값("...") 또는 빈 문자열이면 사용하지 않음
            if saved and "..." not in saved and len(saved) > 10:
                token = saved
        except Exception:
            pass

    if not token:
        raise HTTPException(status_code=500, detail="Slack Bot Token이 설정되지 않았습니다")
    return WebClient(token=token)


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
            or f"사용자({user_id[-4:]})"
        )
        _user_cache[user_id] = name
        return name, is_bot
    except Exception:
        fallback = f"사용자({user_id[-4:]})" if user_id else "Unknown"
        _user_cache[user_id] = fallback
        return fallback, False


@router.get("/channels")
def list_channels():
    """List channels the bot has joined (all pages)."""
    client = _get_slack_client()
    try:
        channels = []
        cursor = None
        while True:
            kwargs = {"types": "public_channel,private_channel", "limit": 200}
            if cursor:
                kwargs["cursor"] = cursor
            result = client.conversations_list(**kwargs)
            for ch in result.get("channels", []):
                if ch.get("is_member"):
                    channels.append({"id": ch["id"], "name": ch["name"]})
            cursor = result.get("response_metadata", {}).get("next_cursor")
            if not cursor:
                break
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


def _action_item_fields(item) -> tuple[Optional[str], str, Optional[str]]:
    """Normalize ActionItem (dict or model) → (assignee, task, deadline)."""
    if isinstance(item, dict):
        return item.get("assignee"), item.get("task", ""), item.get("deadline")
    return (
        getattr(item, "assignee", None),
        getattr(item, "task", ""),
        getattr(item, "deadline", None),
    )


def _sort_action_items_by_assignee(items: list) -> list:
    """같은 assignee의 task가 인접하도록 안정 정렬. None assignee는 끝으로.

    출현 순서를 유지하면서 assignee별로 묶음 — 회의 진행 순서대로 인물이 등장하는 자연 흐름 보존.
    """
    first_seen: dict[str, int] = {}
    for idx, it in enumerate(items):
        assignee, _, _ = _action_item_fields(it)
        key = assignee if assignee else "￿"  # None은 정렬 키 가장 뒤
        if key not in first_seen:
            first_seen[key] = idx
    return sorted(
        items,
        key=lambda it: (
            first_seen[(_action_item_fields(it)[0] or "￿")],
        ),
    )


def _build_main_message(session: Session | Meeting, greeting: str = "", client=None) -> str:
    """1번 메인 메시지 — 현재 형태 유지 + [xxx님] 태그 + 인물별 인접 정렬."""
    header = f"[{session.metadata.date or ''} {session.metadata.title}]"

    summary_bullets = []
    if session.summary_markdown:
        sections = session.summary_markdown.split("### ")
        for section in sections[1:]:
            lines = section.strip().split("\n")
            for line in lines:
                if line.strip().startswith("- ") and "F/U" not in line:
                    summary_bullets.append(f"• {line.strip()[2:]}")
                    break

    sorted_items = _sort_action_items_by_assignee(list(session.action_items))
    fu_bullets = []
    for item in sorted_items:
        assignee, task, deadline = _action_item_fields(item)
        line = f"• [{assignee}님] {task}" if assignee else f"• {task}"
        if deadline:
            line += f" ~{deadline}"
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

    if client:
        def resolve_mention(match):
            uid = match.group(1)
            name, _ = _resolve_user_name(client, uid)
            return f"@{name}"
        raw_message = re.sub(r'<@(\w+)>', resolve_mention, raw_message)

    return raw_message


def _build_topics_message(session: Session | Meeting) -> Optional[str]:
    """2번 thread 메시지 — '## 주요 논의 사항 & F/U 필요 요소' 섹션만 추출.

    빈 경우 None → 전송 라우터가 2번 메시지 자체를 생략.
    """
    md = session.summary_markdown or ""
    if not md.strip():
        return None

    lines = md.split("\n")
    target_lines: list[str] = []
    inside = False
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("## "):
            # 다음 ## 헤딩에 도달하면 섹션 종료
            if inside:
                break
            if "주요 논의" in stripped:
                inside = True
                target_lines.append(line)
                continue
        if inside:
            target_lines.append(line)

    # 끝의 빈 줄 제거
    while target_lines and not target_lines[-1].strip():
        target_lines.pop()

    body = "\n".join(target_lines).strip()
    return body or None


# Legacy alias — 외부 import 호환용 (필요 시).
_build_slack_message = _build_main_message


@router.post("/send")
def send_slack_message(req: SlackSendRequest):
    """Send meeting summary to Slack channel."""
    import json as _json

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

    main_text = _build_main_message(session, greeting, client=client)
    topics_text = _build_topics_message(session)

    try:
        # 1번 메인 메시지 — 사용자 선택 thread가 있다면 그 thread에 들어감
        main_kwargs = {"channel": req.channel_id, "text": main_text}
        if req.thread_ts:
            main_kwargs["thread_ts"] = req.thread_ts
        result_main = client.chat_postMessage(**main_kwargs)
        main_ts = result_main.get("ts", "")
        now_iso = datetime.now().isoformat()

        # 2번 thread 메시지 — 1번 ts를 thread_ts로 (사용자 선택 thread가 아님)
        topics_ts: Optional[str] = None
        if topics_text:
            result_topics = client.chat_postMessage(
                channel=req.channel_id,
                text=topics_text,
                thread_ts=main_ts,
            )
            topics_ts = result_topics.get("ts", "")

        # 3번 .md 첨부 — 1번 ts를 thread_ts로 (현재 동작 유지, parent만 main_ts로)
        md_attached = False
        if req.attach_md:
            title_safe = re.sub(r'[<>:"/\\|?*]', '_', session.metadata.title or 'meeting')
            date_str = (session.metadata.date or '').replace('-', '')
            filename = f"{title_safe}_{date_str}.md"
            md_file = EXPORT_DIR / filename
            if md_file.exists():
                client.files_upload_v2(
                    channel=req.channel_id,
                    file=str(md_file),
                    filename=filename,
                    thread_ts=main_ts,
                )
                md_attached = True

        channel_info = client.conversations_info(channel=req.channel_id)
        channel_name = channel_info.get("channel", {}).get("name", req.channel_id)

        # Build slack_sent dict for response + meeting JSON
        slack_sent_dict = {
            "channel_id": req.channel_id,
            "channel_name": f"#{channel_name}",
            "thread_ts": req.thread_ts,
            "messages": {
                "main": {"ts": main_ts, "text": main_text, "sent_at": now_iso},
            },
            # legacy fields — 구 코드(삭제/마스킹) 호환용으로 main ts 그대로 노출
            "message_ts": main_ts,
            "sent_at": now_iso,
            "deleted": False,
            "deleted_at": None,
        }
        if topics_text and topics_ts:
            slack_sent_dict["messages"]["topics"] = {
                "ts": topics_ts,
                "text": topics_text,
                "sent_at": now_iso,
            }

        # 재전송 흐름(mtg_*)에서는 meeting JSON 직접 갱신.
        # 신규 작성 흐름은 sessions.py의 complete_session이 응답을 받아 Meeting 생성 시 포함.
        if req.session_id.startswith("mtg_"):
            import json as _j2
            meeting_path = MEETINGS_DIR / f"{req.session_id}.json"
            if meeting_path.exists():
                try:
                    m_data = _j2.loads(meeting_path.read_text(encoding="utf-8"))
                    m_data["slack_sent"] = slack_sent_dict
                    meeting_path.write_text(_j2.dumps(m_data, indent=2, ensure_ascii=False), encoding="utf-8")
                except Exception:
                    pass

        return {
            "success": True,
            "channel_name": f"#{channel_name}",
            "message_ts": main_ts,
            "main_ts": main_ts,
            "topics_ts": topics_ts,
            "thread_ts": req.thread_ts,
            "md_attached": md_attached if req.attach_md else None,
            "slack_sent": slack_sent_dict,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Slack 전송 실패: {str(e)}")


class SlackDeleteRequest(BaseModel):
    channel_id: str
    message_ts: str


class SlackUpdateRequest(BaseModel):
    channel_id: str
    message_ts: str
    text: str
    # Phase 1B — 저장본 갱신용. meeting_id + message_key("main"|"topics") 함께 오면
    # meeting JSON의 slack_sent.messages[message_key].text도 동기화.
    meeting_id: Optional[str] = None
    message_key: Optional[str] = None


@router.patch("/message")
def update_slack_message(req: SlackUpdateRequest):
    """Update a bot-sent Slack message text. Attachments are not modified."""
    client = _get_slack_client()
    try:
        client.chat_update(channel=req.channel_id, ts=req.message_ts, text=req.text)
    except Exception as e:
        error_str = str(e)
        if "message_not_found" in error_str:
            raise HTTPException(status_code=404, detail="메시지를 찾을 수 없습니다")
        if "cant_update_message" in error_str or "not_authed" in error_str:
            raise HTTPException(status_code=403, detail="수정 권한이 없습니다 (봇이 보낸 메시지만 수정 가능)")
        raise HTTPException(status_code=500, detail=f"수정 실패: {error_str}")

    # meeting JSON 저장본 갱신 (선택적)
    if req.meeting_id and req.message_key in ("main", "topics"):
        import json as _j
        from datetime import datetime as _dt
        meeting_path = MEETINGS_DIR / f"{req.meeting_id}.json"
        if meeting_path.exists():
            try:
                m_data = _j.loads(meeting_path.read_text(encoding="utf-8"))
                slack_sent = m_data.get("slack_sent") or {}
                messages = slack_sent.get("messages") or {}
                entry = messages.get(req.message_key) or {"ts": req.message_ts, "sent_at": _dt.now().isoformat()}
                entry["text"] = req.text
                messages[req.message_key] = entry
                slack_sent["messages"] = messages
                m_data["slack_sent"] = slack_sent
                meeting_path.write_text(_j.dumps(m_data, indent=2, ensure_ascii=False), encoding="utf-8")
            except Exception:
                pass

    return {"success": True, "message_ts": req.message_ts}


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

    # Update Meeting JSON if exists — 신규 구조(messages.main.ts) + 구 구조(message_ts) 둘 다 인식
    if MEETINGS_DIR.exists():
        meeting_files = list(MEETINGS_DIR.glob("*.json"))
        for mf in meeting_files:
            try:
                data = _json.loads(mf.read_text(encoding="utf-8"))
                slack_sent = data.get("slack_sent")
                if not slack_sent:
                    continue
                # 신규 구조 우선 확인, 없으면 legacy
                main_ts = ((slack_sent.get("messages") or {}).get("main") or {}).get("ts")
                legacy_ts = slack_sent.get("message_ts")
                if main_ts == req.message_ts or legacy_ts == req.message_ts:
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
