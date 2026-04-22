import re
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from config import MEETINGS_DIR, EXPORT_DIR
from models.meeting import Meeting

router = APIRouter(prefix="/api/meetings", tags=["meetings"])

SNIPPET_RADIUS = 30


def _load_all_meetings() -> list[Meeting]:
    meetings = []
    if not MEETINGS_DIR.exists():
        return meetings
    for f in MEETINGS_DIR.glob("mtg_*.json"):
        m = Meeting.model_validate_json(f.read_text(encoding="utf-8"))
        meetings.append(m)
    meetings.sort(key=lambda m: m.created_at, reverse=True)
    return meetings


def _extract_snippet(text: str, query: str, radius: int = SNIPPET_RADIUS) -> str | None:
    idx = text.lower().find(query.lower())
    if idx < 0:
        return None
    start = max(0, idx - radius)
    end = min(len(text), idx + len(query) + radius)
    snippet = text[start:end]
    if start > 0:
        snippet = "\u2026" + snippet
    if end < len(text):
        snippet = snippet + "\u2026"
    return snippet


@router.get("")
def list_meetings():
    meetings = _load_all_meetings()
    result = []
    for m in meetings:
        result.append({
            "meeting_id": m.meeting_id,
            "title": m.metadata.title,
            "date": m.metadata.date,
            "duration_seconds": m.metadata.duration_seconds,
            "participants": m.metadata.participants,
            "slack_sent": m.slack_sent is not None,
            "local_file_path": m.local_file_path,
        })
    return result


@router.get("/search")
def search_meetings(
    q: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None, alias="from"),
    date_to: Optional[str] = Query(None, alias="to"),
):
    meetings = _load_all_meetings()
    results = []

    for m in meetings:
        if date_from and m.metadata.date < date_from:
            continue
        if date_to and m.metadata.date > date_to:
            continue

        snippet = None
        matched_field = None

        if q:
            q_lower = q.lower()

            if q_lower in m.metadata.title.lower():
                matched_field = "title"
                snippet = _extract_snippet(m.metadata.title, q)
            elif any(q_lower in p.lower() for p in m.metadata.participants):
                matched_field = "participants"
            elif any(q_lower in k.lower() for k in m.keywords):
                matched_field = "keywords"
                snippet = next((k for k in m.keywords if q_lower in k.lower()), None)
            elif q_lower in m.summary_markdown.lower():
                matched_field = "summary"
                snippet = _extract_snippet(m.summary_markdown, q)
            else:
                for b in m.blocks:
                    if q_lower in b.text.lower():
                        matched_field = "transcript"
                        snippet = _extract_snippet(b.text, q)
                        break

            if not matched_field:
                continue

        results.append({
            "meeting_id": m.meeting_id,
            "title": m.metadata.title,
            "date": m.metadata.date,
            "duration_seconds": m.metadata.duration_seconds,
            "participants": m.metadata.participants,
            "slack_sent": m.slack_sent is not None,
            "local_file_path": m.local_file_path,
            "snippet": snippet,
            "matched_field": matched_field,
        })

    return results


@router.get("/{meeting_id}")
def get_meeting(meeting_id: str):
    path = MEETINGS_DIR / f"{meeting_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Meeting not found")
    m = Meeting.model_validate_json(path.read_text(encoding="utf-8"))
    return m.model_dump()


@router.patch("/{meeting_id}")
def update_meeting(meeting_id: str, req: dict):
    """Partial update of a meeting (re-edit)."""
    import json as _json
    path = MEETINGS_DIR / f"{meeting_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Meeting not found")
    m = Meeting.model_validate_json(path.read_text(encoding="utf-8"))
    for key, value in req.items():
        if hasattr(m, key):
            setattr(m, key, value)
        elif hasattr(m.metadata, key):
            setattr(m.metadata, key, value)
    path.write_text(m.model_dump_json(indent=2), encoding="utf-8")
    return m.model_dump()


@router.patch("/{meeting_id}/blocks/{block_id}")
def update_meeting_block(meeting_id: str, block_id: str, req: dict):
    """Update block text in a meeting (re-edit mode)."""
    path = MEETINGS_DIR / f"{meeting_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Meeting not found")
    m = Meeting.model_validate_json(path.read_text(encoding="utf-8"))
    for block in m.blocks:
        if block.block_id == block_id:
            if "text" in req and block.text != req["text"]:
                block.text = req["text"]
                block.is_edited = True
                block.source = "user_edit"
            path.write_text(m.model_dump_json(indent=2), encoding="utf-8")
            return block.model_dump()
    raise HTTPException(status_code=404, detail="Block not found")


@router.patch("/{meeting_id}/blocks/{block_id}/importance")
def update_meeting_block_importance(meeting_id: str, block_id: str, req: dict):
    path = MEETINGS_DIR / f"{meeting_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Meeting not found")
    m = Meeting.model_validate_json(path.read_text(encoding="utf-8"))
    for block in m.blocks:
        if block.block_id == block_id:
            block.importance = req.get("importance")
            block.importance_source = "user" if req.get("importance") else None
            path.write_text(m.model_dump_json(indent=2), encoding="utf-8")
            return block.model_dump()
    raise HTTPException(status_code=404, detail="Block not found")


