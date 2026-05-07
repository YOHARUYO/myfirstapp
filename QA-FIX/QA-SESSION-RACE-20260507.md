# 30분+ 녹음 session.json 손상 — Atomic Write + 공통 락 통합 + 자동 복구

> 작성일: 2026-05-07 (오후)
> 작성자: 검수(QA) 세션
> 대상: 개발 세션
> 범위: `backend/services/session_io.py` 신규 생성 (1) + `routers/sessions.py` (15곳 패턴 추가) + `routers/audio.py` (락/세이브 통합)
> 우선순위: 🔴 **Critical** — 30분 이상 녹음 시 session.json 영구 손상 → 작업 전체 차단

---

## 개발 세션 전달 지시사항 (복붙용)

```
QA-FIX/QA-SESSION-RACE-20260507.md 읽고 반영해줘. 30분+ 녹음에서 session.json이 race로 손상되어 (Invalid JSON: trailing characters)
이후 모든 GET /sessions/{id}가 500나는 치명 버그. 사용자 a357f55c 세션이 실제 손상된 채 보존돼있어 직접 검증 가능.
H(atomic write) + I(공통 threading.Lock 모듈) + K(자동 복구) 세 가지를 한 번에 적용해야 lost update까지 차단.
변경 끝나면 손상된 세션이 자동 복구되는지 + 60분 시뮬 검증까지 부탁. DEV-REPORT 결과 기록 필요.
```

---

## 배경

2026-04-27 1차 수정(A~D, `QA-FIX/QA-LONG-RECORDING-20260427.md`) 적용 이후에도 30분 시점부터 동일 증상 재발:

**사용자 보고 (2026-05-07 실사용):**
- 30분 녹음 도중부터 토스트 폭증: `"블록 병합에 실패했습니다"`, `"중요도 저장에 실패했습니다"` 반복
- python 콘솔에 동일 traceback 반복:
  ```
  File "backend/routers/sessions.py", line 33, in _load_session
    return Session.model_validate_json(path.read_text(encoding="utf-8"))
  pydantic_core._pydantic_core.ValidationError: 1 validation error for Session
    Invalid JSON: trailing characters at line 1859 column 7
  ```

**검수 직접 검증 결과 — 손상 단서 확인 (a357f55c 세션):**
```
1856:   "action_items": [],
1857:   "keywords": []
1858: }                              ← 정상 JSON 종료 (~59KB)
1859:       "source": "web_speech",  ← ← 이전 쓰기의 꼬리가 잔존
1860:       "is_edited": false,
...
1871: (총 1871줄 = 정상보다 13줄 더 김)
```

**1차(D)는 "chunk 저장 시 session.json 쓰기 생략"으로 audio.py의 쓰기 빈도만 줄였을 뿐, race의 진짜 출처(sessions.py 15개 sync 핸들러)에는 손대지 않음.**

---

## 근본 원인 (3개)

### ① `_save_session`이 atomic write가 아님 (치명)

`backend/routers/sessions.py:36-40` (그리고 `audio.py:31-33`에 별도 정의):
```python
def _save_session(session: Session) -> None:
    session_dir = SESSIONS_DIR / session.session_id
    session_dir.mkdir(parents=True, exist_ok=True)
    path = session_dir / "session.json"
    path.write_text(session.model_dump_json(indent=2), encoding="utf-8")  # ← non-atomic
```

`Path.write_text()`는 내부적으로 `open(path, 'w') → write → close`. 두 스레드가 거의 동시에 같은 파일을 열면, 더 짧은 쪽이 truncate 없이 덮어써서 **이전 쓰기의 꼬리가 그대로 잔존** → JSON 파서가 `Extra data` 에러.

### ② sessions.py의 15개 sync 핸들러에 락 없음

**호출 위치:** `sessions.py` 라인 95, 125, 137, 147, 182, 224, 227, 247, 261, 282, 373, 419, 471, 493, 542 (15곳).

| 파일 | 핸들러 종류 | 현재 락 |
|------|-----------|--------|
| `audio.py` | `async def` | `asyncio.Lock` (라인 15) ✅ |
| `sessions.py` | **`def` (sync, 15개)** | **락 없음** ❌ |

FastAPI는 sync 핸들러를 threadpool에서 실행 → 같은 세션에 동시 PATCH/PUT/POST가 들어오면 두 워커 스레드가 같은 파일을 동시에 write → race.

