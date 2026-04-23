import asyncio
import re
import time
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException

from config import SESSIONS_DIR, DATA_DIR, WHISPER_MODEL as DEFAULT_WHISPER_MODEL
from models.session import Session


def _get_whisper_model() -> str:
    import json as _json
    settings_path = DATA_DIR / "settings.json"
    if settings_path.exists():
        try:
            s = _json.loads(settings_path.read_text(encoding="utf-8"))
            return s.get("whisper", {}).get("model", DEFAULT_WHISPER_MODEL)
        except Exception:
            pass
    return DEFAULT_WHISPER_MODEL
from models.block import Block

router = APIRouter(prefix="/api/sessions", tags=["processing"])


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


# In-memory processing state per session
_processing_state: dict[str, dict] = {}


def _update_stage(session_id: str, stage: str, status: str, progress: float = 0.0):
    if session_id not in _processing_state:
        return
    state = _processing_state[session_id]
    state["stage"] = stage
    state["stages"][stage]["status"] = status
    if progress > 0:
        state["stages"][stage]["progress"] = progress


async def _run_processing(session_id: str):
    """Background processing pipeline: audio merge → Whisper → block merge → AI tagging."""
    from services.audio_service import merge_audio_chunks, get_uploaded_audio
    from services.whisper_service import transcribe
    from services.merger_service import merge_blocks
    from services.claude_service import tag_blocks

    state = _processing_state[session_id]

    try:
        session = await asyncio.to_thread(_load_session, session_id)
        chunks_dir = Path(session.audio_chunks_dir)
        is_upload = session.input_mode == "upload"

        # Stage 1: Audio merge
        _update_stage(session_id, "audio_merge", "in_progress")

        if is_upload:
            audio_path = await asyncio.to_thread(get_uploaded_audio, chunks_dir)
            if not audio_path:
                raise FileNotFoundError("업로드된 오디오 파일을 찾을 수 없습니다")
        else:
            merged_output = SESSIONS_DIR / session_id / "merged_audio.webm"
            audio_path = await asyncio.to_thread(
                merge_audio_chunks, chunks_dir, merged_output
            )

        _update_stage(session_id, "audio_merge", "completed")

        # Stage 2: Whisper transcription
        _update_stage(session_id, "whisper", "in_progress", 0.1)

        language = session.metadata.language or None
        segments = await asyncio.to_thread(
            transcribe, audio_path, language, _get_whisper_model()
        )

        _update_stage(session_id, "whisper", "completed", 1.0)

        # Stage 3: Block merge
        _update_stage(session_id, "block_merge", "in_progress")

        if is_upload:
            # Upload mode: no Web Speech blocks to merge, use Whisper segments directly
            merged = []
            for i, seg in enumerate(segments):
                merged.append(Block(
                    block_id=f"blk_{i+1:03d}",
                    timestamp_start=seg["start"],
                    timestamp_end=seg["end"],
                    text=seg["text"],
                    source="whisper",
                ))
        else:
            merged = await asyncio.to_thread(
                merge_blocks, session.blocks, segments
            )

        # Save merged blocks
        session = await asyncio.to_thread(_load_session, session_id)
        session.blocks = merged
        await asyncio.to_thread(_save_session, session)

        _update_stage(session_id, "block_merge", "completed")

        # Stage 4: AI tagging
        if not session.ai_tagging_skipped:
            _update_stage(session_id, "ai_tagging", "in_progress")

            tag_result = await asyncio.to_thread(
                tag_blocks,
                merged,
                session.metadata.title,
                session.metadata.participants,
            )

            # Apply tags to blocks
            session = await asyncio.to_thread(_load_session, session_id)
            for block in session.blocks:
                if block.block_id in tag_result and block.importance_source != "user":
                    block.importance = tag_result[block.block_id]
                    block.importance_source = "ai"

            session.status = "editing"
            await asyncio.to_thread(_save_session, session)

            _update_stage(session_id, "ai_tagging", "completed")
        else:
            _update_stage(session_id, "ai_tagging", "skipped")
            session = await asyncio.to_thread(_load_session, session_id)
            session.status = "editing"
            await asyncio.to_thread(_save_session, session)

        state["status"] = "completed"

    except Exception as e:
        state["status"] = "error"
        state["error"] = str(e)

        # Revert session status so user can retry
        try:
            session = await asyncio.to_thread(_load_session, session_id)
            session.status = "post_recording"
            await asyncio.to_thread(_save_session, session)
        except Exception:
            pass


@router.post("/{session_id}/process")
async def start_processing(session_id: str):
    _validate_session_id(session_id)
    session = _load_session(session_id)

    if session.status not in ("post_recording",):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot process session in status: {session.status}"
        )

    if session_id in _processing_state and _processing_state[session_id]["status"] == "processing":
        raise HTTPException(status_code=409, detail="Processing already in progress")

    # Initialize processing state
    _processing_state[session_id] = {
        "status": "processing",
        "stage": "audio_merge",
        "started_at": time.time(),
        "error": None,
        "stages": {
            "audio_merge": {"status": "pending", "progress": 0.0},
            "whisper": {"status": "pending", "progress": 0.0},
            "block_merge": {"status": "pending", "progress": 0.0},
            "ai_tagging": {"status": "pending", "progress": 0.0},
        },
    }

    # Update session status
    session.status = "processing"
    _save_session(session)

    # Start background task
    asyncio.create_task(_run_processing(session_id))

    return {"status": "processing", "session_id": session_id}


@router.get("/{session_id}/process/status")
def get_processing_status(session_id: str):
    _validate_session_id(session_id)

    if session_id not in _processing_state:
        # Check if session is already past processing
        session = _load_session(session_id)
        if session.status in ("editing", "summarizing", "completed"):
            return {
                "status": "completed",
                "stage": "ai_tagging",
                "stages": {
                    "audio_merge": {"status": "completed"},
                    "whisper": {"status": "completed"},
                    "block_merge": {"status": "completed"},
                    "ai_tagging": {"status": "completed"},
                },
            }
        raise HTTPException(status_code=404, detail="No processing state found")

    state = _processing_state[session_id]

    # Estimate remaining time
    elapsed = time.time() - state["started_at"]
    estimated_remaining = None
    if state["stage"] == "whisper":
        whisper_progress = state["stages"]["whisper"].get("progress", 0)
        if whisper_progress > 0.1:
            estimated_remaining = int(elapsed / whisper_progress * (1 - whisper_progress))

    result = {
        "status": state["status"],
        "stage": state["stage"],
        "stages": state["stages"],
    }

    if estimated_remaining is not None:
        result["estimated_remaining_seconds"] = estimated_remaining

    if state.get("error"):
        result["error"] = state["error"]

    return result