@router.post("/{meeting_id}/blocks/{block_id}/split")
def split_meeting_block(meeting_id: str, block_id: str, req: dict):
    from uuid import uuid4
    from models.block import Block
    path = MEETINGS_DIR / f"{meeting_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Meeting not found")
    m = Meeting.model_validate_json(path.read_text(encoding="utf-8"))
    for i, block in enumerate(m.blocks):
        if block.block_id == block_id:
            pos = req.get("cursor_position", 0)
            if pos <= 0 or pos >= len(block.text):
                raise HTTPException(status_code=400, detail="Invalid cursor position")
            original_end = block.timestamp_end
            mid_time = block.timestamp_start + (original_end - block.timestamp_start) * (pos / len(block.text))
            block.text = block.text[:pos].rstrip()
            block.timestamp_end = mid_time
            new_block = Block(
                block_id=f"blk_{uuid4().hex[:8]}",
                timestamp_start=mid_time,
                timestamp_end=original_end,
                text=block.text[pos:].lstrip() if pos < len(block.text) else "",
                source=block.source,
            )
            # Fix: use original text for new block
            full_text = block.text + " " + (req.get("_after_text") or "")
            new_block.text = m.blocks[i].text  # already trimmed above
            # Simpler: re-read
            m2 = Meeting.model_validate_json(path.read_text(encoding="utf-8"))
            orig_text = m2.blocks[i].text
            block.text = orig_text[:pos].rstrip()
            new_block.text = orig_text[pos:].lstrip()
            block.timestamp_end = mid_time
            m.blocks.insert(i + 1, new_block)
            path.write_text(m.model_dump_json(indent=2), encoding="utf-8")
            return {"block": block.model_dump(), "new_block": new_block.model_dump()}
    raise HTTPException(status_code=404, detail="Block not found")


@router.post("/{meeting_id}/blocks/{block_id}/merge")
def merge_meeting_block(meeting_id: str, block_id: str, req: dict):
    path = MEETINGS_DIR / f"{meeting_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Meeting not found")
    m = Meeting.model_validate_json(path.read_text(encoding="utf-8"))
    direction = req.get("direction", "next")
    for i, block in enumerate(m.blocks):
        if block.block_id == block_id:
            if direction == "next":
                if i + 1 >= len(m.blocks):
                    raise HTTPException(status_code=400, detail="No next block")
                target = m.blocks[i + 1]
                block.text = block.text + " " + target.text
                block.timestamp_end = target.timestamp_end
                block.is_edited = True
                m.blocks.pop(i + 1)
            else:
                if i == 0:
                    raise HTTPException(status_code=400, detail="No previous block")
                prev = m.blocks[i - 1]
                prev.text = prev.text + " " + block.text
                prev.timestamp_end = block.timestamp_end
                prev.is_edited = True
                m.blocks.pop(i)
                block = prev
            path.write_text(m.model_dump_json(indent=2), encoding="utf-8")
            return block.model_dump()
    raise HTTPException(status_code=404, detail="Block not found")


@router.post("/{meeting_id}/export-md")
def export_meeting_md(meeting_id: str):
    """Generate and save .md file from completed meeting."""
    path = MEETINGS_DIR / f"{meeting_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Meeting not found")

    m = Meeting.model_validate_json(path.read_text(encoding="utf-8"))

    if not m.summary_markdown:
        raise HTTPException(status_code=400, detail="No summary to export")

    parts = [m.summary_markdown]

    if m.action_items:
        parts.append("\n\n---\n\n## \uc804\uccb4 F/U \uc694\uc57d")
        for item in m.action_items:
            line = "- "
            if item.assignee:
                line += f"[@{item.assignee}] "
            line += item.task
            if item.deadline:
                line += f" ~{item.deadline}"
            if item.source_topic:
                line += f" \u2014 {item.source_topic}"
            parts.append(line)

    parts.append("\n\n---\n\n## \uc804\uc0ac \uc6d0\ubcf8")
    for block in m.blocks:
        ts = int(block.timestamp_start)
        mins, secs = divmod(ts, 60)
        parts.append(f"[{mins:02d}:{secs:02d}] {block.text}")

    md_content = "\n".join(parts)

    title_safe = re.sub(r'[<>:"/\\|?*]', '_', m.metadata.title or 'meeting')
    date_str = m.metadata.date or ''
    filename = f"{title_safe}_{date_str.replace('-', '')}.md"
    export_path = EXPORT_DIR / filename
    export_path.parent.mkdir(parents=True, exist_ok=True)
    export_path.write_text(md_content, encoding="utf-8")

    return {"filename": filename}


@router.delete("/{meeting_id}")
def delete_meeting(meeting_id: str):
    """Delete a meeting and associated files."""
    import shutil
    from config import SESSIONS_DIR

    meeting_path = MEETINGS_DIR / f"{meeting_id}.json"
    if not meeting_path.exists():
        raise HTTPException(status_code=404, detail="Meeting not found")

    m = Meeting.model_validate_json(meeting_path.read_text(encoding="utf-8"))

    # Delete meeting JSON
    meeting_path.unlink()

    # Delete exported .md if exists
    if m.metadata.title:
        title_safe = re.sub(r'[<>:"/\\|?*]', '_', m.metadata.title)
        date_str = (m.metadata.date or '').replace('-', '')
        export_path = EXPORT_DIR / f"{title_safe}_{date_str}.md"
        if export_path.exists():
            export_path.unlink()

    # Delete merged audio if exists
    if m.merged_audio_path:
        from pathlib import Path
        audio = Path(m.merged_audio_path)
        if audio.exists():
            audio.unlink()

    # Delete corresponding session directory if exists
    session_id = meeting_id.replace("mtg_", "session_")
    session_dir = SESSIONS_DIR / session_id
    if session_dir.exists():
        shutil.rmtree(session_dir)

    return {"deleted": meeting_id}
