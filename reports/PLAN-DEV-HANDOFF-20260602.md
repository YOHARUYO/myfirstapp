# 기획→개발 핸드오프 — 슬랙 포맷 4건 + 슬랙 메시지 prefill 신규 + 회의록 제목 변경 fix + 참여자 입력 IME 버그

> 작성일: 2026-06-02
> 작성 주체: 기획 세션 (12번째)
> 심각도: 🟢 **Medium** — 사용 빈도 높은 영역(슬랙 전송/히스토리 재전송/참여자 입력)의 UX 개선 묶음
> 관련 문서: `reports/PLAN-REPORT-20260601.md`(LLM 확장성 검토 본문)
> 선행 의존: 없음 (1번 audio merge handoff와 영역 완전 분리: `audio_service` vs `claude_service`/`slack`/`history`/`MeetingSetup`)
> 묶음 ID: Phase 1B

---

## 개발 세션 전달 지시사항 (복붙용)

```
PLAN-DEV-HANDOFF-20260602.md 읽고 반영 부탁해.
슬랙 포맷 개편 4건 + 슬랙 메시지 prefill 신규 기능 + 회의록 제목 변경 미반영 fix +
참여자 태그 입력 IME 중복 버그 fix. 총 7건.

기획 결정 요약:
1) 슬랙 봇이 3종 메시지를 thread로 전송:
   - 1번 메인: 현재 메시지 형태 유지 + 인물 태그 [xxx님] + 인물별 인접 정렬
   - 2번 thread: 주요 논의 + F/U만 (개요/기타/Keywords 제외)
   - 3번 thread: .md 파일 첨부 (현재 동작 유지)
2) F/U은 "주제 헤딩 + bullet" 평탄 구조 유지하되 같은 인물 task 인접 정렬
3) 인물 태그 형태: 회의록 .md / 슬랙 모두 [xxx님] (@ 완전 제거)
4) prefill: 1번/2번 텍스트를 server에 저장 후 재전송 UI에서 미리 채우기 (3번 .md는 prefill 대상 아님)
5) 회의록 제목 변경 PATCH는 이미 backend에 있음 — 미반영 원인이 frontend 호출/캐시 무효화 쪽일 가능성 높음
6) 참여자 입력 시 "성호님" Enter → "성호님님" 중복 = 한글 IME 조합 중 Enter 클래식 버그.
   nativeEvent.isComposing 가드 필요

검증 필수:
- 신규 회의 1건 전송 → 슬랙에 3개 메시지가 thread로 묶여 보임 + 1번에 [xxx님] 태그
- 히스토리에서 동일 회의 재전송 UI 진입 시 1번/2번 본문이 미리 채워져 있음
- 회의록 .md 본문에도 [xxx님] 형태로 들어가고 F/U은 인물별 인접 정렬
- 한글 참여자 "테스트님" 입력 후 Enter → 정확히 "테스트님" 1개 태그 (중복 없음)

세션 종료 시 reports/DEV-REPORT-20260602.md 작성 부탁해.
```

---

## 1. 배경 — PM 결정 종합

이전 세션(`PLAN-REPORT-20260601.md`)에서 4가지 작업(15일 audio handoff / 슬랙·요약 포맷 / LLM 확장성 / MacBook Whisper)의 안전한 처리 순서를 합의했다. 본 핸드오프는 그중 **"슬랙·요약 포맷 영역"의 Phase 1B 묶음**이다.

Phase 1A(LLM 추상화)는 영역이 완전 분리되어 별건으로 진행하며, 1번 audio merge는 이미 발주 진행 중. Phase 1B는 그 둘과 영역이 겹치지 않으므로 병행 가능.

추가로 PM이 본 세션 중에 보고한 사용자 버그 2건(회의 제목 변경 미반영 / 참여자 입력 IME 중복)도 같은 sprint에 묶어 처리(frontend 영역 재진입 비용 절감).

---

## 2. 기획 결정 (확정)

### 2-1. F/U 표기 구조

