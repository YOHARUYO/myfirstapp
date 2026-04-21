# Sprint 4 검수 — 수정 11건

> 작성일: 2026-04-21
> 작성자: 검수(QA) 세션
> 대상: 개발 세션

---

## 🔴 수정 1: 요약 편집이 서버에 저장되지 않음 (가장 치명적)

**파일:** `backend/routers/sessions.py` 98~112행
**현재 문제:**

`Summary.tsx:140`에서 `PATCH /sessions/{id}/metadata`에 `summary_markdown`과 `action_items`를 전송하지만,
서버의 `UpdateMetadataRequest`(98행)에는 `title`, `participants`, `location`, `language`만 정의되어 있어 **나머지 필드를 무시**함.

**수정:**

방법 A — `UpdateMetadataRequest`에 필드 추가:
```python
class UpdateMetadataRequest(BaseModel):
    title: Optional[str] = None
    participants: Optional[list] = None
    location: Optional[str] = None
    language: Optional[str] = None
    # Sprint 4: 요약 관련 필드
    summary_markdown: Optional[str] = None
    action_items: Optional[list] = None
    keywords: Optional[list[str]] = None
```

`update_metadata` 함수(105행)에서 metadata 필드와 session 직접 필드를 분리:
```python
@router.patch("/{session_id}/metadata")
def update_metadata(session_id: str, req: UpdateMetadataRequest):
    session = _load_session(session_id)
    
    # Metadata fields
    meta_fields = {"title", "participants", "location", "language"}
    update_data = req.model_dump(exclude_none=True)
    
    for key, value in update_data.items():
        if key in meta_fields:
            setattr(session.metadata, key, value)
        else:
            # Session-level fields (summary_markdown, action_items, keywords)
            setattr(session, key, value)
    
    _save_session(session)
    return session.model_dump()
```

방법 B — 별도 엔드포인트 `PATCH /sessions/{id}/summary` 신설 (분리가 깔끔하나 프론트 변경도 필요).

**권장:** 방법 A (기존 API 확장, 프론트 변경 없음).

---

## 🔴 수정 2: XSS 취약점 — dangerouslySetInnerHTML

**파일:** `frontend/src/pages/Summary.tsx` 232~247행
**현재 문제:**

```tsx
const rendered = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
// ...
<div dangerouslySetInnerHTML={{ __html: rendered }} />
```

사용자 편집 텍스트가 HTML로 삽입됨. 개인용 앱이라 실질 위험은 낮으나 원칙적으로 수정 필요.

**수정:** React 렌더링으로 전환:

```tsx
const renderBody = (text: string) => {
  return text.split('\n').map((line, i) => {
    if (!line.trim()) return <div key={i} className="h-2" />;
    
    // Bullet
    const isBullet = line.trim().startsWith('- ');
    const content = isBullet ? line.replace(/^-\s*/, '').trim() : line;
    
    // Bold **text** → <strong>
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

## 🔴 수정 3: 미리보기가 F/U 항목을 핵심 요약으로 표시

**파일:** `frontend/src/pages/SendSave.tsx` 304~319행
**현재 문제:**

미리보기의 "📋 핵심 요약" 섹션이 `session.action_items.slice(0, 3)`을 표시 — F/U 항목이 핵심 요약으로 표시됨.
설계: summary_markdown에서 주제별 첫 불릿 추출.

**수정:**

```tsx
// 미리보기 렌더링 부분을 함수로 분리
const buildPreviewText = () => {
  if (!session) return '';
  
  const header = `[${session.metadata.date} ${session.metadata.title}]`;
  
  // summary_markdown에서 ### 주제 아래 첫 번째 - 불릿 추출
  const summaryBullets: string[] = [];
  if (session.summary_markdown) {
    const lines = session.summary_markdown.split('\n');
    let inTopic = false;
    let foundBullet = false;
    for (const line of lines) {
      if (line.startsWith('### ')) {
        inTopic = true;
        foundBullet = false;
        continue;
      }
      if (line.startsWith('## ')) {
        inTopic = false;
        continue;
      }
      if (inTopic && !foundBullet && line.trim().startsWith('- ') && !line.includes('F/U')) {
        summaryBullets.push(`• ${line.trim().slice(2)}`);
        foundBullet = true;
      }
    }
  }
  
  // F/U 불릿
  const fuBullets = (session.action_items || []).map((item) => {
    let line = item.assignee ? `• [@${item.assignee}] ${item.task}` : `• ${item.task}`;
    if (item.deadline) line += ` ~${item.deadline}`;
    return line;
  });
  
  return `${header}\n\n📋 *핵심 요약*\n${summaryBullets.join('\n') || '(요약 없음)'}\n\n✅ *F/U 필요 사항*\n${fuBullets.join('\n') || '(없음)'}\n\n📎 전체 회의록 첨부`;
};
```

미리보기 영역을:
```tsx
<div className="bg-bg-subtle rounded-xl p-4 text-sm text-text whitespace-pre-wrap font-mono">
  {buildPreviewText()}
