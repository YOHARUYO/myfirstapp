import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, Square, ChevronRight, Pencil } from 'lucide-react';
import WizardLayout from '../components/wizard/WizardLayout';
import Toast from '../components/common/Toast';
import { useWizardStore } from '../stores/wizardStore';
import { useSessionStore } from '../stores/sessionStore';
import { useTimer } from '../hooks/useTimer';
import { useAudioStream } from '../hooks/useAudioStream';
import { useWebSpeech } from '../hooks/useWebSpeech';
import { formatTimestamp } from '../utils/formatTime';
import type { Block } from '../types';

type RecordingState = 'idle' | 'recording' | 'post_recording';

export default function Recording() {
  const navigate = useNavigate();
  const setStep = useWizardStore((s) => s.setStep);
  const session = useSessionStore((s) => s.session);
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [interimText, setInterimText] = useState('');
  const [toast, setToast] = useState({ message: '', visible: false });
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const stoppedAtRef = useRef<number | null>(null);
  const editInputRef = useRef<HTMLTextAreaElement>(null);

  const { elapsed, start: startTimer, stop: stopTimer, getElapsedSeconds } = useTimer();

  useEffect(() => {
    setStep(3);
  }, [setStep]);

  // Redirect if no session
  useEffect(() => {
    if (!session) navigate('/setup');
  }, [session, navigate]);

  const sessionId = session?.session_id || '';

  const handleBlockCreated = useCallback(
    (data: { block_id: string; timestamp_start: number; timestamp_end: number }) => {
      // Block text comes from web speech, we track it locally
    },
    []
  );

  const audioStream = useAudioStream({
    sessionId,
    onBlockCreated: handleBlockCreated,
  });

  const handleFinal = useCallback(
    (text: string, timestampStart: number, timestampEnd: number) => {
      const blockId = `blk_${Date.now()}`;
      const newBlock: Block = {
        block_id: blockId,
        timestamp_start: timestampStart,
        timestamp_end: timestampEnd,
        text,
        source: 'web_speech',
        is_edited: false,
        importance: null,
        importance_source: null,
        speaker: null,
      };
      setBlocks((prev) => [...prev, newBlock]);
      setInterimText('');

      // Send to server
      audioStream.sendSpeechResult({
        text,
        is_final: true,
        timestamp_start: timestampStart,
        timestamp_end: timestampEnd,
      });
    },
    [audioStream]
  );

  const handleInterim = useCallback((text: string) => {
    setInterimText(text);
  }, []);

  const webSpeech = useWebSpeech({
    language: session?.metadata.language || 'ko-KR',
    onFinal: handleFinal,
    onInterim: handleInterim,
    getElapsedSeconds,
  });

  // Auto-scroll (skip when editing to keep scroll position stable)
  useEffect(() => {
    if (!editingBlockId) {
      transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [blocks, interimText, editingBlockId]);

  // Focus textarea when editing starts
  useEffect(() => {
    if (editingBlockId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.selectionStart = editInputRef.current.value.length;
    }
  }, [editingBlockId]);

  const handleEditStart = useCallback((block: Block) => {
    setEditingBlockId(block.block_id);
    setEditingText(block.text);
  }, []);

  const handleEditConfirm = useCallback(() => {
    if (!editingBlockId) return;
    setBlocks((prev) =>
      prev.map((b) =>
        b.block_id === editingBlockId
          ? { ...b, text: editingText, is_edited: true, source: 'user_edit' as const }
          : b
      )
    );
    setEditingBlockId(null);
    setEditingText('');
  }, [editingBlockId, editingText]);

  const handleEditCancel = useCallback(() => {
    setEditingBlockId(null);
    setEditingText('');
  }, []);

  const handleStartRecording = async () => {
    try {
      await audioStream.connect();
      await audioStream.startRecording();
      webSpeech.start();
      startTimer();
      setRecordingState('recording');
    } catch (err: any) {
      const message =
        err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError'
          ? '마이크를 찾을 수 없습니다. 마이크를 연결해주세요.'
          : err?.name === 'NotAllowedError'
          ? '마이크 권한이 거부되었습니다. 브라우저 설정에서 허용해주세요.'
          : `녹음 시작 실패: ${err?.message || '알 수 없는 오류'}`;
      setToast({ message, visible: true });
    }
  };

  const handleStopRecording = () => {
    audioStream.stopRecording();
    webSpeech.stop();
    stopTimer();
    stoppedAtRef.current = Date.now();
    setInterimText('');
    setRecordingState('post_recording');
  };

  const handleResumeRecording = async () => {
    const gapSeconds = stoppedAtRef.current
      ? (Date.now() - stoppedAtRef.current) / 1000
      : 0;
    audioStream.sendResumed(gapSeconds);
    await audioStream.startRecording();
    webSpeech.start();
    startTimer();
    setRecordingState('recording');
  };

  const handleNext = () => {
    if (recordingState === 'recording') {
      handleStopRecording();
    }
    audioStream.disconnect();
    navigate('/processing');
  };

  const formatTs = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <WizardLayout>
      <div className="max-w-2xl mx-auto flex flex-col" style={{ minHeight: 'calc(100vh - 120px)' }}>
        {/* 상태바 */}
        <div className="flex items-center gap-3 py-3 px-4 bg-bg-subtle rounded-lg mb-4">
          {/* Recording dot */}
          <div
            className={`w-2.5 h-2.5 rounded-full shrink-0 ${
              recordingState === 'recording'
                ? 'bg-recording animate-pulse'
                : 'bg-text-tertiary'
            }`}
          />
          {/* Status text */}
          <span className="text-sm text-text-secondary">
            {recordingState === 'idle' && '녹음 대기'}
            {recordingState === 'recording' && '녹음 중'}
            {recordingState === 'post_recording' && '녹음 중지됨'}
          </span>
          {/* Timer */}
          <span className="text-sm font-mono text-text-secondary">
            {formatTimestamp(elapsed)}
          </span>
          {/* Language */}
          <span className="text-xs text-text-tertiary ml-auto">
            {session?.metadata.language || 'ko-KR'}
          </span>
        </div>

        {/* 회의 정보 요약 */}
        <div className="px-4 py-3 border border-border rounded-lg mb-4">
          <div className="flex items-center gap-4 text-sm">
            <span className="font-medium text-text">
              {session?.metadata.title || '제목 없음'}
            </span>
            {session?.metadata.participants && session.metadata.participants.length > 0 && (
              <span className="text-text-secondary">
                {session.metadata.participants.join(', ')}
              </span>
            )}
          </div>
        </div>

        {/* 컨트롤 바 */}
        <div className="flex items-center gap-3 mb-4">
          {recordingState === 'idle' && (
            <button
              onClick={handleStartRecording}
              className="flex items-center gap-2 px-5 py-2.5 bg-success text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity cursor-pointer"
            >
              <Mic size={16} />
              녹음 시작
            </button>
          )}
          {recordingState === 'recording' && (
            <button
              onClick={handleStopRecording}
              className="flex items-center gap-2 px-5 py-2.5 bg-recording text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity cursor-pointer"
            >
              <Square size={14} />
              중지
            </button>
          )}
          {recordingState === 'post_recording' && (
            <button
              onClick={handleResumeRecording}
              className="flex items-center gap-2 px-5 py-2.5 bg-success text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity cursor-pointer"
            >
              <Mic size={16} />
              녹음 재개
            </button>
          )}
        </div>

        {/* 실시간 전사 영역 */}
        <div className="flex-1 border border-border rounded-lg p-4 overflow-y-auto mb-4 min-h-[300px]">
          {blocks.length === 0 && !interimText && (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-text-tertiary">
                {recordingState === 'idle'
                  ? '녹음을 시작하면 전사 내용이 여기에 표시됩니다'
                  : '음성을 인식하고 있습니다...'}
              </p>
            </div>
          )}

          <div className="space-y-1">
            {blocks.map((block) => (
              <div
                key={block.block_id}
                className="group flex gap-2 py-1.5 hover:bg-bg-subtle rounded px-2 -mx-2"
              >
                {/* Timestamp */}
                <span className="text-xs font-mono text-text-tertiary shrink-0 pt-0.5 w-12">
                  {formatTs(block.timestamp_start)}
                </span>

                {/* Edited indicator */}
                {block.is_edited && (
                  <Pencil size={12} className="text-primary shrink-0 mt-1" />
                )}

                {editingBlockId === block.block_id ? (
                  /* Editing mode */
                  <textarea
                    ref={editInputRef}
                    value={editingText}
                    onChange={(e) => setEditingText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleEditConfirm();
                      }
                      if (e.key === 'Escape') {
                        handleEditCancel();
                      }
                    }}
                    onBlur={handleEditConfirm}
                    className="flex-1 text-sm text-text leading-relaxed border border-primary rounded px-2 py-0.5 resize-none focus:outline-none bg-bg"
                    rows={Math.max(1, Math.ceil(editingText.length / 60))}
                  />
                ) : (
                  /* Read mode — double-click to edit */
                  <p
                    className="flex-1 text-sm text-text leading-relaxed cursor-text select-text"
                    onDoubleClick={() => handleEditStart(block)}
                  >
                    {block.text}
                  </p>
                )}
              </div>
            ))}

            {/* Interim (회색) */}
            {interimText && (
              <div className="flex gap-2 py-1.5 px-2 -mx-2">
                <span className="text-xs font-mono text-text-tertiary shrink-0 pt-0.5 w-12">
                  ···
                </span>
                <p className="text-sm text-text-tertiary italic leading-relaxed">
                  {interimText}
                </p>
              </div>
            )}
          </div>
          <div ref={transcriptEndRef} />
        </div>

        {/* 다음 단계 */}
        <div className="flex justify-end pb-2">
          <button
            onClick={handleNext}
            disabled={recordingState === 'idle' || editingBlockId !== null}
            className="flex items-center gap-1.5 px-6 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-hover transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
          >
            다음 단계
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <Toast
        message={toast.message}
        visible={toast.visible}
        onHide={() => setToast((prev) => ({ ...prev, visible: false }))}
      />
    </WizardLayout>
  );
}
