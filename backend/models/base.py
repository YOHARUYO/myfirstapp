from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class MeetingMetadata(BaseModel):
    title: str = ""
    date: str = ""
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    duration_seconds: Optional[float] = None
    language: str = "ko-KR"
    participants: List[str] = Field(default_factory=list)
    location: Optional[str] = None
    template_id: Optional[str] = None


class ActionItem(BaseModel):
    fu_id: str
    assignee: Optional[str] = None
    task: str
    deadline: Optional[str] = None
    source_topic: Optional[str] = None
