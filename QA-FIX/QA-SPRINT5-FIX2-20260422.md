# Sprint 5 검수 — 잔여 수정 5건

> 작성일: 2026-04-22
> 작성자: 검수(QA) 세션
> 대상: 개발 세션

---

## 🔴 수정 1: `POST /meetings/{id}/export-md` 엔드포인트 없음 (404)

**파일:** `backend/routers/history.py`
**현재 문제:**

`HistoryDetail.tsx:320`에서 `POST /meetings/${meetingId}/export-md`를 호출하지만, history 라우터에는 `GET ("")`, `GET ("/search")`, `GET ("/{meeting_id}")`만 있음. → 404 에러.

기존 `sessions.py`에 `/sessions/{id}/export-md`가 있으나 Meeting은 Session이 아니므로 경로가 다름.

**수정:** `backend/routers/history.py`에 엔드포인트 추가:

```python
@router.post("/{meeting_id}/export-md")
def export_meeting_md(meeting_id: str):
    """Generate and save .md file from completed meeting."""
    import re
    from config import EXPORT_DIR

    path = MEETINGS_DIR / f"{meeting_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Meeting not found")

    m = Meeting.model_validate_json(path.read_text(encoding="utf-8"))

    if not m.summary_markdown:
        raise HTTPException(status_code=400, detail="No summary to export")

    parts = [m.summary_markdown]

    # Action items
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

    # Transcript
    parts.append("\n\n---\n\n## 전사 원본")
    for block in m.blocks:
        ts = int(block.timestamp_start)
        mins, secs = divmod(ts, 60)
        parts.append(f"[{mins:02d}:{secs:02d}] {block.text}")

    md_content = "\n".join(parts)

    title_safe = re.sub(r'[<>:"/\\|?*]', '_', m.metadata.title or 'meeting')
    date_str = m.metadata.date or ''
    filename = f"{title_safe}_{date_str.replace('-', '')}.md"
    export_path = EXPORT_DIR / filename
    export_path.parent.mkdir(parents=True, exist_ok=True)
    export_path.write_text(md_content, encoding="utf-8")

    return {"filename": filename}
```

**참고:** sessions.py의 `export_md`와 로직이 동일함. 중복이 신경 쓰이면 `services/export_service.py`로 공통 함수를 추출해도 되나, 지금은 우선 동작을 보장.

---

## 🟡 수정 2: 복구 세션 존재 시 "새 회의 시작" 버튼 안내 없음

**파일:** `frontend/src/pages/Home.tsx` 112~118행
**설계 근거:** decisions.md — 동시 세션 방지: 미완료 세션 있으면 새 세션 생성 거부 (409)

**현재:** 복구 배너와 "새 회의 시작" 버튼이 동시에 표시됨. 클릭하면 서버가 409를 반환하지만 사용자는 이유를 모름.

**수정:**

```tsx
<button
  onClick={() => navigate('/setup')}
  disabled={recoverable.length > 0}
  className="w-full max-w-xs mt-8 py-3 px-5 bg-primary text-white rounded-lg text-[15px] font-semibold hover:bg-primary-hover transition-colors cursor-pointer flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed"
>
  <Mic size={20} />
  새 회의 시작
</button>
{recoverable.length > 0 && (
  <p className="mt-2 text-xs text-text-tertiary text-center">
    진행 중인 회의를 완료하거나 삭제한 후 새 회의를 시작할 수 있습니다
  </p>
)}
```

---

## 🟡 수정 3: 탭 복귀 시 항상 "누락 가능" 토스트 표시

**파일:** `frontend/src/pages/Recording.tsx` 79~87행
**설계 근거:** decisions.md — "**실제로 중단·재연결된 경우에만** 표시. 정상 복귀 시에는 표시 안 함"

**현재:**
```tsx
useVisibility(useCallback(() => {
  if (recordingState === 'recording') {
    try {
      webSpeech.stop();
      webSpeech.start();
      // ← 항상 표시
      setToast({ message: '탭 복귀: 전사를 재연결했습니다...', visible: true });
    } catch {}
  }
}, [recordingState]));
```

탭을 잠깐 전환했다 돌아와도 Web Speech가 정상 동작 중이었을 수 있음. 모든 경우에 경고하면 불필요한 불안을 줌.

**수정:** Web Speech가 실제로 중단됐는지 확인 후 조건부 표시:

```tsx
useVisibility(useCallback(() => {
  if (recordingState === 'recording') {
    // Web Speech가 실제로 중단됐는지 확인
    const wasDisconnected = !webSpeech.isActive();
    try {
      webSpeech.stop();
      webSpeech.start();
    } catch {}
    // 중단·재연결된 경우에만 토스트
    if (wasDisconnected) {
      setToast({ message: '탭 복귀: 전사를 재연결했습니다. 일부 전사가 누락됐을 수 있습니다.', visible: true });
    }
  }
}, [recordingState, webSpeech]));
```

