import { useRef, useCallback, useState } from 'react';

const SILENCE_TIMEOUT_MS = 2500;
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

    // [FIX-5] 새 인스턴스 ID 발급
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
          noSpeechCountRef.current++;
          if (noSpeechCountRef.current >= NO_SPEECH_TOAST_THRESHOLD && !noSpeechToastShownRef.current) {
            onStatusChange?.('음성이 감지되지 않고 있습니다. 마이크를 확인해주세요.');
            noSpeechToastShownRef.current = true;
          }
          break;

        case 'not-allowed':
        case 'service-not-allowed':
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
          // 의도적 abort — 무시
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
          onStatusChange?.('음성이 장시간 감지되지 않아 전사를 일시 중지합니다. 녹음은 계속됩니다.');
          setIsListening(false);
          lastErrorRef.current = null;
          return;
        }

        const delay = Math.min(1000 * Math.pow(1.5, noSpeechCountRef.current - 1), 5000);
        setTimeout(() => {
          // [FIX-5] 지연 후에도 인스턴스 확인
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

      // 정상 종료 — 즉시 재시작
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
