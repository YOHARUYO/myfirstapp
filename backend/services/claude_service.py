"""Compat wrapper — LLM 호출 진입점.

Phase 1A (2026-06-05) 이후 본문은 services/llm/{base,claude,factory}.py로 이전됨.
이 파일은 호출처 6곳(ai.py, processing.py, history.py 2곳, sessions.py)의
import 경로와 시그니처를 보존하기 위한 얇은 래퍼다.

importance_source="user" 필터링 책임은 이 래퍼에 둔다(provider는 순수).

provider가 던지는 anthropic 에러(특히 401 AuthenticationError)는 HTTPException(502)로
변환한다. 이유: main.py의 Basic Auth 미들웨어가 401 응답에 WWW-Authenticate: Basic
헤더를 붙이는 구조라, 원본 401이 그대로 전파되면 브라우저가 cloudflared 자격증명을
다시 요구하는 무한 프롬프트가 발생한다.
"""

from typing import List

import anthropic
from fastapi import HTTPException

from models.block import Block
from services.llm.factory import get_provider


def _safe_call(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except anthropic.AuthenticationError as e:
        raise HTTPException(
            status_code=502,
            detail=f"LLM 인증 실패 (설정의 API 키를 확인해주세요): {e!s}",
        )
    except anthropic.APIStatusError as e:
        detail = f"LLM API 오류 ({e.status_code}): {e!s}"
        # 모델 retire / 미존재 케이스를 한국어 안내로 변환
        error_str = str(e).lower()
        if e.status_code == 404 and ("model" in error_str or "not_found" in error_str):
            detail = (
                "요약·태깅 모델이 더 이상 제공되지 않거나 잘못된 ID입니다. "
                "설정 → 연동 → LLM에서 모델 ID를 최신으로 갱신해주세요. "
                f"(원본: {e!s})"
            )
        raise HTTPException(status_code=502, detail=detail)
    except anthropic.APIError as e:
        raise HTTPException(status_code=502, detail=f"LLM 호출 실패: {e!s}")


def tag_blocks(
    blocks: List[Block],
    title: str = "",
    participants: List[str] | None = None,
) -> dict[str, str]:
    """AI importance tagging for untagged blocks.

    Returns dict of {block_id: importance} for blocks that were tagged.
    Only tags blocks where importance_source != "user".
    """
    untagged = [b for b in blocks if b.importance_source != "user"]
    if not untagged:
        return {}
    return _safe_call(get_provider().tag, untagged, title, participants)


def summarize_blocks(
    blocks: List[Block],
    title: str = "",
    participants: List[str] | None = None,
    date: str = "",
) -> str:
    """Generate meeting summary. Only high+medium importance blocks are used internally."""
    return _safe_call(get_provider().summarize, blocks, title, participants, date)
