from pydantic import BaseModel, Field
from typing import Optional, List, Dict
from datetime import datetime

from .base import MeetingMetadata, ActionItem
from .block import Block


class SlackMessage(BaseModel):
    """One Slack message in a meeting's send record (Phase 1B)."""
    ts: str
    text: str
    sent_at: str


class SlackSentInfo(BaseModel):
    channel_id: str
    channel_name: str
    thread_ts: Optional[str] = None
    # Phase 1B (2026-06-05) — multi-message 구조. key는 "main" | "topics".
    # 신규 전송은 이 dict에만 기록한다. 구 데이터는 message_ts/sent_at에 남아있어 호환.
    messages: Dict[str, SlackMessage] = Field(default_factory=dict)
    # Legacy fields — Phase 1B 이전 데이터 호환용. 신규 전송은 messages.main.ts 사용.
    message_ts: Optional[str] = None
    sent_at: Optional[str] = None
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
