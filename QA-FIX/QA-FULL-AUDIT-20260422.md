# 전체 기획 대비 누락 — 수정 7건

> 작성일: 2026-04-22
> 작성자: 검수(QA) 세션
> 대상: 개발 세션
> 근거: decisions.md + technical-design.md 전수 대조

---

## 🔴 수정 1: Recording.tsx beforeunload 경고 없음

**파일:** `frontend/src/pages/Recording.tsx`
**설계:** decisions.md — "창 닫힘 / 새로고침: beforeunload 경고"

Recording.tsx에 beforeunload 핸들러가 없음. Processing.tsx에는 구현되어 있으므로 동일 패턴 적용:

```tsx
// 녹음 중 + post_recording 상태에서 beforeunload 경고
useEffect(() => {
  if (recordingState === 'idle') return;
  const handler = (e: BeforeUnloadEvent) => {
    e.preventDefault();
  };
  window.addEventListener('beforeunload', handler);
  return () => window.removeEventListener('beforeunload', handler);
}, [recordingState]);
```

---

## 🔴 수정 2: `POST /api/meetings/{id}/export-md` 없음

**파일:** `backend/routers/history.py`
**설계:** technical-design.md 4-7절

HistoryDetail.tsx에서 호출하지만 백엔드에 엔드포인트 없음 → 404.

```python
@router.post("/{meeting_id}/export-md")
def export_meeting_md(meeting_id: str):
    """Generate and save .md file from completed meeting."""
    import re as _re
    from config import EXPORT_DIR

    path = MEETINGS_DIR / f"{meeting_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Meeting not found")
    m = Meeting.model_validate_json(path.read_text(encoding="utf-8"))

    if not m.summary_markdown:
        raise HTTPException(status_code=400, detail="No summary to export")

    parts = [m.summary_markdown]

    if m.action_items:
        parts.append("\n\n---\n\n## 전체 F/U 요약")
        for item in m.action_items:
            line = "- "
            if item.assignee:
                line += f"[@{item.assignee}] "
            line += item.task
            if item.deadline:
                line += f" ~{item.deadline}"
            if item.source_topic:
                line += f" — {item.source_topic}"
            parts.append(line)

    parts.append("\n\n---\n\n## 전사 원본")
    for block in m.blocks:
        ts = int(block.timestamp_start)
        mins, secs = divmod(ts, 60)
        parts.append(f"[{mins:02d}:{secs:02d}] {block.text}")

    md_content = "\n".join(parts)

    title_safe = _re.sub(r'[<>:"/\\|?*]', '_', m.metadata.title or 'meeting')
    date_str = (m.metadata.date or '').replace('-', '')
    filename = f"{title_safe}_{date_str}.md"
    export_path = EXPORT_DIR / filename
    export_path.parent.mkdir(parents=True, exist_ok=True)
    export_path.write_text(md_content, encoding="utf-8")

    return {"filename": filename}
```

---

## 🔴 수정 3: `POST /api/meetings/{id}/resummarize` 없음

**파일:** `backend/routers/history.py`
**설계:** technical-design.md 4-7절 — "기존 Meeting 대상 요약 재생성"

히스토리 재편집 후 재요약 시 필요:

```python
@router.post("/{meeting_id}/resummarize")
def resummarize_meeting(meeting_id: str):
    """Re-generate AI summary for an existing meeting."""
    from services.claude_service import summarize_blocks
    from services.summary_assembler import assemble_full_summary
    from datetime import datetime

    path = MEETINGS_DIR / f"{meeting_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Meeting not found")
    m = Meeting.model_validate_json(path.read_text(encoding="utf-8"))

    if not m.blocks:
        raise HTTPException(status_code=400, detail="No blocks to summarize")

    claude_response = summarize_blocks(
        m.blocks,
        m.metadata.title,
        m.metadata.participants,
        m.metadata.date or "",
    )

    date_str = m.metadata.date or datetime.now().strftime("%Y-%m-%d")
    try:
        dt = datetime.strptime(date_str, "%Y-%m-%d")
        weekdays = ["월", "화", "수", "목", "금", "토", "일"]
        date_str = f"{dt.strftime('%m/%d')}({weekdays[dt.weekday()]})"
    except (ValueError, IndexError):
        pass

    metadata_dict = m.metadata.model_dump()
    full_markdown, keywords, action_items = assemble_full_summary(
        metadata_dict, claude_response, date_str, m.metadata.title,
    )

    m.summary_markdown = full_markdown
    m.action_items = action_items
    m.keywords = keywords
    path.write_text(m.model_dump_json(indent=2), encoding="utf-8")

    return {
        "summary_markdown": full_markdown,
        "action_items": [item for item in action_items],
        "keywords": keywords,
    }
```

---

## 🔴 수정 4: `POST /api/meetings/{id}/resend-slack` 없음

**파일:** `backend/routers/history.py`
**설계:** technical-design.md 4-7절 — "Slack 재전송 (다른 채널/스레드 선택 가능)"

