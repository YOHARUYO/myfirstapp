# Sprint 4 검수 — 잔여 수정 5건

> 작성일: 2026-04-21
> 작성자: 검수(QA) 세션
> 대상: 개발 세션
> 비고: QA-SPRINT4-FIX-20260421.md의 미수정 잔여분

---

## 수정 1: 요약 편집 저장 API 미구현 (blocking)

**근거:** technical-design.md 4-5절에 신설된 API가 코드에 없음

### 1-A. 백엔드 엔드포인트 추가

**파일:** `backend/routers/sessions.py`

`summarize_session` 함수 아래에 2개 엔드포인트 추가:

```python
class UpdateSummaryRequest(BaseModel):
    summary_markdown: str


@router.patch("/{session_id}/summary")
def update_summary(session_id: str, req: UpdateSummaryRequest):
    """Save edited summary markdown (6단계 편집 확정 시)."""
    _validate_session_id(session_id)
    session = _load_session(session_id)
    session.summary_markdown = req.summary_markdown
    _save_session(session)
    return {"ok": True}


class UpdateActionItemsRequest(BaseModel):
    action_items: list


@router.patch("/{session_id}/action-items")
def update_action_items(session_id: str, req: UpdateActionItemsRequest):
    """Save edited action items (6단계 편집 확정 시)."""
    _validate_session_id(session_id)
    session = _load_session(session_id)
    session.action_items = req.action_items
    _save_session(session)
    return {"ok": True}
```

### 1-B. 프론트엔드 API 함수 추가

**파일:** `frontend/src/api/sessions.ts`

```typescript
export async function updateSummaryMarkdown(sessionId: string, summaryMarkdown: string): Promise<void> {
  await api.patch(`/sessions/${sessionId}/summary`, { summary_markdown: summaryMarkdown });
}

export async function updateActionItems(sessionId: string, actionItems: ActionItem[]): Promise<void> {
  await api.patch(`/sessions/${sessionId}/action-items`, { action_items: actionItems });
}
```

### 1-C. Summary.tsx 호출 변경

**파일:** `frontend/src/pages/Summary.tsx` — `saveSummary` 함수 (136행 부근)

현재:
```typescript
const saveSummary = async (blocks: typeof summaryBlocks, items: ActionItem[]) => {
  if (!session) return;
  const md = rebuildMarkdown(titleLine, blocks);
  try {
    await api.patch(`/sessions/${session.session_id}/metadata`, {
      summary_markdown: md,
      action_items: items,
    });
  } catch {}
};
```

수정:
```typescript
import { updateSummaryMarkdown, updateActionItems } from '../api/sessions';

const saveSummary = async (blocks: typeof summaryBlocks, items: ActionItem[]) => {
  if (!session) return;
  const md = rebuildMarkdown(titleLine, blocks);
  try {
    await updateSummaryMarkdown(session.session_id, md);
    await updateActionItems(session.session_id, items);
  } catch {}
};
```

---

## 수정 2: XSS — dangerouslySetInnerHTML 제거

**파일:** `frontend/src/pages/Summary.tsx` — `renderBody` 함수 (232행 부근)

현재:
```tsx
const rendered = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
// ...
<div dangerouslySetInnerHTML={{ __html: rendered }} />
```

수정 — React 컴포넌트로 렌더링:
```tsx
const renderBody = (text: string) => {
  return text.split('\n').map((line, i) => {
    if (!line.trim()) return <div key={i} className="h-2" />;

    const isBullet = line.trim().startsWith('- ');
    const content = isBullet ? line.replace(/^-\s*/, '').trim() : line;

    // **bold** → <strong>
    const parts = content.split(/(\*\*.+?\*\*)/g).map((part, j) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={j}>{part.slice(2, -2)}</strong>;
      }
      return <span key={j}>{part}</span>;
    });

    if (isBullet) {
      return (
        <div key={i} className="flex gap-2 ml-1">
          <span className="text-text-tertiary shrink-0">•</span>
          <span>{parts}</span>
        </div>
      );
    }
    return <div key={i}>{parts}</div>;
  });
};
```

---

## 수정 3: 6→5→6 재진입 시 재요약 모달 없음