</div>
```

---

## 🔴 수정 4: Slack 인사 문구 누락

**파일:** `backend/routers/slack.py` 114~121행
**현재 문제:**

`_build_slack_message(session)` 호출 시 greeting이 전달되지 않음. settings에서 읽어야 함.

**수정:**

```python
@router.post("/send")
def send_slack_message(req: SlackSendRequest):
    client = _get_slack_client()
    session = _load_session(req.session_id)

    # settings에서 인사 문구 로드
    from config import DATA_DIR
    import json
    greeting = ""
    settings_path = DATA_DIR / "settings.json"
    if settings_path.exists():
        try:
            settings_data = json.loads(settings_path.read_text(encoding="utf-8"))
            greeting = settings_data.get("slack_greeting", "")
        except Exception:
            pass

    message_text = _build_slack_message(session, greeting)
    # ... 이하 동일
```

---

## 🔴 수정 5: Slack 전송이 .md 생성보다 먼저 실행 → 첨부 실패

**파일:** `frontend/src/pages/SendSave.tsx` 95~137행
**현재 문제:**

실행 순서: Slack 전송(attach_md=true) → .md export → complete.
Slack 전송 시점에 .md 파일이 아직 없어 첨부 실패.

**수정:** 실행 순서를 **.md export → Slack 전송 → complete**로 변경:

```typescript
const doExecute = async () => {
  if (!session) return;
  setMissingModal(false);
  setExecuting(true);

  // 1. .md export 먼저
  if (saveMd) {
    setMdStatus('loading');
    try {
      const res = await api.post(`/sessions/${session.session_id}/export-md`);
      setMdStatus('success');
      setMdResult(`${res.data.filename} 저장 완료`);
    } catch (e: any) {
      setMdStatus('error');
      setMdResult(e?.response?.data?.detail || '.md 저장 실패');
    }
  }

  // 2. Slack 전송 (이제 .md 파일이 존재)
  if (sendSlack && selectedChannel) {
    setSlackStatus('loading');
    try {
      const result = await sendSlackMessage(
        session.session_id,
        selectedChannel,
        sendMode === 'thread' ? selectedThread : null,
        saveMd,  // .md 저장을 선택한 경우에만 첨부
      );
      setSlackStatus('success');
      setSlackResult(`${result.channel_name} 전송 완료`);
    } catch (e: any) {
      setSlackStatus('error');
      setSlackResult(e?.response?.data?.detail || 'Slack 전송 실패');
    }
  }

  // 3. Complete (항상)
  try {
    await api.post(`/sessions/${session.session_id}/complete`);
  } catch {}

  setExecuting(false);
  setCompleted(true);
};
```

---

## 🟡 수정 6: 6→5→6 재진입 시 재요약 모달 없음

**파일:** `frontend/src/pages/Summary.tsx` 121~131행
**설계 근거:** decisions.md "태깅이나 전사를 수정했습니다. 요약을 다시 생성할까요?"

**수정 방향:**

`wizardStore`에 `editedAfterSummary: boolean` 플래그 추가. 5단계에서 블록 수정 시 `true` 설정.
Summary.tsx mount 시 이 플래그가 true이고 기존 summary가 있으면 모달 표시:

```tsx
// Summary.tsx에 상태 추가
const [resummarizeModal, setResummarizeModal] = useState(false);
const editedAfterSummary = useWizardStore((s) => s.editedAfterSummary);
const clearEditedFlag = useWizardStore((s) => s.clearEditedAfterSummary);

useEffect(() => {
  if (!session) return;
  if (session.summary_markdown && editedAfterSummary) {
    setResummarizeModal(true);
  } else if (session.summary_markdown) {
    // 기존 요약 로드
    const firstLine = session.summary_markdown.split('\n')[0] || '';
    setTitleLine(firstLine);
    setSummaryBlocks(parseSummaryBlocks(session.summary_markdown));
    setActionItems(session.action_items || []);
  } else {
    generateSummary();
  }
}, []);

// 모달 렌더링
<Modal open={resummarizeModal} onClose={() => setResummarizeModal(false)}>
  <h3 className="text-lg font-semibold text-text mb-2">요약 재생성</h3>
  <p className="text-sm text-text-secondary mb-6">
    태깅이나 전사를 수정했습니다. 요약을 다시 생성할까요?
  </p>
  <div className="flex gap-2 justify-end">
    <button onClick={() => {
      setResummarizeModal(false);
      clearEditedFlag();
      // 기존 요약 로드
      const firstLine = session!.summary_markdown.split('\n')[0] || '';
      setTitleLine(firstLine);
      setSummaryBlocks(parseSummaryBlocks(session!.summary_markdown));
      setActionItems(session!.action_items || []);
    }} className="px-4 py-2 text-sm font-medium text-text bg-bg-subtle rounded-lg hover:bg-bg-hover cursor-pointer">
      기존 요약 유지
    </button>
    <button onClick={() => {
      setResummarizeModal(false);
      clearEditedFlag();
      generateSummary();
    }} className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary-hover cursor-pointer">
      재요약
    </button>
  </div>