| 항목 | 결정 |
|------|------|
| 회의록 .md 구조 | 주제 헤딩(`### N. 주제명`) 유지 + `**F/U 필요 사항**` 섹션 아래 평탄 bullet |
| 인물 태그 형태 | **`[xxx님] task` 형식** (`[@xxx]` 형식 폐기) |
| 정렬 | 같은 주제 내에서 **같은 인물의 task가 인접하도록 정렬** |
| 슬랙 메시지 | 회의록 .md와 동일한 형태로 노출 |
| 적용 범위 | 신규 생성·재요약 회의부터. 기존 회의록은 그대로 둠 (역마이그레이션 없음) |

> **PM 표현 직접 인용**: "주제가 제목, 그 아래에 같은 주제에 다른 task 할당 받은 인물의 task를 인물별 표시"

### 2-2. 슬랙 메시지 3종 분할

| # | 내용 | 대상 ts | 비고 |
|---|------|---------|------|
| 1번 | 현재 `_build_slack_message`가 만드는 메시지 + 인물 태그 변환 + 인물별 정렬 | 신규 `chat_postMessage` | 사용자가 thread_ts 선택했다면 그 thread로 |
| 2번 | 주요 논의 + F/U만 (개요/기타 메모/Keywords 제외) | 1번 메시지의 `ts`를 `thread_ts`로 회신 | 신규 |
| 3번 | 회의록 전문 .md 파일 첨부 | 1번 메시지의 `ts`를 `thread_ts`로 | 현재 동작과 동일 (코드 이동만) |

> 사용자가 채널 메시지로 thread를 선택한 경우: 1번이 그 thread에 들어가고 2/3번은 1번의 `ts`를 부모로. 즉 2/3번의 `thread_ts`는 **req.thread_ts가 아니라 1번의 응답 ts**.

### 2-3. prefill 신규 기능

| 항목 | 결정 |
|------|------|
| 대상 메시지 | 1번 + 2번 (3번 .md는 텍스트가 아니라 첨부 → prefill 개념 미적용) |
| 데이터 소스 | **서버 저장 방식** (PATCH 시에도 새 텍스트 저장) |
| 마이그레이션 | 기존 데이터(구 `slack_sent`)는 그대로 두고 신규 전송부터 새 구조 적용. 구 데이터 prefill 시도 시 안내 문구 |

### 2-4. 회의 제목 변경 미적용 (오류 가)
- 백엔드 `PATCH /api/history/{meeting_id}` 엔드포인트 (history.py:127~147)는 `metadata.title`을 화이트리스트에 포함하고 동작함을 코드 정독으로 확인
- → 원인은 **frontend 호출 누락 / 캐시 무효화 / state 동기화** 중 하나. 개발 세션이 재현 + 진단 + fix

### 2-5. 참여자 "님 님" 중복 입력 (오류 나)
- `TagInput.tsx` 코드에는 "님" 자동 부착 로직 **없음** (확인 완료)
- 원인 강력 후보: **한글 IME 조합 중 Enter 키 처리 버그**. `handleKeyDown`에 `e.nativeEvent.isComposing` 체크 없음 → 조합 중 Enter가 두 번 발생 → 마지막 글자가 별도 글자로 추가 입력
- 재현 패턴: "테스트님" 입력 → Enter → 태그 "테스트님" + input에 "님" 잔여 → 다음 Enter에 "님" 추가 태그

---

## 3. 영향 파일 매핑

### 백엔드

