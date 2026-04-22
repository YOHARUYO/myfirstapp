# 전수 조사 — 즉시 수정 5건 + 중간 위험 15건

> 작성일: 2026-04-22
> 작성자: 검수(QA) 세션
> 대상: 개발 세션
> 성격: 전체 코드베이스 최종 품질 점검

## 충돌 분석

파일별 수정 집중도:
- `history.py`: C1+C2+M2+M4 (4건) — **split 함수 전면 재작성 + update 검증 + export escape**
- `Recording.tsx`: C4+M12+M15 (3건) — 각각 다른 함수, 충돌 없음
- `Editing.tsx`: C5+M9 (2건) — 각각 다른 함수, 충돌 없음

**결론: 충돌 없음.** 동일 파일 내 수정이 있으나 모두 다른 함수/영역이므로 순서 무관하게 적용 가능.

---

## Part 1: 백엔드 (11건)

---

### 🔴 C1+C2: history.py split_meeting_block 전면 재작성

**파일:** `backend/routers/history.py:173-209`
**문제:**
- C1: 188행에서 `block.text`를 truncate한 뒤, 194행에서 이미 잘린 `block.text[pos:]`를 시도 → 새 블록이 빈 문자열
- C2: 180행 로드 → 201행 재로드 → 207행 쓰기. 3회 I/O에 락 없음

**수정:** 전체 함수를 깔끔하게 재작성:

```python
@router.post("/{meeting_id}/blocks/{block_id}/split")
def split_meeting_block(meeting_id: str, block_id: str, req: dict):
    from uuid import uuid4
    from models.block import Block

    path = MEETINGS_DIR / f"{meeting_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Meeting not found")

    m = Meeting.model_validate_json(path.read_text(encoding="utf-8"))

    for i, block in enumerate(m.blocks):
        if block.block_id == block_id:
            pos = req.get("cursor_position", 0)
            if pos <= 0 or pos >= len(block.text):
                raise HTTPException(status_code=400, detail="Invalid cursor position")

            # 원본 텍스트를 먼저 보존
            original_text = block.text
            original_end = block.timestamp_end
            mid_time = block.timestamp_start + (original_end - block.timestamp_start) * (pos / len(original_text))

            # 앞 블록 수정
            block.text = original_text[:pos].rstrip()
            block.timestamp_end = mid_time

            # 뒤 블록 생성
            new_block = Block(
                block_id=f"blk_{uuid4().hex[:8]}",
                timestamp_start=mid_time,
                timestamp_end=original_end,
                text=original_text[pos:].lstrip(),
                source=block.source,
                is_edited=block.is_edited,
                importance=None,
                importance_source=None,
                speaker=None,
            )

            m.blocks.insert(i + 1, new_block)
            path.write_text(m.model_dump_json(indent=2), encoding="utf-8")
            return {"block": block.model_dump(), "new_block": new_block.model_dump()}

    raise HTTPException(status_code=404, detail="Block not found")
```

---

### 🔴 C3: audio.py block_counter 동시 연결 시 ID 중복

**파일:** `backend/routers/audio.py:56`
**문제:** `block_counter = len(session.blocks)`가 lock 밖에서 초기화됨. 동시 연결 시 같은 값으로 시작.

**수정:** block_id 생성을 uuid 기반으로 변경 (sessions.py의 패턴과 통일):

```python
# 56행 제거: block_counter = len(session.blocks)

# block 생성 부분 (약 85행 부근)에서:
# 기존: block_id=f"blk_{block_counter:03d}"
# 수정:
from uuid import uuid4
block_id = f"blk_{uuid4().hex[:8]}"
```

`block_counter` 증감 로직도 함께 제거.

---

### 🟡 M1: slack.py delete_slack_message 파일 순회 중 쓰기

**파일:** `backend/routers/slack.py:297-308` (delete_slack_message 내 Meeting JSON 업데이트)

**수정:** glob 결과를 리스트로 먼저 수집한 뒤 처리:

```python
# 기존
for mf in MEETINGS_DIR.glob("*.json"):

# 수정
meeting_files = list(MEETINGS_DIR.glob("*.json"))
for mf in meeting_files:
```

---

### 🟡 M2: history.py update_meeting 무검증 setattr

**파일:** `backend/routers/history.py:123-137`

**수정:** 허용 필드를 화이트리스트로 제한:

