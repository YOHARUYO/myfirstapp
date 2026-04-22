# 낮은 위험 코드 정리 — 10건

> 작성일: 2026-04-22
> 작성자: 검수(QA) 세션
> 대상: 개발 세션
> 성격: 기능 변경 없는 코드 정리. 새 기획 반영 전 깨끗한 상태를 만들기 위함.

---

### L1: config.py API 키 미설정 시 시작 검증

**파일:** `backend/config.py:13-14`

현재 빈 문자열로 기본값 → 이후 API 호출에서 불명확한 에러.

```python
# 기존
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
SLACK_BOT_TOKEN = os.getenv("SLACK_BOT_TOKEN", "")

# 수정: 시작 시 경고 로그
import logging
_logger = logging.getLogger(__name__)

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
SLACK_BOT_TOKEN = os.getenv("SLACK_BOT_TOKEN", "")

if not ANTHROPIC_API_KEY:
    _logger.warning("ANTHROPIC_API_KEY가 설정되지 않았습니다. AI 태깅/요약이 작동하지 않습니다.")
if not SLACK_BOT_TOKEN:
    _logger.warning("SLACK_BOT_TOKEN이 설정되지 않았습니다. Slack 전송이 작동하지 않습니다.")
```

---

### L2: merger_service.py _overlap 데드코드 제거

**파일:** `backend/services/merger_service.py:9-16`

```python
# 기존 (10-11행이 12-13행에 즉시 덮어써짐)
def _overlap(start1: float, end1: float, start2: float, end2: float) -> float:
    overlap_start = max(start1, end1 if end1 < start1 else start1, start2)  # 데드코드
    overlap_end = min(end1, end2)  # 데드코드
    overlap_start = max(start1, start2)
    overlap_end = min(end1, end2)
    return max(0.0, overlap_end - overlap_start)

# 수정
def _overlap(start1: float, end1: float, start2: float, end2: float) -> float:
    overlap_start = max(start1, start2)
    overlap_end = min(end1, end2)
    return max(0.0, overlap_end - overlap_start)
```

---

### L3: Editing.tsx Undo 스택 최대 크기

**파일:** `frontend/src/pages/Editing.tsx:120`

```tsx
// 기존: slice(-50) 후 push → 51개 가능
setUndoStack((prev) => [...prev.slice(-50), current.map((b) => ({ ...b }))]);

// 수정: slice(-49)로 push 후 50개 보장
setUndoStack((prev) => [...prev.slice(-49), current.map((b) => ({ ...b }))]);
```

---

### L4: formatTs 중복 통합

**파일:** `frontend/src/utils/formatTime.ts` + Recording.tsx, Editing.tsx, Summary.tsx, HistoryDetail.tsx

4곳에서 동일한 `formatTs` 함수가 중복 정의됨.

**1단계:** `frontend/src/utils/formatTime.ts`에 추가:
```typescript
export function formatTs(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
```

**2단계:** 4개 파일에서 로컬 `formatTs` 함수 삭제 + import:
```typescript
import { formatTs } from '../utils/formatTime';
```

---

### L5: Recording.tsx handleBlockCreated 빈 콜백 제거

**파일:** `frontend/src/pages/Recording.tsx:150`

```tsx
// 기존: 아무것도 안 하는 빈 콜백
const handleBlockCreated = useCallback(
  (data: { block_id: string; timestamp_start: number; timestamp_end: number }) => {},
  []
);

const audioStream = useAudioStream({
  sessionId,
  onBlockCreated: handleBlockCreated,
});
```

**수정:** 콜백 제거하고 useAudioStream에서 생략:
```tsx
const audioStream = useAudioStream({
  sessionId,
});
```

`useAudioStream.ts`의 `onBlockCreated`가 옵셔널이므로 문제 없음 (이미 `?` 타입).

---

### L6: MeetingSetup.tsx 파일 input DOM 누적

