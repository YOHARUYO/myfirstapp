# 기획 핸드오프 반영 누락 — 수정 4건

> 작성일: 2026-04-22
> 작성자: 검수(QA) 세션
> 근거: `reports/PLAN-DEV-HANDOFF-20260422.md` 대비 코드 검증

---

## 🔴 N1: Recording.tsx 키보드 명령어 미반영

**파일:** `frontend/src/pages/Recording.tsx`
**핸드오프 항목:** 기획 변경 #2 + 버그 B6
**현재:** 편집 textarea의 onKeyDown이 Enter(확정)과 Escape(취소)만 처리.

Editing.tsx에는 정확히 구현되어 있으므로 **동일 패턴 적용**:

```tsx
// Recording.tsx의 편집 textarea onKeyDown (현재 ~599행 부근)
onKeyDown={(e) => {
  // 줄바꿈: Shift+Enter
  if (e.key === 'Enter' && e.shiftKey) {
    // 기본 동작(textarea 줄바꿈) 허용 — preventDefault 안 함
    return;
  }

  // 분할: Ctrl+Enter (Mac: Cmd+Enter)
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    const pos = e.currentTarget.selectionStart;
    handleSplit(block.block_id, pos);
    return;
  }

  // 확정: Enter
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleEditConfirm();
    return;
  }

  // 취소
  if (e.key === 'Escape') {
    handleEditCancel();
    return;
  }

  // 병합: Backspace (첫 블록 가드)
  if (e.key === 'Backspace' && e.currentTarget.selectionStart === 0) {
    const idx = blocks.findIndex((b) => b.block_id === block.block_id);
    if (idx > 0) {
      e.preventDefault();
      handleMerge(block.block_id, 'prev');
    }
    return;
  }

  // 병합: Delete (마지막 블록 가드)
  if (e.key === 'Delete' && e.currentTarget.selectionStart === editingText.length) {
    const idx = blocks.findIndex((b) => b.block_id === block.block_id);
    if (idx < blocks.length - 1) {
      e.preventDefault();
      handleMerge(block.block_id, 'next');
    }
    return;
  }
}}
```

**추가 필요:** Recording.tsx에 `handleSplit`과 `handleMerge` 함수가 없으면 추가 필요. Editing.tsx의 동일 함수를 참고:
- `handleSplit`: `POST /api/sessions/{sessionId}/blocks/{blockId}/split` 호출
- `handleMerge`: `POST /api/sessions/{sessionId}/blocks/{blockId}/merge` 호출

**치트라인도 업데이트** (현재 치트라인이 있는지 확인 후):
```
Enter=확정 · Shift+Enter=줄바꿈 · Ctrl+Enter=분할 · Esc=취소
```

---

## 🔴 N2: Recording.tsx 편집 확정 시 서버 PATCH 미호출

**파일:** `frontend/src/pages/Recording.tsx` — `handleEditConfirm`
**핸드오프 항목:** 버그 B5 (3단계 수정이 5단계에 미반영)

**현재:** handleEditConfirm이 로컬 blocks state만 업데이트하고 **서버에 저장하지 않음**.

```tsx
// 현재 (로컬만 업데이트)
const handleEditConfirm = useCallback(() => {
  if (!editingBlockId) return;
  const textChanged = editingText !== editingOriginalText;
  setBlocks((prev) => prev.map((b) => /* ... */));
  setEditingBlockId(null);
  // ← 서버 PATCH 없음
}, [...]);
```

**수정:** Editing.tsx의 패턴과 동일하게 서버 PATCH 추가:

```tsx
const handleEditConfirm = useCallback(async () => {
  if (!editingBlockId) return;
  const textChanged = editingText !== editingOriginalText;
  
  setBlocks((prev) =>
    prev.map((b) =>
      b.block_id === editingBlockId
        ? {
            ...b,
            text: editingText,
            is_edited: textChanged ? true : b.is_edited,
            source: textChanged ? 'user_edit' as const : b.source,
          }
        : b
    )
  );

  // 서버에 저장 (변경된 경우만)
  if (textChanged && sessionId) {
    try {
      await api.patch(`/sessions/${sessionId}/blocks/${editingBlockId}`, { text: editingText });
    } catch {}
  }

  setEditingBlockId(null);
  setEditingText('');
  setEditingOriginalText('');
}, [editingBlockId, editingText, editingOriginalText, sessionId]);
```

`api`를 import하지 않았다면 추가:
```tsx
import api from '../api/client';
```

---

## 🟡 N3: Slack 메시지에서 유저 ID가 코드로 표시

**파일:** `backend/routers/slack.py` — `_build_slack_message` 함수
**핸드오프 항목:** 버그 B1

**현재:** `_build_slack_message()`가 `session.action_items`의 `assignee`를 그대로 사용. `<@U079L6BBL8P>` 같은 Slack 유저 멘션이 해석 안 됨.

**문제 위치:** 이 버그는 두 가지 경로가 있음:
1. **summary_markdown 내부**에 `<@UXXXXXX>` 형태가 포함된 경우 — Claude가 전사 텍스트에서 이를 그대로 인용
2. **action_items의 assignee**에 유저 ID가 들어간 경우

**수정:** `_build_slack_message`에서 최종 메시지 텍스트의 `<@UXXXXXX>` 패턴을 일괄 치환:

```python
import re

def _build_slack_message(session: Session, greeting: str = "") -> str:
    # ... 기존 메시지 조립 로직 ...
    
    raw_message = "\n".join(parts)
    
    # <@UXXXXXX> → @display_name 치환
    client = _get_slack_client()
    def resolve_mention(match):
        user_id = match.group(1)
        name, _ = _resolve_user_name(client, user_id)
        return f"@{name}"
    
    resolved_message = re.sub(r'<@(\w+)>', resolve_mention, raw_message)
    
    return resolved_message
```

**주의:** `_resolve_user_name`은 이미 구현되어 있고(54~72행) 캐시도 있으므로 성능 문제 없음. 단, _build_slack_message에 `client` 파라미터를 추가하거나 내부에서 생성해야 함.

더 깔끔하게:
```python
def _build_slack_message(session: Session, greeting: str = "", client=None) -> str:
    # ... 기존 로직 ...
    raw_message = "\n".join(parts)
    
    if client:
        def resolve_mention(match):
            user_id = match.group(1)
            name, _ = _resolve_user_name(client, user_id)
            return f"@{name}"
        raw_message = re.sub(r'<@(\w+)>', resolve_mention, raw_message)
    
    return raw_message
```

호출부(`send_slack_message`, ~208행)에서:
```python
message_text = _build_slack_message(session, greeting, client=client)
```

---

## 🟢 N4: Summary.tsx 요약 로딩이 전체 화면 오버레이가 아님

**파일:** `frontend/src/pages/Summary.tsx`
**핸드오프 항목:** 기획 변경 #1

**현재:** 로딩 상태가 페이지 콘텐츠 내부(`mt-20`)에 표시됨.
**설계:** "전체 화면 로딩 오버레이 — 스피너 + AI 요약 생성 중…"

**수정:** 로딩 시 fixed 오버레이:

```tsx
{loading && (
  <div className="fixed inset-0 z-50 bg-bg/80 flex flex-col items-center justify-center gap-4">
    <Loader2 size={32} className="text-primary animate-spin" />
    <p className="text-[15px] text-text-secondary">AI 요약을 생성하고 있습니다...</p>
  </div>
)}
```

기존 `mt-20` 영역의 로딩 블록을 위 코드로 교체.

---

## 수정 완료 후

```
QA-FIX/QA-HANDOFF-MISSING-20260422.md 4건 수정 완료했어. 확인해줘.
```