`useWebSpeech` 훅에 `isActive()` 메서드 추가 필요:
```typescript
// useWebSpeech.ts에 추가
const isActive = useCallback(() => {
  return recognitionRef.current !== null && /* recognition이 현재 동작 중인지 플래그 */;
}, []);

return { start, stop, flush, isActive };
```

**주의:** `useCallback` deps에 `webSpeech`도 추가 (수정 4 참조).

---

## 🟡 수정 4: useVisibility 콜백에 webSpeech 의존성 누락

**파일:** `frontend/src/pages/Recording.tsx` 79행

**현재:** `useCallback` deps가 `[recordingState]`만 — `webSpeech` 참조가 stale될 수 있음.

**수정:** 수정 3과 함께:
```tsx
useVisibility(useCallback(() => {
  if (recordingState === 'recording') {
    // ...수정 3 내용...
  }
}, [recordingState, webSpeech]));  // ← webSpeech 추가
```

---

## 🟡 수정 5: 검색 결과에 매칭 스니펫 표시

**파일:** `backend/routers/history.py` 40~75행, `frontend/src/pages/History.tsx`, `frontend/src/api/history.ts`, `frontend/src/types/index.ts`

### 5-A. 백엔드: search 응답에 snippet 필드 추가

**파일:** `backend/routers/history.py` — `search_meetings` 함수

```python
SNIPPET_RADIUS = 30  # 검색어 주변 ±30자

def _extract_snippet(text: str, query: str, radius: int = SNIPPET_RADIUS) -> str | None:
    """검색어 주변 텍스트를 잘라서 반환."""
    idx = text.lower().find(query.lower())
    if idx < 0:
        return None
    start = max(0, idx - radius)
    end = min(len(text), idx + len(query) + radius)
    snippet = text[start:end]
    if start > 0:
        snippet = "…" + snippet
    if end < len(text):
        snippet = snippet + "…"
    return snippet


@router.get("/search")
def search_meetings(
    q: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None, alias="from"),
    date_to: Optional[str] = Query(None, alias="to"),
):
    meetings = _load_all_meetings()
    results = []

    for m in meetings:
        if date_from and m.metadata.date < date_from:
            continue
        if date_to and m.metadata.date > date_to:
            continue

        snippet = None
        matched_field = None

        if q:
            q_lower = q.lower()

            # 필드별 순서대로 매칭 시도
            if q_lower in m.metadata.title.lower():
                matched_field = "title"
                snippet = _extract_snippet(m.metadata.title, q)
            elif any(q_lower in p.lower() for p in m.metadata.participants):
                matched_field = "participants"
            elif any(q_lower in k.lower() for k in m.keywords):
                matched_field = "keywords"
                snippet = next((k for k in m.keywords if q_lower in k.lower()), None)
            elif q_lower in m.summary_markdown.lower():
                matched_field = "summary"
                snippet = _extract_snippet(m.summary_markdown, q)
            else:
                # 전사 본문 검색
                for b in m.blocks:
                    if q_lower in b.text.lower():
                        matched_field = "transcript"
                        snippet = _extract_snippet(b.text, q)
                        break

            if not matched_field:
                continue

        results.append({
            "meeting_id": m.meeting_id,
            "title": m.metadata.title,
            "date": m.metadata.date,
            "duration_seconds": m.metadata.duration_seconds,
            "participants": m.metadata.participants,
            "slack_sent": m.slack_sent is not None,
            "local_file_path": m.local_file_path,
            "snippet": snippet,
            "matched_field": matched_field,
        })

    return results
```

### 5-B. 프론트: 타입 + API

**`frontend/src/types/index.ts`** — `MeetingListItem`에 추가:
```typescript
export interface MeetingListItem {
  // ...기존 필드...
  snippet?: string | null;
  matched_field?: string | null;
}
```

### 5-C. 프론트: History.tsx 카드에 스니펫 표시

`History.tsx`의 카드 내부, participants 아래에:

```tsx
const FIELD_LABELS: Record<string, string> = {
  title: '제목',
  participants: '참여자',
  keywords: '키워드',
  summary: '요약',
  transcript: '전사',
};

// 검색어 하이라이트
const highlightMatch = (text: string, query: string) => {
  if (!query) return text;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return text.split(regex).map((part, i) =>
    regex.test(part) ? <mark key={i} className="bg-primary/15 text-text px-0.5 rounded">{part}</mark> : part
  );
};

// 카드 내부에 추가
{searchQuery && m.snippet && (
  <div className="mt-1.5 text-xs text-text-tertiary">
    {m.matched_field && (
      <span className="text-primary font-medium mr-1.5">{FIELD_LABELS[m.matched_field] || m.matched_field}</span>
    )}
    <span>{highlightMatch(m.snippet, searchQuery)}</span>
  </div>
)}
```

---

## 수정 완료 후

```
QA-FIX/QA-SPRINT5-FIX2-20260422.md 5건 수정 완료했어. 확인해줘.
```