| 파일 | 변경 내용 |
|------|----------|
| `backend/services/claude_service.py` | `SUMMARY_SYSTEM_PROMPT` 수정 — F/U bullet 출력 형식을 `- [{name}님] {task} (~{deadline})`로 지시, 같은 인물 task 인접 출력 지시 |
| `backend/services/summary_assembler.py` | `extract_action_items`의 `assignee` 추출 정규식을 `r"\[([^\]]+?)님\]"` 패턴으로 교체. 결과 dict에서는 기존대로 `assignee` 키에 이름(님 제외) 저장 |
| `backend/models/meeting.py` | `SlackSentInfo`를 multi-message 구조로 확장 — 권장: `messages: dict[str, SlackMessage]` (key: `"main"`, `"topics"`, value: `SlackMessage(ts, text, sent_at)`). 기존 `channel_id`, `channel_name`, `deleted`, `deleted_at`는 상위 유지 |
| `backend/routers/slack.py` | (a) `_build_slack_message` 분리 → `_build_main_message`, `_build_topics_message` 두 함수<br>(b) `_build_main_message` 내부: `action_items`를 `assignee`별로 묶어 인접 정렬 후 `[xxx님] task ~deadline` 형식 출력. F/U 외 핵심 요약 부분은 현재 로직 유지<br>(c) `_build_topics_message` 내부: `summary_markdown`에서 `## 주요 논의 사항 & F/U 필요 요소` 섹션만 추출 (개요/기타/Keywords 제외)<br>(d) `send_slack_message` 흐름: 1번 `chat_postMessage` → 그 응답 `ts`를 `thread_ts`로 2번 `chat_postMessage` → 같은 `thread_ts`로 .md `files_upload_v2` → meeting JSON에 `messages.{main,topics}` 저장(text 포함)<br>(e) `update_slack_message` PATCH는 어떤 메시지를 수정할지 식별자 받기(`message_key: "main"|"topics"`) — `chat_update` 후 저장본 text도 갱신 |
| `backend/routers/history.py` | (선택) `update_meeting` PATCH 응답에 갱신된 metadata 전체 포함 — frontend가 응답으로 state 재설정할 수 있도록 (이미 `m.model_dump()` 반환 중이라 OK일 수 있음. 개발이 확인) |

### 프론트엔드

| 파일 | 변경 내용 |
|------|----------|
| `frontend/src/components/common/TagInput.tsx` | `handleKeyDown`에 IME 가드 추가: `if (e.key === 'Enter' && input.trim() && !(e.nativeEvent as any).isComposing)`. Backspace 분기도 동일 가드 권장 |
| `frontend/src/pages/HistoryDetail.tsx` | (a) 제목 변경 fix — PATCH 호출 후 응답으로 state 갱신 또는 history 재fetch. 실제 원인 진단 후 결정<br>(b) 슬랙 재전송 UI 진입 시 `meeting.slack_sent.messages.main.text` / `messages.topics.text`를 입력 칸에 prefill |
| `frontend/src/pages/SendSave.tsx` | 슬랙 미리보기 영역에 2번 메시지도 함께 미리보기 (신규 전송 흐름) |
| `frontend/src/api/slack.ts` | `updateSlackMessage` 호출에 `message_key` 파라미터 추가 |
| `frontend/src/types/index.ts` | `SlackSentInfo` 타입 신구조 반영 |

---

## 4. 수정 명세

### 4.1 요약 프롬프트 변경 (`claude_service.py`)

현재 `SUMMARY_SYSTEM_PROMPT`의 "F/U 항목에는 담당자(@이름)와 기한(~날짜)을 포함합니다" 부분과 user_prompt의 "응답 형식" 예시를 다음으로 교체:

```
3. F/U 항목 형식은 "- [{담당자이름}님] 할 일 (~{기한})" 입니다.
   - 담당자는 회의 참여자 명단에서만 선택하고, 이름만 사용합니다(직책 제외).
   - 같은 주제 내에서 같은 담당자의 F/U 항목들은 서로 인접하게 배치합니다.
   - 담당자가 명시되지 않은 경우 "- {할 일}" 형식으로 출력합니다.
```

예시 블록도 같이 갱신:
```
### 1. [주제명]
**주요 논의**
- ...

**F/U 필요 사항**
- [Sam님] 할 일 (~6/2)
- [Sam님] 다른 할 일
- [Jayden님] 또 다른 할 일 (~6/3)
```

### 4.2 action_items 추출 정규식 변경 (`summary_assembler.py`)