**파일:** `frontend/src/pages/Summary.tsx` + `frontend/src/stores/wizardStore.ts` + `frontend/src/pages/Editing.tsx`

### 3-A. wizardStore에 플래그 추가

```typescript
// wizardStore.ts에 추가
editedAfterSummary: boolean;
setEditedAfterSummary: () => void;
clearEditedAfterSummary: () => void;
```

초기값 `false`, `setEditedAfterSummary`는 `true`로, `clearEditedAfterSummary`는 `false`로.

### 3-B. Editing.tsx — 편집 확정 시 플래그 설정

`handleEditConfirm` 내부, 텍스트 변경 감지 후:
```typescript
if (changed) {
  useWizardStore.getState().setEditedAfterSummary();
  // ... 기존 로직
}
```

블록 병합/분할/치환/중요도 변경 시에도 동일하게 호출.

### 3-C. Summary.tsx — mount 시 모달 체크

```tsx
const editedAfterSummary = useWizardStore((s) => s.editedAfterSummary);
const clearEditedAfterSummary = useWizardStore((s) => s.clearEditedAfterSummary);
const [resummarizeModal, setResummarizeModal] = useState(false);

useEffect(() => {
  if (!session) return;
  if (session.summary_markdown && editedAfterSummary) {
    setResummarizeModal(true);
  } else if (session.summary_markdown) {
    // 기존 요약 로드
    loadExistingSummary();
  } else {
    generateSummary();
  }
}, []);

// 모달 JSX
<Modal open={resummarizeModal} onClose={() => setResummarizeModal(false)}>
  <h3 className="text-lg font-semibold text-text mb-2">요약 재생성</h3>
  <p className="text-sm text-text-secondary mb-6">
    태깅이나 전사를 수정했습니다. 요약을 다시 생성할까요?
  </p>
  <div className="flex gap-2 justify-end">
    <button
      onClick={() => { setResummarizeModal(false); clearEditedAfterSummary(); loadExistingSummary(); }}
      className="px-4 py-2 text-sm font-medium text-text bg-bg-subtle rounded-lg hover:bg-bg-hover cursor-pointer"
    >
      기존 요약 유지
    </button>
    <button
      onClick={() => { setResummarizeModal(false); clearEditedAfterSummary(); generateSummary(); }}
      className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary-hover cursor-pointer"
    >
      재요약
    </button>
  </div>
</Modal>
```

---

## 수정 4: F/U 편집 시 @assignee / ~deadline 미파싱

**파일:** `frontend/src/pages/Summary.tsx` — `handleFuEditConfirm` (195행 부근)

현재 편집 텍스트 전체가 `task`에 들어감. 수정:

```typescript
const handleFuEditConfirm = () => {
  if (!editingFuId) return;
  const text = editingFuText.trim();

  let assignee: string | null = null;
  const assigneeMatch = text.match(/[@＠](\S+)/);
  if (assigneeMatch) assignee = assigneeMatch[1];

  let deadline: string | null = null;
  const deadlineMatch = text.match(/[~～](\d{2}\/\d{2}|\d{4}-\d{2}-\d{2})/);
  if (deadlineMatch) deadline = deadlineMatch[1];

  let task = text;
  if (assigneeMatch) task = task.replace(assigneeMatch[0], '').trim();
  if (deadlineMatch) task = task.replace(deadlineMatch[0], '').trim();

  const updated = actionItems.map((item) => {
    if (item.fu_id !== editingFuId) return item;
    return { ...item, task, assignee, deadline };
  });
  setActionItems(updated);
  saveSummary(summaryBlocks, updated);
  setEditingFuId(null);
  setEditingFuText('');
};
```

---

## 수정 5: export-md 응답에 서버 파일 경로 노출

**파일:** `backend/routers/sessions.py` — `export_md` 함수 반환값 (261행 부근)

현재:
```python
return {"path": str(export_path), "filename": filename}
```

수정:
```python
return {"filename": filename}
```

프론트(`SendSave.tsx:134`)는 `res.data.filename`만 사용하므로 변경 불필요.

---

## 수정 완료 후

```
QA-FIX/QA-SPRINT4-FIX2-20260421.md 5건 수정 완료했어. 확인해줘.
```
