from pydantic import BaseModel, Field
from typing import Optional, List, Union
from datetime import datetime

from .base import MeetingMetadata, ActionItem
from .block import Block


class SlackMessage(BaseModel):
    """One Slack message in a meeting's send record (Phase 1B)."""
    ts: str
    text: str
    sent_at: str


class SlackTopicMessage(SlackMessage):
    """주제별 thread 회신 1건 (슬랙 포맷 v2, PLAN-DEV-HANDOFF-20260708)."""
    title: str = ""


class SlackMessages(BaseModel):
    """slack_sent.messages — v2: main 1건 + topics 배열 (주제별 분할 전송).

    호환: Phase 1B(06-05)~v2 이전 저장본은 topics가 단일 dict — Union이 그대로 수용.
    새 전송은 항상 배열로 기록한다.
    """
    main: Optional[SlackMessage] = None
    topics: Union[List[SlackTopicMessage], SlackTopicMessage, None] = None


class SlackSentInfo(BaseModel):
    channel_id: str
    channel_name: str
    thread_ts: Optional[str] = None
    # Phase 1B (2026-06-05) multi-message 구조 → v2 (2026-07-08) topics 배열형 확장.
    # 신규 전송은 이 구조에만 기록한다. 구 데이터는 message_ts/sent_at에 남아있어 호환.
    messages: SlackMessages = Field(default_factory=SlackMessages)
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
