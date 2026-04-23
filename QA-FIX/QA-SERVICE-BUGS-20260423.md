# 서비스 사용 관점 버그 — 즉시 수정 8건

> 작성일: 2026-04-23
> 작성자: 검수(QA) 세션
> 대상: 개발 세션
> 성격: 실사용 시나리오에서 확정적으로 발생하는 버그

## 충돌 분석

| 수정 | 파일 | 다른 수정과 충돌 |
|------|------|-----------------|
| #1 editMode | Summary.tsx, SendSave.tsx | ✅ 없음 — import + 변수 추가만 |
| #2 F5 복원 | Recording.tsx | ✅ 없음 — mount 시 getSession 추가 |
| #3 세션 가드 | Editing.tsx, Processing.tsx | ✅ 없음 — early return 추가 |
| #4 WS 에러 | Recording.tsx | ✅ 없음 — catch 블록 확장 (#2와 같은 파일이나 다른 함수) |
| #5 Claude fallback | Summary.tsx | #1과 같은 파일이나 다른 함수. ✅ 충돌 없음 |
| #6 Whisper 설정 | processing.py, config.py | ✅ 없음 — config 읽기 방식 변경 |
| #7 처리 중 삭제 | sessions.py | ✅ 없음 — delete 함수에 가드 추가 |
| #8 유휴 세션 | sessions.py | #7과 같은 파일이나 다른 함수. ✅ 충돌 없음 |

**충돌 없음 확인.** #1과 #5가 Summary.tsx, #7과 #8이 sessions.py에서 겹치나 모두 다른 함수 영역.

---

## 🔴 #1: Summary.tsx + SendSave.tsx — editMode 미확인 (재편집 유실)

**문제:** 히스토리 재편집(editMode='meeting') 시 Summary.tsx와 SendSave.tsx가 여전히 `/sessions/` 경로로 API 호출 → Meeting 데이터 업데이트 안 됨.

Editing.tsx에는 이미 `const apiBase = editMode === 'meeting' ? '/meetings' : '/sessions'` 패턴이 있음.

### 1-A: Summary.tsx

```tsx
// 상단 import에 추가
import { useSessionStore } from '../stores/sessionStore';

// 컴포넌트 내부 (기존 session, setSession 가져오는 곳 근처)
const editMode = useSessionStore((s) => s.editMode);
const apiBase = editMode === 'meeting' ? '/meetings' : '/sessions';

// saveSummary 함수 수정 (148행 부근)
const saveSummary = async (blocks: typeof summaryBlocks, items: ActionItem[]) => {
  if (!session) return;
  const md = rebuildMarkdown(titleLine, blocks);
  try {
    await api.patch(`${apiBase}/${session.session_id}/summary`, { summary_markdown: md });
    await api.patch(`${apiBase}/${session.session_id}/action-items`, { action_items: items });
  } catch {}
};
```

`updateSummaryMarkdown`과 `updateActionItems` 함수(sessions.ts)를 직접 호출하는 대신 `api.patch`로 변경하여 apiBase를 적용.

또는 sessions.ts의 함수에 apiBase 파라미터를 추가하는 방식도 가능.

### 1-B: SendSave.tsx

```tsx
// 상단에 추가
const editMode = useSessionStore((s) => s.editMode);
const apiBase = editMode === 'meeting' ? '/meetings' : '/sessions';

// doExecute 내 export-md 호출 (134행 부근)
const res = await api.post(`${apiBase}/${session.session_id}/export-md`);

// doExecute 내 complete 호출 (164행 부근)
await api.post(`${apiBase}/${session.session_id}/complete`);
```

**참고:** `/meetings/{id}/complete`는 불필요 (이미 완료된 Meeting). editMode='meeting'일 때 complete 호출을 스킵:
```tsx
if (editMode !== 'meeting') {
  try { await api.post(`/sessions/${session.session_id}/complete`); } catch {}
}
```

---

## 🔴 #2: Recording.tsx — F5 새로고침 시 세션 복원

**문제:** 녹음 중 F5 → 세션 스토어가 비워짐 → /setup으로 리다이렉트 → 녹음 유실. 서버에는 데이터가 있으나 자동 복원 안 됨.

**수정:** Recording.tsx mount 시 세션 스토어가 비어있으면 URL의 세션 정보 또는 recovery API로 복원 시도.

