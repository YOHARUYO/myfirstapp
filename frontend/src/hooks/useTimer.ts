import { useState, useRef, useCallback } from 'react';

export function useTimer() {
  const [elapsed, setElapsed] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const rafRef = useRef<number>(0);

  const tick = useCallback(() => {
    if (startTimeRef.current !== null) {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
      rafRef.current = requestAnimationFrame(tick);
    }
  }, []);

  const start = useCallback(() => {
    if (startTimeRef.current === null) {
      startTimeRef.current = Date.now();
    } else {
      // Resume: adjust start time by already elapsed
      startTimeRef.current = Date.now() - elapsed * 1000;
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [elapsed, tick]);

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
  }, []);

  const reset = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    startTimeRef.current = null;
    setElapsed(0);
  }, []);

  const getElapsedSeconds = useCallback(() => {
    if (startTimeRef.current === null) return 0;
    return (Date.now() - startTimeRef.current) / 1000;
  }, []);

  return { elapsed, start, stop, reset, getElapsedSeconds };
}