### ③ audio.py와 sessions.py의 락이 별개

audio.py는 자체 `_session_locks`(asyncio.Lock 기반)로 보호되지만, 이 락은 sessions.py에 영향 없음. 3단계(녹음 중) 동시 진행되는 상황:

- audio.py: speech_result 수신 → block POST + save (audio 락)
- sessions.py: 사용자 메타데이터 blur 저장 → metadata PATCH + save (락 없음)

→ 두 작업이 같은 session.json을 같은 시점에 쓸 수 있음.

---

## 손상 메커니즘 (재현)

```
T=0: 핸들러 A — PUT /blocks (페이로드 크기: 80KB JSON)
     open()
       → write(80KB)
T=10ms: 핸들러 B — PATCH /metadata (페이로드 크기: 60KB JSON)
        open()
          → write(60KB)
          → close() ← 60KB까지만 정상, 60KB~80KB 위치엔 A의 꼬리가 남음
T=20ms: A가 close() → 80KB 정상 (또는 더 짧을 수도)
                     실제로는 close 순서/타이밍에 따라 다양하게 손상
```

페이로드가 작을 때(짧은 녹음)는 윈도우가 짧아 충돌 확률 낮음. **30분+ → 60–200KB → race window 길어짐 → 충돌 ↑.**

---

## H: Atomic Write — `tempfile + os.replace`

### 개념

같은 디렉토리에 임시 파일을 만들어 다 쓴 뒤 `os.replace()`로 원본을 통째로 교체. POSIX와 Windows 모두에서 atomic 보장.

### 적용 위치

`backend/services/session_io.py` (신규) 의 `_atomic_write_text()` 헬퍼 1곳에서 통합 처리. audio.py / sessions.py가 이 모듈을 사용하도록 변경.

---

## I: 공통 락 모듈 — `threading.Lock` 기반

### 왜 threading.Lock인가

- sessions.py의 sync 핸들러는 `async with asyncio.Lock` 사용 불가 (await 못 함)
- audio.py의 async 핸들러는 `await asyncio.to_thread(lock.acquire)` 또는 `to_thread`로 감싼 sync 함수 안에서 `with lock:` 사용 가능
- → **`threading.Lock` 하나로 sync/async 양립 가능, 같은 dict 공유로 동일 세션 동시성 차단**

### 락의 역할 — 두 가지

1. **atomic write 보호** — H로 OS 차원 보장됨, 락은 보조
2. **read-modify-write 원자성** ← **lost update 차단** (이게 핵심)
   - 핸들러 본문 전체를 락으로 감싸야 함 (load + modify + save 한 단위)
   - save_session 내부에만 락 두면 ②는 보호 안 됨

### 락 클린업

audio.py disconnect 시 (현재 라인 121) `_session_locks.pop(session_id, None)` 했던 패턴 유지. 추가로 sessions.py의 `complete_session` (status="completed"로 전환되는 지점, 라인 182)과 `delete_session` (라인 340)에서도 동일하게 정리.

---

## K: 손상 자동 복구 (보너스 안전망)

### 발동 조건

`load_session()` 호출 시 `Session.model_validate_json()`이 실패할 때만. H+I 적용 후에는 새로 손상이 발생할 일이 없으므로, 이미 손상된 a357f55c 세션과 같은 기존 손상 파일을 살리는 용도.

### 복구 알고리즘

```
1. 원본을 .corrupted-{타임스탬프}.json 으로 백업 (한 번만)
2. json.JSONDecoder().raw_decode()로 첫 valid JSON 객체까지만 파싱
3. 파싱된 객체로 Session 재구성 → 정상이면 atomic write로 다시 저장
4. 정상 Session 반환
실패 시: HTTPException(500, "Session file is corrupted and could not be recovered")
```

### 부작용 검토

- 거의 모든 trailing-char 손상은 **첫 객체가 valid한 패턴** (a357f55c 케이스도 그러함)
- 백업 파일이 옆에 남으므로 수동 검증/복구 가능
- 복구되는 데이터는 "마지막으로 정상적으로 쓰인 시점의 세션 스냅샷" — 손상 이후 들어온 PATCH는 어차피 모두 500났으므로 손실 없음

---

## 구현 명세

### 1) 신규 파일: `backend/services/session_io.py`

