# Sprint 5 검수 — 수정 + 미구현 항목

> 작성일: 2026-04-21
> 작성자: 검수(QA) 세션
> 대상: 개발 세션

---

## Part A: 기존 코드 수정 (10건)

---

### 🔴 A-1: 재편집/재전송 버튼이 Meeting 데이터를 로드하지 않음

**파일:** `frontend/src/pages/HistoryDetail.tsx` 236~258행
**설계 근거:** technical-design.md 4-7절 — "Meeting 데이터를 5단계 편집 UI에 로드하고, `PATCH /api/meetings/{id}`로 직접 저장"

**현재 문제:**
```tsx
<button onClick={() => navigate('/editing')}>재편집</button>
<button onClick={() => navigate('/send')}>재전송</button>
```
단순 navigate만 → sessionStore에 현재 Meeting이 없으므로 빈 화면 또는 이전 세션 데이터가 표시됨.

**수정 방향:**

1. `sessionStore`에 Meeting → Session 변환 함수 또는 `editMode` 추가:
```typescript
// sessionStore.ts에 추가
setMeetingForEdit: (meeting: Meeting) => void;
editMode: 'session' | 'meeting' | null;
editingMeetingId: string | null;
```

2. 재편집 버튼:
```tsx
const handleReEdit = () => {
  if (!meeting) return;
  // Meeting 데이터를 sessionStore에 세팅
  const sessionLike: Session = {
    session_id: meeting.meeting_id, // meeting ID를 session ID로 사용
    status: 'editing',
    created_at: meeting.created_at,
    input_mode: 'realtime',
    metadata: meeting.metadata,
    audio_chunks_dir: '',
    audio_chunk_count: 0,
    blocks: meeting.blocks,
    recording_gaps: [],
    ai_tagging_skipped: false,
    summary_markdown: meeting.summary_markdown,
    action_items: meeting.action_items,
    keywords: meeting.keywords,
  };
  setSession(sessionLike);
  // editMode를 meeting으로 설정 → Editing/Summary에서 저장 시 PATCH /meetings/{id} 사용
  useSessionStore.getState().setEditMode('meeting', meeting.meeting_id);
  navigate('/editing');
};
```

3. 재전송 버튼:
```tsx
const handleResend = () => {
  if (!meeting) return;
  // 위와 동일하게 sessionStore 세팅 후 7단계로 직행
  // ...동일 로직...
  navigate('/send');
};
```

4. `Editing.tsx`와 `Summary.tsx`에서 `editMode === 'meeting'`일 때 저장 API를 `PATCH /api/meetings/{meetingId}`로 분기.

**참고:** technical-design.md에 "wizardStore에 `editMode: "session" | "meeting"` 상태를 두어 컴포넌트가 분기"라고 명시.

---

### 🔴 A-2: Settings에서 Slack Bot Token 평문 노출

**파일:** `frontend/src/pages/Settings.tsx` 305~316행
**설계 근거:** decisions.md — "마스킹 표시 `sk-ant-●●●●●●●●●●XYZ`", "프론트엔드에 키 원문 노출 안 함 (백엔드 경유)"

**현재:**
```tsx
<p className="text-xs text-text-tertiary mt-0.5">
  {settings?.slack?.bot_token || '미설정'}
</p>
```

**수정:**

백엔드(`settings.py`)의 GET /api/settings 응답에서 키를 마스킹:
```python
# settings.py GET 응답 시
def mask_key(key: str) -> str:
    if not key or len(key) < 8:
        return '미설정'
    return key[:6] + '●' * (len(key) - 10) + key[-4:]
```

또는 프론트에서 마스킹 (백엔드 수정이 어려우면):
```tsx
const maskToken = (token: string) => {
  if (!token || token.length < 8) return '미설정';
  return token.slice(0, 6) + '●'.repeat(Math.max(token.length - 10, 4)) + token.slice(-4);
};

// 렌더링
<p className="text-xs text-text-tertiary mt-0.5">
  {maskToken(settings?.slack?.bot_token || '')}
</p>
```

Claude API 키(`settings?.claude?.api_key`)도 동일하게 마스킹 적용.

---

### 🟡 A-3: 기간 필터 없음

**파일:** `frontend/src/pages/History.tsx`
**설계 근거:** decisions.md — "기간 필터: 날짜 범위 메타데이터 필터링"

**수정:** 검색 바 옆에 기간 필터 추가:

```tsx
const [dateFrom, setDateFrom] = useState('');
const [dateTo, setDateTo] = useState('');

// 검색 함수에 기간 파라미터 추가
const handleSearch = async () => {
  setSearching(true);
  try {
    const results = await searchMeetings(searchQuery, dateFrom, dateTo);
    setMeetings(results);
  } catch {}
  setSearching(false);
};
```

