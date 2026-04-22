import { useRef, useCallback, useState } from 'react';

interface UseAudioStreamOptions {
  sessionId: string;
  onChunkAck?: (index: number) => void;
  onBlockCreated?: (data: { block_id: string; timestamp_start: number; timestamp_end: number }) => void;
}

export function useAudioStream({ sessionId, onChunkAck, onBlockCreated }: UseAudioStreamOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const [connected, setConnected] = useState(false);

  const connect = useCallback(() => {
    return new Promise<void>((resolve, reject) => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/api/sessions/${sessionId}/audio`);

      ws.onopen = () => {
        wsRef.current = ws;
        setConnected(true);
        resolve();
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'chunk_ack' && onChunkAck) {
            onChunkAck(data.chunk_index);
          } else if (data.type === 'block_created' && onBlockCreated) {
            onBlockCreated(data);
          }
        } catch {}
      };

      ws.onerror = () => reject(new Error('WebSocket connection failed'));
      ws.onclose = () => setConnected(false);
    });
  }, [sessionId, onChunkAck, onBlockCreated]);

  const startRecording = useCallback(async (initialGain: number = 1.0) => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;

    // GainNode pipeline for mic sensitivity
    const audioCtx = new AudioContext();
    audioCtxRef.current = audioCtx;
    const source = audioCtx.createMediaStreamSource(stream);
    const gainNode = audioCtx.createGain();
    gainNode.gain.value = initialGain;
    gainNodeRef.current = gainNode;

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

    return stream; // raw stream for mic level meter
  }, []);

  const setGain = useCallback((value: number) => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = value;
    }
  }, []);

  const stopRecording = useCallback(() => {
    return new Promise<void>((resolve) => {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === 'inactive') {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        recorderRef.current = null;
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

  const sendSpeechResult = useCallback(
    (data: { text: string; is_final: boolean; timestamp_start: number; timestamp_end: number; block_id?: string }) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'speech_result', ...data }));
      }
    },
    []
  );

  const sendResumed = useCallback((gapSeconds: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'recording_resumed', gap_seconds: gapSeconds }));
    }
  }, []);

  const disconnect = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    recorderRef.current = null;
    streamRef.current = null;
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    gainNodeRef.current = null;
    wsRef.current?.close();
    wsRef.current = null;
    setConnected(false);
  }, []);

  const getStream = useCallback(() => streamRef.current, []);

  return {
    connected,
    connect,
    startRecording,
    stopRecording,
    sendSpeechResult,
    sendResumed,
    disconnect,
    getStream,
    setGain,
  };
}
