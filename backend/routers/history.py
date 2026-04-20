from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from config import MEETINGS_DIR
from models.meeting import Meeting

router = APIRouter(prefix="/api/meetings", tags=["meetings"])


def _load_all_meetings() -> list[Meeting]:
    meetings = []
    if not MEETINGS_DIR.exists():
        return meetings
    for f in MEETINGS_DIR.glob("mtg_*.json"):
        m = Meeting.model_validate_json(f.read_text(encoding="utf-8"))
        meetings.append(m)
    meetings.sort(key=lambda m: m.created_at, reverse=True)
    return meetings


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

        if q:
            q_lower = q.lower()
            searchable = " ".join([
                m.metadata.title,
                " ".join(m.metadata.participants),
                " ".join(m.keywords),
                m.summary_markdown,
                " ".join(b.text for b in m.blocks),
            ]).lower()
            if q_lower not in searchable:
                continue

        results.append({
            "meeting_id": m.meeting_id,
            "title": m.metadata.title,
            "date": m.metadata.date,
            "duration_seconds": m.metadata.duration_seconds,
            "participants": m.metadata.participants,
        })

    return results


@router.get("/{meeting_id}")
def get_meeting(meeting_id: str):
    path = MEETINGS_DIR / f"{meeting_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Meeting not found")
    m = Meeting.model_validate_json(path.read_text(encoding="utf-8"))
    return m.model_dump()
