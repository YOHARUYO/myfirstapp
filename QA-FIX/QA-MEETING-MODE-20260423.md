# Meeting 모드(재편집/재전송) 근본 수정 — 6건

> 작성일: 2026-04-23
> 작성자: 검수(QA) 세션
> 대상: 개발 세션
> 범위: meeting 모드에서 API 경로 하드코딩 + 누락 엔드포인트 + 타입 불일치

---

## 배경

히스토리에서 "재편집" 또는 "재전송"으로 진입하면 `editMode='meeting'`, `session_id='mtg_xxx'`가 됨.
이때 여러 API 호출이 `/sessions/mtg_xxx/...`로 하드코딩되어 **전부 404**.
이로 인해 요약 재생성, 요약 저장, Slack 전송이 모두 실패.

---

## 🔴 R1: Summary.tsx — summarize/getSession 하드코딩

**현상:** 재편집 후 요약 재생성 시 404 → 빈 요약 → MD 다운로드 빈 파일

**파일:** `frontend/src/pages/Summary.tsx`

**원인:** `summarizeSession()`과 `getSession()` 모두 `/sessions/{id}` 하드코딩.
meeting 모드에서는 `/meetings/{id}/resummarize`와 `/meetings/{id}`를 호출해야 함.

**수정:** Summary.tsx에서 이미 `apiBase`를 계산하고 있으므로 (line 76), 이를 활용:

```tsx
// 기존 (Summary.tsx ~line 106-125)
const generateSummary = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const result = await summarizeSession(session.session_id);
      const updated = await getSession(session.session_id);
      setSession(updated);
      // ...
    } catch (e: any) {
      setError(e?.response?.data?.detail || '요약 생성에 실패했습니다');
    } finally {
      setLoading(false);
    }
  }, [session, setSession]);

// 수정: apiBase 기반 호출
const generateSummary = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      // meeting 모드: /meetings/{id}/resummarize, session 모드: /sessions/{id}/summarize
      const summarizeUrl = editMode === 'meeting'
        ? `${apiBase}/${session.session_id}/resummarize`
        : `${apiBase}/${session.session_id}/summarize`;
      const result = (await api.post(summarizeUrl)).data;

      // apiBase 기반 리로드
      const updated = (await api.get(`${apiBase}/${session.session_id}`)).data;
      setSession(updated);

      const firstLine = result.summary_markdown.split('\n')[0] || '';
      setTitleLine(firstLine);
      setSummaryBlocks(parseSummaryBlocks(result.summary_markdown));
      setActionItems(result.action_items);
    } catch (e: any) {
      setError(e?.response?.data?.detail || '요약 생성에 실패했습니다');
    } finally {
      setLoading(false);
    }
  }, [session, setSession, editMode, apiBase]);
```

`import { summarizeSession, getSession } from '../api/sessions'`에서 `summarizeSession`과 `getSession`이 이 파일에서 더 이상 사용되지 않으면 import에서 제거.

---

## 🔴 R2: history.py — PATCH summary/action-items 엔드포인트 누락

**현상:** 6단계에서 요약을 수동 편집 후 저장 시 404

**파일:** `backend/routers/history.py`

**원인:** `Summary.tsx:154-155`가 `api.patch('/meetings/{id}/summary')`, `api.patch('/meetings/{id}/action-items')`를 호출하지만, history.py에 해당 엔드포인트가 없음.
(sessions.py에는 `/sessions/{id}/summary`, `/sessions/{id}/action-items`가 있음 — line 241, 256)

**수정:** history.py에 2개 엔드포인트 추가 (sessions.py의 패턴을 따름):

```python
# history.py — resummarize_meeting 함수 뒤에 추가 (line 349 이후)

@router.patch("/{meeting_id}/summary")
def update_meeting_summary(meeting_id: str, req: dict):
    """Save edited summary markdown for a meeting (6단계 편집 확정 시)."""
    path = MEETINGS_DIR / f"{meeting_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Meeting not found")
    m = Meeting.model_validate_json(path.read_text(encoding="utf-8"))
    m.summary_markdown = req.get("summary_markdown", m.summary_markdown)
    path.write_text(m.model_dump_json(indent=2), encoding="utf-8")
    return {"ok": True}


@router.patch("/{meeting_id}/action-items")
def update_meeting_action_items(meeting_id: str, req: dict):
    """Save edited action items for a meeting (6단계 편집 확정 시)."""
    from .base import ActionItem  # 필요 시
    path = MEETINGS_DIR / f"{meeting_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Meeting not found")
    m = Meeting.model_validate_json(path.read_text(encoding="utf-8"))
    if "action_items" in req:
        m.action_items = req["action_items"]
    path.write_text(m.model_dump_json(indent=2), encoding="utf-8")
    return {"ok": True}
```

---

## 🔴 R3+R4: slack.py — ActionItem 타입 불일치로 Meeting 전송 크래시

**현상:** 재전송 시 `_build_slack_message`에서 `AttributeError` — `.get()` 호출 실패

**파일:** `backend/routers/slack.py:204-211`

**원인:**
- Session.action_items = `List[dict]` → `.get("assignee")` 동작 ✅
- Meeting.action_items = `List[ActionItem]` (pydantic 모델) → `.get("assignee")` 없음 ❌

**수정:** `_build_slack_message`에서 dict와 pydantic 객체 모두 처리:

