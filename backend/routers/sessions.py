import json
import re
from datetime import datetime
from pathlib import Path
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from config import SESSIONS_DIR, MEETINGS_DIR
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


@router.patch("/{session_id}/metadata")
def update_metadata(session_id: str, req: UpdateMetadataRequest):
    session = _load_session(session_id)
    update_data = req.model_dump(exclude_none=True)
    for key, value in update_data.items():
        setattr(session.metadata, key, value)
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
    )

    meeting_path = MEETINGS_DIR / f"{meeting_id}.json"
    meeting_path.write_text(meeting.model_dump_json(indent=2), encoding="utf-8")

    session.status = "completed"
    _save_session(session)

    return meeting.model_dump()


@router.delete("/{session_id}")
def delete_session(session_id: str):
    import shutil
    session_dir = SESSIONS_DIR / session_id
    if not session_dir.exists():
        raise HTTPException(status_code=404, detail="Session not found")
    shutil.rmtree(session_dir)
    return {"deleted": session_id}
