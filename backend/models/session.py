from pydantic import BaseModel, Field
from typing import Optional, List, Literal
from datetime import datetime

from .base import MeetingMetadata
from .block import Block


class RecordingGap(BaseModel):
    after_block_id: str
    gap_seconds: float


class Session(BaseModel):
    session_id: str
    status: Literal[
        "idle", "recording", "post_recording",
        "processing", "editing", "summarizing", "completed"
    ] = "idle"
    created_at: str = Field(default_factory=lambda: datetime.now().isoformat())
    input_mode: Literal["realtime", "upload"] = "realtime"
    metadata: MeetingMetadata = Field(default_factory=MeetingMetadata)
    audio_chunks_dir: str = ""
    audio_chunk_count: int = 0
    blocks: List[Block] = Field(default_factory=list)
    recording_gaps: List[RecordingGap] = Field(default_factory=list)
    ai_tagging_skipped: bool = False
    summary_markdown: str = ""
    action_items: List[dict] = Field(default_factory=list)
    keywords: List[str] = Field(default_factory=list)