`extract_action_items` 함수의 다음 라인 교체:

```python
# 기존
assignee_match = re.search(r"[@＠](\S+?)[\]\s]", text)

# 신규
assignee_match = re.search(r"\[([^\[\]@＠]+?)님\]", text)
```

- 그 후 task 텍스트에서 `assignee_match.group(0)` (전체 매치 `[Sam님]`) 제거
- `assignee` 값은 매치 그룹(이름만, "님" 제외) 그대로 저장
- 결과: 기존 데이터 모델(ActionItem)은 변경 없이 호환

### 4.3 SlackSentInfo 모델 확장 (`meeting.py`)

```python
class SlackMessage(BaseModel):
    ts: str
    text: str
    sent_at: str

class SlackSentInfo(BaseModel):
    channel_id: str
    channel_name: str
    thread_ts: Optional[str] = None
    messages: dict[str, SlackMessage] = Field(default_factory=dict)
    # legacy field — 구 데이터 호환 + 점진 deprecate
    message_ts: Optional[str] = None
    sent_at: Optional[str] = None
    deleted: bool = False
    deleted_at: Optional[str] = None
```

- 신규 전송 시 `messages = {"main": SlackMessage(...), "topics": SlackMessage(...)}` 저장
- `message_ts`/`sent_at`는 구 데이터 호환용으로 유지(필드 자체는 남기되 신규 코드는 `messages.main.ts` 사용)
- 삭제 흐름의 `message_ts`로 비교하는 코드(`delete_slack_message`)는 신구조 호환되도록 `messages.main.ts` 기준으로 변경

### 4.4 슬랙 메시지 빌더 분리 (`slack.py`)

#### `_build_main_message(session_or_meeting, greeting, client) -> str`
- 현재 `_build_slack_message` 본문 거의 그대로
- 단 F/U bullet 생성 시:
  1. `action_items`를 `assignee`별로 묶어서 정렬 (None인 항목은 끝으로)
  2. 출력 형식 `- [{assignee}님] {task} ~{deadline}` (assignee None이면 `- {task} ~{deadline}`)

#### `_build_topics_message(session_or_meeting) -> str` (신규)
- `summary_markdown` 파싱해서 `## 주요 논의 사항 & F/U 필요 요소` 섹션만 추출
- 단순 문자열 슬라이싱(파이프 헤더 등장 후 다음 `## ` 헤딩 전까지)
- 출력 그대로 (요약은 이미 신규 형식 `[xxx님]` 포함)
- 빈 경우 None 반환 → 전송 라우터에서 2번 메시지 생략

### 4.5 전송 라우터 흐름 변경 (`slack.py` `send_slack_message`)

```python
main_text = _build_main_message(session, greeting, client=client)
result_main = client.chat_postMessage(
    channel=req.channel_id,
    text=main_text,
    thread_ts=req.thread_ts,  # 사용자가 선택한 thread (있다면)
)
main_ts = result_main["ts"]

topics_text = _build_topics_message(session)
topics_ts = None
if topics_text:
    result_topics = client.chat_postMessage(
        channel=req.channel_id,
        text=topics_text,
        thread_ts=main_ts,  # 1번 메시지의 thread
    )
    topics_ts = result_topics["ts"]

# .md 첨부도 main_ts를 thread_ts로 (현재 코드의 message_ts를 main_ts로 교체)
if req.attach_md:
    ...
    client.files_upload_v2(
        channel=req.channel_id,
        file=str(md_file),
        filename=filename,
        thread_ts=main_ts,
    )
```

- meeting JSON 저장: `slack_sent.messages = {"main": {ts:main_ts, text:main_text, ...}, "topics": {ts:topics_ts, text:topics_text, ...}}`

### 4.6 PATCH 수정 (`update_slack_message`)

```python
class SlackUpdateRequest(BaseModel):
    channel_id: str
    message_ts: str
    text: str
    meeting_id: Optional[str] = None  # 저장본 갱신용
    message_key: Optional[str] = None  # "main" | "topics"
```