가장 간단한 방법 — 세션이 없으면 **홈으로 보내되, 복구 배너를 통해 돌아올 수 있도록**:

```tsx
// 기존 (약 108행)
useEffect(() => {
  if (!session) {
    navigate('/setup');
  }
  // ...
}, [session, navigate]);

// 수정: 세션이 없으면 홈으로 (복구 배너에서 재진입 가능)
useEffect(() => {
  if (!session) {
    navigate('/', { replace: true });
    return;
  }
  // ... 기존 로직
}, [session, navigate]);
```

**추가 개선 (선택):** sessionId를 URL 파라미터나 sessionStorage에 저장하여, 새로고침 시 자동으로 `getSession()`을 호출하는 방법도 가능하나, 현재 구조에서는 홈 복구 배너로 충분.

---

## 🔴 #3: Editing.tsx + Processing.tsx — 세션 가드 없음

**문제:** URL 직접 접근(/editing, /processing) 시 session=null → 빈 화면, 에러 안내 없음.

### 3-A: Editing.tsx

```tsx
// 컴포넌트 최상단 (return 전)
if (!session) {
  return (
    <WizardLayout>
      <div className="pt-20 text-center">
        <p className="text-sm text-text-tertiary">세션 정보가 없습니다</p>
        <button onClick={() => navigate('/')} className="mt-4 text-sm text-primary cursor-pointer">
          홈으로 돌아가기
        </button>
      </div>
    </WizardLayout>
  );
}
```

### 3-B: Processing.tsx

Processing.tsx의 선택 화면(Whisper 스킵)과 처리 화면 모두 동일 가드:

```tsx
if (!session) {
  return (
    <WizardLayout>
      <div className="pt-20 text-center">
        <p className="text-sm text-text-tertiary">세션 정보가 없습니다</p>
        <button onClick={() => navigate('/')} className="mt-4 text-sm text-primary cursor-pointer">
          홈으로 돌아가기
        </button>
      </div>
    </WizardLayout>
  );
}
```

**Summary.tsx, SendSave.tsx**에도 동일 가드 추가 권장 (같은 패턴).

---

## 🔴 #4: Recording.tsx — WebSocket 연결 실패 시 무음

**문제:** `audioStream.connect()`가 reject되면 catch에 잡히지만, 에러 메시지가 마이크 관련 메시지만 처리. WS 실패 시 "알 수 없는 오류"로 표시되고, 녹음은 시작되지 않지만 원인이 불명확.

**수정:** catch 블록에서 WS 에러를 명시적으로 구분:

```tsx
const handleStartRecording = async () => {
  try {
    await audioStream.connect();
    const stream = await audioStream.startRecording(micSensitivity);
    if (stream) startMicLevel(stream);
    webSpeech.start();
    startTimer();
    silentAudio.start();
    setRecordingState('recording');
  } catch (err: any) {
    let message: string;
    if (err?.message === 'WebSocket connection failed') {
      message = '서버에 연결할 수 없습니다. 백엔드가 실행 중인지 확인해주세요.';
    } else if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') {
      message = '마이크를 찾을 수 없습니다. 마이크를 연결해주세요.';
    } else if (err?.name === 'NotAllowedError') {
      message = '마이크 권한이 거부되었습니다. 브라우저 설정에서 허용해주세요.';
    } else {
      message = `녹음 시작 실패: ${err?.message || '알 수 없는 오류'}`;
    }
    setToast({ message, visible: true });
  }
};
```

---

## 🔴 #5: Summary.tsx — Claude API 실패 시 fallback 없음

**문제:** 요약 생성 실패 → 에러 메시지 + 재시도 버튼만 → 사용자가 전송 단계로 진행 불가.

**수정:** 에러 상태에서 "요약 없이 전송으로 이동" 옵션 추가:

```tsx
{/* Error state — 기존 에러 블록에 버튼 추가 */}
{error && !loading && (
  <div className="mt-12 bg-warning-bg rounded-xl p-5">
    <p className="text-[15px] text-warning-text font-medium">요약 생성 실패</p>
    <p className="text-sm text-warning-text/80 mt-1">{error}</p>
    <div className="flex gap-2 mt-4">
      <button onClick={generateSummary}
        className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary-hover cursor-pointer">
        재시도
      </button>
      <button onClick={() => navigate('/send')}
        className="px-4 py-2 text-sm font-medium text-text bg-bg-subtle rounded-lg hover:bg-bg-hover cursor-pointer">
        요약 없이 전송으로 이동
      </button>
    </div>
  </div>
)}
```

