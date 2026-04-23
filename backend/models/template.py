from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class TemplateDefaults(BaseModel):
    title: str = ""
    participants: List[str] = Field(default_factory=list)
    location: Optional[str] = None
    language: str = "ko-KR"
    slack_channel_id: Optional[str] = None


class Template(BaseModel):
    template_id: str
    name: str
    defaults: TemplateDefaults = Field(default_factory=TemplateDefaults)
    order: int = 0
    created_at: str = Field(default_factory=lambda: datetime.now().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now().isoformat())
