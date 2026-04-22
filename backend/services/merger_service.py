from typing import List
from uuid import uuid4

from models.block import Block

TOLERANCE = 2.0  # seconds


def _overlap(start1: float, end1: float, start2: float, end2: float) -> float:
    """Calculate overlap duration between two time ranges."""
    overlap_start = max(start1, start2)
    overlap_end = min(end1, end2)
    return max(0.0, overlap_end - overlap_start)


def _find_best_overlap(
    whisper_segments: list[dict],
    ts_start: float,
    ts_end: float,
) -> dict | None:
    """Find the Whisper segment with the most overlap to the given time range."""
    best = None
    best_overlap = 0.0

    for seg in whisper_segments:
        seg_start = seg["start"]
        seg_end = seg["end"]

        overlap = _overlap(
            ts_start - TOLERANCE, ts_end + TOLERANCE,
            seg_start, seg_end,
        )

        if overlap > best_overlap:
            best_overlap = overlap
            best = seg

    return best


def merge_blocks(
    web_speech_blocks: List[Block],
    whisper_segments: list[dict],
) -> List[Block]:
    """
    Merge Web Speech blocks with Whisper segments.

    Rules (technical-design.md section 8):
    1. Edited blocks (is_edited=True) are always preserved (locked).
    2. Unedited blocks are replaced with the best-matching Whisper segment.
    3. Matching uses ±2s tolerance, picks segment with largest overlap.
    """
    if not whisper_segments:
        return web_speech_blocks

    used_segments: set[int] = set()
    merged: List[Block] = []

    for ws_block in web_speech_blocks:
        if ws_block.is_edited:
            # Locked: preserve user edit as-is
            merged.append(ws_block)
            continue

        matching = _find_best_overlap(
            whisper_segments,
            ws_block.timestamp_start,
            ws_block.timestamp_end,
        )

        if matching:
            seg_idx = whisper_segments.index(matching)
            used_segments.add(seg_idx)

            merged.append(Block(
                block_id=ws_block.block_id,
                timestamp_start=matching["start"],
                timestamp_end=matching["end"],
                text=matching["text"],
                source="whisper",
                is_edited=False,
                importance=ws_block.importance,
                importance_source=ws_block.importance_source,
                speaker=ws_block.speaker,
            ))
        else:
            # No matching Whisper segment — keep original
            merged.append(ws_block)

    # Add Whisper segments that didn't match any Web Speech block
    for i, seg in enumerate(whisper_segments):
        if i in used_segments:
            continue

        # Check if this segment overlaps with any edited (locked) block
        overlaps_locked = False
        for block in web_speech_blocks:
            if block.is_edited:
                overlap = _overlap(
                    block.timestamp_start - TOLERANCE,
                    block.timestamp_end + TOLERANCE,
                    seg["start"], seg["end"],
                )
                if overlap > 0:
                    overlaps_locked = True
                    break

        if overlaps_locked:
            continue

        # New segment from Whisper — insert at correct position
        merged.append(Block(
            block_id=f"blk_w_{uuid4().hex[:6]}",
            timestamp_start=seg["start"],
            timestamp_end=seg["end"],
            text=seg["text"],
            source="whisper",
        ))

    # Sort by timestamp
    merged.sort(key=lambda b: b.timestamp_start)

    return merged
