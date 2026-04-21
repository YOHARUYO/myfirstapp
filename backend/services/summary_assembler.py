import re
from typing import Optional


def format_duration(seconds: Optional[int]) -> str:
    if not seconds:
        return "미확인"
    h, remainder = divmod(seconds, 3600)
    m, _ = divmod(remainder, 60)
    if h > 0:
        return f"{h}시간 {m}분"
    return f"{m}분"


def build_overview_section(metadata: dict) -> str:
    lines = ["## 회의 개요"]

    start = metadata.get("start_time", "")
    end = metadata.get("end_time", "")
    duration = metadata.get("duration_seconds")
    time_str = f"{start} ~ {end}" if start and end else start or "미입력"
    if duration:
        time_str += f" ({format_duration(duration)})"
    lines.append(f"- 회의 시간: {time_str}")

    lines.append(f"- 장소: {metadata.get('location') or '미입력'}")

    participants = metadata.get("participants", [])
    participants_str = ", ".join(participants) if participants else "미입력"
    lines.append(f"- 참여자: {participants_str}")

    lines.append(f"- 언어: {metadata.get('language', '미입력')}")

    return "\n".join(lines)


def split_keywords(claude_response: str) -> tuple[str, list[str]]:
    """Split Keywords line from Claude response body."""
    lines = claude_response.strip().split("\n")
    keywords: list[str] = []
    body_lines: list[str] = []

    for line in lines:
        if line.strip().startswith("Keywords:"):
            raw = line.split(":", 1)[1].strip()
            # Parse [kw1, kw2, ...] or kw1, kw2, ...
            raw = raw.strip("[]")
            keywords = [k.strip().strip('"').strip("'") for k in raw.split(",") if k.strip()]
        else:
            body_lines.append(line)

    # Remove trailing empty lines
    while body_lines and not body_lines[-1].strip():
        body_lines.pop()

    return "\n".join(body_lines), keywords


def extract_action_items(summary_markdown: str) -> list[dict]:
    """Extract F/U items from summary markdown."""
    items: list[dict] = []
    current_topic: str | None = None
    in_fu_section = False
    fu_counter = 0

    for line in summary_markdown.split("\n"):
        # Track topic headings (### 1. Topic Name)
        topic_match = re.match(r"###\s+\d+\.\s+(.+)", line)
        if topic_match:
            current_topic = topic_match.group(1).strip()
            in_fu_section = False
            continue

        # Detect F/U section
        if "F/U" in line and ("**" in line or "필요" in line):
            in_fu_section = True
            continue

        # Detect exit from F/U section
        if line.startswith("### ") or line.startswith("## "):
            in_fu_section = False
            if line.startswith("### "):
                topic_match = re.match(r"###\s+\d+\.\s+(.+)", line)
                if topic_match:
                    current_topic = topic_match.group(1).strip()
            continue

        # Parse F/U bullet
        if in_fu_section and line.strip().startswith("- "):
            fu_counter += 1
            text = line.strip()[2:].strip()

            # Extract @assignee
            assignee = None
            assignee_match = re.search(r"[@＠](\S+?)[\]\s]", text)
            if assignee_match:
                assignee = assignee_match.group(1)

            # Extract ~deadline
            deadline = None
            deadline_match = re.search(r"[~～](\d{2}/\d{2}|\d{4}-\d{2}-\d{2})", text)
            if deadline_match:
                deadline = deadline_match.group(1)

            # Clean task text
            task = text
            if assignee_match:
                task = task.replace(assignee_match.group(0), "").strip()
            if deadline_match:
                task = task.replace(deadline_match.group(0), "").strip()
            task = re.sub(r"^[\[\(]?\s*", "", task).strip()

            items.append({
                "fu_id": f"fu_{fu_counter:03d}",
                "assignee": assignee,
                "task": task,
                "deadline": deadline,
                "source_topic": current_topic,
            })

    return items


def assemble_full_summary(
    metadata: dict,
    claude_response: str,
    date_str: str,
    title: str,
) -> tuple[str, list[str], list[dict]]:
    """
    Assemble full summary markdown from metadata + Claude response.

    Returns (full_markdown, keywords, action_items).
    """
    overview = build_overview_section(metadata)
    header = f"# {date_str} {title}"

    body, keywords = split_keywords(claude_response)

    full_markdown = f"{header}\n\n{overview}\n\n{body}"

    action_items = extract_action_items(full_markdown)

    return full_markdown, keywords, action_items
