# 재편집 근본 수정 + 버그 + UX 개선 — 종합 수정

> 작성일: 2026-04-24
> 작성자: 검수(QA) 세션
> 대상: 개발 세션
> 범위: 재편집 근본 수정 1건 + 버그 3건 + UX 개선 5건

---

## 🔴 E1: 재편집 근본 수정 — `session.session_id`가 `undefined`

**이것이 사용자 보고 재편집 오류 전체의 근본 원인.**

### 현상

재편집 진입 후 블록 분할/병합/텍스트 편집/중요도/AI 태깅/요약 **전부 404**.
Console: `POST /api/meetings/undefined/blocks/...`

### 근본 원인

1. `HistoryDetail.tsx:283` — `session_id: meeting.meeting_id`로 fake Session 생성 → store에 저장 ✅
2. `Editing.tsx:95-97` — `api.get('/meetings/mtg_xxx')` → 서버가 **Meeting 객체** 반환 (`meeting_id` 필드만 있고 `session_id` 없음)
3. `setSession(updated)` — store의 session이 서버 응답으로 **덮어씌워짐**
4. 이후 `session.session_id` → **`undefined`**

`Session` 타입은 `session_id`, `Meeting` 타입은 `meeting_id` — 필드명 불일치.

### 수정 방법

**서버에서 Meeting 응답을 받은 후 `session_id`로 매핑하는 헬퍼 함수** 추가:

```typescript
// 각 페이지에서 api.get으로 meeting 데이터를 받은 뒤 setSession 전에 적용
// meeting 응답에 session_id가 없으면 meeting_id를 session_id로 매핑
function normalizeSession(data: any, editMode: string): any {
  if (editMode === 'meeting' && data.meeting_id && !data.session_id) {
    return { ...data, session_id: data.meeting_id };
  }
  return data;
}
```

### 적용 위치 (모든 `setSession(updated)` 또는 `setSession(res.data)` 호출)

#### Editing.tsx

```tsx
// (1) mount useEffect (line 95-97)
// 기존
api.get(`${apiBase}/${session.session_id}`).then((res) => {
  const updated = res.data;
  setSession(updated);

// 수정
api.get(`${apiBase}/${session.session_id}`).then((res) => {
  const updated = editMode === 'meeting' && res.data.meeting_id && !res.data.session_id
    ? { ...res.data, session_id: res.data.meeting_id }
    : res.data;
  setSession(updated);
```

```tsx
// (2) handleSplit 내부 (line ~227)
// 기존
const res = await api.get(`${apiBase}/${session.session_id}`);
setSession(res.data);

// 수정
const res = await api.get(`${apiBase}/${session.session_id}`);
const reloaded = editMode === 'meeting' && res.data.meeting_id && !res.data.session_id
  ? { ...res.data, session_id: res.data.meeting_id }
  : res.data;
setSession(reloaded);
setBlocks(reloaded.blocks);
```

```tsx
// (3) handleMerge 내부 (line ~250)
// 동일 패턴 적용
```

```tsx
// (4) handleSearchReplace 내부 (line ~275)
// 동일 패턴 적용
```

```tsx
// (5) handleRetag 내부 (line ~295)
// 동일 패턴 적용
```

#### Summary.tsx

```tsx
// generateSummary 내부 (line ~117)
// 기존
const updated = (await api.get(`${apiBase}/${session.session_id}`)).data;
setSession(updated);

// 수정
const raw = (await api.get(`${apiBase}/${session.session_id}`)).data;
const updated = editMode === 'meeting' && raw.meeting_id && !raw.session_id
  ? { ...raw, session_id: raw.meeting_id }
  : raw;
setSession(updated);
```

#### SendSave.tsx

```tsx
// doExecute에서는 setSession을 호출하지 않으므로 직접 영향은 없으나,
// session.session_id가 이미 undefined가 된 상태로 진입하면 API 호출이 전부 실패.
// E1 수정이 적용되면 SendSave까지 정상 도달함.
// 단, session.session_id가 여전히 사용되는 곳 확인:
// - line 151: api.post(`${apiBase}/${session.session_id}/export-md`, ...)
// - line 164: sendSlackMessage(session.session_id, ...)
// - line 245: sendSlackMessage(session!.session_id, ...)
// 이들은 E1 수정 후 정상 동작.
```

**추천:** 반복되는 패턴이므로, 유틸 함수로 추출하면 깔끔:

```typescript
// utils/session.ts 또는 각 파일 상단
function ensureSessionId(data: any, editMode: string) {
  if (editMode === 'meeting' && data.meeting_id && !data.session_id) {
    return { ...data, session_id: data.meeting_id };
  }
  return data;
}
```