- `chat_update` 호출 후 `meeting_id` + `message_key`가 있으면 meeting JSON의 `slack_sent.messages[message_key].text` 갱신

### 4.7 TagInput IME 가드

```typescript
const handleKeyDown = (e: React.KeyboardEvent) => {
    // IME 조합 중 Enter는 무시 (한글 입력 중 마지막 글자 중복 입력 방지)
    if ((e.nativeEvent as any).isComposing) return;
    if (e.key === 'Enter' && input.trim()) {
      e.preventDefault();
      addTag(input);
    } else if (e.key === 'Backspace' && !input && values.length > 0) {
      removeTag(values[values.length - 1]);
    }
};
```

### 4.8 회의 제목 변경 fix (frontend HistoryDetail)

- 백엔드는 동작 확인됨 (history.py:127, ALLOWED_META에 `title` 포함, PATCH 응답에 갱신된 meeting 반환)
- 개발 세션이 실제 재현 → frontend 원인 진단:
  - PATCH 호출 자체가 빠진 건지
  - 호출 후 history 목록 / detail state가 갱신 안 된 건지
  - 응답 dispatch / store 동기화 누락인지
- 진단 후 fix. **백엔드는 변경 없을 가능성 높음.**

### 4.9 HistoryDetail prefill UI

- 재전송 UI 진입 시 `meeting.slack_sent?.messages?.main?.text`를 1번 메시지 입력 칸의 초기값으로
- 동일하게 `messages.topics.text`를 2번 메시지 입력 칸
- 둘 다 없으면(구 데이터) 안내 문구 "이 회의는 이전 메시지 텍스트가 저장되지 않아 prefill을 제공하지 않습니다. 직접 작성해주세요" 표시 + 빈 입력

---

## 5. 검증 시나리오

### 5.1 회귀 (필수)
1. **기존 회의 .md 다운로드** → 본문 변화 없음(구 회의록은 그대로). PATCH 미적용
2. **기존 회의 슬랙 삭제 흐름** → `chat_delete` 정상 (구 `message_ts` 또는 신구조 `messages.main.ts` 둘 다 인식)

### 5.2 슬랙 포맷 (핵심)
3. **신규 회의 1건 생성 → 요약 → 슬랙 전송**
   - 슬랙 채널에 메인 메시지 1건 + 그 thread에 회신 1건 + .md 첨부 1건 (총 3개 메시지)
   - 1번 메시지 본문의 F/U bullet이 `[xxx님] task ~deadline` 형식
   - 같은 인물의 F/U 여러 개일 때 같은 주제 내에서 연속으로 표시
   - 2번 메시지 본문이 주요 논의 사항 섹션만 포함 (개요/기타/Keywords 없음)
   - 3번 .md 본문도 `[xxx님]` 형식
4. **회의록 .md 다운로드** → F/U bullet이 `[xxx님]` 형식, 인물별 인접 정렬

### 5.3 prefill (핵심)
5. **5.2 #3 회의를 히스토리에서 열어 슬랙 재전송 UI 진입**
   - 1번 메시지 입력 칸에 보낸 본문이 미리 채워져 있음
   - 2번 메시지 입력 칸에도 미리 채워져 있음
6. **재전송 본문 수정 후 저장** → 슬랙 메시지가 새 본문으로 갱신, meeting JSON에 새 text 저장됨
7. **5.2 #3 회의를 다시 재전송 UI 진입** → 새로 저장된 텍스트로 prefill 됨

### 5.4 추가 버그
8. **히스토리 상세에서 회의 제목 변경** → 저장 즉시 반영, 목록 새로고침에도 반영. 새 세션에서 동일 회의 열어도 변경된 제목 유지
9. **참여자 입력 "테스트님" + Enter** → 정확히 "테스트님" 1개 태그 (input 비워짐, "님" 잔여 없음)
10. **영문 참여자 "Sam" + Enter** → 정상 동작 (회귀 확인)

