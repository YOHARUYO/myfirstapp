import { useRef, useCallback } from 'react';

export function useSilentAudio() {
  const ctxRef = useRef<AudioContext | null>(null);
  const oscRef = useRef<OscillatorNode | null>(null);

  const start = useCallback(() => {
    if (ctxRef.current) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0.001;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    ctxRef.current = ctx;
    oscRef.current = osc;
  }, []);

  const stop = useCallback(() => {
    oscRef.current?.stop();
    ctxRef.current?.close();
    ctxRef.current = null;
    oscRef.current = null;
  }, []);

  return { start, stop };
}