```python
"""세션 영속 계층 — atomic write + 세션별 락 + 손상 자동 복구.

audio.py / sessions.py 양쪽이 동일 인터페이스로 사용.
sync 핸들러: 직접 호출 (`with get_session_lock(sid):` ... save_session(session))
async 핸들러: `await asyncio.to_thread(...)` 안에서 동일 패턴 사용.
"""
import json
import os
import tempfile
import threading
from datetime import datetime
from pathlib import Path

from fastapi import HTTPException

from config import SESSIONS_DIR
from models.session import Session


# ---- per-session locks ----
_session_locks: dict[str, threading.Lock] = {}
_meta_lock = threading.Lock()


def get_session_lock(session_id: str) -> threading.Lock:
    """세션별 락 — sync/async 모두 사용. 없으면 lazy 생성."""
    with _meta_lock:
        lock = _session_locks.get(session_id)
        if lock is None:
            lock = threading.Lock()
            _session_locks[session_id] = lock
        return lock


def release_session_lock(session_id: str) -> None:
    """세션 종료/삭제 시 호출. 누락돼도 동작에는 영향 없음(메모리만 누수)."""
    with _meta_lock:
        _session_locks.pop(session_id, None)


# ---- atomic write ----
def _atomic_write_text(path: Path, content: str) -> None:
    """tempfile에 쓴 뒤 os.replace로 atomic 교체. partial write 방지."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(
        dir=path.parent,
        prefix=f".{path.name}.",
        suffix=".tmp",
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(content)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_path, path)  # atomic on Windows + POSIX
    except Exception:
        try:
            os.unlink(tmp_path)
        except FileNotFoundError:
            pass
        raise


def save_session(session: Session) -> None:
    """Atomic write only. 호출자가 lock을 잡고 호출해야 함 (lost update 방지)."""
    path = SESSIONS_DIR / session.session_id / "session.json"
    _atomic_write_text(path, session.model_dump_json(indent=2))


# ---- load with auto-recovery (K) ----
def load_session(session_id: str) -> Session:
    path = SESSIONS_DIR / session_id / "session.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Session not found")

    raw = path.read_text(encoding="utf-8")
    try:
        return Session.model_validate_json(raw)
    except Exception as exc_first:
        # 손상 자동 복구 (K)
        try:
            obj, _idx = json.JSONDecoder().raw_decode(raw)
            session = Session.model_validate(obj)
            # 백업 후 정상 부분 재저장
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_path = path.with_name(f"{path.name}.corrupted-{ts}")
            backup_path.write_text(raw, encoding="utf-8")
            _atomic_write_text(path, session.model_dump_json(indent=2))
            return session
        except Exception:
            raise HTTPException(
                status_code=500,
                detail=f"Session file is corrupted and could not be recovered: {exc_first}",
            )
```

### 2) `backend/routers/sessions.py` 변경

#### 헤더 변경
```python
# 기존 import 부근
import threading  # ← 사용 안 하면 제거 가능

from services.session_io import load_session, save_session, get_session_lock, release_session_lock
```

#### 자체 헬퍼 제거 (라인 28~40)
```python
# 제거: _load_session, _save_session
# (위 import로 대체)
```

#### 모든 핸들러를 `with get_session_lock(session_id):`로 감싸기 (15곳)

**패턴 1 — 단순 PATCH 핸들러 (예: update_block, 라인 363~)**
```python
# 기존
@router.patch("/{session_id}/blocks/{block_id}")
def update_block(session_id: str, block_id: str, req: UpdateBlockRequest):
    _validate_session_id(session_id)
    session = _load_session(session_id)
    for block in session.blocks:
        if block.block_id == block_id:
            ...
            _save_session(session)
            return block.model_dump()
    raise HTTPException(status_code=404, detail="Block not found")

# 수정
@router.patch("/{session_id}/blocks/{block_id}")
def update_block(session_id: str, block_id: str, req: UpdateBlockRequest):
    _validate_session_id(session_id)
    with get_session_lock(session_id):
        session = load_session(session_id)
        for block in session.blocks:
            if block.block_id == block_id:
                ...
                save_session(session)
                return block.model_dump()
    raise HTTPException(status_code=404, detail="Block not found")
```

