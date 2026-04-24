# 사용자 보고 버그 + QA 발견 버그 — 종합 수정 9건

> 작성일: 2026-04-23
> 작성자: 검수(QA) 세션
> 대상: 개발 세션
> 범위: 사용자 보고 오류 7건 + QA 발견 2건 = 총 9건

---

## 🔴 F1: `backend/routers/slack.py` — DATA_DIR import 누락 (NameError)

**원인:** `_get_slack_client()` (line 25)에서 `DATA_DIR`을 사용하지만, top-level import에 포함되지 않음. `send_slack_message` 내부 local import(line 247)은 해당 함수 스코프에만 유효.

**영향:** `_get_slack_client()` 호출 시 `NameError` → Slack 채널 조회, 전송, 테스트 전부 실패. (사용자 보고 #10, #11의 근본 원인)

**수정:** line 9의 import에 `DATA_DIR` 추가:

```python
# 기존 (line 9)
from config import SESSIONS_DIR, MEETINGS_DIR, SLACK_BOT_TOKEN, EXPORT_DIR

# 수정
from config import SESSIONS_DIR, MEETINGS_DIR, SLACK_BOT_TOKEN, EXPORT_DIR, DATA_DIR
```

그리고 `send_slack_message` 내부의 중복 local import (line 247) 제거:

```python
# 기존 (send_slack_message 내부, line 247)
    from config import DATA_DIR

# 삭제 (이미 top-level에서 import됨)
```

---

## 🔴 F2: Recording.tsx — 중요도 태깅 서버 미저장 → 분할 시 전부 초기화

**원인:** `Recording.tsx:290-298` `setBlockImportance`가 로컬 state만 업데이트하고 서버 API를 호출하지 않음. `handleSplit`이 서버에서 재로드하면 로컬 중요도가 전부 유실.

**수정:** Recording.tsx의 `setBlockImportance`에 서버 저장 추가:

```tsx
// 기존 (Recording.tsx ~line 290)
const setBlockImportance = useCallback((blockId: string, importance: ImportanceLevel | null) => {
    setBlocks((prev) =>
      prev.map((b) =>
        b.block_id === blockId
          ? { ...b, importance, importance_source: importance ? 'user' : null }
          : b
      )
    );
    setPopoverBlockId(null);
  }, []);

// 수정: 서버 저장 추가
const setBlockImportance = useCallback((blockId: string, importance: ImportanceLevel | null) => {
    setBlocks((prev) =>
      prev.map((b) =>
        b.block_id === blockId
          ? { ...b, importance, importance_source: importance ? 'user' : null }
          : b
      )
    );
    setPopoverBlockId(null);
    // 서버에 저장
    if (session) {
      api.patch(`/sessions/${session.session_id}/blocks/${blockId}/importance`, { importance }).catch(() => {});
    }
  }, [session]);
```

추가로 분할 시 원본 중요도를 새 블록에도 복사 — `backend/routers/sessions.py` split 핸들러:

```python
# 기존 (sessions.py ~line 383-393, split_block 내부 new_block 생성)
new_block = Block(
    block_id=f"blk_{uuid4().hex[:8]}",
    timestamp_start=mid_time,
    timestamp_end=original_end,
    text=text_after,
    source=block.source,
    is_edited=block.is_edited,
    importance=None,           # ← 여기가 문제
    importance_source=None,    # ← 여기가 문제
    speaker=None,
)

# 수정: 원본 블록의 중요도 복사
new_block = Block(
    block_id=f"blk_{uuid4().hex[:8]}",
    timestamp_start=mid_time,
    timestamp_end=original_end,
    text=text_after,
    source=block.source,
    is_edited=block.is_edited,
    importance=block.importance,
    importance_source=block.importance_source,
    speaker=None,
)
```

`backend/routers/history.py`의 `split_meeting_block`도 동일 수정:

```python
# 기존 (history.py ~line 202-212, split_meeting_block 내부)
new_block = Block(
    ...
    importance=None,
    importance_source=None,
    ...
)

# 수정
new_block = Block(
    ...
    importance=block.importance,
    importance_source=block.importance_source,
    ...
)
```

---

## 🔴 F3: 텍스트 수정 중 분할/병합 시 편집 내용 유실

**원인:** `handleSplit`과 `handleMerge`가 서버 API 호출 전에 현재 편집 텍스트를 저장하지 않음. 서버는 이전에 저장된 텍스트 기준으로 분할/병합 → 편집 내용 유실.

**영향:** Recording.tsx + Editing.tsx 양쪽. (사용자 보고 #8, #9)

### Recording.tsx 수정

```tsx
// 기존 handleSplit (Recording.tsx ~line 372)
const handleSplit = useCallback(async (blockId: string, cursorPos: number) => {
    if (!session) return;
    try {
      await api.post(`/sessions/${session.session_id}/blocks/${blockId}/split`, { cursor_position: cursorPos });
      const updated = await getSession(session.session_id);
      setSession(updated);
      setBlocks(updated.blocks);
      setEditingBlockId(null);
    } catch {}
  }, [session, setSession]);

// 수정: 분할 전 현재 텍스트 저장
const handleSplit = useCallback(async (blockId: string, cursorPos: number) => {
    if (!session) return;
    try {
      // 편집 중이면 현재 텍스트를 먼저 저장
      if (editingBlockId === blockId && editingText !== editingOriginalText) {
        await api.patch(`/sessions/${session.session_id}/blocks/${blockId}`, { text: editingText });
      }
      await api.post(`/sessions/${session.session_id}/blocks/${blockId}/split`, { cursor_position: cursorPos });
      const updated = await getSession(session.session_id);
      setSession(updated);
      setBlocks(updated.blocks);
      setEditingBlockId(null);
      setEditingText('');
      setEditingOriginalText('');
    } catch {}
  }, [session, setSession, editingBlockId, editingText, editingOriginalText]);
```

`handleMerge`도 동일하게 수정:

```tsx
// 기존 handleMerge (Recording.tsx ~line 383)
const handleMerge = useCallback(async (blockId: string, direction: 'prev' | 'next') => {
    if (!session) return;
    try {
      await api.post(`/sessions/${session.session_id}/blocks/${blockId}/merge`, { direction });
      const updated = await getSession(session.session_id);
      setSession(updated);
      setBlocks(updated.blocks);
    } catch {}
  }, [session, setSession]);

// 수정: 병합 전 현재 텍스트 저장
const handleMerge = useCallback(async (blockId: string, direction: 'prev' | 'next') => {
    if (!session) return;
    try {
      // 편집 중이면 현재 텍스트를 먼저 저장
      if (editingBlockId === blockId && editingText !== editingOriginalText) {
        await api.patch(`/sessions/${session.session_id}/blocks/${blockId}`, { text: editingText });
      }
      await api.post(`/sessions/${session.session_id}/blocks/${blockId}/merge`, { direction });
      const updated = await getSession(session.session_id);
      setSession(updated);
      setBlocks(updated.blocks);
      setEditingBlockId(null);
      setEditingText('');
      setEditingOriginalText('');
    } catch {}
  }, [session, setSession, editingBlockId, editingText, editingOriginalText]);
```

### Editing.tsx 수정

```tsx
// 기존 handleSplit (Editing.tsx ~line 214)
const handleSplit = async (blockId: string, cursorPos: number) => {
    if (!session) return;
    pushUndo(blocks);
    try {
      const res = await api.post(`${apiBase}/${session.session_id}/blocks/${blockId}/split`, {
        cursor_position: cursorPos,
      });
      const updated = await getSession(session.session_id);
      setSession(updated);
      setBlocks(updated.blocks);
      setEditingBlockId(null);
      setCheatlineVisible(false);
    } catch {
      showToast('분할에 실패했습니다');
    }
  };

// 수정: 분할 전 텍스트 저장 + meeting 모드 리로드 수정 (F4와 연계)
const handleSplit = async (blockId: string, cursorPos: number) => {
    if (!session) return;
    pushUndo(blocks);
    try {
      // 편집 중이면 현재 텍스트를 먼저 저장
      if (editingBlockId === blockId && editingText !== editingOriginalText) {
        await api.patch(`${apiBase}/${session.session_id}/blocks/${blockId}`, { text: editingText });
      }
      await api.post(`${apiBase}/${session.session_id}/blocks/${blockId}/split`, {
        cursor_position: cursorPos,
      });
      // F4: apiBase 기반 리로드
      const res = await api.get(`${apiBase}/${session.session_id}`);
      setSession(res.data);
      setBlocks(res.data.blocks);
      setEditingBlockId(null);
      setEditingText('');
      setEditingOriginalText('');
      setCheatlineVisible(false);
    } catch {
      showToast('분할에 실패했습니다');
    }
  };
```

Editing.tsx `handleMerge`도 동일:

```tsx
// 기존 handleMerge (Editing.tsx ~line 233)
const handleMerge = async (blockId: string, direction: 'next' | 'prev') => {
    if (!session) return;
    pushUndo(blocks);
    try {
      await api.post(`${apiBase}/${session.session_id}/blocks/${blockId}/merge`, { direction });
      const updated = await getSession(session.session_id);
      setSession(updated);
      setBlocks(updated.blocks);
    } catch {
      showToast('병합에 실패했습니다');
    }
  };

// 수정
const handleMerge = async (blockId: string, direction: 'next' | 'prev') => {
    if (!session) return;
    pushUndo(blocks);
    try {
      // 편집 중이면 현재 텍스트를 먼저 저장
      if (editingBlockId && editingText !== editingOriginalText) {
        await api.patch(`${apiBase}/${session.session_id}/blocks/${editingBlockId}`, { text: editingText });
      }
      await api.post(`${apiBase}/${session.session_id}/blocks/${blockId}/merge`, { direction });
      // F4: apiBase 기반 리로드
      const res = await api.get(`${apiBase}/${session.session_id}`);
      setSession(res.data);
      setBlocks(res.data.blocks);
      setEditingBlockId(null);
      setEditingText('');
      setEditingOriginalText('');
    } catch {
      showToast('병합에 실패했습니다');
    }
  };
```

---

## 🔴 F4: Editing.tsx — meeting 모드에서 getSession 404 → 분할/병합/리태깅 실패

**원인:** `getSession()` (api/sessions.ts)가 항상 `/sessions/{id}`로 요청. meeting 모드에서 `session_id`가 `mtg_xxx`이면 404. 분할/병합/리태깅 API는 `apiBase`로 정상 호출되지만, 이후 리로드가 실패.

**영향:** 히스토리에서 재편집 진입 후 분할, 병합, AI 리태깅 전부 "실패" 토스트. (사용자 보고 #6)

**수정:** Editing.tsx 내 `getSession(session.session_id)` 호출을 `api.get(${apiBase}/${session.session_id})`로 교체.

영향 받는 위치:
- `handleSplit` → F3에서 이미 수정
- `handleMerge` → F3에서 이미 수정
- `handleSearchReplace` (line 260)
- `handleRetag` (line 280)
- mount useEffect (line 95)

```tsx
// handleSearchReplace 내부 (Editing.tsx ~line 260)
// 기존
const updated = await getSession(session.session_id);

// 수정
const res = await api.get(`${apiBase}/${session.session_id}`);
const updated = res.data;
```

```tsx
// handleRetag 내부 (Editing.tsx ~line 280)
// 기존
const updated = await getSession(session.session_id);

// 수정
const res = await api.get(`${apiBase}/${session.session_id}`);
const updated = res.data;
```

```tsx
// mount useEffect 내부 (Editing.tsx ~line 95)
// 기존
getSession(session.session_id).then((updated) => {

// 수정
api.get(`${apiBase}/${session.session_id}`).then((res) => {
  const updated = res.data;
```

**참고:** `import { getSession, ... } from '../api/sessions'`에서 `getSession`은 이 수정 후 Editing.tsx에서 사용되지 않으므로 import에서 제거 가능. 단, 다른 곳에서 사용 중이면 유지.

---

## 🔴 F5: Editing.tsx — 더블클릭 대신 3클릭 필요

**원인:** 미포커스 블록의 wrapper `onClick`이 `setFocusedBlockId` → state 변경 → re-render → 더블클릭 체인 끊김. 이미 포커스된 블록에서만 더블클릭이 정상 동작.

**수정:** `<p>` 요소의 `onDoubleClick` 핸들러에서 focusedBlockId도 함께 설정:

```tsx
// 기존 (Editing.tsx ~line 687-692)
<p
  className="flex-1 text-[15px] text-text leading-relaxed cursor-text select-text whitespace-pre-wrap"
  onDoubleClick={() => handleEditStart(block)}
>
  {block.text}
</p>

// 수정: onDoubleClick에서 focus도 처리 + onClick에서 focusedBlockId만 설정 (re-render는 발생하지만 double-click이 p에서 직접 처리됨)
<p
  className="flex-1 text-[15px] text-text leading-relaxed cursor-text select-text whitespace-pre-wrap"
  onClick={(e) => {
    e.stopPropagation();
    setFocusedBlockId(block.block_id);
  }}
  onDoubleClick={(e) => {
    e.stopPropagation();
    setFocusedBlockId(block.block_id);
    handleEditStart(block);
  }}
>
  {block.text}
</p>
```

Recording.tsx에도 동일 패턴 적용:

```tsx
// 기존 (Recording.tsx ~line 687-692)
<p
  className="flex-1 text-[15px] text-text leading-relaxed cursor-text select-text whitespace-pre-wrap"
  onDoubleClick={() => handleEditStart(block)}
>
  {block.text}
</p>

// 수정
<p
  className="flex-1 text-[15px] text-text leading-relaxed cursor-text select-text whitespace-pre-wrap"
  onClick={(e) => {
    e.stopPropagation();
    setFocusedBlockId(block.block_id);
  }}
  onDoubleClick={(e) => {
    e.stopPropagation();
    setFocusedBlockId(block.block_id);
    handleEditStart(block);
  }}
>
  {block.text}
</p>
```

---

## 🔴 F6: Recording.tsx — Ctrl+Home 시 페이지 최상단으로 이동

**원인:** textarea의 `onKeyDown`에서 `Ctrl+Home`/`Ctrl+End` 이벤트를 가로채지 않아 브라우저 기본 동작(페이지 스크롤) 실행.

**수정:** Recording.tsx textarea의 `onKeyDown` 핸들러에 추가:

```tsx
// Recording.tsx textarea onKeyDown 내부 (~line 661 부근, 기존 핸들러 맨 앞에 추가)
onKeyDown={(e) => {
  // Ctrl+Home/End: textarea 내부에서 처리 (페이지 스크롤 방지)
  if ((e.ctrlKey || e.metaKey) && (e.key === 'Home' || e.key === 'End')) {
    e.stopPropagation();
    // 브라우저 기본 동작(textarea 내 커서 이동)은 허용 → preventDefault 하지 않음
    return;
  }
  if (e.key === 'Enter' && e.shiftKey) return; // 줄바꿈
  // ... 기존 핸들러 계속
```

Editing.tsx에도 동일 추가:

```tsx
// Editing.tsx textarea onKeyDown 내부 (~line 648 부근)
onKeyDown={(e) => {
  // Ctrl+Home/End: textarea 내부에서 처리 (페이지 스크롤 방지)
  if ((e.ctrlKey || e.metaKey) && (e.key === 'Home' || e.key === 'End')) {
    e.stopPropagation();
    return;
  }
  // Ctrl+Enter (Cmd+Enter): 블록 분할
  // ... 기존 핸들러 계속
```

---

## 🔴 F7: HistoryDetail.tsx — MD 다운로드 버튼이 실제 다운로드를 하지 않음

**원인:** `api.post(/meetings/{id}/export-md)`가 서버에 파일만 생성하고 `{ filename }` 반환. 프론트에서 브라우저 다운로드를 트리거하지 않음.

**수정 방법:** 서버에서 파일 내용을 응답으로 반환하고, 프론트에서 Blob 다운로드 처리.

### 백엔드 수정 — `backend/routers/history.py`의 `export_meeting_md`:

```python
# 기존 (history.py export_meeting_md, return 부분)
    return {"filename": filename}

# 수정: 파일 내용도 함께 반환
    return {"filename": filename, "content": md_content}
```

`backend/routers/sessions.py`의 `export_md`도 동일:

```python
# 기존 (sessions.py export_md, return 부분)
    return {"filename": filename}

# 수정
    return {"filename": filename, "content": md_content}
```

### 프론트 수정 — `frontend/src/pages/HistoryDetail.tsx`:

```tsx
// 기존 (HistoryDetail.tsx ~line 334-338)
onClick={async () => {
  try {
    const res = await api.post(`/meetings/${meeting.meeting_id}/export-md`);
    showToast(`${res.data.filename} 다운로드 준비 완료`);
  } catch { showToast('.md 생성에 실패했습니다'); }
}}

// 수정: Blob 다운로드 추가
onClick={async () => {
  try {
    const res = await api.post(`/meetings/${meeting.meeting_id}/export-md`);
    // Blob 다운로드
    const blob = new Blob([res.data.content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = res.data.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`${res.data.filename} 다운로드 완료`);
  } catch { showToast('.md 생성에 실패했습니다'); }
}}
```

`frontend/src/pages/SendSave.tsx`에서도 동일한 패턴이 있으면(line 148, 274) 같은 방식으로 수정 가능하지만, SendSave의 "로컬 저장"은 서버 디스크 저장 목적이므로 동작 의도가 다름 — 유지해도 됨.

---

## 🟡 F8: `frontend/src/pages/SendSave.tsx` — export_path 미전달

**원인:** settings에서 `exportPath`를 로드(line 72)하지만, `export-md` API 호출 시(line 148, 274) 경로를 서버에 전달하지 않음. 서버 `export_md` 함수도 `export_path` 파라미터를 받지 않음.

**수정:**

### 백엔드 — `sessions.py` `export_md`:

```python
# 기존 (sessions.py ~line 271)
@router.post("/{session_id}/export-md")
def export_md(session_id: str):

# 수정: 요청 body에서 export_path 수신
class ExportMdRequest(BaseModel):
    export_path: Optional[str] = None

@router.post("/{session_id}/export-md")
def export_md(session_id: str, req: ExportMdRequest = ExportMdRequest()):
```

그리고 파일 저장 부분:

```python
# 기존 (sessions.py ~line 311-312)
    export_path = EXPORT_DIR / filename
    export_path.parent.mkdir(parents=True, exist_ok=True)

# 수정
    if req.export_path:
        export_dir = Path(req.export_path)
        export_dir.mkdir(parents=True, exist_ok=True)
    else:
        export_dir = EXPORT_DIR
    export_file = export_dir / filename
    export_file.parent.mkdir(parents=True, exist_ok=True)
```

변수명 충돌 주의: 기존 `export_path`를 `export_file`로 변경하고, 이후 `export_path` 참조도 `export_file`로 변경.

### 프론트 — `SendSave.tsx`:

```tsx
// 기존 (SendSave.tsx ~line 148)
const res = await api.post(`${apiBase}/${session.session_id}/export-md`);

// 수정
const res = await api.post(`${apiBase}/${session.session_id}/export-md`, { export_path: exportPath || undefined });
```

line 274도 동일 수정.

---

## 수정 우선순위

| 순서 | 항목 | 이유 |
|------|------|------|
| 1 | F1 (DATA_DIR) | Slack 기능 전체 차단 중 |
| 2 | F3 (텍스트 유실) | 핵심 편집 플로우 데이터 손실 |
| 3 | F4 (meeting getSession) | 재편집 기능 전체 차단 |
| 4 | F2 (중요도 초기화) | 사용자 작업 유실 |
| 5 | F5 (3클릭) | UX 불편 |
| 6 | F6 (Ctrl+Home) | UX 불편 |
| 7 | F7 (MD 다운로드) | 기능 미동작 |
| 8 | F8 (export_path) | 설정 미반영 |

---

## 수정 완료 후

```
QA-FIX/QA-USER-BUGS-20260423.md 수정 완료했어. 확인해줘.
```
