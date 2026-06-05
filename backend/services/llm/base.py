from abc import ABC, abstractmethod
from typing import List

from models.block import Block


class LLMProvider(ABC):
    """LLM provider 추상 인터페이스. tag/summarize 두 책임.

    importance_source="user" 필터링 책임은 호출자(claude_service 래퍼)에 있음.
    provider 구현은 입력된 모든 블록을 처리한다.
    """

    @abstractmethod
    def tag(
        self,
        blocks: List[Block],
        title: str = "",
        participants: List[str] | None = None,
    ) -> dict[str, str]:
        """Return {block_id: importance} for all input blocks."""

    @abstractmethod
    def summarize(
        self,
        blocks: List[Block],
        title: str = "",
        participants: List[str] | None = None,
        date: str = "",
    ) -> str:
        """Return raw markdown summary. ## 회의 개요 제외, Keywords 줄 포함."""
