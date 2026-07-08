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


def _action_item_fields(item) -> tuple[Optional[str], str, Optional[str], Optional[str]]:
    """Normalize ActionItem (dict or model) → (assignee, task, deadline, topic).

    topic은 추출 단계에서 보존된 source_topic (v2 안건별 그룹핑용, legacy는 None).
    """
    if isinstance(item, dict):
        return (
            item.get("assignee"),
            item.get("task", ""),
            item.get("deadline"),
            item.get("source_topic"),
        )
    return (
        getattr(item, "assignee", None),
        getattr(item, "task", ""),
        getattr(item, "deadline", None),
        getattr(item, "source_topic", None),
    )


def _sort_action_items_by_assignee(items: list) -> list:
    """같은 assignee의 task가 인접하도록 안정 정렬. None assignee는 끝으로.

    출현 순서를 유지하면서 assignee별로 묶음 — 회의 진행 순서대로 인물이 등장하는 자연 흐름 보존.
    """
    first_seen: dict[str, int] = {}
    for idx, it in enumerate(items):
        assignee = _action_item_fields(it)[0]
        key = assignee if assignee else "￿"  # None은 정렬 키 가장 뒤
        if key not in first_seen:
            first_seen[key] = idx
    return sorted(
        items,
        key=lambda it: (
            first_seen[(_action_item_fields(it)[0] or "￿")],
        ),
    )


def _md_to_mrkdwn(text: str) -> str:
    """표준 markdown → Slack mrkdwn 변환 (v2, PLAN-DEV-HANDOFF-20260708 §3.5).

    - `**텍스트**` → `*텍스트*`
    - 행 시작 `## 제목` / `### 제목` → `*제목*` (bold 줄)
    - `- ` bullet / `---` 구분선 / `[xxx님]` / 이모지는 그대로 유지

    슬랙 표현 계층 전용 — EXPORT_DIR의 .md 파일과 summary_markdown 저장본에는
    절대 적용하지 않는다.
    """
    lines: list[str] = []
    for line in text.split("\n"):
        m = re.match(r"^\s*(#{2,6})\s+(.+)$", line)
        if m:
            lines.append(f"*{m.group(2).strip()}*")
        else:
            lines.append(line)
    out = "\n".join(lines)
    out = re.sub(r"\*\*(.+?)\*\*", r"*\1*", out)
    return out


def _extract_core_summary_bullets(md: str) -> list[str]:
    """summary_markdown의 '## 핵심 요약' 섹션 bullet 텍스트 목록. 섹션이 없으면 []."""
    bullets: list[str] = []
    inside = False
    for line in (md or "").split("\n"):
        stripped = line.strip()
        if stripped.startswith("## "):
            if inside:
                break
            inside = "핵심 요약" in stripped
            continue
        if inside and stripped.startswith("- "):
            bullets.append(stripped[2:].strip())
    return bullets


def _format_task_piece(task: str, deadline: Optional[str]) -> str:
    """task 조각 1개 — 기한이 있으면 맨 뒤에 (~7/6) 형식으로 붙인다."""
    return f"{task} (~{deadline})" if deadline else task


