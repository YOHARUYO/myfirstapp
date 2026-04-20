from fastapi import APIRouter, HTTPException

from config import SESSIONS_DIR
from models.session import Session

router = APIRouter(prefix="/api/recovery", tags=["recovery"])


@router.get("")
def list_recoverable():
    results = []
    if not SESSIONS_DIR.exists():
        return results
    for d in SESSIONS_DIR.iterdir():
        if d.is_dir():
            sf = d / "session.json"
            if sf.exists():
                s = Session.model_validate_json(sf.read_text(encoding="utf-8"))
                if s.status != "completed":
                    results.append({
                        "session_id": s.session_id,
                        "status": s.status,
                        "title": s.metadata.title,
                        "date": s.metadata.date,
                        "participants": s.metadata.participants,
                        "created_at": s.created_at,
                    })
    return results
