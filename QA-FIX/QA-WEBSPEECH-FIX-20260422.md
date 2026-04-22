# Web Speech 안정화 — 수정 4건

> 작성일: 2026-04-22
> 작성자: 검수(QA) 세션
> 대상: 개발 세션
> 중요도: 🔴 핵심 기능 (녹음 전사의 안정성)

---

## 배경

녹음 중 Web Speech 관련 오류가 다수 발생하는 현상. 원인 분석 결과:

1. Chrome의 `no-speech` 에러 → onend → 즉시 재시작 → 또 `no-speech` **무한 루프** (콘솔 폭주 + CPU 소모)
2. 모든 에러가 `console.error`만 찍히고 **사용자에게 안내 없음**
3. 탭 복귀 시 stop→start 경쟁으로 **recognition 인스턴스 2개 동시 실행** 가능
4. onend에서 재시작 실패해도 **조용히 삼켜짐** → 전사 중단을 인지 못함

수정 4(forceFinalize 중복)는 분석 결과 현재 코드가 이미 안전하므로 제외.

---

## 수정 대상

**파일:** `frontend/src/hooks/useWebSpeech.ts` (전면 수정)
**연관:** `frontend/src/pages/Recording.tsx` (탭 복귀 로직 수정)

---

## useWebSpeech.ts 전체 수정

아래 코드로 교체. 변경 포인트에 `// [FIX]` 주석을 달아둠.

