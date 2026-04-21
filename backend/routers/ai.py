import re

from fastapi import APIRouter, HTTPException

from config import SESSIONS_DIR
from models.session import Session
from services.claude_service import tag_blocks

router = APIRouter(prefix="/api/sessions", tags=["ai"])


def _validate_session_id(session_id: str) -> None:
    if not re.match(r'^[a-zA-Z0-9_-]+$', session_id):
        raise HTTPException(status_code=400, detail="유효하지 않은 세션 ID")


def _load_session(session_id: str) -> Session:
    path = SESSIONS_DIR / session_id / "session.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Session not found")
    return Session.model_validate_json(path.read_text(encoding="utf-8"))


def _save_session(session: Session) -> None:
    path = SESSIONS_DIR / session.session_id / "session.json"
    path.write_text(session.model_dump_json(indent=2), encoding="utf-8")


@router.post("/{session_id}/tag")
def tag_session_blocks(session_id: str):
    """AI importance tagging — only tags untagged blocks, user tags preserved. Idempotent."""
    _validate_session_id(session_id)
    session = _load_session(session_id)

    if not session.blocks:
        raise HTTPException(status_code=400, detail="No blocks to tag")

    tag_result = tag_blocks(
        session.blocks,
        session.metadata.title,
        session.metadata.participants,
    )

    tagged_count = 0
    for block in session.blocks:
        if block.block_id in tag_result and block.importance_source != "user":
            block.importance = tag_result[block.block_id]
            block.importance_source = "ai"
            tagged_count += 1

    _save_session(session)

    return {
        "tagged_count": tagged_count,
        "total_blocks": len(session.blocks),
        "skipped_user_tags": sum(1 for b in session.blocks if b.importance_source == "user"),
    }