**파일:** `frontend/src/pages/MeetingSetup.tsx:362-370`

```tsx
// 기존: 매번 createElement
const input = document.createElement('input');
input.type = 'file';
// ...
input.click();
// input이 DOM에 계속 남음

// 수정: 사용 후 제거
const input = document.createElement('input');
input.type = 'file';
input.accept = '.webm,.mp3,.wav,.m4a';
input.onchange = (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) handleFileSelect(file);
  input.remove();  // ← 추가
};
input.click();
```

또는 `useRef`로 한 번만 생성하여 재사용해도 됨.

---

### L7: History.tsx 검색 디바운싱

**파일:** `frontend/src/pages/History.tsx`

현재 Enter 키 기반이라 급하지 않지만, 입력 중 실시간 검색으로 확장할 경우를 대비:

```tsx
// 검색 input의 onChange에 디바운스 적용 (선택적)
const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

const handleSearchInput = (value: string) => {
  setSearchQuery(value);
  if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
  searchTimeoutRef.current = setTimeout(() => {
    handleSearch();
  }, 300);
};
```

**최소 수정:** 현재 Enter 키 방식 유지하되, 위 코드를 주석으로 준비만 해둬도 됨.

---

### L8: Toast 에러 시 표시 시간 연장

**파일:** `frontend/src/components/common/Toast.tsx`

```tsx
// Toast 컴포넌트에 duration prop 추가
interface ToastProps {
  message: string;
  visible: boolean;
  onHide: () => void;
  duration?: number;  // ← 추가, 기본 3000
}

export default function Toast({ message, visible, onHide, duration = 3000 }: ToastProps) {
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(onHide, duration);
    return () => clearTimeout(timer);
  }, [visible, onHide, duration]);
  // ...
}
```

에러 토스트 호출 시:
```tsx
// 일반
<Toast message={toast.message} visible={toast.visible} onHide={...} />

// 에러 (필요한 곳에서)
<Toast message={toast.message} visible={toast.visible} onHide={...} duration={5000} />
```

**최소 수정:** Toast.tsx에 duration prop만 추가. 호출부는 필요 시 점진 적용.

---

### L9: 모달 닫힘 후 포커스 복귀

**파일:** `frontend/src/components/common/Modal.tsx`

```tsx
// Modal 컴포넌트에 포커스 복귀 로직 추가
export default function Modal({ open, onClose, children }: ModalProps) {
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      // 모달 열릴 때 현재 포커스 요소 저장
      triggerRef.current = document.activeElement as HTMLElement;
    } else if (triggerRef.current) {
      // 모달 닫힐 때 포커스 복귀
      triggerRef.current.focus();
      triggerRef.current = null;
    }
  }, [open]);

  // ... 기존 렌더링
}
```

---

### L10: slack.py _strip_mrkdwn 확장

**파일:** `backend/routers/slack.py:34-51`

```python
def _strip_mrkdwn(text: str) -> str:
    """Strip Slack mrkdwn formatting to plain text."""
    # 기존 처리
    text = re.sub(r'[*_~`]', '', text)
    text = re.sub(r'<@\w+>', '@user', text)
    text = re.sub(r'<#\w+\|([^>]+)>', r'#\1', text)
    text = re.sub(r'<(https?://[^|>]+)\|([^>]+)>', r'\2', text)
    text = re.sub(r'<(https?://[^>]+)>', r'\1', text)

    # 추가: emoji shortcode 제거
    text = re.sub(r':[\w+-]+:', '', text)

    # 추가: 코드블록 마커 제거
    text = re.sub(r'```[\s\S]*?```', '[코드]', text)
    text = re.sub(r'`([^`]+)`', r'\1', text)

    return text.strip()
```

---

## 수정 완료 후

```
QA-FIX/QA-LOW-RISK-CLEANUP-20260422.md 10건 수정 완료했어. 확인해줘.
```