**패턴 2 — 단순 GET (락 불필요, read-only)**
```python
# 기존
@router.get("/{session_id}")
def get_session(session_id: str):
    session = _load_session(session_id)
    return session.model_dump()

# 수정 (load_session으로만 변경, 락 불필요 — read는 atomic write 결과를 그대로 읽음)
@router.get("/{session_id}")
def get_session(session_id: str):
    session = load_session(session_id)
    return session.model_dump()
```

**패턴 3 — complete_session (라인 151)에서 락 해제 추가**
```python
@router.post("/{session_id}/complete")
def complete_session(session_id: str):
    _validate_session_id(session_id)
    with get_session_lock(session_id):
        session = load_session(session_id)
        # ... duration 계산, meeting 생성, meeting_path.write_text ...
        session.status = "completed"
        save_session(session)
    release_session_lock(session_id)  # ← 추가
    return meeting.model_dump()
```

**패턴 4 — delete_session (라인 340)에서 락 해제 추가**
```python
@router.delete("/{session_id}")
def delete_session(session_id: str):
    import shutil
    _validate_session_id(session_id)
    with get_session_lock(session_id):
        # ... shutil.rmtree(session_dir) ...
        pass
    release_session_lock(session_id)  # ← 추가
    return {"deleted": session_id}
```

#### 락이 필요한 핸들러 목록 (15개 _save_session 호출 → 15개 모두 with 블록 추가)

| 라인 | 핸들러 | 비고 |
|------|--------|------|
| 95 | create_session | session_id가 함수 내에서 생성됨 → 락 불필요 (다른 핸들러가 동시 접근 못 함) |
| 125 | update_metadata | with 추가 |
| 137 | stop_recording | with 추가 |
| 147 | resume_recording | with 추가 |
| 182 | complete_session | with 추가 + release_session_lock 호출 |
| 224, 227 | summarize_session | with 추가 (try/except 모두 락 안에서) |
| 247 | update_summary | with 추가 |
| 261 | update_action_items | with 추가 |
| 282 | replace_all_blocks (PUT) | with 추가 |
| 373 | update_block | with 추가 |
| 419 | split_block | with 추가 |
| 471 | merge_block | with 추가 |
| 493 | update_importance | with 추가 |
| 542 | (다음 핸들러 — Read 후 라인 정확히 확인) | with 추가 |

> **주의:** create_session(95)은 새 세션 ID 생성 직후이므로 동시 진입 불가 → 락 생략. 나머지 14개 모두 with 블록 추가.

> **try/except 안에서 _save_session이 두 번 나오는 케이스 (summarize_session 라인 224/227)는 with 블록을 try 바깥에 두기.**

### 3) `backend/routers/audio.py` 변경

#### 헤더 변경
```python
import asyncio
import json
from pathlib import Path
from datetime import datetime

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, UploadFile, File, HTTPException

from config import SESSIONS_DIR
from models.session import Session
from models.block import Block
from services.session_io import load_session, save_session, get_session_lock, release_session_lock
```

#### 자체 헬퍼 제거 (라인 14~33)
```python
# 제거: _session_locks, _get_lock, _load_session, _save_session
# (services.session_io 사용으로 대체)
```

#### 락 패턴 변경 — `async with asyncio.Lock` → sync 함수 + `to_thread`

```python
# 기존 (라인 50~53)
async with lock:
    session = await asyncio.to_thread(_load_session, session_id)
    session.status = "recording"
    await asyncio.to_thread(_save_session, session)

# 수정
def _start_recording(sid: str) -> Session:
    with get_session_lock(sid):
        session = load_session(sid)
        session.status = "recording"
        save_session(session)
        return session

session = await asyncio.to_thread(_start_recording, session_id)
```

```python
# 기존 (라인 87~90, speech_result)
async with lock:
    session = await asyncio.to_thread(_load_session, session_id)
    session.blocks.append(block)
    await asyncio.to_thread(_save_session, session)

# 수정
def _append_block(sid: str, blk: Block) -> None:
    with get_session_lock(sid):
        session = load_session(sid)
        session.blocks.append(blk)
        save_session(session)

await asyncio.to_thread(_append_block, session_id, block)
```

