import { useRef, useCallback, useState } from 'react';

const SILENCE_TIMEOUT_MS = 1500;

interface UseWebSpeechOptions {
  language: string;
  onInterim: (text: string) => void;
  onFinal: (text: string, timestampStart: number, timestampEnd: number) => void;
  getElapsedSeconds: () => number;
}

export function useWebSpeech({ language, onInterim, onFinal, getElapsedSeconds }: UseWebSpeechOptions) {
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const blockStartRef = useRef<number | null>(null);
  const [isListening, setIsListening] = useState(false);
  const shouldContinueRef = useRef(false);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastInterimRef = useRef<string>('');

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
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = language;
    recognition.interimResults = true;
    recognition.continuous = true;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const elapsed = getElapsedSeconds();

      // Process final results
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

      // Collect ALL pending (non-final) results
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

    recognition.onend = () => {
      if (shouldContinueRef.current) {
        forceFinalize();
        try {
          recognition.start();
        } catch {}
      } else {
        setIsListening(false);
      }
    };

    recognition.onstart = () => {
      console.log('[WebSpeech] recognition started');
    };

    recognition.onaudiostart = () => {
      console.log('[WebSpeech] audio capture started');
    };

    recognition.onspeechstart = () => {
      console.log('[WebSpeech] speech detected');
    };

    recognition.onerror = (e) => {
      console.error('[WebSpeech] error:', e.error, e.message);
    };

    shouldContinueRef.current = true;
    recognition.start();
    recognitionRef.current = recognition;
    setIsListening(true);
  }, [language, onInterim, onFinal, getElapsedSeconds, clearSilenceTimer, resetSilenceTimer, forceFinalize]);

  // Flush: stop recognition to finalize current interim as isFinal,
  // then onend will auto-restart (shouldContinueRef stays true)
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
    setIsListening(false);
  }, [clearSilenceTimer, forceFinalize]);

  return { isListening, start, stop, flush };
}
