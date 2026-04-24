import asyncio
import json
from datetime import datetime
from uuid import uuid4

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List

from config import DATA_DIR
from models.template import Template, TemplateDefaults

router = APIRouter(prefix="/api/templates", tags=["templates"])

TEMPLATES_FILE = DATA_DIR / "templates.json"
_templates_lock = asyncio.Lock()


def _load_templates() -> list[Template]:
    if not TEMPLATES_FILE.exists():
        return []
    data = json.loads(TEMPLATES_FILE.read_text(encoding="utf-8"))
    return [Template.model_validate(t) for t in data]


def _save_templates(templates: list[Template]) -> None:
    data = [t.model_dump() for t in templates]
    TEMPLATES_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


@router.get("")
def list_templates():
    templates = _load_templates()
    templates.sort(key=lambda t: t.order)
    return [t.model_dump() for t in templates]


class ReorderRequest(BaseModel):
    order: List[str]


@router.patch("/reorder")
async def reorder_templates(req: ReorderRequest):
    async with _templates_lock:
        templates = _load_templates()
        id_map = {t.template_id: t for t in templates}
        for idx, tid in enumerate(req.order):
            if tid in id_map:
                id_map[tid].order = idx
        _save_templates(templates)
    return {"success": True}


class CreateTemplateRequest(BaseModel):
    name: str
    defaults: TemplateDefaults = Field(default_factory=TemplateDefaults)


@router.post("")
async def create_template(req: CreateTemplateRequest):
    async with _templates_lock:
        templates = _load_templates()
        now = datetime.now().isoformat()
        max_order = max((t.order for t in templates), default=-1)
        tpl = Template(
            template_id=f"tpl_{uuid4().hex[:12]}",
            name=req.name,
            defaults=req.defaults,
            order=max_order + 1,
            created_at=now,
            updated_at=now,
        )
        templates.append(tpl)
        _save_templates(templates)
    return tpl.model_dump()


@router.patch("/{template_id}")
async def update_template(template_id: str, req: CreateTemplateRequest):
    async with _templates_lock:
        templates = _load_templates()
        for t in templates:
            if t.template_id == template_id:
                t.name = req.name
                t.defaults = req.defaults
                t.updated_at = datetime.now().isoformat()
                _save_templates(templates)
                return t.model_dump()
    raise HTTPException(status_code=404, detail="Template not found")


@router.delete("/{template_id}")
async def delete_template(template_id: str):
    async with _templates_lock:
        templates = _load_templates()
        original_len = len(templates)
        templates = [t for t in templates if t.template_id != template_id]
        if len(templates) == original_len:
            raise HTTPException(status_code=404, detail="템플릿을 찾을 수 없습니다")
        _save_templates(templates)
    return {"deleted": template_id}