```python
# 기존 (라인 101~110, recording_resumed)
async with lock:
    session = await asyncio.to_thread(_load_session, session_id)
    if session.blocks:
        from models.session import RecordingGap
        session.recording_gaps.append(...)
    session.status = "recording"
    await asyncio.to_thread(_save_session, session)

# 수정
def _record_resume(sid: str, gap: float) -> None:
    with get_session_lock(sid):
        session = load_session(sid)
        if session.blocks:
            from models.session import RecordingGap
            session.recording_gaps.append(RecordingGap(
                after_block_id=session.blocks[-1].block_id,
                gap_seconds=gap,
            ))
        session.status = "recording"
        save_session(session)

await asyncio.to_thread(_record_resume, session_id, data.get("gap_seconds", 0))
```

```python
# 기존 (라인 112~121, disconnect)
except WebSocketDisconnect:
    async with lock:
        session = await asyncio.to_thread(_load_session, session_id)
        session.audio_chunk_count = chunk_index
        if session.status == "recording":
            session.status = "post_recording"
            session.metadata.end_time = datetime.now().strftime("%H:%M:%S")
        await asyncio.to_thread(_save_session, session)
    _session_locks.pop(session_id, None)

# 수정
except WebSocketDisconnect:
    def _finalize(sid: str, chunks: int) -> None:
        with get_session_lock(sid):
            session = load_session(sid)
            session.audio_chunk_count = chunks
            if session.status == "recording":
                session.status = "post_recording"
                session.metadata.end_time = datetime.now().strftime("%H:%M:%S")
            save_session(session)
    await asyncio.to_thread(_finalize, session_id, chunk_index)
    # 녹음 종료 시점이지만 사용자가 4~7단계로 진행하면서 sessions.py가 같은 락을 사용하므로
    # 여기서는 release_session_lock 호출하지 않음. complete_session/delete_session에서 정리됨.
```

#### `lock = _get_lock(session_id)` 줄 제거 (라인 47)

audio.py 전체에서 외부 `lock` 변수는 더 이상 필요 없음 (각 헬퍼 함수가 직접 `get_session_lock` 호출).

#### upload_audio 핸들러 (라인 124~)

```python
# 기존 (라인 152~155)
session = _load_session(session_id)
session.audio_chunks_dir = str(chunks_dir)
session.status = "post_recording"
_save_session(session)

# 수정
def _finalize_upload(sid: str, chunks_dir_str: str) -> None:
    with get_session_lock(sid):
        session = load_session(sid)
        session.audio_chunks_dir = chunks_dir_str
        session.status = "post_recording"
        save_session(session)

await asyncio.to_thread(_finalize_upload, session_id, str(chunks_dir))
```

### 4) `.gitignore` 추가

```
# session_io tempfile (예외 시 잔여 가능)
backend/data/sessions/**/.session.json.*.tmp
# 손상 자동 복구 백업
backend/data/sessions/**/session.json.corrupted-*
```

---

## 안전성·호환성·롤백 검토

| 항목 | 판정 | 근거 |
|------|------|------|
| session.json 포맷 변경 | ❌ 없음 | model_dump_json 그대로 |
| 기존 데이터 호환 | ✅ 그대로 읽힘 | load_session이 정상 + 손상 두 케이스 모두 처리 |
| Windows + macOS 양쪽 atomic | ✅ 보장 | `os.replace` 표준 동작 |
| 60분 회의 손상 가능성 | ✅ **0** | atomic write가 race를 차단 |
| 60분 회의 lost update | ✅ **0** | per-session lock이 read-modify-write 직렬화 |
| 60분 회의 응답 지연 | 🟡 ~50–500ms | 큰 페이로드 PATCH/PUT이 락을 오래 잡음. 손상보다 훨씬 나음 |
| 메모리 누수 (락 dict) | 🟢 무시 | 세션당 1항목, complete/delete에서 정리 |
| tmp 파일 잔여 | 🟢 무시 | 예외 시에만, .gitignore 처리 |
| 롤백 | ✅ 가능 | git revert 1회 |

---

## 검증 방법

### 1. 손상 자동 복구 (K) 단독 검증 — 즉시
- 사용자 세션 `backend/data/sessions/session_20260507_a357f55c/session.json`이 손상된 채 보존돼있음 (line 1858 이후 trailing 데이터)
- 백엔드 재시작 후 GET `/api/sessions/session_20260507_a357f55c` 호출
- 기대:
  - 200 OK + 정상 Session JSON 반환
  - `session.json.corrupted-{ts}` 백업 파일 생성
  - `session.json` 파일 재정렬 (line 1858까지로 잘림)