### 5.5 엣지
11. action_items가 모두 `assignee=None`인 경우 → 1번/2번 메시지 모두 정상 출력 ("님" 없는 평탄 bullet)
12. summary_markdown이 비어있는 경우 → 2번 메시지 생략, 1번/3번만 전송

---

## 6. 영향 범위

| 영역 | 변화 | 위험 |
|------|------|------|
| 신규 회의 요약 생성 | F/U 출력 형식 변경 | ⚠ Claude 응답 안정성 검증 필요(5.2 #3) |
| 기존 회의록 .md | 변화 없음 | ✅ |
| 슬랙 메시지 수 | 1건 → 최대 3건 | ⚠ API rate limit 영향 작음(1 회의당 3회) |
| 슬랙 thread 구조 | 사용자 선택 thread → 1번에 들어감, 2/3번은 1번의 회신 | ⚠ 사용자가 thread를 선택한 케이스 회귀 검증 |
| 슬랙 PATCH | message_key 추가 | ⚠ frontend·backend 동시 변경 필요 |
| meeting JSON | `slack_sent` 구조 확장(레거시 필드 유지) | ✅ 호환 |
| 한글 참여자 입력 UX | IME 가드 추가 | ✅ 단순 패치 |

---

## 7. 권장 작업 순서

1. **4.7 TagInput IME 가드** — 가장 작고 독립적. 먼저 닫으면 PM이 즉시 체감
2. **4.8 회의 제목 변경 fix** — 재현 후 진단 → frontend fix
3. **4.1 + 4.2 요약 프롬프트·정규식** — 신규 회의 1건 생성으로 5.2 #4 확인
4. **4.3 SlackSentInfo 모델 확장** — 호환 모델 검증
5. **4.4 + 4.5 슬랙 메시지 빌더 분리·전송 흐름** — 5.2 #3 검증
6. **4.6 PATCH + 4.9 HistoryDetail prefill UI** — 5.3 검증
7. `reports/DEV-REPORT-20260602.md` 작성. 회의 제목 fix 원인 진단 결과는 보고서에 명시(향후 유사 패턴 방지)

---

## 8. 우선순위

🟢 **Medium** — 운영 차단 없음. 다만 사용 빈도 높은 영역(매 회의 슬랙 전송 + 히스토리 재전송)이라 UX 개선 효과 큼. 1번 audio merge(High) 다음 우선순위.

---

## 9. 비변경 항목 (명시)

- 기존 회의록 .md / 기존 slack_sent 데이터 — 마이그레이션 없음
- `action_items` 모델 구조 — `assignee`는 여전히 이름만(님 제외) 저장
- 슬랙 채널/스레드 선택 UI — 변화 없음 (사용자가 선택한 thread는 1번 메시지가 들어감)
- 슬랙 삭제 흐름 — `messages.main.ts` 기준으로 식별하도록 분기 추가 외 구조 유지
- 요약 화면 자체 UI — Phase 1B 범위 아님 (Phase 2의 요약 포맷 작업에서 다룸)
- LLM provider 추상화 — Phase 1A 범위, 본 핸드오프 별개

---

## 10. Phase 1A와의 분리 선언

본 핸드오프(Phase 1B)는 다음과 같이 Phase 1A(LLM 추상화)와 영역 분리됨:

| 영역 | Phase 1A | Phase 1B |
|------|----------|----------|
| `claude_service.py` | provider 추상화 도입 | **프롬프트 텍스트만 변경** (provider 영향 0) |
| `settings.py` / `Settings.tsx` | 변경 | 변경 없음 |
| `slack.py` | 변경 없음 | 빌더·전송 흐름 변경 |
| `meeting.py` | 변경 없음 | SlackSentInfo 확장 |
| `TagInput.tsx` / `HistoryDetail.tsx` | 변경 없음 | IME / prefill / 제목 fix |

→ 두 핸드오프는 **병행 가능 또는 임의 순서**로 진행 가능. 같은 sprint에 들어가도 충돌 영역 없음.