```python
@router.patch("/{meeting_id}")
def update_meeting(meeting_id: str, req: dict):
    path = MEETINGS_DIR / f"{meeting_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Meeting not found")
    m = Meeting.model_validate_json(path.read_text(encoding="utf-8"))

    # 허용된 최상위 필드만 업데이트
    ALLOWED_TOP = {"blocks", "summary_markdown", "action_items", "keywords"}
    ALLOWED_META = {"title", "participants", "location", "language"}

    for key, value in req.items():
        if key == "metadata" and isinstance(value, dict):
            for mk, mv in value.items():
                if mk in ALLOWED_META:
                    setattr(m.metadata, mk, mv)
        elif key in ALLOWED_TOP:
            setattr(m, key, value)

    path.write_text(m.model_dump_json(indent=2), encoding="utf-8")
    return m.model_dump()
```

---

### 🟡 M3: processing.py 에러 인메모리만 저장

**파일:** `backend/routers/processing.py:142-152`

**수정:** 에러 발생 시 session.json에도 에러 메시지를 기록:

```python
except Exception as e:
    state["status"] = "error"
    state["error"] = str(e)

    try:
        session = await asyncio.to_thread(_load_session, session_id)
        session.status = "post_recording"
        # 에러 메시지를 세션에도 기록 (서버 재시작 후에도 확인 가능)
        await asyncio.to_thread(_save_session, session)
    except Exception:
        pass
```

**참고:** Session 모델에 `last_error: Optional[str]` 필드를 추가하면 더 좋으나, 최소 수정으로는 status 복귀만 보장.

---

### 🟡 M4: sessions.py + history.py export-md에서 action_items escape 없음

**파일:** `backend/routers/sessions.py:269-277`, `backend/routers/history.py:258-268`
**문제:** action_items의 text가 마크다운에 그대로 삽입됨.

**수정:** 두 파일의 export-md 함수에서 텍스트 escape 추가:

```python
def _escape_md(text: str) -> str:
    """마크다운 특수 문자 이스케이프."""
    for ch in ['<', '>', '&']:
        text = text.replace(ch, f'\\{ch}')
    return text

# export-md 함수 내 action_items 루프에서:
line += _escape_md(item.get("task", ""))
# 또는 Pydantic 모델인 경우:
line += _escape_md(item.task)
```

**두 파일 모두** 동일하게 적용.

---

### 🟡 M5: contacts.py + templates.py 동시 쓰기 락 없음

**파일:** `backend/routers/contacts.py`, `backend/routers/templates.py`

**수정:** 모듈 수준 asyncio.Lock 추가 (audio.py 패턴 참고):

```python
# contacts.py 상단에:
import asyncio
_contacts_lock = asyncio.Lock()

# 쓰기 함수들에서 (POST, PATCH, DELETE):
@router.post("/participants")
async def add_participant(req: dict):  # async로 변경
    async with _contacts_lock:
        contacts = _load_contacts()
        # ... 기존 로직 ...
        _save_contacts(contacts)
    return new_item
```

templates.py에도 동일 패턴 적용 (`_templates_lock`).

**주의:** 함수를 `def` → `async def`로 변경해야 `async with`를 쓸 수 있음. FastAPI는 async 엔드포인트를 자동 지원.

---

### 🟡 M6: claude_service.py JSON 파싱 무음 실패

**파일:** `backend/services/claude_service.py:80-95`

**수정:** 로깅 추가 + importance 값 검증:

```python
import logging
logger = logging.getLogger(__name__)

# tag_blocks 함수 내:
try:
    tags = json.loads(result_text)
except json.JSONDecodeError:
    start = result_text.find("[")
    end = result_text.rfind("]") + 1
    if start >= 0 and end > start:
        try:
            tags = json.loads(result_text[start:end])
        except json.JSONDecodeError:
            logger.warning(f"[AI Tagging] JSON 파싱 실패: {result_text[:200]}")
            return {}
    else:
        logger.warning(f"[AI Tagging] JSON 배열 미발견: {result_text[:200]}")
        return {}

VALID_IMPORTANCE = {"high", "medium", "low", "lowest"}
return {
    item["block_id"]: item["importance"]
    for item in tags
    if isinstance(item, dict)
    and "block_id" in item
    and "importance" in item
    and item["importance"] in VALID_IMPORTANCE
}
```

---

### 🟡 M7: recovery.py 손상된 세션이 전체 API 차단

**파일:** `backend/routers/recovery.py`

**수정:** 개별 세션 파싱 실패 시 skip:

```python
@router.get("")
def list_recoverable():
    sessions = []
    if not SESSIONS_DIR.exists():
        return {"sessions": sessions}
    for d in SESSIONS_DIR.iterdir():
        if d.is_dir():
            sf = d / "session.json"
            if sf.exists():
                try:
                    s = Session.model_validate_json(sf.read_text(encoding="utf-8"))
                    if s.status != "completed":
                        sessions.append({
                            "session_id": s.session_id,
                            "status": s.status,
                            # ... 기존 필드 ...
                        })
                except Exception:
                    # 손상된 세션은 건너뜀
                    continue
    return {"sessions": sessions}
```

