# 종합 수정 — 기존 이슈 + 사용자 오류 보고 + 개선 요청

> 작성일: 2026-04-23
> 작성자: 검수(QA) 세션
> 대상: 개발 세션
> 범위: 🔴 즉시 수정 + 🟡 중간 위험 + 사용자 보고 오류 4건 + 사용자 개선 요청 7건

---

## Part A: 사용자 보고 오류 (4건)

---

### 🔴 U1: 설정에서 Slack/Claude API가 "미설정"으로 표시

**파일:** `backend/routers/settings.py:15-19, 30-38`
**원인:** `_load_settings()`가 `settings.json`에서 읽지만, 실제 토큰은 `.env`에 있음. settings.json에 토큰을 저장한 적이 없으면 빈 문자열 → 프론트 maskToken이 "미설정" 반환.

**수정:** GET /settings 응답 시 settings.json에 값이 없으면 `.env`의 값을 마스킹해서 표시:

```python
from config import ANTHROPIC_API_KEY, SLACK_BOT_TOKEN

def _mask_response(settings: AppSettings) -> dict:
    data = settings.model_dump()

    # settings.json에 없으면 .env 값 사용
    token = data.get("slack", {}).get("bot_token", "") or SLACK_BOT_TOKEN
    if token and len(token) > 12:
        data["slack"]["bot_token"] = f"{token[:8]}...{token[-4:]}"
        data["slack"]["connected"] = True
    elif token:
        data["slack"]["bot_token"] = f"{token[:4]}...{"
        data["slack"]["connected"] = True
    else:
        data["slack"]["bot_token"] = ""
        data["slack"]["connected"] = False

    key = data.get("claude", {}).get("api_key", "") or ANTHROPIC_API_KEY
    if key and len(key) > 14:
        data["claude"]["api_key"] = f"{key[:10]}...{key[-4:]}"
    elif key:
        data["claude"]["api_key"] = f"{key[:4]}..."
    else:
        data["claude"]["api_key"] = ""

    return data
```

---

### 🔴 U2: 설정에 마이크 민감도 슬라이더 없음

**파일:** `frontend/src/pages/Settings.tsx`
**원인:** Recording.tsx에만 슬라이더가 있고 Settings에는 누락됨.

**수정:** Settings.tsx "연동" 섹션 하단에 추가:

```tsx
// "연동" 섹션 내부, Whisper 모델 아래에:
<div className="bg-bg-subtle rounded-xl p-4">
  <p className="text-[15px] font-medium text-text">마이크 민감도</p>
  <p className="text-xs text-text-tertiary mt-0.5">녹음 시 기본 민감도 ({micSensitivity.toFixed(1)}x)</p>
  <input
    type="range" min="0.5" max="10.0" step="0.1"
    value={micSensitivity}
    onChange={(e) => {
      const val = parseFloat(e.target.value);
      setMicSensitivity(val);
      api.patch('/settings', { mic_sensitivity: val }).catch(() => {});
    }}
    className="w-full mt-3 accent-primary cursor-pointer"
  />
  <div className="flex justify-between text-xs text-text-tertiary mt-1">
    <span>0.5x</span>
    <span>10.0x</span>
  </div>
  {micSensitivity > 5.0 && (
    <p className="text-xs text-warning mt-2">⚠️ 5x 이상에서는 오디오 왜곡이 발생할 수 있습니다</p>
  )}
</div>
```

상태 추가:
```tsx
const [micSensitivity, setMicSensitivity] = useState(1.0);

// useEffect 로드 시:
setMicSensitivity(s.mic_sensitivity || 1.0);
```

Recording.tsx의 슬라이더도 max를 `10.0`으로 변경 (567행):
```tsx
max="10.0"
```

**⚠️ 리스크:** 5x 이상에서 GainNode 증폭으로 오디오 클리핑/왜곡 발생 가능. Whisper 인식률 저하 위험. 경고 문구로 대응.

---

### 🟡 U3: 설정 저장 경로가 7단계에 미반영

**파일:** `frontend/src/pages/SendSave.tsx:31, 64-68`
**원인:** `exportPath` 초기값이 빈 문자열. settings의 `export_path`를 로드하지 않음.

**수정:** mount 시 settings에서 경로 로드:

```tsx
// 기존 useEffect (64행 부근)에 settings 로드 추가
useEffect(() => {
  setStep(7);
  if (session) {
    getSession(session.session_id).then(setSession).catch(() => {});
  }
  // settings에서 기본 저장 경로 로드
  api.get('/settings').then((res) => {
    setExportPath(res.data.export_path || 'exports/');
  }).catch(() => {});
}, [setStep]);
```

또한 export-md 호출 시 경로를 서버에 전달해야 함:
```tsx
// 기존
const res = await api.post(`${apiBase}/${session.session_id}/export-md`);

// 수정: 경로 전달
const res = await api.post(`${apiBase}/${session.session_id}/export-md`, { export_path: exportPath });
```

백엔드 `export_md` 함수도 `export_path` 파라미터를 받도록 수정:
```python
@router.post("/{session_id}/export-md")
def export_md(session_id: str, req: dict = {}):
    # ...
    custom_path = req.get("export_path")
    if custom_path:
        export_dir = Path(custom_path)
        export_dir.mkdir(parents=True, exist_ok=True)
    else:
        export_dir = EXPORT_DIR
    export_path = export_dir / filename
    # ...
```

---

### 🟡 U4: 새로 추가한 Slack 채널 선택 불가

**파일:** `frontend/src/pages/SendSave.tsx:72-80`, `backend/routers/slack.py:92-96`
**원인:** `conversations_list`에 `is_member` 필터 → 봇이 `/invite`된 채널만 표시. 채널 목록 새로고침 UI 없음.

**수정:**

```tsx
// SendSave.tsx 채널 드롭다운 옆에 새로고침 버튼 추가:
<div className="flex gap-2">
  <select ...>{/* 기존 */}</select>
  <button
    onClick={() => {
      setChannelsLoading(true);
      listChannels().then((chs) => {
        setChannels(chs);
        if (chs.length > 0 && !selectedChannel) setSelectedChannel(chs[0].id);
        showToast(`${chs.length}개 채널 로드됨`);
      }).catch(() => showToast('채널 목록을 불러올 수 없습니다'))
      .finally(() => setChannelsLoading(false));
    }}
    className="px-3 py-2 text-sm text-text-secondary bg-bg rounded-lg hover:bg-bg-hover cursor-pointer shrink-0"
    title="채널 목록 새로고침"
  >
    ↻
  </button>
</div>

// 채널 0개일 때 안내 문구 변경:
<p className="text-sm text-text-tertiary">
  참여 중인 채널이 없습니다. Slack에서 봇을 채널에 /invite 해주세요.
</p>
```

---

## Part B: 사용자 개선 요청 (7건 — 기획 변경 불필요한 것만)

---

### 🟡 I1: 주소록 레이아웃 → 칩(태그) 그리드

**파일:** `frontend/src/pages/Settings.tsx` 주소록 섹션

**현재:** 참여자/장소가 1열 리스트 → 스크롤 길어짐.
**수정:** 칩(태그) 형태의 flex-wrap 레이아웃:

```tsx
// 기존: space-y-1 리스트
<div className="space-y-1 mb-3">
  {participants.map((p) => (
    <div key={p.id} className="flex items-center justify-between py-1.5 px-3">...</div>
  ))}
</div>

// 수정: flex-wrap 칩
<div className="flex flex-wrap gap-2 mb-3">
  {participants.map((p) => (
    <span key={p.id} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-bg rounded-full text-sm text-text ring-1 ring-border-light">
      {p.name}
      <button onClick={() => handleDeleteContact('participants', p.id)}
        className="text-text-tertiary hover:text-recording cursor-pointer">
        <X size={12} />
      </button>
    </span>
  ))}
</div>
```

장소도 동일 패턴 적용.

---

### 🟡 I3: 마이크 민감도 최대 10.0x

**파일:** `frontend/src/pages/Recording.tsx:567-568`

```tsx
// 기존
min="0.5" max="3.0"

// 수정
min="0.5" max="10.0"
```

**⚠️ 리스크:** 5x 이상에서 오디오 클리핑 가능. 경고 표시 추가:
```tsx
{micSensitivity > 5.0 && (
  <p className="text-xs text-warning mt-1">⚠️ 높은 민감도는 오디오 왜곡을 유발할 수 있습니다</p>
)}
```

---

### 🟡 I4: 블록 편집 시 스크롤 제거 → 자동 확장 textarea

**파일:** `frontend/src/pages/Recording.tsx`, `frontend/src/pages/Editing.tsx`