---

## 🔴 #6: processing.py — Whisper 모델 설정 변경 미반영

**문제:** `processing.py:81`이 `config.py`의 `WHISPER_MODEL`(env var, 시작 시 고정)을 사용. settings.json에서 모델을 변경해도 반영 안 됨.

**수정:** processing.py에서 settings.json을 직접 읽어 모델명 결정:

```python
# processing.py의 _run_processing 함수 내 (81행 부근)

# 기존
from config import WHISPER_MODEL
# ...
segments = await asyncio.to_thread(transcribe, audio_path, language, WHISPER_MODEL)

# 수정: settings.json에서 실시간 읽기, fallback으로 config
import json as _json
from config import DATA_DIR, WHISPER_MODEL as DEFAULT_WHISPER_MODEL

whisper_model = DEFAULT_WHISPER_MODEL
settings_path = DATA_DIR / "settings.json"
if settings_path.exists():
    try:
        s = _json.loads(settings_path.read_text(encoding="utf-8"))
        whisper_model = s.get("whisper", {}).get("model", DEFAULT_WHISPER_MODEL)
    except Exception:
        pass

segments = await asyncio.to_thread(transcribe, audio_path, language, whisper_model)
```

---

## 🔴 #7: sessions.py — 처리 중 세션 삭제 시 백그라운드 task 충돌

**문제:** `DELETE /sessions/{id}`가 `shutil.rmtree`로 디렉토리를 삭제하지만, processing.py의 background task가 해당 디렉토리에 계속 접근 → 에러.

**수정:** 삭제 전 processing 상태 확인 + 차단:

```python
@router.delete("/{session_id}")
def delete_session(session_id: str):
    import shutil
    _validate_session_id(session_id)
    session_dir = SESSIONS_DIR / session_id
    if not session_dir.exists():
        raise HTTPException(status_code=404, detail="Session not found")

    # 처리 중이면 삭제 차단
    session = _load_session(session_id)
    if session.status == "processing":
        raise HTTPException(
            status_code=409,
            detail="처리 중인 세션은 삭제할 수 없습니다. 처리 완료 후 다시 시도해주세요."
        )

    shutil.rmtree(session_dir)
    return {"deleted": session_id}
```

---

## 🔴 #8: sessions.py — 유휴(idle) 세션이 새 세션 생성 영구 차단

**문제:** 세션 생성 후 녹음하지 않고 브라우저를 닫으면 idle 세션이 남아서 `_has_active_session()`이 항상 409 반환. 홈 복구 배너에서 삭제할 수 있지만, 사용자가 모르면 영원히 차단.

**수정:** 두 가지 방어:

### 8-A: 오래된 idle 세션 자동 무시 (24시간 경과)

```python
from datetime import datetime, timedelta

def _has_active_session() -> Optional[str]:
    if not SESSIONS_DIR.exists():
        return None
    cutoff = (datetime.now() - timedelta(hours=24)).isoformat()
    for d in SESSIONS_DIR.iterdir():
        if d.is_dir():
            sf = d / "session.json"
            if sf.exists():
                try:
                    s = Session.model_validate_json(sf.read_text(encoding="utf-8"))
                    if s.status != "completed":
                        # 24시간 이상 된 idle 세션은 무시
                        if s.status == "idle" and s.created_at < cutoff:
                            continue
                        return s.session_id
                except Exception:
                    continue
    return None
```

### 8-B: 프론트엔드 — 새 세션 생성 시 409 에러 메시지 개선

```tsx
// MeetingSetup.tsx 세션 생성 catch에서
} catch (err: any) {
  if (err?.response?.status === 409) {
    showToast('진행 중인 회의가 있습니다. 홈 화면에서 삭제하거나 이어서 진행해주세요.');
    navigate('/');
  } else {
    showToast('세션 생성에 실패했습니다.');
  }
}
```

---

## 수정 완료 후

```
QA-FIX/QA-SERVICE-BUGS-20260423.md 8건 수정 완료했어. 확인해줘.
```