def _build_fu_bullets(items: list) -> list[str]:
    """F/U 섹션 라인 목록 — v2 변형 A (PLAN-DEV-HANDOFF-20260708 §2).

    topic(source_topic)이 하나라도 있으면 안건별 그룹핑:
    `*N. 안건명*` bold 라벨 + 같은 인물 task ` / ` 한 줄 병합 + 기한 각 task 뒤 (~7/6).
    담당자 미명시 task는 태그 없이 단독 bullet (병합 안 함).
    전부 None(legacy)이면 기존 평탄 + 인물 인접 정렬 fallback.
    """
    items = list(items)
    if not items:
        return []

    has_topic = any(_action_item_fields(it)[3] for it in items)
    if not has_topic:
        # legacy fallback — 평탄 리스트 + 인물 인접 정렬 (기한만 v2 괄호 형식)
        lines: list[str] = []
        for item in _sort_action_items_by_assignee(items):
            assignee, task, deadline, _ = _action_item_fields(item)
            piece = _format_task_piece(task, deadline)
            lines.append(f"• [{assignee}님] {piece}" if assignee else f"• {piece}")
        return lines

    # 주제 출현 순서대로 그룹핑 — topic 없는 항목은 마지막 무라벨 그룹
    group_order: list[Optional[str]] = []
    groups: dict[Optional[str], list] = {}
    for it in items:
        topic = _action_item_fields(it)[3]
        if topic not in groups:
            groups[topic] = []
            group_order.append(topic)
        groups[topic].append(it)
    if None in groups:
        group_order = [t for t in group_order if t is not None] + [None]

    lines = []
    label_no = 0
    for topic in group_order:
        group = _sort_action_items_by_assignee(groups[topic])
        if topic is not None:
            label_no += 1
            lines.append(f"*{label_no}. {topic}*")
        i = 0
        while i < len(group):
            assignee, task, deadline, _ = _action_item_fields(group[i])
            if not assignee:
                lines.append(f"• {_format_task_piece(task, deadline)}")
                i += 1
                continue
            pieces = [_format_task_piece(task, deadline)]
            j = i + 1
            while j < len(group):
                a2, t2, d2, _ = _action_item_fields(group[j])
                if a2 != assignee:
                    break
                pieces.append(_format_task_piece(t2, d2))
                j += 1
            lines.append(f"• [{assignee}님] {' / '.join(pieces)}")
            i = j
    return lines


def _build_main_message(session: Session | Meeting, greeting: str = "", client=None) -> str:
    """1번 메인 메시지 — v2 (PLAN-DEV-HANDOFF-20260708).

    핵심 요약: summary_markdown의 '## 핵심 요약' 섹션(LLM 생성) 사용.
    섹션이 없으면(구 회의 재전송·legacy) 기존 기계 추출 fallback.
    F/U: 안건별 그룹핑 변형 A. '📎 전체 회의록 첨부' 문구는 .md initial_comment로 이동.
    """
    header = f"[{session.metadata.date or ''} {session.metadata.title}]"

    core = _extract_core_summary_bullets(session.summary_markdown or "")
    if core:
        # 빌더가 직접 mrkdwn을 생성하므로 bullet 텍스트에만 방어적 변환 적용
        summary_bullets = [f"• {_md_to_mrkdwn(b)}" for b in core]
    else:
        # legacy fallback — 각 주제 첫 bullet 기계 추출
        summary_bullets = []
        if session.summary_markdown:
            sections = session.summary_markdown.split("### ")
            for section in sections[1:]:
                lines = section.strip().split("\n")
                for line in lines:
                    if line.strip().startswith("- ") and "F/U" not in line:
                        summary_bullets.append(f"• {line.strip()[2:]}")
                        break

    fu_bullets = _build_fu_bullets(list(session.action_items))

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

    raw_message = "\n".join(parts).rstrip()

    if client:
        def resolve_mention(match):
            uid = match.group(1)
            name, _ = _resolve_user_name(client, uid)
            return f"@{name}"
        raw_message = re.sub(r'<@(\w+)>', resolve_mention, raw_message)

    return raw_message