---

## 🔴 E2: 템플릿 순서 변경이 유지되지 않음

### 현상

설정 > 템플릿 드래그로 순서 변경 → 다시 열면 원래 순서

### 원인

`backend/routers/templates.py:64-70` — `create_template`에서 `order` 미지정 → 기본값 0.
모든 신규 템플릿의 order=0이므로 정렬 시 순서 보장 불가.

reorder API 자체는 정상이나, 새 템플릿 생성 시 order가 0으로 겹침.

### 수정

```python
# backend/routers/templates.py create_template (line 64-70)
# 기존
tpl = Template(
    template_id=f"tpl_{uuid4().hex[:12]}",
    name=req.name,
    defaults=req.defaults,
    created_at=now,
    updated_at=now,
)

# 수정: order를 현재 최대값 + 1로 설정
max_order = max((t.order for t in templates), default=-1)
tpl = Template(
    template_id=f"tpl_{uuid4().hex[:12]}",
    name=req.name,
    defaults=req.defaults,
    order=max_order + 1,
    created_at=now,
    updated_at=now,
)
```

프론트에서 reorder API 호출 여부도 확인 필요 — 드래그 후 `api.patch('/templates/reorder', { order: [...ids] })`가 호출되는지 확인.

---

## 🟡 E3: 설정 > 템플릿 모달에 Slack 채널 새로고침 버튼 없음

### 현상

템플릿 편집 모달에서 Slack 채널 드롭다운이 있으나, 채널 목록을 새로고침할 수 없음.
모달을 닫았다 다시 열어야 최신 채널 반영.

### 수정

`frontend/src/pages/Settings.tsx` — 템플릿 모달의 Slack 채널 드롭다운 옆에 새로고침 버튼 추가:

```tsx
// Settings.tsx — 템플릿 모달 내 Slack 채널 드롭다운 부분 (line ~531-538)
// 드롭다운 옆에 새로고침 버튼 추가
<div className="flex items-center gap-2">
  <select
    value={tplSlackChannel}
    onChange={(e) => setTplSlackChannel(e.target.value)}
    className="flex-1 px-4 py-3 bg-bg-subtle rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary/30 pr-10"
  >
    <option value="">채널 선택 안 함</option>
    {tplChannels.map((ch) => (
      <option key={ch.id} value={ch.id}>#{ch.name}</option>
    ))}
  </select>
  <button
    type="button"
    onClick={() => listChannels().then(setTplChannels).catch(() => {})}
    className="p-2 text-text-secondary hover:text-primary rounded-lg hover:bg-bg-hover cursor-pointer"
    title="채널 목록 새로고침"
  >
    ↻
  </button>
</div>
```

---

## 🟡 E4: 7단계 — Slack/로컬 저장 없이도 진행 가능하도록

### 현상

"실행" 버튼이 `disabled={executing || (!sendSlack && !saveMd)}` → 둘 다 체크 해제 시 버튼 비활성.
사용자는 히스토리에만 저장하고 싶은 경우가 있음.

### 수정

```tsx
// SendSave.tsx line 324
// 기존
disabled={executing || (!sendSlack && !saveMd)}

// 수정: 항상 실행 가능 (둘 다 미선택이면 히스토리만 저장)
disabled={executing}
```

`doExecute`에서 `sendSlack`과 `saveMd`가 모두 false이면 Slack/MD 단계를 건너뛰고 바로 complete → 이미 그렇게 동작하므로 추가 변경 불필요.

버튼 텍스트도 상황에 맞게 변경하면 좋음:

```tsx
// 기존
<><Send size={20} /> 실행</>

// 수정
{!sendSlack && !saveMd
  ? <><Check size={20} /> 완료</>
  : <><Send size={20} /> 실행</>
}
```

---

## 🟡 E5: 7단계 — 스레드 선택 시 사용자 닉네임 표시

### 현상

스레드 메시지의 사용자명이 `2AE9` 같은 코드(user_id 끝 4자리)로 표시됨.

### 원인

**코드 문제 아님 — Slack App 토큰 스코프 문제.**

`slack.py:86-101` `_resolve_user_name`이 `users_info` API를 호출하지만, 현재 봇 토큰에 `users:read` 스코프가 없어서 `missing_scope` 에러 → fallback `"사용자(마지막4자리)"` 표시.

Slack App 설정에서 `users:read`를 필수 권한에 추가했더라도, **앱을 워크스페이스에 Reinstall하지 않으면 기존 토큰에 새 스코프가 반영되지 않음.**

