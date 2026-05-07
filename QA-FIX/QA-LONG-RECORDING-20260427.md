# 30분+ 녹음 안정성 수정 — 1차 (방어 코드)

> 작성일: 2026-04-27
> 작성자: 검수(QA) 세션
> 대상: 개발 세션
> 범위: 저위험 방어 코드 4건 (기존 구조 변경 없음)

---

## 배경

30분 이상 녹음 시 POST 500 에러 발생, 블록 병합/편집 불가, 전사 품질 저하, 다음 단계 전환 시 데이터 유실.
근본 원인은 session.json의 매 블록마다 전체 직렬화이지만, 이번 1차에서는 **기존 구조를 건드리지 않고 방어 코드만 추가**하여 리스크를 최소화.

---

## A: Recording.tsx — API 에러 무시(catch(() => {})) 제거 → 토스트 표시

### 현상

`handleEditConfirm`, `handleSplit`, `handleMerge`, `setBlockImportance`에서 서버 500 에러 발생 시 `catch(() => {})` 또는 `catch {}` → 사용자가 인지 못함 → 편집이 서버에 안 저장된 줄 모르고 다음 단계로 이동 → 데이터 유실.

### 수정

```tsx
// (1) setBlockImportance (Recording.tsx ~line 315)
// 기존
api.patch(`/sessions/${session.session_id}/blocks/${blockId}/importance`, { importance }).catch(() => {});

// 수정
api.patch(`/sessions/${session.session_id}/blocks/${blockId}/importance`, { importance }).catch(() => {
  setToast({ message: '중요도 저장에 실패했습니다. 다시 시도해주세요.', visible: true });
});
```

```tsx
// (2) handleEditConfirm (Recording.tsx ~line 381-383)
// 기존
try {
  await api.patch(`/sessions/${session.session_id}/blocks/${editingBlockId}`, { text: editingText });
} catch {}

// 수정
try {
  await api.patch(`/sessions/${session.session_id}/blocks/${editingBlockId}`, { text: editingText });
} catch {
  setToast({ message: '블록 저장에 실패했습니다. 다시 시도해주세요.', visible: true });
}
```

```tsx
// (3) handleSplit (Recording.tsx ~line 390-404)
// 기존
} catch {}

// 수정
} catch {
  setToast({ message: '블록 분할에 실패했습니다.', visible: true });
}
```

```tsx
// (4) handleMerge (Recording.tsx ~line 407-421)
// 기존
} catch {}

// 수정
} catch {
  setToast({ message: '블록 병합에 실패했습니다.', visible: true });
}
```

---

## B: Recording.tsx — 단계 전환 전 블록 수 검증

### 현상

`handleNext`에서 서버에 블록이 제대로 저장되었는지 확인 없이 바로 `navigate('/processing')` → WS 끊김이나 500 에러로 서버에 블록이 일부만 저장된 상태에서 다음 단계 진입 → 데이터 유실.

### 수정

```tsx
// Recording.tsx handleNext (~line 495-501)
// 기존
const handleNext = async () => {
  if (recordingState === 'recording') {
    await handleStopRecording();
  }
  audioStream.disconnect();
  navigate('/processing');
};

// 수정: 서버 블록 수 검증 추가
const handleNext = async () => {
  if (recordingState === 'recording') {
    await handleStopRecording();
  }
  audioStream.disconnect();

  // 서버에 저장된 블록 수 확인
  if (session) {
    try {
      const serverSession = await getSession(session.session_id);
      const serverCount = serverSession.blocks.length;
      const localCount = blocks.length;
      if (serverCount < localCount) {
        // 로컬에만 있는 블록을 서버에 저장 시도
        setToast({
          message: `블록 ${localCount - serverCount}개가 서버에 미저장 상태입니다. 저장 중...`,
          visible: true,
        });
        // 서버에 없는 블록들을 WebSocket으로 재전송하는 대신,
        // 로컬 블록 전체를 서버에 덮어쓰기
        try {
          await api.put(`/sessions/${session.session_id}/blocks`, {
            blocks: blocks.map((b) => ({
              block_id: b.block_id,
              timestamp_start: b.timestamp_start,
              timestamp_end: b.timestamp_end,
              text: b.text,
              source: b.source,
              is_edited: b.is_edited,
              importance: b.importance,
              importance_source: b.importance_source,
              speaker: b.speaker,
            })),
          });
        } catch {
          setToast({ message: '블록 저장 실패. 다시 시도해주세요.', visible: true });
          return; // navigate 하지 않음
        }
      }
    } catch {
      // 서버 확인 실패 시에도 경고 후 진행
      setToast({ message: '서버 상태 확인에 실패했습니다. 데이터가 불완전할 수 있습니다.', visible: true });
    }
  }

  navigate('/processing');
};
```