**현재:** `rows={Math.max(1, ...)}` + 고정 크기 → 내부 스크롤 발생.
**수정:** textarea를 자동 확장하고 overflow hidden:

```tsx
// 두 파일의 편집 textarea에 동일 적용:
<textarea
  ref={editInputRef}
  value={editingText}
  onChange={(e) => {
    setEditingText(e.target.value);
    // 자동 높이 조절
    e.target.style.height = 'auto';
    e.target.style.height = e.target.scrollHeight + 'px';
  }}
  className="... resize-none overflow-hidden"
  style={{ minHeight: '2rem' }}
  // rows 속성 제거
/>
```

mount 시에도 높이 설정:
```tsx
useEffect(() => {
  if (editInputRef.current) {
    editInputRef.current.style.height = 'auto';
    editInputRef.current.style.height = editInputRef.current.scrollHeight + 'px';
  }
}, [editingText]);
```

---

### 🟡 I5: 합치기 버튼 위치 → 블록 크기 비영향

**파일:** `frontend/src/pages/Editing.tsx` 호버 메뉴

**현재:** 블록 내부에 `group-hover:opacity-100` → 버튼이 나타나면 블록 높이가 변함.
**수정:** absolute 포지셔닝으로 블록 밖에 표시:

```tsx
// 블록 wrapper에 relative 추가
<div className="group relative flex items-start gap-1.5 py-2 rounded-lg px-3 -mx-3 ...">
  {/* ... 기존 블록 내용 ... */}

  {/* 합치기 메뉴: absolute로 블록 우측 상단에 오버레이 */}
  {!editingBlockId && isFocused && (
    <div className="absolute -right-2 top-0 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-0.5 z-10">
      {blocks.indexOf(block) > 0 && (
        <button onClick={(e) => { e.stopPropagation(); handleMerge(block.block_id, 'prev'); }}
          className="text-[10px] text-text-tertiary hover:text-text px-1.5 py-0.5 rounded bg-bg shadow-sm hover:bg-bg-hover cursor-pointer whitespace-nowrap">
          ↑ 합치기
        </button>
      )}
      {blocks.indexOf(block) < blocks.length - 1 && (
        <button onClick={(e) => { e.stopPropagation(); handleMerge(block.block_id, 'next'); }}
          className="text-[10px] text-text-tertiary hover:text-text px-1.5 py-0.5 rounded bg-bg shadow-sm hover:bg-bg-hover cursor-pointer whitespace-nowrap">
          ↓ 합치기
        </button>
      )}
    </div>
  )}
</div>
```

---

### 🟡 I6: 복구 배너 경고 스타일

**파일:** `frontend/src/pages/Home.tsx` 복구 배너

**현재:** `bg-bg-subtle` (연회색) → 중요성 안 느껴짐.
**수정:** 경고 스타일로 변경:

```tsx
// 기존
<div className="w-full mb-8 bg-bg-subtle rounded-xl p-5">
  <p className="text-sm font-medium text-text">진행 중인 회의가 있습니다</p>

// 수정
<div className="w-full mb-8 bg-warning-bg border border-warning/20 rounded-xl p-5">
  <p className="text-sm font-medium text-warning-text">📌 진행 중인 회의가 있습니다</p>
```

---

### 🟡 I7: 스레드 답장 유저 코드 표시

**파일:** `backend/routers/slack.py:91-137` `list_messages`
**현재:** `_resolve_user_name()` 함수가 존재하고 호출되지만, 일부 메시지에서 `user_id`가 빈 문자열일 수 있음.

**확인 필요:** 프론트에서 `msg.user_name`이 "Unknown" 또는 코드로 표시되는 경우:
- 서버가 `users.info` API 호출 실패 시 user_id를 그대로 반환 (66행)
- 캐시에 없고 API 실패하면 raw ID가 표시됨

**수정:** 에러 시 fallback 개선:
```python
def _resolve_user_name(client, user_id: str) -> tuple[str, bool]:
    if user_id in _user_cache:
        return _user_cache[user_id], False
    try:
        info = client.users_info(user=user_id)
        user = info.get("user", {})
        is_bot = user.get("is_bot", False)
        name = (
            user.get("profile", {}).get("display_name")
            or user.get("real_name")
            or user.get("name")
            or f"사용자({user_id[-4:]})"  # ← 코드 대신 마지막 4자리
        )
        _user_cache[user_id] = name
        return name, is_bot
    except Exception:
        fallback = f"사용자({user_id[-4:]})"  # ← 코드 대신 읽기 쉬운 형태
        _user_cache[user_id] = fallback
        return fallback, False
```

