import json
from typing import List

import anthropic

from config import ANTHROPIC_API_KEY
from models.block import Block


_client: anthropic.Anthropic | None = None


def _get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    return _client


TAGGING_SYSTEM_PROMPT = """당신은 회의 전사 텍스트의 중요도를 분류하는 전문가입니다.
각 블록에 다음 4단계 중 하나를 부여하세요:

- high: 핵심 결정사항, 액션 아이템, 중요 논의 포인트
- medium: 관련 맥락, 배경 설명, 보조 논의
- low: 부가적 내용, 간접 관련 사항
- lowest: 사담, 인사말, 잡담, 주제 이탈

JSON 배열로 응답하세요. 다른 텍스트는 포함하지 마세요."""


def tag_blocks(
    blocks: List[Block],
    title: str = "",
    participants: List[str] | None = None,
) -> dict[str, str]:
    """
    AI importance tagging for untagged blocks using Claude Haiku.

    Returns dict of {block_id: importance} for blocks that were tagged.
    Only tags blocks where importance_source != "user" (user tags are never overwritten).
    """
    # Filter to untagged blocks only (user tags preserved)
    untagged = [b for b in blocks if b.importance_source != "user"]
    if not untagged:
        return {}

    blocks_text = "\n".join(
        f"[{b.block_id}] {b.text}" for b in untagged
    )

    participants_str = ", ".join(participants) if participants else "미입력"

    user_prompt = f"""회의 제목: {title}
참여자: {participants_str}

전사 블록:
{blocks_text}

응답 형식:
[
  {{"block_id": "blk_001", "importance": "medium"}},
  ...
]"""

    client = _get_client()
    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=4096,
        system=[{
            "type": "text",
            "text": TAGGING_SYSTEM_PROMPT,
            "cache_control": {"type": "ephemeral"},
        }],
        messages=[{"role": "user", "content": user_prompt}],
    )

    result_text = response.content[0].text.strip()

    # Parse JSON response
    try:
        tags = json.loads(result_text)
    except json.JSONDecodeError:
        # Try to extract JSON array from response
        start = result_text.find("[")
        end = result_text.rfind("]") + 1
        if start >= 0 and end > start:
            tags = json.loads(result_text[start:end])
        else:
            return {}

    return {
        item["block_id"]: item["importance"]
        for item in tags
        if "block_id" in item and "importance" in item
    }


SUMMARY_SYSTEM_PROMPT = """당신은 회의 전사 텍스트를 구조화된 회의록으로 정리하는 전문가입니다.
아래 템플릿 구조를 정확히 따르세요.

## 주요 논의 사항 & F/U 필요 요소 섹션 작성 규칙:
1. 전사 내용에서 주요 주제를 식별하여 번호를 매깁니다
2. 각 주제 안에서 "주요 논의"와 "F/U 필요 사항"을 분리합니다
3. F/U 항목에는 담당자(@이름)와 기한(~날짜)을 포함합니다 (전사에서 확인된 경우만)
4. 주제에 속하지 않는 부가 내용은 "기타 메모"에 포함합니다

응답 시 "## 회의 개요" 섹션은 생성하지 마세요 (메타데이터에서 자동 삽입됩니다).
마지막에 Keywords 줄을 추가하세요."""


def summarize_blocks(
    blocks: List[Block],
    title: str = "",
    participants: List[str] | None = None,
    date: str = "",
) -> str:
    """
    Generate meeting summary using Claude Sonnet.
    Only high+medium importance blocks are passed as input.
    Returns raw Claude response text.
    """
    filtered = [b for b in blocks if b.importance in ("high", "medium")]
    if not filtered:
        filtered = blocks

    blocks_text = "\n".join(
        f"[{b.timestamp_start:.0f}s] {b.text}" for b in filtered
    )

    participants_str = ", ".join(participants) if participants else "미입력"

    user_prompt = f"""회의 제목: {title}
참여자: {participants_str}
회의 날짜: {date}

전사 텍스트 (중요도 상+중 블록만):
{blocks_text}

---
다음 형식으로 응답하세요:

## 주요 논의 사항 & F/U 필요 요소

### 1. [주제명]
**주요 논의**
- ...

**F/U 필요 사항**
- [@담당자] 할 일 (~기한)

### 2. [주제명]
...

---

## 기타 메모
- ...

Keywords: [키워드1, 키워드2, ...]"""

    client = _get_client()
    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=8192,
        system=[{
            "type": "text",
            "text": SUMMARY_SYSTEM_PROMPT,
            "cache_control": {"type": "ephemeral"},
        }],
        messages=[{"role": "user", "content": user_prompt}],
    )

    return response.content[0].text.strip()