---

## Part 2: 프론트엔드 (9건)

---

### 🔴 C4: Recording.tsx ArrowUp 초기 인덱스 오류

**파일:** `frontend/src/pages/Recording.tsx:318`

**현재:**
```tsx
const idx = focusedBlockId ? visibleBlocks.findIndex(...) : 1;
```

**수정:**
```tsx
const idx = focusedBlockId ? visibleBlocks.findIndex((b) => b.block_id === focusedBlockId) : -1;
```

ArrowDown 쪽(~315행)도 동일하게 확인 — 기존이 `: -1`이면 정상.

---

### 🔴 C5: Editing.tsx 빈 배열에서 undefined 접근

**파일:** `frontend/src/pages/Editing.tsx:306-320`

**수정:** 방향키 핸들러 상단에 가드 추가:

```tsx
// Arrow key navigation
const visibleBlocks = showCoreOnly
  ? blocks.filter((b) => b.importance === 'high' || b.importance === 'medium')
  : blocks;

if (visibleBlocks.length === 0) return;  // ← 추가

if (e.key === 'ArrowDown') {
  // ... 기존 로직
}
```

---

### 🟡 M8: Home.tsx API 실패 시 에러 안내 없음

**파일:** `frontend/src/pages/Home.tsx:39,42`

**수정:**
```tsx
const [loadError, setLoadError] = useState(false);

const loadData = () => {
  setLoadError(false);
  Promise.all([
    listMeetings().then((data) => setMeetings(data.slice(0, 5))),
    listRecoverable().then(setRecoverable),
  ]).catch(() => setLoadError(true));
};

// 렌더링에 에러 상태 추가:
{loadError && (
  <div className="w-full mb-4 text-center">
    <p className="text-sm text-text-tertiary">데이터를 불러올 수 없습니다</p>
    <button onClick={loadData} className="text-sm text-primary mt-1 cursor-pointer">
      다시 시도
    </button>
  </div>
)}
```

---

### 🟡 M9: Editing.tsx setBlockImportance API 실패 시 UI만 변경

**파일:** `frontend/src/pages/Editing.tsx` — setBlockImportance 함수

**수정:** API 실패 시 UI 롤백:

```tsx
const setBlockImportance = async (blockId: string, level: ImportanceLevel | null) => {
  // 이전 상태 저장
  const prevBlock = blocks.find((b) => b.block_id === blockId);
  const prevImportance = prevBlock?.importance ?? null;
  const prevSource = prevBlock?.importance_source ?? null;

  // 낙관적 업데이트
  pushUndo(blocks);
  setBlocks((prev) =>
    prev.map((b) =>
      b.block_id === blockId
        ? { ...b, importance: level, importance_source: level ? 'user' : null }
        : b
    )
  );
  setPopoverBlockId(null);

  // API 호출
  if (session) {
    try {
      await api.patch(`${apiBase}/${session.session_id}/blocks/${blockId}/importance`, { importance: level });
    } catch {
      // 실패 시 롤백
      setBlocks((prev) =>
        prev.map((b) =>
          b.block_id === blockId
            ? { ...b, importance: prevImportance, importance_source: prevSource }
            : b
        )
      );
      showToast('중요도 저장에 실패했습니다');
    }
  }
};
```

---

### 🟡 M10: SendSave.tsx 더블 클릭 중복 전송

**���일:** `frontend/src/pages/SendSave.tsx` — handleExecute / doExecute

**수정:** executing 플래그를 doExecute 최상단에서 즉시 설정:

```tsx
const doExecute = async () => {
  if (!session || executing) return;  // ← 이중 가드
  setMissingModal(false);
  setExecuting(true);
  // ... 이하 동일
};
```

실행 버튼도 `disabled={executing}` 확인 (이미 있으면 OK).

---

### 🟡 M11: Processing.tsx kickOff 중복 트리거

**파일:** `frontend/src/pages/Processing.tsx:82-89`

**수정:** startedRef 가드를 더 엄격하게:

```tsx
useEffect(() => {
  if (!session || startedRef.current) return;
  startedRef.current = true;
  kickOff();
  return () => {
    if (pollingRef.current) clearInterval(pollingRef.current);
  };
}, [session]);  // ← kickOff를 deps에서 제거, session만 의존
```

`kickOff`가 deps에 있으면 session/setSession 변경 시 kickOff가 재생성되어 effect가 재실행됨. `startedRef`가 가드하지만, deps에서 빼는 것이 근본 해결.

---

### 🟡 M12: Recording.tsx 참여자 변경 시 저장 순서 비보장

**파일:** `frontend/src/pages/Recording.tsx:132-147`

**수정:** 이전 요청을 취소하는 패턴 적용:

```tsx
const metaSaveRef = useRef<AbortController | null>(null);

const handleParticipantsChange = (v: string[]) => {
  setMetaParticipants(v);
  v.forEach((name) => {
    if (!contactParticipants.find((c) => c.name === name)) {
      addParticipant(name).then((c) => setContactParticipants((prev) => [...prev, c])).catch(() => {});
    }
  });

  // 이전 요청 취소
  metaSaveRef.current?.abort();
  const controller = new AbortController();
  metaSaveRef.current = controller;

  if (sessionId) {
    updateMetadata(sessionId, {
      title: metaTitle,
      participants: v,
      location: metaLocation || null,
      language: metaLanguage,
    }).then((updated) => {
      if (!controller.signal.aborted) setSession(updated);
    }).catch(() => {});
  }
};
```

**참고:** `updateMetadata` API 함수가 AbortController를 지원하지 않으면, 단순히 **최신 응답만 반영**하는 가드로 대체:

```tsx
const metaSaveVersionRef = useRef(0);

const handleParticipantsChange = (v: string[]) => {
  // ...
  const version = ++metaSaveVersionRef.current;
  if (sessionId) {
    updateMetadata(sessionId, { /* ... */ })
      .then((updated) => {
        if (metaSaveVersionRef.current === version) setSession(updated);
      })
      .catch(() => {});
  }
};
```

---

### 🟡 M13: HistoryDetail.tsx 타임스탬프 파싱 실패 시 NaN

**파일:** `frontend/src/pages/HistoryDetail.tsx:241-246`

**수정:** 파싱에 방어 코드 추가:

```tsx
if (tsMode === 'absolute' && meta.start_time) {
  const parts = meta.start_time.split(':').map(Number);
  const h = parts[0] || 0;
  const m = parts[1] || 0;
  const s = parts[2] || 0;
  if (!isNaN(h) && !isNaN(m)) {
    const baseSeconds = h * 3600 + m * 60 + s;
    const total = baseSeconds + block.timestamp_start;
    const hh = Math.floor(total / 3600) % 24;
    const mm = Math.floor((total % 3600) / 60);
    tsDisplay = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  } else {
    tsDisplay = formatTs(block.timestamp_start); // fallback
  }
} else {
  tsDisplay = formatTs(block.timestamp_start);
}
```

---

### 🟡 M14: Summary.tsx parseSummaryBlocks 파싱 깨짐

**파일:** `frontend/src/pages/Summary.tsx:22-56`

**수정:** 방어적 파싱 + 빈 블록 필터링:

```tsx
function parseSummaryBlocks(md: string): { id: string; heading: string; body: string }[] {
  if (!md || !md.trim()) return [];
  const lines = md.split('\n');
  const blocks: { id: string; heading: string; body: string }[] = [];
  let currentHeading = '';
  let currentBody: string[] = [];
  let blockIdx = 0;

  const flush = () => {
    const body = currentBody.join('\n').trim();
    if (currentHeading || body) {
      blocks.push({
        id: `sb_${blockIdx++}`,
        heading: currentHeading,
        body,
      });
    }
    currentHeading = '';
    currentBody = [];
  };

  for (const line of lines) {
    if (line.startsWith('# ')) continue; // Title line skip
    if (line.startsWith('## ') || line.startsWith('### ')) {
      flush();
      currentHeading = line;
    } else {
      currentBody.push(line);
    }
  }
  flush();

  return blocks;
}
```

주요 변경: `flush` 후 `currentHeading`과 `currentBody`를 명시적으로 초기화. 기존 코드에서는 flush 후 `currentBody = []`만 하고 `currentHeading`은 다음 헤딩에서 덮어쓰는 구조였는데, 연속 헤딩(## 뒤에 바로 ###)일 때 빈 body 블록이 생길 수 있었음.

---

### 🟡 M15: Recording.tsx popover click 리스너 정리 누락

**파일:** `frontend/src/pages/Recording.tsx:231-236`

**수정:** 리스너를 한 번만 등록하고 popoverBlockId 변경 시 정리 보장:

```tsx
useEffect(() => {
  if (!popoverBlockId) return;
  const close = (e: MouseEvent) => {
    // popover 자체 클릭은 무시 (stopPropagation으로 처리됨)
    setPopoverBlockId(null);
  };
  // 다음 틱에 등록 (현재 클릭 이벤트가 즉시 트리거되지 않도록)
  const timer = setTimeout(() => {
    window.addEventListener('click', close);
  }, 0);
  return () => {
    clearTimeout(timer);
    window.removeEventListener('click', close);
  };
}, [popoverBlockId]);
```

---

## 수정 완료 후

```
QA-FIX/QA-FINAL-AUDIT-20260422.md 20건 수정 완료했어. 확인해줘.
```