### 백엔드: PUT /sessions/{id}/blocks 엔드포인트 추가

```python
# backend/routers/sessions.py — 블록 전체 덮어쓰기 API 추가

class BulkBlocksRequest(BaseModel):
    blocks: List[dict]

@router.put("/{session_id}/blocks")
async def replace_all_blocks(session_id: str, req: BulkBlocksRequest):
    """Replace all blocks in a session (for sync recovery)."""
    session_dir = SESSIONS_DIR / session_id
    session_path = session_dir / "session.json"
    if not session_path.exists():
        raise HTTPException(status_code=404, detail="Session not found")

    session = Session.model_validate_json(session_path.read_text(encoding="utf-8"))
    session.blocks = [Block.model_validate(b) for b in req.blocks]
    session_path.write_text(session.model_dump_json(indent=2), encoding="utf-8")

    return {"ok": True, "block_count": len(session.blocks)}
```

---

## C: useWebSpeech.ts — event.results 전체 순회 방지

### 현상

`onresult`에서 interim 텍스트 수집 시 `for (let i = 0; i < event.results.length; i++)` → 30분 후 결과 150개+ 전부 매번 순회 → CPU 부하 → 전사 품질 저하 + 띄어쓰기 깨짐.

### 수정

isFinal 처리 루프는 이미 `event.resultIndex`부터 시작하여 정상.
문제는 interim 수집 루프(line 95-99)가 매번 0부터 순회하는 것.

```typescript
// useWebSpeech.ts onresult 내부 (~line 94-99)
// 기존: 매번 전체 순회
let pendingText = '';
for (let i = 0; i < event.results.length; i++) {
  if (!event.results[i].isFinal) {
    pendingText += event.results[i][0].transcript;
  }
}

// 수정: resultIndex부터만 순회 (isFinal 아닌 결과는 항상 배열 끝에 위치)
let pendingText = '';
for (let i = event.resultIndex; i < event.results.length; i++) {
  if (!event.results[i].isFinal) {
    pendingText += event.results[i][0].transcript;
  }
}
```

**근거:** Web Speech API 스펙상, `event.resultIndex`는 변경된 첫 결과의 인덱스. 이미 isFinal이 된 이전 결과에 isFinal=false 항목이 다시 나타나지 않음. 따라서 `resultIndex`부터만 순회해도 모든 pending interim을 수집 가능.

---

## D: audio.py — _session_locks 클린업

### 현상

`_session_locks` dict에 세션별 Lock이 추가되지만 제거되지 않음. 서버가 오래 실행되면 메모리 누수.
또한 Lock 자체는 큰 문제가 아니지만, 동일 세션에서 30분간 수백 번 lock acquire/release가 반복되면서 asyncio 이벤트 루프에 부하.

### 수정

WebSocket disconnect 시 해당 세션의 lock을 정리:

```python
# audio.py — WebSocketDisconnect 핸들러 (~line 116-122)
# 기존
except WebSocketDisconnect:
    async with lock:
        session = await asyncio.to_thread(_load_session, session_id)
        if session.status == "recording":
            session.status = "post_recording"
            session.metadata.end_time = datetime.now().strftime("%H:%M:%S")
            await asyncio.to_thread(_save_session, session)

# 수정: lock 사용 후 정리
except WebSocketDisconnect:
    async with lock:
        session = await asyncio.to_thread(_load_session, session_id)
        if session.status == "recording":
            session.status = "post_recording"
            session.metadata.end_time = datetime.now().strftime("%H:%M:%S")
            await asyncio.to_thread(_save_session, session)
    # 세션 lock 정리
    _session_locks.pop(session_id, None)
```

추가로, chunk 저장 시 매번 session.json 전체를 읽고 쓰는 대신 **chunk_count만 메모리에서 관리**:

```python
# audio.py — WebSocket 루프 내 chunk 처리 (~line 62-75)
# 기존: 매 chunk마다 session.json 전체 읽기/쓰기
if "bytes" in message:
    chunk_path = chunks_dir / f"chunk_{chunk_index:03d}.webm"
    await asyncio.to_thread(chunk_path.write_bytes, message["bytes"])
    chunk_index += 1

    async with lock:
        session = await asyncio.to_thread(_load_session, session_id)
        session.audio_chunk_count = chunk_index
        await asyncio.to_thread(_save_session, session)

    await websocket.send_json({...})

# 수정: chunk_count는 메모리에서 관리, disconnect 시에만 최종 저장
if "bytes" in message:
    chunk_path = chunks_dir / f"chunk_{chunk_index:03d}.webm"
    await asyncio.to_thread(chunk_path.write_bytes, message["bytes"])
    chunk_index += 1

    await websocket.send_json({
        "type": "chunk_ack",
        "chunk_index": chunk_index - 1,
    })
    # session.json 쓰기는 생략 — disconnect 시 한 번만 저장
```

그리고 disconnect 핸들러에서 최종 chunk_count를 저장:

```python
except WebSocketDisconnect:
    async with lock:
        session = await asyncio.to_thread(_load_session, session_id)
        session.audio_chunk_count = chunk_index  # 최종 chunk 수 저장
        if session.status == "recording":
            session.status = "post_recording"
            session.metadata.end_time = datetime.now().strftime("%H:%M:%S")
        await asyncio.to_thread(_save_session, session)
    _session_locks.pop(session_id, None)
```

이렇게 하면 **5초마다 발생하던 session.json 전체 직렬화가 speech_result 시에만 발생** (chunk 저장은 파일만 쓰고 session.json 안 건드림) → I/O 부하 절반 이하로 감소.

---

## 수정 영향 분석

| 수정 | 변경 파일 | 기존 기능 영향 | 충돌 위험 |
|------|----------|--------------|----------|
| A | Recording.tsx | 없음 (catch 내부만 변경) | 없음 |
| B | Recording.tsx + sessions.py | 신규 API 추가 (기존 안 건드림) | 없음 |
| C | useWebSpeech.ts | 루프 시작점만 변경, 로직 동일 | 없음 |
| D | audio.py | chunk 저장 시 session.json 쓰기 제거 + disconnect 정리 | 낮음 (서버 크래시 시 chunk_count 유실 가능하나 복구 가능) |

---

## 수정 완료 후 테스트

1. **기본 동작**: 녹음 시작 → 5분 진행 → 블록 편집/분할/병합 → 정상 동작 확인
2. **에러 표시**: 서버 중지 상태에서 편집 시도 → 토스트 표시 확인
3. **단계 전환**: 녹음 종료 → 다음 단계 → 블록 수 일치 확인
4. **장시간 녹음**: 가능하면 15~30분 녹음 → 500 에러 발생 여부 확인

---

## 수정 완료 후

```
QA-FIX/QA-LONG-RECORDING-20260427.md 수정 완료했어. 확인해줘.
```