```python
# 기존 (slack.py ~line 204-211)
    fu_bullets = []
    for item in session.action_items:
        assignee = item.get("assignee")
        task = item.get("task", "")
        line = f"• [@{assignee}] {task}" if assignee else f"• {task}"
        if item.get("deadline"):
            line += f" ~{item['deadline']}"
        fu_bullets.append(line)

# 수정: dict와 pydantic 모두 지원
    fu_bullets = []
    for item in session.action_items:
        # dict 또는 pydantic 모델 모두 지원
        if isinstance(item, dict):
            assignee = item.get("assignee")
            task = item.get("task", "")
            deadline = item.get("deadline")
        else:
            assignee = getattr(item, "assignee", None)
            task = getattr(item, "task", "")
            deadline = getattr(item, "deadline", None)
        line = f"• [@{assignee}] {task}" if assignee else f"• {task}"
        if deadline:
            line += f" ~{deadline}"
        fu_bullets.append(line)
```

**참고:** 근본 해결은 Session.action_items도 `List[ActionItem]`로 통일하는 것이지만, 기존 session.json 파일의 하위 호환이 필요하므로 지금은 양쪽 모두 처리하는 방식으로 대응.

---

## 🟡 R5: SendSave.tsx — 채널 로드 에러 무시

**현상:** Slack 채널 API 실패 시 "참여 중인 채널이 없습니다"만 표시. 사용자가 원인(토큰 오류, 권한 부족 등)을 알 수 없음.

**파일:** `frontend/src/pages/SendSave.tsx:77-86`

**수정:** `.catch`에서 에러 메시지를 토스트로 표시:

```tsx
// 기존 (SendSave.tsx ~line 77-86)
  useEffect(() => {
    setChannelsLoading(true);
    listChannels()
      .then((chs) => {
        setChannels(chs);
        if (chs.length > 0) setSelectedChannel(chs[0].id);
      })
      .catch(() => {})
      .finally(() => setChannelsLoading(false));
  }, []);

// 수정: 에러 시 사용자에게 안내
  useEffect(() => {
    setChannelsLoading(true);
    listChannels()
      .then((chs) => {
        setChannels(chs);
        if (chs.length > 0) setSelectedChannel(chs[0].id);
      })
      .catch((err) => {
        const detail = err?.response?.data?.detail || 'Slack 채널 목록을 불러올 수 없습니다';
        showToast(detail);
      })
      .finally(() => setChannelsLoading(false));
  }, []);
```

새로고침 버튼의 `.catch`도 동일하게 수정 (에러 시 토스트 표시):

```tsx
// 새로고침 버튼의 .catch (현재 .catch(() => {}))
.catch((err) => {
  const detail = err?.response?.data?.detail || '채널 목록을 불러올 수 없습니다';
  showToast(detail);
})
```

---

## 🟡 R6: Editing.tsx — retagBlocks() meeting 모드 404

**현상:** 재편집 시 "AI 재태깅" 버튼 클릭 → 404 → "AI 태깅에 실패했습니다"

**파일:** `frontend/src/pages/Editing.tsx:293-294`

**원인:** `retagBlocks()`가 `api/sessions.ts`에서 `/sessions/{id}/tag`로 하드코딩.
history.py에 `/meetings/{id}/tag` 엔드포인트도 없음.

**수정 (프론트 + 백엔드):**

### 프론트 — Editing.tsx:

```tsx
// 기존 (Editing.tsx ~line 293-294)
      const res = await retagBlocks(session.session_id);

// 수정: apiBase 기반 직접 호출
      const res = (await api.post(`${apiBase}/${session.session_id}/tag`)).data;
```

`import { ..., retagBlocks } from '../api/sessions'`에서 `retagBlocks`가 이 파일에서 더 이상 사용되지 않으면 import에서 제거.

### 백엔드 — history.py에 태깅 엔드포인트 추가:

```python
# history.py — update_meeting_action_items 뒤에 추가

@router.post("/{meeting_id}/tag")
def retag_meeting_blocks(meeting_id: str):
    """Re-run AI tagging on meeting blocks."""
    from services.claude_service import tag_blocks

    path = MEETINGS_DIR / f"{meeting_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Meeting not found")
    m = Meeting.model_validate_json(path.read_text(encoding="utf-8"))

    if not m.blocks:
        raise HTTPException(status_code=400, detail="No blocks to tag")

    tag_result = tag_blocks(
        m.blocks, m.metadata.title, m.metadata.participants,
    )

    for block in m.blocks:
        if block.block_id in tag_result and block.importance_source != "user":
            block.importance = tag_result[block.block_id]
            block.importance_source = "ai"

    path.write_text(m.model_dump_json(indent=2), encoding="utf-8")

    return {"tagged_count": len(tag_result)}
```

---

## 수정 영향 범위 요약

| 파일 | 변경 내용 |
|------|----------|
| `frontend/src/pages/Summary.tsx` | R1: `generateSummary`에서 apiBase 기반 호출 |
| `backend/routers/history.py` | R2: PATCH summary/action-items 추가, R6: POST tag 추가 |
| `backend/routers/slack.py` | R3: `_build_slack_message` dict/pydantic 양쪽 지원 |
| `frontend/src/pages/SendSave.tsx` | R5: 채널 로드 에러 표시 |
| `frontend/src/pages/Editing.tsx` | R6: retagBlocks → api.post(apiBase) 직접 호출 |

---

## 수정 완료 후

```
QA-FIX/QA-MEETING-MODE-20260423.md 수정 완료했어. 확인해줘.
```
