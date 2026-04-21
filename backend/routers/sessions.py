import json
import re
from datetime import datetime
from pathlib import Path
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from config import SESSIONS_DIR, MEETINGS_DIR, EXPORT_DIR
from models.session import Session
from models.base import MeetingMetadata
from models.meeting import Meeting

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


def _session_path(session_id: str) -> Path:
    return SESSIONS_DIR / session_id / "session.json"


def _validate_session_id(session_id: str) -> None:
    if not re.match(r'^[a-zA-Z0-9_-]+$', session_id):
        raise HTTPException(status_code=400, detail="유효하지 않은 세션 ID")


def _load_session(session_id: str) -> Session:
    _validate_session_id(session_id)
    path = _session_path(session_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Session not found")
    return Session.model_validate_json(path.read_text(encoding="utf-8"))


def _save_session(session: Session) -> None:
    session_dir = SESSIONS_DIR / session.session_id
    session_dir.mkdir(parents=True, exist_ok=True)
    path = session_dir / "session.json"
    path.write_text(session.model_dump_json(indent=2), encoding="utf-8")


def _has_active_session() -> Optional[str]:
    if not SESSIONS_DIR.exists():
        return None
    for d in SESSIONS_DIR.iterdir():
        if d.is_dir():
            sf = d / "session.json"
            if sf.exists():
                s = Session.model_validate_json(sf.read_text(encoding="utf-8"))
                if s.status != "completed":
                    return s.session_id
    return None


class CreateSessionRequest(BaseModel):
    input_mode: str = "realtime"
    metadata: MeetingMetadata = Field(default_factory=MeetingMetadata)


@router.post("")
def create_session(req: CreateSessionRequest):
    active = _has_active_session()
    if active:
        raise HTTPException(
            status_code=409,
            detail=f"Active session exists: {active}"
        )

    now = datetime.now()
    session_id = f"session_{now.strftime('%Y%m%d')}_{uuid4().hex[:8]}"
    chunks_dir = SESSIONS_DIR / session_id / "chunks"
    chunks_dir.mkdir(parents=True, exist_ok=True)

    metadata = req.metadata.model_copy()
    if not metadata.date:
        metadata.date = now.strftime("%Y-%m-%d")
    if not metadata.start_time:
        metadata.start_time = now.strftime("%H:%M:%S")

    session = Session(
        session_id=session_id,
        status="idle",
        input_mode=req.input_mode,
        metadata=metadata,
        audio_chunks_dir=str(chunks_dir),
    )
    _save_session(session)
    return session.model_dump()


@router.get("/{session_id}")
def get_session(session_id: str):
    session = _load_session(session_id)
    return session.model_dump()


class UpdateMetadataRequest(BaseModel):
    title: Optional[str] = None
    participants: Optional[list] = None
    location: Optional[str] = None
    language: Optional[str] = None
    summary_markdown: Optional[str] = None
    action_items: Optional[list] = None
    keywords: Optional[list[str]] = None


@router.patch("/{session_id}/metadata")
def update_metadata(session_id: str, req: UpdateMetadataRequest):
    session = _load_session(session_id)
    meta_fields = {"title", "participants", "location", "language"}
    update_data = req.model_dump(exclude_none=True)
    for key, value in update_data.items():
        if key in meta_fields:
            setattr(session.metadata, key, value)
        else:
            setattr(session, key, value)
    _save_session(session)
    return session.model_dump()


@router.post("/{session_id}/stop")
def stop_recording(session_id: str):
    session = _load_session(session_id)
    if session.status != "recording":
        raise HTTPException(status_code=400, detail="Session is not recording")
    session.status = "post_recording"
    now = datetime.now()
    session.metadata.end_time = now.strftime("%H:%M:%S")
    _save_session(session)
    return session.model_dump()


@router.post("/{session_id}/resume")
def resume_recording(session_id: str):
    session = _load_session(session_id)
    if session.status != "post_recording":
        raise HTTPException(status_code=400, detail="Session is not in post_recording")
    session.status = "recording"
    _save_session(session)
    return session.model_dump()


@router.post("/{session_id}/complete")
def complete_session(session_id: str):
    _validate_session_id(session_id)
    session = _load_session(session_id)

    # #9: Calculate duration
    if session.metadata.start_time and session.metadata.end_time:
        try:
            today = session.metadata.date or datetime.now().strftime("%Y-%m-%d")
            start = datetime.fromisoformat(f"{today}T{session.metadata.start_time}")
            end = datetime.fromisoformat(f"{today}T{session.metadata.end_time}")
            session.metadata.duration_seconds = int((end - start).total_seconds())
        except (ValueError, TypeError):
            pass

    meeting_id = session.session_id.replace("session_", "mtg_")
    meeting = Meeting(
        meeting_id=meeting_id,
        created_at=session.created_at,
        completed_at=datetime.now().isoformat(),
        metadata=session.metadata,
        blocks=session.blocks,
        summary_markdown=session.summary_markdown,
        action_items=session.action_items,
        keywords=session.keywords,
    )

    meeting_path = MEETINGS_DIR / f"{meeting_id}.json"
    meeting_path.write_text(meeting.model_dump_json(indent=2), encoding="utf-8")

    session.status = "completed"
    _save_session(session)

    return meeting.model_dump()


@router.post("/{session_id}/summarize")
def summarize_session(session_id: str):
    """Generate AI summary from high+medium blocks. Assembles overview from metadata."""
    from services.claude_service import summarize_blocks
    from services.summary_assembler import assemble_full_summary

    _validate_session_id(session_id)
    session = _load_session(session_id)

    if not session.blocks:
        raise HTTPException(status_code=400, detail="No blocks to summarize")

    claude_response = summarize_blocks(
        session.blocks,
        session.metadata.title,
        session.metadata.participants,
        session.metadata.date or "",
    )

    date_str = session.metadata.date or datetime.now().strftime("%Y-%m-%d")
    try:
        dt = datetime.strptime(date_str, "%Y-%m-%d")
        weekdays = ["월", "화", "수", "목", "금", "토", "일"]
        date_str = f"{dt.strftime('%m/%d')}({weekdays[dt.weekday()]})"
    except (ValueError, IndexError):
        pass

    metadata_dict = session.metadata.model_dump()
    full_markdown, keywords, action_items = assemble_full_summary(
        metadata_dict, claude_response, date_str, session.metadata.title,
    )

    session.summary_markdown = full_markdown
    session.action_items = action_items
    session.keywords = keywords
    session.status = "summarizing"
    _save_session(session)

    return {
        "summary_markdown": full_markdown,
        "action_items": action_items,
        "keywords": keywords,
    }


@router.post("/{session_id}/export-md")
def export_md(session_id: str):
    """Generate and save .md file from session summary + transcript."""
    _validate_session_id(session_id)
    session = _load_session(session_id)

    if not session.summary_markdown:
        raise HTTPException(status_code=400, detail="No summary to export")

    # Build .md content
    parts = [session.summary_markdown]

    # Action items section
    if session.action_items:
        parts.append("\n\n---\n\n## 전체 F/U 요약")
        for item in session.action_items:
            line = f"- "
            if item.get("assignee"):
                line += f"[@{item['assignee']}] "
            line += item.get("task", "")
            if item.get("deadline"):
                line += f" ~{item['deadline']}"
            if item.get("source_topic"):
                line += f" — {item['source_topic']}"
            parts.append(line)

    # Transcript section
    parts.append("\n\n---\n\n## 전사 원본")
    for block in session.blocks:
        ts = int(block.timestamp_start)
        m, s = divmod(ts, 60)
        parts.append(f"[{m:02d}:{s:02d}] {block.text}")

    md_content = "\n".join(parts)

    # Save to exports directory
    title_safe = re.sub(r'[<>:"/\\|?*]', '_', session.metadata.title or 'meeting')
    date_str = session.metadata.date or datetime.now().strftime("%Y-%m-%d")
    filename = f"{title_safe}_{date_str.replace('-', '')}.md"
    export_path = EXPORT_DIR / filename
    export_path.parent.mkdir(parents=True, exist_ok=True)
    export_path.write_text(md_content, encoding="utf-8")

    return {"filename": filename}


@router.delete("/{session_id}")
def delete_session(session_id: str):
    import shutil
    session_dir = SESSIONS_DIR / session_id
    if not session_dir.exists():
        raise HTTPException(status_code=404, detail="Session not found")
    shutil.rmtree(session_dir)
    return {"deleted": session_id}


# --- Block editing APIs (technical-design.md 4-3) ---


class UpdateBlockRequest(BaseModel):
    text: str


@router.patch("/{session_id}/blocks/{block_id}")
def update_block(session_id: str, block_id: str, req: UpdateBlockRequest):
    _validate_session_id(session_id)
    session = _load_session(session_id)
    for block in session.blocks:
        if block.block_id == block_id:
            if block.text != req.text:
                block.text = req.text
                block.is_edited = True
                block.source = "user_edit"
            _save_session(session)
            return block.model_dump()
    raise HTTPException(status_code=404, detail="Block not found")


class SplitBlockRequest(BaseModel):
    cursor_position: int


@router.post("/{session_id}/blocks/{block_id}/split")
def split_block(session_id: str, block_id: str, req: SplitBlockRequest):
    _validate_session_id(session_id)
    session = _load_session(session_id)

    for i, block in enumerate(session.blocks):
        if block.block_id == block_id:
            pos = req.cursor_position
            if pos <= 0 or pos >= len(block.text):
                raise HTTPException(status_code=400, detail="Invalid cursor position")

            text_before = block.text[:pos].rstrip()
            text_after = block.text[pos:].lstrip()

            # 원본 end를 보존
            original_end = block.timestamp_end
            mid_time = block.timestamp_start + (original_end - block.timestamp_start) * (pos / len(block.text))

            # 원본 블록 수정
            block.text = text_before
            block.timestamp_end = mid_time

            # 새 블록 생성
            from models.block import Block
            new_block = Block(
                block_id=f"blk_{uuid4().hex[:8]}",
                timestamp_start=mid_time,
                timestamp_end=original_end,
                text=text_after,
                source=block.source,
                is_edited=block.is_edited,
                importance=None,
                importance_source=None,
                speaker=None,
            )

            session.blocks.insert(i + 1, new_block)
            _save_session(session)
            return {"block": block.model_dump(), "new_block": new_block.model_dump()}

    raise HTTPException(status_code=404, detail="Block not found")


class MergeDirection(BaseModel):
    direction: str = "next"  # "next" or "prev"


@router.post("/{session_id}/blocks/{block_id}/merge")
def merge_block(session_id: str, block_id: str, req: MergeDirection):
    _validate_session_id(session_id)
    session = _load_session(session_id)

    for i, block in enumerate(session.blocks):
        if block.block_id == block_id:
            if req.direction == "next":
                if i + 1 >= len(session.blocks):
                    raise HTTPException(status_code=400, detail="No next block to merge")
                target = session.blocks[i + 1]
                block.text = block.text + " " + target.text
                block.timestamp_end = target.timestamp_end
                # Higher importance wins
                if target.importance and (not block.importance or _imp_rank(target.importance) > _imp_rank(block.importance)):
                    block.importance = target.importance
                    block.importance_source = target.importance_source
                block.is_edited = True
                session.blocks.pop(i + 1)
            else:  # prev
                if i == 0:
                    raise HTTPException(status_code=400, detail="No previous block to merge")
                prev = session.blocks[i - 1]
                prev.text = prev.text + " " + block.text
                prev.timestamp_end = block.timestamp_end
                if block.importance and (not prev.importance or _imp_rank(block.importance) > _imp_rank(prev.importance)):
                    prev.importance = block.importance
                    prev.importance_source = block.importance_source
                prev.is_edited = True
                session.blocks.pop(i)
                block = prev

            _save_session(session)
            return block.model_dump()

    raise HTTPException(status_code=404, detail="Block not found")


def _imp_rank(importance: str) -> int:
    return {"high": 4, "medium": 3, "low": 2, "lowest": 1}.get(importance, 0)


class UpdateImportanceRequest(BaseModel):
    importance: Optional[str] = None


@router.patch("/{session_id}/blocks/{block_id}/importance")
def update_importance(session_id: str, block_id: str, req: UpdateImportanceRequest):
    _validate_session_id(session_id)
    session = _load_session(session_id)
    for block in session.blocks:
        if block.block_id == block_id:
            block.importance = req.importance
            block.importance_source = "user" if req.importance else None
            _save_session(session)
            return block.model_dump()
    raise HTTPException(status_code=404, detail="Block not found")


class SearchReplaceRequest(BaseModel):
    search: str
    replace: str
    case_sensitive: bool = False
    whole_word: bool = False
    skip_edited_blocks: bool = True


@router.post("/{session_id}/blocks/search-replace")
def search_replace(session_id: str, req: SearchReplaceRequest):
    _validate_session_id(session_id)
    session = _load_session(session_id)

    replaced_count = 0
    skipped_locked_count = 0
    affected_block_ids = []

    for block in session.blocks:
        if req.skip_edited_blocks and block.is_edited:
            if req.search in block.text or (not req.case_sensitive and req.search.lower() in block.text.lower()):
                skipped_locked_count += 1
            continue

        original_text = block.text

        if req.case_sensitive:
            if req.whole_word:
                pattern = re.compile(r'\b' + re.escape(req.search) + r'\b')
            else:
                pattern = re.compile(re.escape(req.search))
        else:
            flags = re.IGNORECASE
            if req.whole_word:
                pattern = re.compile(r'\b' + re.escape(req.search) + r'\b', flags)
            else:
                pattern = re.compile(re.escape(req.search), flags)

        new_text = pattern.sub(req.replace, block.text)
        if new_text != original_text:
            count = len(pattern.findall(original_text))
            replaced_count += count
            block.text = new_text
            affected_block_ids.append(block.block_id)

    _save_session(session)

    return {
        "replaced_count": replaced_count,
        "skipped_locked_count": skipped_locked_count,
        "affected_block_ids": affected_block_ids,
    }