</Modal>
```

`wizardStore`에 추가할 상태:
```typescript
editedAfterSummary: boolean;
setEditedAfterSummary: () => void;
clearEditedAfterSummary: () => void;
```

`Editing.tsx`의 편집 확정 시 `setEditedAfterSummary()` 호출.

---

## 🟡 수정 7: F/U 편집 시 @assignee / ~deadline 미파싱

**파일:** `frontend/src/pages/Summary.tsx` 195~204행
**현재 문제:**

`handleFuEditConfirm`에서 편집된 텍스트 전체가 `task`에 그대로 들어감.
`@김OO 보고서 작성 ~04/25` 형태로 입력해도 assignee/deadline 분리 안 됨.

**수정:**

```typescript
const handleFuEditConfirm = () => {
  if (!editingFuId) return;
  const text = editingFuText.trim();
  
  // Parse @assignee
  let assignee: string | null = null;
  const assigneeMatch = text.match(/[@＠](\S+)/);
  if (assigneeMatch) assignee = assigneeMatch[1];
  
  // Parse ~deadline
  let deadline: string | null = null;
  const deadlineMatch = text.match(/[~～](\d{2}\/\d{2}|\d{4}-\d{2}-\d{2})/);
  if (deadlineMatch) deadline = deadlineMatch[1];
  
  // Clean task
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

## 🟡 수정 8+9: Slack 실패 시 재시도 UI 없음 + 부분 성공 처리

**파일:** `frontend/src/pages/SendSave.tsx` 완료 화면 (142~202행)
**설계 근거:** decisions.md "Slack 전송 실패: 오류 메시지 + 재시도 버튼 + Slack 건너뛰고 저장만"

**현재:** 완료 화면에 결과만 표시, 실패 항목에 대한 재시도 불가.

**수정:** 완료 화면의 실패 항목에 재시도 버튼 추가:

```tsx
{slackStatus === 'error' && (
  <div className="flex items-center gap-3 text-[15px] text-recording">
    <AlertCircle size={16} className="shrink-0" />
    Slack: {slackResult}
    <button
      onClick={async () => {
        setSlackStatus('loading');
        try {
          const result = await sendSlackMessage(
            session!.session_id, selectedChannel,
            sendMode === 'thread' ? selectedThread : null, saveMd,
          );
          setSlackStatus('success');
          setSlackResult(`${result.channel_name} 전송 완료`);
        } catch (e: any) {
          setSlackStatus('error');
          setSlackResult(e?.response?.data?.detail || 'Slack 전송 실패');
        }
      }}
      className="ml-auto px-3 py-1 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary-hover cursor-pointer"
    >
      재시도
    </button>
  </div>
)}
```

동일 패턴으로 `mdStatus === 'error'` 케이스에도 재시도 버튼 추가.

---

## 🟡 수정 10: Slack 메시지 요약 불릿 추출 부정확

**파일:** `backend/routers/slack.py` 73~111행
**현재 문제:**

`_build_slack_message`에서 `- ` 라인을 필터링하되, "회의 시간", "장소" 등만 제외 — 본문 불릿과 F/U 불릿이 혼재.

**수정:** technical-design 9절의 로직 적용 — `### N.` 주제 헤딩 아래 첫 번째 논의 불릿만 추출:

```python
def _build_slack_message(session: Session, greeting: str = "") -> str:
    header = f"[{session.metadata.date or ''} {session.metadata.title}]"

    summary_bullets = []
    if session.summary_markdown:
        sections = session.summary_markdown.split("### ")
        for section in sections[1:]:  # 첫 번째는 헤딩 앞 내용
            lines = section.strip().split("\n")
            for line in lines:
                if line.strip().startswith("- ") and "F/U" not in line:
                    summary_bullets.append(f"• {line.strip()[2:]}")
                    break

    fu_bullets = []
    for item in session.action_items:
        assignee = item.get("assignee")
        task = item.get("task", "")
        line = f"• [@{assignee}] {task}" if assignee else f"• {task}"
        if item.get("deadline"):
            line += f" ~{item['deadline']}"
        fu_bullets.append(line)

    parts = [header]
    if greeting:
        parts.append(greeting)
    parts.append("")

    if summary_bullets:
        parts.append("📋 *핵심 요약*")
        parts.extend(summary_bullets)
        parts.append("")

    if fu_bullets:
        parts.append("✅ *F/U 필요 사항*")
        parts.extend(fu_bullets)
        parts.append("")

    parts.append("📎 전체 회의록 첨부")
    return "\n".join(parts)
```

---

## 🟡 수정 11: export-md가 서버 파일 경로를 응답에 노출

**파일:** `backend/routers/sessions.py` 261행
**현재:** `return {"path": str(export_path), "filename": filename}`

**수정:** `path` 필드 제거, `filename`만 반환:

```python
return {"filename": filename}
```

프론트엔드(`SendSave.tsx:122`)는 이미 `res.data.filename`만 사용하므로 변경 불필요.

---

## 수정 완료 후

11건 모두 수정했으면 검수 세션에 확인 요청:

```
QA-FIX/QA-SPRINT4-FIX-20260421.md 11건 수정 완료했어. 확인해줘.
```
