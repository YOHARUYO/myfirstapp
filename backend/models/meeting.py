from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

from .base import MeetingMetadata, ActionItem
from .block import Block


class SlackSentInfo(BaseModel):
    channel_id: str
    channel_name: str
    thread_ts: Optional[str] = None
    message_ts: str
    sent_at: str
    deleted: bool = False
    deleted_at: Optional[str] = None


class Meeting(BaseModel):
    meeting_id: str
    created_at: str = Field(default_factory=lambda: datetime.now().isoformat())
    completed_at: Optional[str] = None
    metadata: MeetingMetadata = Field(default_factory=MeetingMetadata)
    blocks: List[Block] = Field(default_factory=list)
    summary_markdown: str = ""
    action_items: List[ActionItem] = Field(default_factory=list)
    keywords: List[str] = Field(default_factory=list)
    slack_sent: Optional[SlackSentInfo] = None
    local_file_path: Optional[str] = None
    merged_audio_path: Optional[str] = None
