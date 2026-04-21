# Sprint 3 검수 — 즉시 수정 4건

> 작성일: 2026-04-20
> 작성자: 개발 검수 세션
> 대상: 개발 세션

---

## 수정 1: 처리 실패 후 중복 실행 방지

**파일:** `backend/routers/processing.py`
**위치:** 160행 `start_processing` 함수
**심각도:** 🔴 핵심 기능

### 현재 문제

```python
# 160행
if session.status not in ("post_recording", "processing"):
```

`"processing"` 상태에서도 재진입을 허용하므로, 처리 중 실수로 재호출하면 **두 개의 asyncio task가 동시에 session.json을 쓰게 되어 데이터 손상** 가능.

### 수정

```python
# 160행 수정
if session.status not in ("post_recording",):
    raise HTTPException(
        status_code=400,
        detail=f"Cannot process session in status: {session.status}"
    )
```

---

## 수정 2: split_block 타임스탬프 계산 버그

**파일:** `backend/routers/sessions.py`
**위치:** 219~238행 `split_block` 함수
**심각도:** 🔴 확정적 오동작

### 현재 문제

```python
# 224행: 원본 block의 timestamp_end를 mid_time으로 변경
block.timestamp_end = mid_time

# 230행: 이 시점에서 block.timestamp_end는 이미 mid_time
new_block.timestamp_end = mid_time + (block.timestamp_end - block.timestamp_start)
# 결과: mid_time + (mid_time - start) ← 의도와 다른 값
```

분할된 뒤 블록의 `timestamp_end`가 원래 블록의 end가 아닌 잘못된 값이 됨.

### 수정

219행부터 전체를 아래로 교체:

```python
for i, block in enumerate(session.blocks):
    if block.block_id == block_id:
        pos = req.cursor_position
        if pos <= 0 or pos >= len(block.text):
            raise HTTPException(status_code=400, detail="Invalid cursor position")

        text_before = block.text[:pos].rstrip()
        text_after = block.text[pos:].lstrip()

        # 원본 end를 보존
        original_end = block.timestamp_end
        mid_time = block.timestamp_start + (original_end - block.timestamp_start) * (pos / len(block.text))

        # 원본 블록 수정
        block.text = text_before
        block.timestamp_end = mid_time

        # 새 블록 생성
        from models.block import Block
        new_block = Block(
            block_id=f"blk_{uuid4().hex[:8]}",
            timestamp_start=mid_time,
            timestamp_end=original_end,
            text=text_after,
            source=block.source,
            is_edited=block.is_edited,
            importance=None,
            importance_source=None,
            speaker=None,
        )

        session.blocks.insert(i + 1, new_block)
        _save_session(session)
        return {"block": block.model_dump(), "new_block": new_block.model_dump()}
```

---

## 수정 3: Processing.tsx 재시도 버튼 미작동

**파일:** `frontend/src/pages/Processing.tsx`
**위치:** 56~93행, 105~110행
**심각도:** 🔴 핵심 기능

### 현재 문제

`handleRetry`에서 `startedRef.current = false`만 설정하지만, useEffect의 dependency에 ref가 없으므로 **재시도 버튼 클릭 후 아무 일도 일어나지 않음**.

### 수정

polling/kickoff 로직을 `useCallback`으로 분리하고 `handleRetry`에서 직접 호출:

```tsx
// kickOff를 컴포넌트 레벨 함수로 분리
const kickOff = useCallback(async () => {
  if (!session) return;
  try {
    await startProcessing(session.session_id);
    pollingRef.current = setInterval(async () => {
      try {
        const status = await getProcessingStatus(session.session_id);
        setProcessingStatus(status);

        if (status.status === 'completed') {
          if (pollingRef.current) clearInterval(pollingRef.current);
          setIsComplete(true);
          const updated = await getSession(session.session_id);
          setSession(updated);
        } else if (status.status === 'error') {
          if (pollingRef.current) clearInterval(pollingRef.current);
          setError(status.error || '처리 중 오류가 발생했습니다');
        }
      } catch {}
    }, 2000);
  } catch (e: any) {
    setError(e?.response?.data?.detail || '처리를 시작할 수 없습니다');
  }
}, [session, setSession]);

// useEffect에서 사용
useEffect(() => {
  if (!session || startedRef.current) return;
  startedRef.current = true;
  kickOff();
  return () => {
    if (pollingRef.current) clearInterval(pollingRef.current);
  };
}, [session, kickOff]);

// handleRetry 수정
const handleRetry = async () => {
  if (!session) return;
  setError(null);
  setIsComplete(false);
  setProcessingStatus(null);
  if (pollingRef.current) clearInterval(pollingRef.current);
  kickOff();
};
```

---

## 수정 4: Editing.tsx 키보드 단축키 입력 필드 간섭

**파일:** `frontend/src/pages/Editing.tsx`
**위치:** 258행 키보드 핸들러
**심각도:** 🟡→🔴 (검색 바 사용 시 중요도 변경 발생)

### 현재 문제

검색 바(input)에 숫자를 입력하면 중요도 태깅이 동시에 동작함. Recording.tsx에는 `target.tagName` 체크가 있으나 Editing.tsx에는 누락.

### 수정

273행(`if (editingBlockId) return;`) 아래에 가드 추가:

```typescript
// Skip if editing text
if (editingBlockId) return;

// ← 이 줄 추가
const target = e.target as HTMLElement;
if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;

// Importance shortcuts
if (focusedBlockId && ['1', '2', '3', '4', '0'].includes(e.key)) {
```

---

## 수정 완료 후

4건 모두 수정했으면 검수 세션에 확인 요청해주세요.

```
QA-SPRINT3-FIX.md 4건 수정 완료했어. 확인해줘.
```