---

## Part C: 기존 검수 이슈 (🔴 5건 + 🟡 중복 제거 후 약 10건)

---

### 🔴 C1: summarize 실패 시 status "summarizing" 고정 (#9, #N1, #32)

**파일:** `backend/routers/sessions.py:180-222`

```python
@router.post("/{session_id}/summarize")
def summarize_session(session_id: str):
    # ...
    session = _load_session(session_id)
    # status 변경을 Claude 호출 이후로 이동 + try-catch
    try:
        claude_response = summarize_blocks(...)
        # ...
        full_markdown, keywords, action_items = assemble_full_summary(...)

        session.summary_markdown = full_markdown
        session.action_items = action_items
        session.keywords = keywords
        session.status = "summarizing"  # ← 성공 후에만 상태 변경
        _save_session(session)
    except Exception as e:
        # 실패 시 status 복구
        session.status = "editing"
        _save_session(session)
        raise HTTPException(status_code=500, detail=f"요약 생성 실패: {str(e)}")

    return { "summary_markdown": full_markdown, "action_items": action_items, "keywords": keywords }
```

---

### 🔴 C2: Slack 전송 후 slack_sent 미업데이트 (#11, #N2)

**파일:** `backend/routers/slack.py:219-276`

전송 성공 후 Session 또는 Meeting의 `slack_sent` 필드 업데이트:

```python
# send_slack_message 함수 내, return 직전에:
from datetime import datetime as _dt

# Session이면 session.json 업데이트
session_path = SESSIONS_DIR / req.session_id / "session.json"
if session_path.exists():
    s = Session.model_validate_json(session_path.read_text(encoding="utf-8"))
    # Session 모델에 slack_sent가 없으면 skip
    # Meeting이면:
meeting_path = MEETINGS_DIR / f"{req.session_id}.json"
if meeting_path.exists():
    import json as _j
    m_data = _j.loads(meeting_path.read_text(encoding="utf-8"))
    m_data["slack_sent"] = {
        "channel_id": req.channel_id,
        "channel_name": f"#{channel_name}",
        "thread_ts": req.thread_ts,
        "message_ts": message_ts,
        "sent_at": _dt.now().isoformat(),
        "deleted": False,
        "deleted_at": None,
    }
    meeting_path.write_text(_j.dumps(m_data, indent=2, ensure_ascii=False), encoding="utf-8")
```

---

### 🔴 C3: editedAfterSummary 미정리 (#14, #N3)

**파일:** `frontend/src/pages/Editing.tsx:367-370`

```tsx
const handleSkipToSend = () => {
  clearEditedAfterSummary();  // ← 추가
  navigate('/send');
};
```

---

### 🔴 C4: SILENCE_TIMEOUT_MS 1500 → 2500 (#15, #N4)

**파일:** `frontend/src/hooks/useWebSpeech.ts:3`

```typescript
const SILENCE_TIMEOUT_MS = 2500;  // 기존 1500 → 2500
```

---

### 🔴 C5: buildPreviewText null 크래시 (#N5)

**파일:** `frontend/src/pages/SendSave.tsx:88`

```tsx
// 기존
if (session.summary_markdown) {
  const lines = session.summary_markdown.split('\n');

// 수정: null/undefined 방어
if (session.summary_markdown && typeof session.summary_markdown === 'string') {
  const lines = session.summary_markdown.split('\n');
```

---

### 🟡 C6: Slack 토큰 settings.json 미반영 (#17, #N6)

**파일:** `backend/routers/slack.py:19-23`

U1과 연관 — 동일 원리로 settings.json → .env fallback:

```python
def _get_slack_client():
    from slack_sdk import WebClient
    import json as _json

    # settings.json 우선, .env fallback
    token = SLACK_BOT_TOKEN
    settings_path = DATA_DIR / "settings.json"
    if settings_path.exists():
        try:
            s = _json.loads(settings_path.read_text(encoding="utf-8"))
            saved_token = s.get("slack", {}).get("bot_token", "")
            if saved_token and not saved_token.startswith("..."):  # 마스킹된 값 제외
                token = saved_token
        except Exception:
            pass

    if not token:
        raise HTTPException(status_code=500, detail="Slack Bot Token이 설정되지 않았습니다")
    return WebClient(token=token)
```

