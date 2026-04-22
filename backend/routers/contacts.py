import asyncio
import json
from datetime import datetime
from uuid import uuid4

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from config import DATA_DIR

router = APIRouter(prefix="/api/contacts", tags=["contacts"])

CONTACTS_FILE = DATA_DIR / "contacts.json"
_contacts_lock = asyncio.Lock()


def _load_contacts() -> dict:
    if not CONTACTS_FILE.exists():
        return {"participants": [], "locations": []}
    return json.loads(CONTACTS_FILE.read_text(encoding="utf-8"))


def _save_contacts(data: dict) -> None:
    CONTACTS_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


class ContactRequest(BaseModel):
    name: str


# --- Participants ---
@router.get("/participants")
def list_participants():
    return _load_contacts()["participants"]


@router.post("/participants")
async def add_participant(req: ContactRequest):
    async with _contacts_lock:
        data = _load_contacts()
        entry = {
            "id": f"p_{uuid4().hex[:12]}",
            "name": req.name,
            "created_at": datetime.now().strftime("%Y-%m-%d"),
        }
        data["participants"].append(entry)
        _save_contacts(data)
    return entry


@router.patch("/participants/{pid}")
async def update_participant(pid: str, req: ContactRequest):
    async with _contacts_lock:
        data = _load_contacts()
        for p in data["participants"]:
            if p["id"] == pid:
                p["name"] = req.name
                _save_contacts(data)
                return p
    raise HTTPException(status_code=404, detail="Participant not found")


@router.delete("/participants/{pid}")
async def delete_participant(pid: str):
    async with _contacts_lock:
        data = _load_contacts()
        original_len = len(data["participants"])
        data["participants"] = [p for p in data["participants"] if p["id"] != pid]
        if len(data["participants"]) == original_len:
            raise HTTPException(status_code=404, detail="Participant not found")
        _save_contacts(data)
    return {"deleted": pid}


# --- Locations ---
@router.get("/locations")
def list_locations():
    return _load_contacts()["locations"]


@router.post("/locations")
async def add_location(req: ContactRequest):
    async with _contacts_lock:
        data = _load_contacts()
        entry = {
            "id": f"l_{uuid4().hex[:12]}",
            "name": req.name,
            "created_at": datetime.now().strftime("%Y-%m-%d"),
        }
        data["locations"].append(entry)
        _save_contacts(data)
    return entry


@router.patch("/locations/{lid}")
async def update_location(lid: str, req: ContactRequest):
    async with _contacts_lock:
        data = _load_contacts()
        for l in data["locations"]:
            if l["id"] == lid:
                l["name"] = req.name
                _save_contacts(data)
                return l
    raise HTTPException(status_code=404, detail="Location not found")


@router.delete("/locations/{lid}")
async def delete_location(lid: str):
    async with _contacts_lock:
        data = _load_contacts()
        original_len = len(data["locations"])
        data["locations"] = [l for l in data["locations"] if l["id"] != lid]
        if len(data["locations"]) == original_len:
            raise HTTPException(status_code=404, detail="Location not found")
        _save_contacts(data)
    return {"deleted": lid}