```python
@router.post("/{meeting_id}/resend-slack")
def resend_meeting_slack(meeting_id: str, channel_id: str, thread_ts: str = None):
    """Re-send meeting to Slack (different channel/thread allowed)."""
    from routers.slack import _get_slack_client, _build_slack_message, _resolve_user_name
    from config import DATA_DIR, EXPORT_DIR
    import json as _json

    path = MEETINGS_DIR / f"{meeting_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Meeting not found")
    m = Meeting.model_validate_json(path.read_text(encoding="utf-8"))

    # Load greeting from settings
    greeting = ""
    settings_path = DATA_DIR / "settings.json"
    if settings_path.exists():
        try:
            settings_data = _json.loads(settings_path.read_text(encoding="utf-8"))
            greeting = settings_data.get("slack_greeting", "")
        except Exception:
            pass

    # Build and send (reuse slack.py logic)
    # Note: This reuses Session-like interface, so convert Meeting fields
    # Alternatively, call POST /api/slack/send with meeting_id
    # For now, redirect to existing slack send endpoint
    from pydantic import BaseModel as _BM
    class _Req(_BM):
        session_id: str
        channel_id: str
        thread_ts: str | None = None
        attach_md: bool = True

    from routers.slack import send_slack_message as _send
    req = _Req(session_id=meeting_id, channel_id=channel_id, thread_ts=thread_ts)

    # This won't work directly because slack.py's _load_session looks in SESSIONS_DIR
    # Better approach: extend POST /api/slack/send to accept meeting_id too
    raise HTTPException(status_code=501, detail="Not yet implemented — use POST /api/slack/send with meeting_id")
```

**참고:** 현재 `POST /api/slack/send`의 `_load_session`이 sessions 디렉토리만 검색하므로, meeting_id를 전달하면 404가 됨. 두 가지 방법:

**방법 A (권장):** `slack.py`의 `_load_session`을 확장하여 sessions에 없으면 meetings에서도 탐색:
```python
def _load_session_or_meeting(id: str):
    # Try sessions first
    session_path = SESSIONS_DIR / id / "session.json"
    if session_path.exists():
        return Session.model_validate_json(session_path.read_text(encoding="utf-8"))
    # Try meetings
    meeting_path = MEETINGS_DIR / f"{id}.json"
    if meeting_path.exists():
        m = Meeting.model_validate_json(meeting_path.read_text(encoding="utf-8"))
        # Convert to Session-like for message building
        return m  # Meeting has same summary_markdown, action_items, metadata fields
    raise HTTPException(status_code=404, detail="Session or meeting not found")
```

**방법 B:** history.py에 독립 엔드포인트로 메시지 빌드+전송을 구현.

---

## 🟡 수정 5: Recording.tsx 회의 정보 패널 기본 접힘

**파일:** `frontend/src/pages/Recording.tsx`
**설계:** decisions.md (최신) — "접기 가능, **기본 접힘** (녹음 시작 후 참조 빈도 낮음, 전사 영역 최대화)"

**현재:** `const [infoExpanded, setInfoExpanded] = useState(true);`

**수정:**
```tsx
const [infoExpanded, setInfoExpanded] = useState(false);
```

---

## 🟡 수정 6: Summary.tsx 전체 화면 로딩 오버레이

**파일:** `frontend/src/pages/Summary.tsx`
**설계:** decisions.md 기획 변경 #1 — "전체 화면 로딩 오버레이 — 스피너 + AI 요약 생성 중…"

**현재:** 페이지 내부에 로딩 표시 (mt-20 위치).

**수정:** 로딩 시 fixed 오버레이:
```tsx
{loading && (
  <div className="fixed inset-0 z-50 bg-bg/80 flex flex-col items-center justify-center gap-4">
    <Loader2 size={32} className="text-primary animate-spin" />
    <p className="text-[15px] text-text-secondary">AI 요약을 생성하고 있습니다...</p>
  </div>
)}
```

---

## 🟡 수정 7: 검색 스니펫 미구현 (A-4 잔여)

**파일:** `backend/routers/history.py` + `frontend/src/pages/History.tsx`
**설계:** decisions.md — "검색 결과에 매칭 스니펫 (검색어 주변 텍스트) 표시, 매칭 필드 하이라이트"

이전 `QA-FIX/QA-SPRINT5-FIX2-20260422.md` 수정 5에 상세 코드 포함되어 있음. 해당 파일의 수정 5를 그대로 구현하면 됨:
- 백엔드: `_extract_snippet()` 함수 + search 응답에 `snippet`, `matched_field` 필드 추가
- 프론트: History.tsx 카드에 스니펫 표시 + 검색어 `<mark>` 하이라이트

---

## 수정 완료 후

```
QA-FIX/QA-FULL-AUDIT-20260422.md 7건 수정 완료했어. 확인해줘.
```