검색 바 아래에 날짜 입력:
```tsx
<div className="mt-3 flex gap-2">
  <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
    className="bg-bg-subtle rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none" />
  <span className="text-text-tertiary self-center">~</span>
  <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
    className="bg-bg-subtle rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none" />
</div>
```

`searchMeetings` API 함수에 `from`, `to` 파라미터가 이미 정의되어 있으므로 전달만 하면 됨.

---

### 🟡 A-4: 검색 결과에 매칭 스니펫 미표시

**파일:** `frontend/src/pages/History.tsx`
**설계 근거:** decisions.md — "검색 결과에 매칭 스니펫 (검색어 주변 텍스트) 표시"

**수정 방향:**
- 백엔드 `GET /api/meetings/search` 응답에 `snippet` 필드 추가 (검색어 주변 ±30자)
- 프론트에서 카드 하단에 스니펫 표시 + 검색어 하이라이트

```tsx
// 카드 내부, participants 아래에:
{m.snippet && (
  <p className="mt-1.5 text-xs text-text-tertiary line-clamp-2">
    ...{highlightMatch(m.snippet, searchQuery)}...
  </p>
)}
```

**MVP 최소:** 백엔드 수정이 크면 프론트에서 검색어를 볼드 표시하는 것만이라도 적용.

---

### 🟡 A-5: 타임스탬프 절대/상대 토글 없음

**파일:** `frontend/src/pages/HistoryDetail.tsx`
**설계 근거:** decisions.md — "히스토리 화면에서 절대/상대 시각 토글 제공"

**수정:** 전사 원본 헤더에 토글 추가:

```tsx
const [tsMode, setTsMode] = useState<'relative' | 'absolute'>('relative');

// 전사 헤더
<div className="flex items-center justify-between">
  <button onClick={() => setTranscriptExpanded(!transcriptExpanded)} ...>
    전사 원본 ({meeting.blocks.length}블록)
  </button>
  {transcriptExpanded && (
    <button
      onClick={() => setTsMode(tsMode === 'relative' ? 'absolute' : 'relative')}
      className="text-xs text-text-tertiary hover:text-text cursor-pointer"
    >
      {tsMode === 'relative' ? '절대 시각' : '상대 시각'}
    </button>
  )}
</div>
```

절대 시각: `metadata.start_time` + `block.timestamp_start`로 실제 시각 계산.

---

### 🟡 A-6: Claude API 키 / Whisper 모델 변경 UI 없음

**파일:** `frontend/src/pages/Settings.tsx` 328~336행
**설계 근거:** decisions.md — "API 키 [변경] 클릭 시 새 키 입력", "Whisper 모델 드롭다운 선택"

**수정:** 각 항목에 [변경] 버튼 + 인라인 편집:

```tsx
// Claude API
<div className="bg-bg-subtle rounded-xl p-4">
  <div className="flex items-center justify-between">
    <div>
      <p className="text-[15px] font-medium text-text">Claude API</p>
      <p className="text-xs text-text-tertiary mt-0.5">{maskToken(settings?.claude?.api_key || '')}</p>
    </div>
    <button onClick={() => setEditingApiKey(true)} className="text-sm text-text-secondary hover:text-text cursor-pointer">
      변경
    </button>
  </div>
  {editingApiKey && (
    <div className="mt-3 flex gap-2">
      <input type="password" placeholder="새 API 키" value={newApiKey} onChange={...}
        className="flex-1 bg-bg rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none" />
      <button onClick={handleSaveApiKey} className="px-3 py-2 text-sm font-medium text-bg bg-primary rounded-lg ...">저장</button>
    </div>
  )}
</div>

// Whisper 모델 — 드롭다운
<div className="bg-bg-subtle rounded-xl p-4">
  <p className="text-[15px] font-medium text-text">Whisper 모델</p>
  <select value={whisperModel} onChange={(e) => handleSaveWhisperModel(e.target.value)}
    className="mt-2 bg-bg rounded-lg px-3 py-2 text-sm ...">
    <option value="tiny">tiny (~1분, 낮음)</option>
    <option value="base">base (~2분, 보통)</option>
    <option value="small">small (~3분, 양호)</option>
    <option value="medium">medium (~5-8분, 높음) ← 추천</option>
    <option value="large">large (~15분+, 최고)</option>
  </select>
</div>
```

---

### 🟡 A-7: 템플릿에 Slack 채널 선택 없음

**파일:** `frontend/src/pages/Settings.tsx` 360~408행
**설계 근거:** decisions.md — "템플릿 필드에 Slack 채널 포함"

**수정:** 템플릿 모달에 채널 드롭다운 추가:

