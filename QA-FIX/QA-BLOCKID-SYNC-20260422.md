# block_id 클라이언트-서버 동기화 — 수정 3건

> 작성일: 2026-04-22
> 작성자: 검수(QA) 세션
> 대상: 개발 세션
> 원인: 3단계에서 블록 분할 시 404 — 클라이언트 ID와 서버 ID가 다름

---

## 원인

- Recording.tsx: `blk_${Date.now()}` (예: `blk_1776843759869`)
- audio.py: `blk_${uuid4().hex[:8]}` (예: `blk_a3f2c1d8`)

둘이 다르므로 분할/병합/편집 API 호출 시 서버가 해당 block_id를 찾지 못해 404.

## 해결: 클라이언트가 생성한 block_id를 서버에 전달, 서버가 그대로 사용

---

### 수정 1: Recording.tsx — sendSpeechResult에 block_id 포함

**파일:** `frontend/src/pages/Recording.tsx:173`

```tsx
// 기존
audioStream.sendSpeechResult({
  text,
  is_final: true,
  timestamp_start: timestampStart,
  timestamp_end: timestampEnd,
});

// 수정: block_id 추가
audioStream.sendSpeechResult({
  text,
  is_final: true,
  timestamp_start: timestampStart,
  timestamp_end: timestampEnd,
  block_id: blockId,
});
```

---

### 수정 2: useAudioStream.ts — 타입에 block_id 추가

**파일:** `frontend/src/hooks/useAudioStream.ts:87`

```typescript
// 기존
const sendSpeechResult = useCallback(
  (data: { text: string; is_final: boolean; timestamp_start: number; timestamp_end: number }) => {

// 수정: block_id 추가
const sendSpeechResult = useCallback(
  (data: { text: string; is_final: boolean; timestamp_start: number; timestamp_end: number; block_id?: string }) => {
```

전송 부분은 `{ type: 'speech_result', ...data }`로 spread하므로 자동 포함됨. 변경 불필요.

---

### 수정 3: audio.py — 클라이언트 block_id 우선 사용

**파일:** `backend/routers/audio.py:81`

```python
# 기존
block_id = f"blk_{uuid4().hex[:8]}"

# 수정: 클라이언트가 보낸 ID 우선, 없으면 fallback
block_id = data.get("block_id") or f"blk_{uuid4().hex[:8]}"
```

이 한 줄만 변경. 나머지 로직(Block 생성, session 저장, block_created 응답)은 그대로.

---

## 충돌 확인

| 영향 범위 | 충돌 여부 |
|----------|----------|
| 4단계 Processing (Whisper 병합) | ✅ 무관 — session.json의 ID를 그대로 사용 |
| 5단계 Editing (블록 편집) | ✅ 무관 — getSession()으로 최신 블록 로드 |
| 히스토리 재편집 | ✅ 무관 — Meeting의 ID를 그대로 사용 |
| 기존 세션 데이터 | ✅ 무관 — 이미 저장된 uuid 기반 ID는 유효 |

---

## 수정 완료 후

```
QA-FIX/QA-BLOCKID-SYNC-20260422.md 3건 수정 완료했어. 확인해줘.
```
