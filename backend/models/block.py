from pydantic import BaseModel, Field
from typing import Optional, Literal


class Block(BaseModel):
    block_id: str
    timestamp_start: float
    timestamp_end: float
    text: str
    source: Literal["web_speech", "whisper", "user_edit"] = "web_speech"
    is_edited: bool = False
    importance: Optional[Literal["high", "medium", "low", "lowest"]] = None
    importance_source: Optional[Literal["user", "ai"]] = None
    speaker: Optional[str] = None