---

### 🟡 C7: 복구 목록 정렬 (#12, #N8)

**파일:** `backend/routers/recovery.py`

```python
# 반환 전 정렬 추가:
sessions.sort(key=lambda x: x.get("created_at", ""), reverse=True)
return {"sessions": sessions}
```

---

### 🟡 C8: editMode 잔류 (#N7)

**파일:** `frontend/src/pages/Editing.tsx` mount 시

```tsx
// useEffect mount에 추가:
useEffect(() => {
  setStep(5);
  // 세션 모드가 아닌데 editMode가 meeting이면 초기화
  if (session && !session.session_id.startsWith('mtg_') && editMode === 'meeting') {
    useSessionStore.getState().setEditMode('session');
  }
  // ... 기존 로직
}, []);
```

---

### 🟡 C9: _processing_state 메모리 정리 (#N10)

**파일:** `backend/routers/processing.py`

`_run_processing` 완료 시 상태 정리:
```python
# 성공/에러 후 공통:
# 30초 후 상태 삭제 (status 조회 여유)
import asyncio
async def _cleanup_state(session_id: str):
    await asyncio.sleep(30)
    _processing_state.pop(session_id, None)

# _run_processing 마지막 (성공/에러 모두):
asyncio.create_task(_cleanup_state(session_id))
```

---

### 🟡 C10: 블록 병합 시 user 태그 보존 (#N11)

**파일:** `backend/routers/sessions.py:415-417`

```python
# 기존
if target.importance and (not block.importance or _imp_rank(target.importance) > _imp_rank(block.importance)):

# 수정: user 태그는 항상 우선
if block.importance_source == "user":
    pass  # 사용자 태그 유지
elif target.importance_source == "user":
    block.importance = target.importance
    block.importance_source = "user"
elif target.importance and (not block.importance or _imp_rank(target.importance) > _imp_rank(block.importance)):
    block.importance = target.importance
    block.importance_source = target.importance_source
```

---

### 🟡 C11: Editing.tsx Ctrl+Z 편집 중 동작 (#N14)

**파일:** `frontend/src/pages/Editing.tsx:290-299`

```tsx
// 기존: Undo/Redo가 editingBlockId 체크보다 먼저
if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {

// 수정: 편집 중이면 브라우저 기본 Undo 사용 (가로채지 않음)
if (editingBlockId) return;  // ← 이 줄을 Undo/Redo 앞으로 이동

if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
  e.preventDefault();
  handleUndo();
  return;
}
```

---

### 🟡 C12: Home.tsx handleResume/handleDelete 에러 안내 (#N13)

**파일:** `frontend/src/pages/Home.tsx:52-65`

```tsx
const handleResume = async (r: RecoverableSession) => {
  try {
    const session = await getSession(r.session_id);
    setSession(session);
    navigate(STATUS_ROUTES[r.status] || '/setup');
  } catch {
    setLoadError(true);  // ← 기존 loadError 재활용 또는 별도 토스트
  }
};

const handleDeleteSession = async (sessionId: string) => {
  try {
    await deleteSession(sessionId);
    setRecoverable((prev) => prev.filter((r) => r.session_id !== sessionId));
  } catch {
    // 사용자에게 안내 (간단한 alert 또는 loadError)
    setLoadError(true);
  }
};
```

---

## Part D: 기획 변경이 필요한 항목 (별도 처리)

아래 항목은 **기획 세션에서 decisions.md / technical-design.md 변경 후** 개발 전달:

| 항목 | 필요한 기획 변경 | 리스크 |
|------|----------------|--------|
| 개선2: 템플릿 순서 드래그 | decisions.md 설정 화면 + technical-design.md Template 모델 `order` 필드 + 드래그 라이브러리 선정 | 새 의존성 추가 (`@dnd-kit/core`), 번들 크기 증가 |
| 개선9: 슬랙 메시지 수정 | decisions.md 7단계 완료 화면 + technical-design.md `PATCH /api/slack/message` | Slack 봇 메시지만 수정 가능 (타인 메시지 불가) |

**개선8 (봇 이미지/이름):** 앱 범위 밖 — Slack App 관리(api.slack.com)에서 직접 변경. Settings에 안내 링크만 추가 가능.

---

## 수정 완료 후

```
QA-FIX/QA-COMPREHENSIVE-20260423.md 수정 완료했어. 확인해줘.
```