def _build_topic_messages(session: Session | Meeting) -> list[tuple[str, str]]:
    """주제별 thread 회신 목록 — v2 (PLAN-DEV-HANDOFF-20260708 §3.4).

    '## 주요 논의 사항' 섹션을 `###` 주제 단위로 분할해 [(title, md_body), ...] 반환.
    섹션 헤더('## 주요 논의...') 자체는 생략 — 각 메시지가 `*N. 주제명*`으로 시작.
    '## 기타 메모' 섹션이 있으면 마지막 회신 1개로 추가.
    빈 경우 [] → 전송 라우터가 회신 자체를 생략.
    """
    md = session.summary_markdown or ""
    if not md.strip():
        return []

    discussion: list[str] = []
    memo: list[str] = []
    current: Optional[list[str]] = None
    for line in md.split("\n"):
        stripped = line.strip()
        if stripped.startswith("## "):
            if "주요 논의" in stripped:
                current = discussion
                continue  # 섹션 헤더는 생략
            if "기타 메모" in stripped:
                current = memo
                memo.append(line)  # 헤딩 유지 → mrkdwn 변환 시 *기타 메모* bold 줄
                continue
            current = None
            continue
        if current is not None:
            current.append(line)

    result: list[tuple[str, str]] = []

    # `###` 주제 단위 분할
    topic_title: Optional[str] = None
    topic_lines: list[str] = []

    def flush():
        nonlocal topic_title, topic_lines
        if topic_title is not None:
            body = "\n".join([f"### {topic_title}"] + topic_lines).strip()
            result.append((topic_title, body))
        topic_title = None
        topic_lines = []

    for line in discussion:
        stripped = line.strip()
        if stripped.startswith("### "):
            flush()
            topic_title = stripped[4:].strip()
            continue
        if topic_title is not None:
            topic_lines.append(line)
    flush()

    # `###` 없는 비정형 요약(legacy) — 통짜 1건으로 폴백해 내용 유실 방지
    if not result and any(l.strip() for l in discussion):
        result.append(("주요 논의", "\n".join(discussion).strip()))

    # 기타 메모 — 헤딩 외 실제 내용이 있을 때만 마지막 회신로 추가
    if any(l.strip() and not l.strip().startswith("## ") for l in memo):
        result.append(("기타 메모", "\n".join(memo).strip()))

    return result


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
    topic_messages = _build_topic_messages(session)

    try:
        # 1번 메인 메시지 — 사용자 선택 thread가 있다면 그 thread에 들어감
        main_kwargs = {"channel": req.channel_id, "text": main_text}
        if req.thread_ts:
            main_kwargs["thread_ts"] = req.thread_ts
        result_main = client.chat_postMessage(**main_kwargs)
        main_ts = result_main.get("ts", "")
        now_iso = datetime.now().isoformat()

        # 주제별 thread 회신 — 주제 1개당 1건, 1번 ts를 thread_ts로 순차 전송 (v2)
        topics_records: list[dict] = []
        topics_ts: Optional[str] = None  # 첫 회신 ts — 응답 legacy 필드 호환용
        for title, body in topic_messages:
            mrkdwn_body = _md_to_mrkdwn(body)
            result_topic = client.chat_postMessage(
                channel=req.channel_id,
                text=mrkdwn_body,
                thread_ts=main_ts,
            )
            t_ts = result_topic.get("ts", "")
            if topics_ts is None:
                topics_ts = t_ts
            topics_records.append({
                "ts": t_ts,
                "title": title,
                "text": mrkdwn_body,
                "sent_at": now_iso,
            })

        # 마지막 .md 첨부 — 1번 ts를 thread_ts로 + 첨부 안내 코멘트 (v2 §3.6)
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
                    initial_comment="📎 전체 회의록 첨부합니다",
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
        if topics_records:
            # v2 — 항상 배열로 기록 (legacy 단일 dict는 읽기에서만 인식)
            slack_sent_dict["messages"]["topics"] = topics_records

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
    # Phase 1B — 저장본 갱신용. meeting_id + message_key 함께 오면
    # meeting JSON의 slack_sent.messages 해당 항목 text도 동기화.
    # v2 message_key: "main" | "topic_{i}"(topics 배열 인덱스) | "topics"(legacy 단일 dict)
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
    topic_idx_match = re.match(r"^topic_(\d+)$", req.message_key or "")
    if req.meeting_id and (req.message_key in ("main", "topics") or topic_idx_match):
        import json as _j
        from datetime import datetime as _dt
        meeting_path = MEETINGS_DIR / f"{req.meeting_id}.json"
        if meeting_path.exists():
            try:
                m_data = _j.loads(meeting_path.read_text(encoding="utf-8"))
                slack_sent = m_data.get("slack_sent") or {}
                messages = slack_sent.get("messages") or {}
                if topic_idx_match:
                    # v2 — topics 배열의 해당 인덱스 갱신
                    topics = messages.get("topics")
                    idx = int(topic_idx_match.group(1))
                    if isinstance(topics, list) and 0 <= idx < len(topics):
                        topics[idx]["text"] = req.text
                elif req.message_key == "topics" and isinstance(messages.get("topics"), list):
                    # v2 배열 저장본에 legacy 키가 오면 무시 (topic_{i}를 사용해야 함)
                    pass
                else:
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