### 2. atomic write (H) 검증 — 단위 시뮬
- 같은 세션에 동시 PATCH 100회 (curl 또는 pytest):
  ```bash
  for i in $(seq 1 100); do (curl -s -X PATCH ".../sessions/{sid}/blocks/{bid}" -d '{"text":"a"}' &); done; wait
  ```
- session.json 파싱 검증: `python -c "import json; json.loads(open('session.json').read())"` → 100% 성공
- 수정 전: 일부 시도에서 trailing chars 발생

### 3. lost update (I) 검증
- 같은 세션의 다른 블록 2개에 동시 PATCH 50회 × 2 (총 100회)
- 종료 후 두 블록의 `text`가 모두 마지막 값으로 정확히 반영
- 수정 전: 한쪽 패치 일부가 묻혀서 사라짐

### 4. 60분 시뮬 (실제 회의 전 권장)
- Web Speech 자동 블록 1초당 1개 가정 → 3600개 블록까지 누적
- script로 시뮬: 1초마다 POST + 가끔 PATCH → 60분간 무결성 유지
- session.json 크기 ~200–300KB까지 안정 동작 확인

### 5. 롤백 안전성
- 신 코드로 만든 session.json을 구 코드로 읽기 → 정상
- 구 코드로 만든 session.json을 신 코드로 읽기 → 정상

---

## 영향 범위 요약

| 파일 | 변경 유형 | 라인 수 추정 |
|------|----------|------------|
| `backend/services/session_io.py` | 신규 | ~80 |
| `backend/routers/sessions.py` | 헤더 import + 자체 헬퍼 제거 + 14개 핸들러 with 블록 추가 | ~60 (실질 +/- 30) |
| `backend/routers/audio.py` | 헤더 import + 자체 헬퍼 제거 + 5개 락 블록 함수 추출 | ~70 (실질 +/- 40) |
| `.gitignore` | 패턴 2줄 추가 | +2 |

**기능·UX 로직 변경 0** — 영속화 계층만 atomic + 직렬화로 강화.

---

## 우선순위

🔴 **Critical** — 사용자가 30분+ 회의에서 정상 사용 불가. 본 수정 없이는 60분 회의 시 같은 손상이 재발 확실.

---

## 즉시 사용자 작업 권고 (코드 변경과 별개)

### 손상된 세션 백업
```powershell
$src = "C:\Users\rsa4635\Desktop\coding\project\myfirstapp\backend\data\sessions\session_20260507_a357f55c\session.json"
$dst = "$src.corrupted-backup-20260507"
Copy-Item $src $dst
```

신규 K 로직이 자동 복구하더라도, 백업이 있으면 검증/대조 가능. 또한 H+I 적용 후 같은 파일을 다시 GET하면 K가 자동 복구하면서 line 1859 이후가 잘려나가므로, **잘리기 전 원본을 보존**하는 의미가 있음.

---

## 2차 (재테스트 후 판단, 본 프롬프트 범위 밖)

| # | 항목 | 발동 조건 |
|---|------|----------|
| E | session.json 블록 분리 저장 (blocks/blk_xxx.json 단위) | 60분 회의에서 PATCH 응답 1초 이상 체감 시 |
| F | 블록 렌더링 가상화 (react-window) | 5단계 진입이 5초 이상 걸리는 경우 |
| G | WebSocket heartbeat + 자동 재연결 | 30분+ 녹음에서 WS 끊김이 빈발 시 |

---

## 부록 — 참고 트레이스 (사용자 콘솔)

```
File "C:\Users\rsa4635\Desktop\coding\project\myfirstapp\backend\routers\sessions.py", line 101, in get_session
  session = _load_session(session_id)
File "C:\Users\rsa4635\Desktop\coding\project\myfirstapp\backend\routers\sessions.py", line 33, in _load_session
  return Session.model_validate_json(path.read_text(encoding="utf-8"))
pydantic_core._pydantic_core.ValidationError: 1 validation error for Session
  Invalid JSON: trailing characters at line 1859 column 7 [type=json_invalid, ...]
```

---

*검수 세션 작성. 본 수정 적용 시 사용자가 30분+ 회의를 정상 진행할 수 있고, 60분 회의에서도 손상은 발생하지 않습니다. 응답 지연 체감 시 2차(E/F/G) 진행을 별도 평가합니다.*