```typescript
import { useRef, useCallback, useState } from 'react';

const SILENCE_TIMEOUT_MS = 1500;
const NO_SPEECH_MAX_RETRIES = 10; // [FIX-2] no-speech 연속 최대 재시도
const NO_SPEECH_TOAST_THRESHOLD = 5; // [FIX-1] 이 횟수 이후 사용자에게 1회 안내

interface UseWebSpeechOptions {
  language: string;
  onInterim: (text: string) => void;
  onFinal: (text: string, timestampStart: number, timestampEnd: number) => void;
  getElapsedSeconds: () => number;
  onStatusChange?: (message: string) => void; // [FIX-1] 에러/상태 알림 콜백
}

export function useWebSpeech({
  language, onInterim, onFinal, getElapsedSeconds, onStatusChange,
}: UseWebSpeechOptions) {
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const blockStartRef = useRef<number | null>(null);
  const [isListening, setIsListening] = useState(false);
  const shouldContinueRef = useRef(false);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastInterimRef = useRef<string>('');

  // [FIX-2] no-speech backoff 상태
  const lastErrorRef = useRef<string | null>(null);
  const noSpeechCountRef = useRef(0);
  const noSpeechToastShownRef = useRef(false);

  // [FIX-5] 인스턴스 ID — onend에서 현재 인스턴스만 재시작하도록 보장
  const instanceIdRef = useRef(0);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const forceFinalize = useCallback(() => {
    const text = lastInterimRef.current;
    if (!text) return;

    const elapsed = getElapsedSeconds();
    const timestampStart = blockStartRef.current ?? elapsed - 3;
    onFinal(text, timestampStart, elapsed);

    lastInterimRef.current = '';
    blockStartRef.current = null;
    onInterim('');
  }, [getElapsedSeconds, onFinal, onInterim]);

  const resetSilenceTimer = useCallback(() => {
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => {
      forceFinalize();
      recognitionRef.current?.abort();
    }, SILENCE_TIMEOUT_MS);
  }, [clearSilenceTimer, forceFinalize]);

  const start = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      onStatusChange?.('이 브라우저는 음성 인식을 지원하지 않습니다.');
      return;
    }

    // [FIX-5] 새 인스턴스 ID 발급 — 이전 인스턴스의 onend가 이 인스턴스를 건드리지 못하게
    const currentInstanceId = ++instanceIdRef.current;

    const recognition = new SpeechRecognition();
    recognition.lang = language;
    recognition.interimResults = true;
    recognition.continuous = true;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const elapsed = getElapsedSeconds();

      // [FIX-2] 음성이 인식되면 no-speech 카운터 리셋
      noSpeechCountRef.current = 0;
      noSpeechToastShownRef.current = false;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          clearSilenceTimer();
          const transcript = event.results[i][0].transcript;
          const timestampEnd = elapsed;
          const timestampStart = blockStartRef.current ?? timestampEnd - 3;
          onFinal(transcript, timestampStart, timestampEnd);
          blockStartRef.current = null;
        }
      }

      let pendingText = '';
      for (let i = 0; i < event.results.length; i++) {
        if (!event.results[i].isFinal) {
          pendingText += event.results[i][0].transcript;
        }
      }

      if (pendingText) {
        if (blockStartRef.current === null) {
          blockStartRef.current = elapsed;
        }
        lastInterimRef.current = pendingText;
        onInterim(pendingText);
        resetSilenceTimer();
      } else {
        lastInterimRef.current = '';
        onInterim('');
      }
    };

    // [FIX-1] 에러 유형별 분기
    recognition.onerror = (e) => {
      lastErrorRef.current = e.error;

      switch (e.error) {
        case 'no-speech':
          // [FIX-2] 카운터 증가, 과도한 반복 시 1회만 안내
          noSpeechCountRef.current++;
          if (noSpeechCountRef.current >= NO_SPEECH_TOAST_THRESHOLD && !noSpeechToastShownRef.current) {
            onStatusChange?.('음성이 감지되지 않고 있습니다. 마이크를 확인해주세요.');
            noSpeechToastShownRef.current = true;
          }
          break;

        case 'not-allowed':
        case 'service-not-allowed':
          // [FIX-1] 권한 소실 — 재시작 중단 + 사용자 안내
          shouldContinueRef.current = false;
          onStatusChange?.('마이크 권한이 거부되었습니다. 브라우저 설정을 확인해주세요.');
          break;

        case 'network':
          onStatusChange?.('네트워크 오류: 음성 인식 서버에 연결할 수 없습니다. 자동 재연결을 시도합니다.');
          break;

        case 'audio-capture':
          onStatusChange?.('마이크 입력을 받을 수 없습니다. 마이크 연결을 확인해주세요.');
          break;

        case 'aborted':
          // 의도적 abort (silence timeout, flush, stop) — 무시
          break;

        default:
          console.warn('[WebSpeech] unhandled error:', e.error, e.message);
          break;
      }
    };

    recognition.onend = () => {
      // [FIX-5] 이 인스턴스가 더 이상 최신이 아니면 재시작 안 함
      if (!shouldContinueRef.current || instanceIdRef.current !== currentInstanceId) {
        if (instanceIdRef.current === currentInstanceId) {
          setIsListening(false);
        }
        return;
      }

      forceFinalize();

      // [FIX-2] no-speech 에러였으면 backoff 적용
      if (lastErrorRef.current === 'no-speech') {
        if (noSpeechCountRef.current >= NO_SPEECH_MAX_RETRIES) {
          // 최대 재시도 초과 — 재시작 중단, 사용자 안내
          onStatusChange?.('음성이 장시간 감지되지 않아 전사를 일시 중지합니다. 녹음은 계속됩니다.');
          setIsListening(false);
          lastErrorRef.current = null;
          return;
        }

        // 지수 backoff: 1초 → 1.5초 → 2.25초 → ... 최대 5초
        const delay = Math.min(1000 * Math.pow(1.5, noSpeechCountRef.current - 1), 5000);
        setTimeout(() => {
          // [FIX-5] 지연 후에도 인스턴스 확인 (지연 중 stop→start가 호출됐을 수 있음)
          if (!shouldContinueRef.current || instanceIdRef.current !== currentInstanceId) return;
          try {
            recognition.start();
          } catch {
            // [FIX-3] 재시작 실패 안내
            onStatusChange?.('전사 재시작에 실패했습니다. 녹음은 계속됩니다.');
            setIsListening(false);
          }
        }, delay);
        lastErrorRef.current = null;
        return;
      }

      // 정상 종료 (abort, stop 등) — 즉시 재시작
      lastErrorRef.current = null;
      try {
        recognition.start();
      } catch {
        // [FIX-3] 재시작 실패 안내
        onStatusChange?.('전사 재시작에 실패했습니다. 녹음은 계속됩니다.');
        setIsListening(false);
      }
    };

    shouldContinueRef.current = true;
    noSpeechCountRef.current = 0;
    noSpeechToastShownRef.current = false;
    lastErrorRef.current = null;

    recognition.start();
    recognitionRef.current = recognition;
    setIsListening(true);
  }, [language, onInterim, onFinal, getElapsedSeconds, clearSilenceTimer, resetSilenceTimer, forceFinalize, onStatusChange]);

  const flush = useCallback(() => {
    clearSilenceTimer();
    recognitionRef.current?.stop();
  }, [clearSilenceTimer]);

  const stop = useCallback(() => {
    shouldContinueRef.current = false;
    clearSilenceTimer();
    forceFinalize();
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    blockStartRef.current = null;
    lastErrorRef.current = null;
    setIsListening(false);
  }, [clearSilenceTimer, forceFinalize]);

  const isActive = useCallback(() => {
    return recognitionRef.current !== null && shouldContinueRef.current;
  }, []);

  return { isListening, start, stop, flush, isActive };
}
```