```tsx
// 모달 state 추가
const [tplSlackChannel, setTplSlackChannel] = useState('');
const [tplChannels, setTplChannels] = useState<SlackChannel[]>([]);

// 모달 열 때 채널 로드
useEffect(() => {
  if (templateModal) {
    listChannels().then(setTplChannels).catch(() => {});
  }
}, [templateModal]);

// 모달 내부에 필드 추가
<div>
  <label className="text-xs font-medium text-text-secondary block mb-1">Slack 채널</label>
  <select value={tplSlackChannel} onChange={(e) => setTplSlackChannel(e.target.value)} ...>
    <option value="">선택 안 함</option>
    {tplChannels.map((ch) => <option key={ch.id} value={ch.id}>#{ch.name}</option>)}
  </select>
</div>
```

저장 시 `slack_channel_id: tplSlackChannel || null` 전달.

---

### 🟢 A-8: .md 다운로드 버튼 onClick 없음

**파일:** `frontend/src/pages/HistoryDetail.tsx` 251~253행

**수정:**
```tsx
<button
  onClick={async () => {
    try {
      const res = await api.post(`/meetings/${meeting.meeting_id}/export-md`);
      showToast(`${res.data.filename} 다운로드 준비 완료`);
    } catch {
      showToast('.md 생성에 실패했습니다');
    }
  }}
  className="..."
>
  <Download size={18} /> .md 다운로드
</button>
```

**참고:** `POST /api/meetings/{id}/export-md` API가 구현되어 있는지 확인 필요. 없으면 세션용 `export-md`를 참고하여 meetings 라우터에 추가.

---

### 🟢 A-9: 템플릿 삭제 확인 모달 없음

**파일:** `frontend/src/pages/Settings.tsx` 140~146행

**수정:** 삭제 전 확인 모달:
```tsx
const [deleteTemplateId, setDeleteTemplateId] = useState<string | null>(null);

// 삭제 버튼
<button onClick={() => setDeleteTemplateId(tpl.template_id)} ...>

// 모달
<Modal open={!!deleteTemplateId} onClose={() => setDeleteTemplateId(null)}>
  <h3 ...>템플릿 삭제</h3>
  <p ...>이 템플릿을 삭제할까요?</p>
  <div className="flex gap-2 justify-end mt-4">
    <button onClick={() => setDeleteTemplateId(null)} ...>취소</button>
    <button onClick={() => { handleDeleteTemplate(deleteTemplateId!); setDeleteTemplateId(null); }} ...>삭제</button>
  </div>
</Modal>
```

---

### 🟢 A-10: settings 상태 any 타입

**파일:** `frontend/src/pages/Settings.tsx` 26행

**수정:** `types/index.ts`에 Settings 인터페이스 정의 후 사용:
```typescript
interface AppSettings {
  slack: { bot_token: string; connected: boolean };
  claude: { api_key: string; summary_model: string; tagging_model: string };
  whisper: { model: string };
  slack_greeting: string;
  export_path: string;
}

const [settings, setSettings] = useState<AppSettings | null>(null);
```

---

## Part B: 미구현 기능 (3건)

---

### B-1: 복구 기능 (홈 배너 + 세션 복구)

**관련 파일:** `frontend/src/pages/Home.tsx`, `frontend/src/api/recovery.ts`
**설계 근거:** decisions.md (최신 — 카드형 복구 배너 + status별 진입 라우팅), technical-design.md 4-10절

#### 구현 내용

**Home.tsx에 복구 배너 추가:**

```tsx
const [recoverableSession, setRecoverableSession] = useState<RecoverableSession | null>(null);

useEffect(() => {
  listRecoverableSessions().then((sessions) => {
    if (sessions.length > 0) setRecoverableSession(sessions[0]);
  }).catch(() => {});
}, []);
```

카드 렌더링 (decisions.md 최신 레이아웃):
```tsx
{recoverableSession && (
  <div className="bg-bg-subtle rounded-xl p-5 mb-8">
    <p className="text-sm font-medium text-text">📌 진행 중인 회의가 있습니다</p>
    <p className="text-[15px] text-text mt-2">
      {recoverableSession.title} · {recoverableSession.date}
      {recoverableSession.participants.length > 0 && ` · ${recoverableSession.participants[0]} 외 ${recoverableSession.participants.length - 1}명`}
    </p>
    <p className="text-xs text-text-tertiary mt-1">
      마지막 상태: {STATUS_LABELS[recoverableSession.status]}
    </p>
    <div className="flex gap-2 mt-4">
      <button onClick={() => handleResume(recoverableSession)} className="px-4 py-2 text-sm font-medium text-bg bg-primary rounded-lg hover:bg-primary-hover cursor-pointer">
        이어서 진행
      </button>
      <button onClick={() => handleDeleteAndNew(recoverableSession.session_id)} className="px-4 py-2 text-sm font-medium text-text bg-bg-hover rounded-lg hover:bg-border-light cursor-pointer">
        삭제하고 새로 시작
      </button>
    </div>
  </div>
)}
```

