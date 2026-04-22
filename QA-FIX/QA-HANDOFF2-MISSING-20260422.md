# 2차 핸드오프 누락 — 수정 2건

> 작성일: 2026-04-22
> 작성자: 검수(QA) 세션
> 대상: 개발 세션
> 근거: `reports/PLAN-DEV-HANDOFF-20260422-2.md` 항목 5, 9

---

## 🔴 N1: WizardLayout 이전 단계(←) 버튼 미렌더링

**파일:** `frontend/src/components/wizard/WizardLayout.tsx`
**현재 상태:** `prevRoute` prop을 받고 있으나 **버튼 UI가 없음**. 모든 페이지에서 이전 단계 이동 불가.

현재 전달되는 prevRoute 값:
| 페이지 | prevRoute | 기대 동작 |
|--------|-----------|----------|
| MeetingSetup | `"/"` | 홈으로 |
| Recording | `"/setup"` | 2단계로 (녹음 중지 후만) |
| Processing (choice) | `"/recording"` | 3단계로 |
| Processing (처리 중) | `false` | 버튼 숨김 |
| Editing | `"/recording"` | 3단계로 (post_recording) |
| Summary | `"/editing"` | 5단계로 |
| SendSave | `"/summary"` | 6단계로 |
| SendSave (완료) | `false` | 버튼 숨김 |

**수정:** WizardLayout.tsx의 `children` 영역 하단에 네비게이션 바 추가:

```tsx
export default function WizardLayout({
  children,
  showStepper = true,
  prevRoute,
  prevDisabled,
  homeDisabled,
  homeModalMessage,
  onBeforeHome,
}: Props) {
  const navigate = useNavigate();
  const currentStep = useWizardStore((s) => s.currentStep);
  const [homeModalOpen, setHomeModalOpen] = useState(false);

  // ... 기존 handleHomeClick, handleHomeConfirm ...

  return (
    <div className="max-w-3xl mx-auto min-h-screen flex flex-col overflow-x-hidden">
      {showStepper && (
        <div className="border-b border-border">
          <WizardStepper onHomeClick={handleHomeClick} homeDisabled={homeDisabled} />
        </div>
      )}
      <div className="flex-1 p-6">{children}</div>

      {/* 하단 이전 단계 버튼 */}
      {prevRoute !== false && prevRoute && (
        <div className="px-6 pb-6">
          <button
            onClick={() => navigate(prevRoute)}
            disabled={prevDisabled}
            className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ArrowLeft size={16} />
            이전 단계
          </button>
        </div>
      )}

      {/* Home confirmation modal */}
      <Modal open={homeModalOpen} onClose={() => setHomeModalOpen(false)}>
        {/* ... 기존 모달 ... */}
      </Modal>
    </div>
  );
}
```

**주의:** 
- `prevRoute={false}`이면 버튼 숨김 (Processing 처리 중, SendSave 완료)
- `prevDisabled={true}`이면 버튼 비활성 (Recording 녹음 중)
- `ArrowLeft`는 이미 import되어 있음 (4행)

---

## 🟡 N2: 마이크 민감도 GainNode 오디오 증폭 미구현

**파일:** `frontend/src/pages/Recording.tsx` + `frontend/src/hooks/useAudioStream.ts`
**현재 상태:** 슬라이더 UI(`micSensitivity` state)는 있으나, 실제 오디오 스트��에 GainNode 증폭이 적용되지 않음. 슬라이더를 움직여도 녹음 품질이 변하지 않음.

**수정 방향:** `useAudioStream.ts`의 `startRecording`에서 GainNode를 연결하고, Recording.tsx에서 슬라이더 변경 시 gain 값을 업데이트.

### 2-A: useAudioStream.ts에 GainNode 지원 추가

```typescript
// 상단에 ref 추가
const gainNodeRef = useRef<GainNode | null>(null);
const audioCtxRef = useRef<AudioContext | null>(null);

const startRecording = useCallback(async (initialGain: number = 1.0) => {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  streamRef.current = stream;

  // GainNode로 오디오 증폭
  const audioCtx = new AudioContext();
  audioCtxRef.current = audioCtx;
  const source = audioCtx.createMediaStreamSource(stream);
  const gainNode = audioCtx.createGain();
  gainNode.gain.value = initialGain;
  gainNodeRef.current = gainNode;

  // GainNode → MediaStreamDestination → MediaRecorder
  const destination = audioCtx.createMediaStreamDestination();
  source.connect(gainNode);
  gainNode.connect(destination);

  const recorder = new MediaRecorder(destination.stream, {
    mimeType: 'audio/webm;codecs=opus',
    audioBitsPerSecond: 128000,
  });

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(event.data);
    }
  };

  recorder.start(5000);
  recorderRef.current = recorder;

  return stream;  // 원본 stream 반환 (mic level meter용)
}, []);

// gain 값 실시간 업데이트
const setGain = useCallback((value: number) => {
  if (gainNodeRef.current) {
    gainNodeRef.current.gain.value = value;
  }
}, []);

// stopRecording에 AudioContext 정리 추가
const stopRecording = useCallback(() => {
  return new Promise<void>((resolve) => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      // ... 기존 정리 ...
      audioCtxRef.current?.close();
      audioCtxRef.current = null;
      gainNodeRef.current = null;
      resolve();
      return;
    }
    recorder.onstop = () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      recorderRef.current = null;
      audioCtxRef.current?.close();
      audioCtxRef.current = null;
      gainNodeRef.current = null;
      resolve();
    };
    recorder.stop();
  });
}, []);

// return에 setGain 추가
return {
  connected, connect, startRecording, stopRecording,
  sendSpeechResult, sendResumed, disconnect, getStream,
  setGain,  // ← 추가
};
```

### 2-B: Recording.tsx에서 연결

```tsx
// 녹음 시작 시 초기 gain 전달
const handleStartRecording = async () => {
  try {
    await audioStream.connect();
    const stream = await audioStream.startRecording(micSensitivity);  // ← 초기값 전달
    if (stream) startMicLevel(stream);
    // ...
  } catch { /* ... */ }
};

// 슬라이더 onChange에서 실시간 업데이트
<input
  type="range" min="0.5" max="3.0" step="0.1"
  value={micSensitivity}
  onChange={(e) => {
    const val = parseFloat(e.target.value);
    setMicSensitivity(val);
    audioStream.setGain(val);  // ← 실시간 반영
  }}
/>
```

**주의:**
- `startRecording`의 반환값은 **원본 stream** (mic level meter에 사용) — GainNode 이후의 stream이 아님
- `AudioContext.close()`를 stopRecording에서 호출하므로 Recording.tsx의 mic level용 AudioContext와 충돌하지 않음 (별도 인스턴스)
- `useSilentAudio`의 AudioContext와도 별도 인스턴스라 충돌 없음

---

## 충돌 확인

| 수정 | 영향 파일 | 기존 코드 충돌 |
|------|----------|---------------|
| N1 | WizardLayout.tsx | ✅ 없음 — 기존 `prevRoute` prop 활용, UI 추가만 |
| N2 | useAudioStream.ts + Recording.tsx | ✅ 없음 — GainNode는 기존 MediaRecorder 파이프라인 사이에 삽입, 인터페이스만 확장 |

---

## 수정 완료 후

```
QA-FIX/QA-HANDOFF2-MISSING-20260422.md 2건 수정 완료했어. 확인해줘.
```
