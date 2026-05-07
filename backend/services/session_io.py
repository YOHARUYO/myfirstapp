"""Session persistence layer.

atomic write + per-session threading.Lock + corruption auto-recovery.

Both audio.py (async) and sessions.py (sync) share this module to serialize
read-modify-write on the same session.json. Sync handlers call directly:
    with get_session_lock(sid):
        session = load_session(sid)
        ...
        save_session(session)
Async handlers wrap the sync block with asyncio.to_thread.
"""
import json
import os
import tempfile
import threading
from datetime import datetime
from pathlib import Path

from fastapi import HTTPException

from config import SESSIONS_DIR
from models.session import Session


# ---- per-session locks ----
_session_locks: dict[str, threading.Lock] = {}
_meta_lock = threading.Lock()


def get_session_lock(session_id: str) -> threading.Lock:
    with _meta_lock:
        lock = _session_locks.get(session_id)
        if lock is None:
            lock = threading.Lock()
            _session_locks[session_id] = lock
        return lock


def release_session_lock(session_id: str) -> None:
    with _meta_lock:
        _session_locks.pop(session_id, None)


# ---- atomic write ----
def _atomic_write_text(path: Path, content: str) -> None:
    """Write to a sibling tempfile then os.replace; atomic on POSIX and Windows."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(
        dir=str(path.parent),
        prefix=f".{path.name}.",
        suffix=".tmp",
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(content)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_path, path)
    except Exception:
        try:
            os.unlink(tmp_path)
        except FileNotFoundError:
            pass
        raise


def save_session(session: Session) -> None:
    """Caller must hold get_session_lock(session_id) for read-modify-write atomicity."""
    path = SESSIONS_DIR / session.session_id / "session.json"
    _atomic_write_text(path, session.model_dump_json(indent=2))


# ---- load with auto-recovery (K) ----
def load_session(session_id: str) -> Session:
    path = SESSIONS_DIR / session_id / "session.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Session not found")

    raw = path.read_text(encoding="utf-8")
    try:
        return Session.model_validate_json(raw)
    except Exception as exc_first:
        # K: trailing-char corruption recovery — first valid JSON object only
        try:
            obj, _idx = json.JSONDecoder().raw_decode(raw)
            session = Session.model_validate(obj)
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_path = path.with_name(f"{path.name}.corrupted-{ts}")
            backup_path.write_text(raw, encoding="utf-8")
            _atomic_write_text(path, session.model_dump_json(indent=2))
            return session
        except Exception:
            raise HTTPException(
                status_code=500,
                detail=f"Session file is corrupted and could not be recovered: {exc_first}",
            )