**status → 라우팅 매핑** (decisions.md + technical-design.md):
```tsx
const STATUS_LABELS: Record<string, string> = {
  idle: '정보 입력 전',
  recording: '녹음 완료',
  post_recording: '녹음 완료',
  processing: 'Whisper 처리 중',
  editing: '편집 중',
  summarizing: '요약 중',
};

const STATUS_ROUTES: Record<string, string> = {
  idle: '/setup',
  recording: '/recording',
  post_recording: '/recording',
  processing: '/processing',
  editing: '/editing',
  summarizing: '/summary',
};

const handleResume = async (s: RecoverableSession) => {
  // 기존 세션 데이터 로드
  const session = await getSession(s.session_id);
  setSession(session);
  // recording/post_recording → post_recording으로 통일
  navigate(STATUS_ROUTES[s.status] || '/setup');
};

const handleDeleteAndNew = async (sessionId: string) => {
  await deleteSession(sessionId);
  setRecoverableSession(null);
};
```

**"새 회의 시작" 버튼:** 복구 세션이 있으면 비활성 또는 "삭제하고 새로 시작"으로 유도 (동시 세션 방지).

---

### B-2: 백그라운드 탭 대응

**관련 파일:** `frontend/src/hooks/useAudioStream.ts`, `frontend/src/hooks/useWebSpeech.ts`, `frontend/src/pages/Recording.tsx`
**설계 근거:** decisions.md "백그라운드 탭 대응" 5종

#### 구현 내용 (5종)

**① 무음 오디오 재생** (AudioContext 탭 활성 유지):

```typescript
// hooks/useSilentAudio.ts
export function useSilentAudio() {
  const ctxRef = useRef<AudioContext | null>(null);
  const oscRef = useRef<OscillatorNode | null>(null);

  const start = useCallback(() => {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0.001;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    ctxRef.current = ctx;
    oscRef.current = osc;
  }, []);

  const stop = useCallback(() => {
    oscRef.current?.stop();
    ctxRef.current?.close();
    ctxRef.current = null;
    oscRef.current = null;
  }, []);

  return { start, stop };
}
```

Recording.tsx에서 녹음 시작 시 `silentAudio.start()`, 중지 시 `silentAudio.stop()`.

**② 탭 복귀 시 자동 재연결:**

```typescript
// hooks/useVisibility.ts
export function useVisibility(onVisible: () => void) {
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'visible') onVisible();
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [onVisible]);
}
```

Recording.tsx에서:
```tsx
useVisibility(() => {
  if (recordingState === 'recording') {
    // Web Speech 재시작
    webSpeech.restart();
    // 타이머 보정
    // ...
  }
});
```

**③ 조건부 토스트:** Web Speech가 실제로 중단·재연결된 경우에만 "일부 전사가 누락됐을 수 있습니다" 표시. 정상 복귀 시 표시 안 함.

**④ 타이머 보정:** `useTimer` 훅이 이미 `Date.now()` 기반이면 OK. `setInterval` 의존이면 보정 필요.

**⑤ Web Worker:** 오디오 청크 전송 로직을 Worker로 분리 — **MVP에서는 선택적**. 현재 WebSocket 전송이 메인 스레드에서 빠르게 처리되므로 급하지 않음.

**최소 구현 권장:** ①②③ 먼저, ④⑤는 테스트 후 필요 시.

---

### B-3: 브라우저 뒤로가기 동기화

**관련 파일:** `frontend/src/App.tsx` 또는 각 페이지
**설계 근거:** decisions.md — "React Router로 단계별 URL 관리, popstate에서 동일 이동 규칙 적용"

#### 구현 내용

현재 React Router가 URL을 관리하므로 기본적인 뒤로가기는 작동함. 추가 필요:

**차단 상황에서 이탈 방지:**
```tsx
// Recording.tsx — 녹음 중 뒤로가기 차단
useEffect(() => {
  if (recordingState !== 'recording') return;
  const handler = (e: PopStateEvent) => {
    // 뒤로가기 취소 → 현재 URL 다시 push
    window.history.pushState(null, '', window.location.href);
  };
  window.history.pushState(null, '', window.location.href);
  window.addEventListener('popstate', handler);
  return () => window.removeEventListener('popstate', handler);
}, [recordingState]);
```

**Processing.tsx — 처리 중 이탈 차단:** 동일 패턴.

**나머지 단계:** React Router의 기본 뒤로가기가 [← 이전 단계] 버튼과 동일하게 동작하는지 확인. 대부분 URL 구조가 `/recording` → `/processing` → `/editing` 순이므로 자연스럽게 일치함.

---

## 수정 완료 후

```
QA-FIX/QA-SPRINT5-FIX-20260421.md 수정 완료했어. 확인해줘.
```