---

## Recording.tsx 수정

### A. useWebSpeech 호출에 onStatusChange 추가

```tsx
// 기존
const webSpeech = useWebSpeech({
  language: session?.metadata.language || 'ko-KR',
  onFinal: handleFinal,
  onInterim: handleInterim,
  getElapsedSeconds,
});

// 수정
const webSpeech = useWebSpeech({
  language: session?.metadata.language || 'ko-KR',
  onFinal: handleFinal,
  onInterim: handleInterim,
  getElapsedSeconds,
  onStatusChange: useCallback((message: string) => {
    setToast({ message, visible: true });
  }, []),
});
```

### B. 탭 복귀 로직 — stop→start 경쟁 해소

```tsx
// 기존 (189-200행)
useVisibility(useCallback(() => {
  if (recordingState === 'recording') {
    const wasDisconnected = !webSpeech.isActive();
    try {
      webSpeech.stop();
      webSpeech.start();
    } catch {}
    if (wasDisconnected) {
      setToast({ message: '탭 복귀: ...', visible: true });
    }
  }
}, [recordingState, webSpeech]));

// 수정 — stop 후 짧은 대기로 이전 onend가 먼저 처리되도록
useVisibility(useCallback(() => {
  if (recordingState === 'recording') {
    const wasDisconnected = !webSpeech.isActive();
    webSpeech.stop();
    // 이전 인스턴스의 onend가 처리된 후 새 인스턴스 시작
    // instanceIdRef 덕분에 이전 onend는 재시작하지 않음 — 50ms면 충분
    setTimeout(() => {
      webSpeech.start();
      if (wasDisconnected) {
        setToast({ message: '탭 복귀: 전사를 재연결했습니다. 일부 전사가 누락됐을 수 있습니다.', visible: true });
      }
    }, 50);
  }
}, [recordingState, webSpeech]));
```

**주의:** `setTimeout` 50ms는 안전 마진. `instanceIdRef` 방식이 근본 방어이므로 0ms여도 동작하지만, 브라우저 이벤트 루프의 microtask 순서를 고려해 여유를 둠.

---

## 수정 요약

| # | 내용 | 위치 |
|---|------|------|
| FIX-1 | onerror 에러 유형별 분기 + 사용자 안내 콜백 | useWebSpeech.ts onerror |
| FIX-2 | no-speech 지수 backoff + 최대 재시도 제한 | useWebSpeech.ts onend |
| FIX-3 | onend 재시작 실패 시 사용자 안내 | useWebSpeech.ts onend catch |
| FIX-5 | instanceIdRef로 인스턴스 동일성 보장 | useWebSpeech.ts onend + Recording.tsx 탭 복귀 |

---

## 수정 완료 후

```
QA-FIX/QA-WEBSPEECH-FIX-20260422.md 수정 완료했어. 확인해줘.
```