### 해결 (코드 수정 아님, 사용자 조치)

1. api.slack.com → meetingrecorder 앱 → **OAuth & Permissions**
2. `users:read`가 Bot Token Scopes에 있는지 확인
3. **"Reinstall to Workspace"** 클릭
4. 새로 발급된 `xoxb-...` 토큰을 `backend/.env` + 설정 페이지에 업데이트

### 코드 보완 (선택)

Reinstall 후에도 fallback 메시지를 더 명확하게:

```python
# slack.py _resolve_user_name (line ~99)
# 기존
fallback = f"사용자({user_id[-4:]})" if user_id else "Unknown"

# 수정
fallback = f"멤버 #{user_id[-4:]}" if user_id else "Unknown"
```

---

## 🟡 E6: 7단계 완료 화면 — 재시도/재전송 개선

### 현상

- "No Summary to Export" 재시도 → 변함없음 (요약이 없으면 당연)
- Slack 재전송 → 같은 오류 반복

### 수정

**"No Summary" 경우:** 재시도 대신 명확한 안내로 교체:

```tsx
// SendSave.tsx mdStatus === 'error' 부분 (line ~269-290)
// 에러 메시지가 "No summary" 관련이면 재시도 버튼 대신 안내
{mdStatus === 'error' && (
  <div className="flex items-center gap-3 text-[15px] text-recording">
    <AlertCircle size={16} className="shrink-0" />
    {mdResult}
    {mdResult?.includes('summary') || mdResult?.includes('No') ? (
      <span className="ml-auto text-xs text-text-tertiary">요약을 먼저 생성해주세요</span>
    ) : (
      <button onClick={/* 재시도 */} className="...">재시도</button>
    )}
  </div>
)}
```

**Slack 재전송:** 에러 원인에 따라 안내 분기:

```tsx
// SendSave.tsx slackStatus === 'error' 부분 (line ~229-260)
// 에러가 토큰/권한 관련이면 재시도 무의미 → 설정 확인 안내
{slackResult?.includes('Token') || slackResult?.includes('not_authed') ? (
  <span className="ml-auto text-xs text-text-tertiary">설정에서 Slack 토큰을 확인해주세요</span>
) : (
  <button onClick={/* 재시도 */}>재시도</button>
)}
```

---

## 🟢 E7: 드롭다운 화살표 여백

### 현상

드롭다운(select) 우측 화살표가 상자 가장자리에 붙어있음.

### 수정

select 요소에 `pr-10` 클래스를 추가 (기존 `pr-4` → `pr-10`로 확대) 또는 `appearance-none` + 커스텀 화살표 아이콘 사용.

영향 파일: 드롭다운이 사용되는 모든 select 요소
- `Settings.tsx` — 템플릿 모달의 Slack 채널 / 언어 드롭다운
- `SendSave.tsx` — 채널 선택 드롭다운
- `MeetingSetup.tsx` — 언어 선택 드롭다운

```tsx
// 공통 패턴
<select className="... pr-10">
```

---

## 🟢 E8: 3단계 녹음 — 자동 스크롤 제어

### 현상

녹음 진행 중 새 블록이 추가되면 자동으로 최하단 스크롤. 사용자가 상단 블록을 읽거나 편집하려 해도 강제로 내려감.

### 현재 코드

```tsx
// Recording.tsx line 222-227
useEffect(() => {
  if (!editingBlockId) {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }
}, [blocks, interimText, editingBlockId]);
```

`editingBlockId`가 있을 때만 스크롤 중지 → 편집 모드가 아니면(단순 읽기/스크롤) 강제 스크롤 발생.

### 수정

사용자가 수동으로 스크롤한 경우 자동 스크롤을 중지하는 방식:

```tsx
// Recording.tsx — 새 state 추가
const [userScrolled, setUserScrolled] = useState(false);
const containerRef = useRef<HTMLDivElement>(null);

// 스크롤 이벤트 감지
useEffect(() => {
  const container = containerRef.current;
  if (!container) return;

  const handleScroll = () => {
    const { scrollTop, scrollHeight, clientHeight } = container;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 100; // 100px 여유
    setUserScrolled(!isAtBottom);
  };

  container.addEventListener('scroll', handleScroll);
  return () => container.removeEventListener('scroll', handleScroll);
}, []);

// 자동 스크롤 조건 변경
useEffect(() => {
  if (!editingBlockId && !userScrolled) {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }
}, [blocks, interimText, editingBlockId, userScrolled]);
```

