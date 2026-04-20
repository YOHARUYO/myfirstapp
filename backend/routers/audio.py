import asyncio
import json
from pathlib import Path
from datetime import datetime

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, UploadFile, File, HTTPException

from config import SESSIONS_DIR
from models.session import Session
from models.block import Block

router = APIRouter(prefix="/api/sessions", tags=["audio"])

# Per-session locks to prevent concurrent writes (#7)
_session_locks: dict[str, asyncio.Lock] = {}


def _get_lock(session_id: str) -> asyncio.Lock:
    if session_id not in _session_locks:
        _session_locks[session_id] = asyncio.Lock()
    return _session_locks[session_id]


def _load_session(session_id: str) -> Session:
    path = SESSIONS_DIR / session_id / "session.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Session not found")
    return Session.model_validate_json(path.read_text(encoding="utf-8"))


def _save_session(session: Session) -> None:
    path = SESSIONS_DIR / session.session_id / "session.json"
    path.write_text(session.model_dump_json(indent=2), encoding="utf-8")


@router.websocket("/{session_id}/audio")
async def audio_websocket(websocket: WebSocket, session_id: str):
    session_dir = SESSIONS_DIR / session_id
    chunks_dir = session_dir / "chunks"

    if not session_dir.exists():
        await websocket.close(code=4004, reason="Session not found")
        return

    await websocket.accept()

    lock = _get_lock(session_id)

    # #6: Use asyncio.to_thread for file I/O
    async with lock:
        session = await asyncio.to_thread(_load_session, session_id)
        session.status = "recording"
        await asyncio.to_thread(_save_session, session)

    chunk_index = session.audio_chunk_count
    block_counter = len(session.blocks)

    try:
        while True:
            message = await websocket.receive()

            if "bytes" in message:
                chunk_path = chunks_dir / f"chunk_{chunk_index:03d}.webm"
                await asyncio.to_thread(chunk_path.write_bytes, message["bytes"])
                chunk_index += 1

                async with lock:
                    session = await asyncio.to_thread(_load_session, session_id)
                    session.audio_chunk_count = chunk_index
                    await asyncio.to_thread(_save_session, session)

                await websocket.send_json({
                    "type": "chunk_ack",
                    "chunk_index": chunk_index - 1,
                })

            elif "text" in message:
                data = json.loads(message["text"])

                if data.get("type") == "speech_result" and data.get("is_final"):
                    block_counter += 1
                    block_id = f"blk_{block_counter:03d}"

                    block = Block(
                        block_id=block_id,
                        timestamp_start=data.get("timestamp_start", 0.0),
                        timestamp_end=data.get("timestamp_end", 0.0),
                        text=data.get("text", ""),
                        source="web_speech",
                    )

                    async with lock:
                        session = await asyncio.to_thread(_load_session, session_id)
                        session.blocks.append(block)
                        await asyncio.to_thread(_save_session, session)

                    await websocket.send_json({
                        "type": "block_created",
                        "block_id": block_id,
                        "timestamp_start": block.timestamp_start,
                        "timestamp_end": block.timestamp_end,
                    })

                elif data.get("type") == "recording_resumed":
                    gap_seconds = data.get("gap_seconds", 0)
                    async with lock:
                        session = await asyncio.to_thread(_load_session, session_id)
                        if session.blocks:
                            from models.session import RecordingGap
                            session.recording_gaps.append(RecordingGap(
                                after_block_id=session.blocks[-1].block_id,
                                gap_seconds=gap_seconds,
                            ))
                        session.status = "recording"
                        await asyncio.to_thread(_save_session, session)

    except WebSocketDisconnect:
        async with lock:
            session = await asyncio.to_thread(_load_session, session_id)
            if session.status == "recording":
                session.status = "post_recording"
                session.metadata.end_time = datetime.now().strftime("%H:%M:%S")
                await asyncio.to_thread(_save_session, session)


@router.post("/{session_id}/upload")
async def upload_audio(session_id: str, file: UploadFile = File(...)):
    session_dir = SESSIONS_DIR / session_id
    if not session_dir.exists():
        raise HTTPException(status_code=404, detail="Session not found")

    ext = Path(file.filename or "audio.webm").suffix.lower()
    allowed = {".webm", ".mp3", ".wav", ".m4a"}
    if ext not in allowed:
        raise HTTPException(status_code=422, detail=f"지원하지 않는 파일 형식입니다. 지원: {', '.join(allowed)}")

    # #10: Save to chunks dir so audio_chunks_dir stays a directory path
    chunks_dir = session_dir / "chunks"
    chunks_dir.mkdir(exist_ok=True)
    upload_path = chunks_dir / f"uploaded{ext}"

    # #5: Stream to disk in chunks to avoid OOM
    MAX_SIZE = 500 * 1024 * 1024
    total = 0
    with open(upload_path, "wb") as f:
        while chunk := await file.read(1024 * 1024):
            total += len(chunk)
            if total > MAX_SIZE:
                f.close()
                upload_path.unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail="파일 크기가 500MB를 초과합니다")
            f.write(chunk)

    session = _load_session(session_id)
    session.audio_chunks_dir = str(chunks_dir)
    session.status = "post_recording"
    _save_session(session)

    # #12: Don't expose server file path
    return {"status": "uploaded", "filename": file.filename, "size": total}