전사 블록 목록을 감싸는 div에 `ref={containerRef}` 추가.

---

## 수정 우선순위

| 순서 | 항목 | 이유 |
|------|------|------|
| 1 | E1 (재편집 undefined) | 재편집 기능 전체 차단 — 근본 원인 |
| 2 | E2 (템플릿 순서) | 기능 미동작 |
| 3 | E4 (전송 없이 완료) | UX 차단 |
| 4 | E3 (채널 새로고침) | UX 불편 |
| 5 | E5 (사용자 닉네임) | UX 불편 + 스코프 확인 필요 |
| 6 | E6 (재시도 개선) | UX 개선 |
| 7 | E8 (자동 스크롤) | UX 개선 |
| 8 | E9 (토큰 .env 동기화) | 관리 일관성 |
| 9 | E7 (드롭다운 여백) | 사소한 UI |

---

## 🟡 E9: 설정에서 Slack 토큰/Claude API 키 변경 시 `.env` 미동기화

### 현상

설정 페이지에서 Slack 토큰을 변경 → 연결 성공 확인. 그러나 `backend/.env`에는 옛날 토큰이 그대로 남아있음.
`settings.json`에만 저장되고 `.env`는 갱신되지 않음.

### 영향

- 현재: `_get_slack_client()`가 settings.json 우선이라 **동작은 함**
- 위험: settings.json 삭제/초기화 시 옛날 토큰으로 복귀, 관리 혼란

### 수정

`backend/routers/settings.py` `update_settings`에서 토큰/키가 변경되면 `.env` 파일도 동기화:

```python
# settings.py update_settings (line 88-107)
# _save_settings(settings) 뒤에 .env 동기화 추가

def _sync_env(key: str, value: str):
    """Update a key in backend/.env file."""
    from config import BASE_DIR
    env_path = BASE_DIR / ".env"
    if not env_path.exists():
        return
    lines = env_path.read_text(encoding="utf-8").splitlines()
    updated = False
    for i, line in enumerate(lines):
        if line.startswith(f"{key}="):
            lines[i] = f"{key}={value}"
            updated = True
            break
    if not updated:
        lines.append(f"{key}={value}")
    env_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


@router.patch("")
def update_settings(req: UpdateSettingsRequest):
    settings = _load_settings()

    if req.slack:
        update = req.slack.model_dump(exclude_none=True)
        settings.slack = settings.slack.model_copy(update=update)
    if req.claude:
        update = req.claude.model_dump(exclude_none=True)
        settings.claude = settings.claude.model_copy(update=update)
    if req.whisper:
        update = req.whisper.model_dump(exclude_none=True)
        settings.whisper = settings.whisper.model_copy(update=update)

    flat_update = req.model_dump(exclude_none=True, exclude={"slack", "claude", "whisper"})
    for key, value in flat_update.items():
        setattr(settings, key, value)

    _save_settings(settings)

    # .env 동기화
    if req.slack and req.slack.bot_token and "..." not in req.slack.bot_token:
        _sync_env("SLACK_BOT_TOKEN", req.slack.bot_token)
    if req.claude and req.claude.api_key and "..." not in req.claude.api_key:
        _sync_env("ANTHROPIC_API_KEY", req.claude.api_key)

    return _mask_response(settings)
```

`"..." not in` 조건: 마스킹된 값이 다시 저장되는 것을 방지.

---

## 미포함 항목 (별도 처리)

- **7단계 미리보기에서 전송 메시지 수정**: 기획 검토 필요 (메시지 구조 변경 수반)
- **환경 의존 이슈 2건**: 실기기 테스트 후 결정
- **`users:read` 스코프**: 앱 설정에 이미 추가됨. **Reinstall to Workspace 후 새 토큰을 .env에 반영** 필요 (코드 변경 아님)

---

## 수정 완료 후

개발 세션에 전달할 수정 요청:

> `QA-FIX/QA-REEDIT-AND-UX-20260424.md`를 읽고 E1~E9 총 9건을 수정해줘. **E1(재편집 undefined)이 최우선** — Meeting 응답의 `meeting_id`를 `session_id`로 매핑하는 코드가 Editing.tsx/Summary.tsx의 모든 `setSession` 호출 앞에 필요해. E2~E9은 순서대로 진행하되, E5(사용자 닉네임)는 코드 수정 아니라 Slack App Reinstall이니 건너뛰면 돼.

수정 완료 확인 요청:

```
QA-FIX/QA-REEDIT-AND-UX-20260424.md 수정 완료했어. 확인해줘.
```
