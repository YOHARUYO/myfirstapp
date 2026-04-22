import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, Square, ChevronRight, Pencil, ChevronDown, ChevronUp } from 'lucide-react';
import WizardLayout from '../components/wizard/WizardLayout';
import TagInput from '../components/common/TagInput';
import Toast from '../components/common/Toast';
import { useWizardStore } from '../stores/wizardStore';
import { useSessionStore } from '../stores/sessionStore';
import { useTimer } from '../hooks/useTimer';
import { useAudioStream } from '../hooks/useAudioStream';
import { useWebSpeech } from '../hooks/useWebSpeech';
import { useSilentAudio } from '../hooks/useSilentAudio';
import { useVisibility } from '../hooks/useVisibility';
import { formatTimestamp } from '../utils/formatTime';
import { updateMetadata, stopRecording, resumeRecording, getSession } from '../api/sessions';
import api from '../api/client';
import { listParticipants, listLocations, addParticipant, addLocation } from '../api/contacts';
import type { Block, ImportanceLevel } from '../types';
import type { Contact } from '../api/contacts';

type RecordingState = 'idle' | 'recording' | 'post_recording';

const IMPORTANCE_COLORS: Record<string, string> = {
  high: 'bg-importance-high',
  medium: 'bg-importance-medium',
  low: 'bg-importance-low',
};

const IMPORTANCE_OPTIONS: { level: ImportanceLevel | null; color: string; label: string }[] = [
  { level: 'high', color: 'bg-importance-high', label: '상' },
  { level: 'medium', color: 'bg-importance-medium', label: '중' },
  { level: 'low', color: 'bg-importance-low', label: '하' },
  { level: 'lowest', color: 'bg-transparent border border-border', label: '최하' },
  { level: null, color: 'bg-bg border border-border', label: '미지정' },
];

interface GapMarker {
  type: 'gap';
  after_block_id: string;
  gap_seconds: number;
}

export default function Recording() {
  const navigate = useNavigate();
  const setStep = useWizardStore((s) => s.setStep);
  const session = useSessionStore((s) => s.session);
  const setSession = useSessionStore((s) => s.setSession);
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [gaps, setGaps] = useState<GapMarker[]>([]);
  const [interimText, setInterimText] = useState('');
  const [toast, setToast] = useState({ message: '', visible: false });
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [editingOriginalText, setEditingOriginalText] = useState('');
  const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null);
  const [micLevel, setMicLevel] = useState(0);
  const [popoverBlockId, setPopoverBlockId] = useState<string | null>(null);
  const [infoExpanded, setInfoExpanded] = useState(true);

  // Editable metadata fields
  const [metaTitle, setMetaTitle] = useState('');
  const [metaParticipants, setMetaParticipants] = useState<string[]>([]);
  const [metaLocation, setMetaLocation] = useState('');
  const [metaLanguage, setMetaLanguage] = useState('ko-KR');
  const [contactParticipants, setContactParticipants] = useState<Contact[]>([]);
  const [contactLocations, setContactLocations] = useState<Contact[]>([]);

  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const stoppedAtRef = useRef<number | null>(null);
  const editInputRef = useRef<HTMLTextAreaElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const { elapsed, start: startTimer, stop: stopTimer, getElapsedSeconds } = useTimer();
  const silentAudio = useSilentAudio();

  useEffect(() => {
    setStep(3);
    listParticipants().then(setContactParticipants).catch(() => {});
    listLocations().then(setContactLocations).catch(() => {});
  }, [setStep]);

  // Block browser back during recording
  useEffect(() => {
    if (recordingState !== 'recording') return;
    const handler = () => {
      window.history.pushState(null, '', window.location.href);
    };
    window.history.pushState(null, '', window.location.href);
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, [recordingState]);

  useEffect(() => {
    if (!session) {
      navigate('/setup');
    } else {
      setMetaTitle(session.metadata.title);
      setMetaParticipants(session.metadata.participants);
      setMetaLocation(session.metadata.location || '');
      setMetaLanguage(session.metadata.language);
    }
  }, [session, navigate]);

  const sessionId = session?.session_id || '';

  // Save metadata on blur (decisions.md: blur 시 자동 저장)
  const saveMetadata = useCallback(async () => {
    if (!sessionId) return;
    try {
      const updated = await updateMetadata(sessionId, {
        title: metaTitle,
        participants: metaParticipants,
        location: metaLocation || null,
        language: metaLanguage,
      });
      setSession(updated);
    } catch {}
  }, [sessionId, metaTitle, metaParticipants, metaLocation, metaLanguage, setSession]);

  const handleParticipantsChange = (v: string[]) => {
    setMetaParticipants(v);
    v.forEach((name) => {
      if (!contactParticipants.find((c) => c.name === name)) {
        addParticipant(name).then((c) => setContactParticipants((prev) => [...prev, c])).catch(() => {});
      }
    });
    // Save immediately with latest value
    if (sessionId) {
      updateMetadata(sessionId, {
        title: metaTitle,
        participants: v,
        location: metaLocation || null,
        language: metaLanguage,
      }).then((updated) => setSession(updated)).catch(() => {});
    }
  };

  const handleBlockCreated = useCallback(
    (data: { block_id: string; timestamp_start: number; timestamp_end: number }) => {},
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
    onStatusChange: useCallback((message: string) => {
      setToast({ message, visible: true });
    }, []),
  });

  // Background tab: restart Web Speech on tab return
  useVisibility(useCallback(() => {
    if (recordingState === 'recording') {
      const wasDisconnected = !webSpeech.isActive();
      webSpeech.stop();
      // instanceIdRef 방식으로 이전 onend 무효화 — 50ms 후 새 인스턴스 시작
      setTimeout(() => {
        webSpeech.start();
        if (wasDisconnected) {
          setToast({ message: '탭 복귀: 전사를 재연결했습니다. 일부 전사가 누락됐을 수 있습니다.', visible: true });
        }
      }, 50);
    }
  }, [recordingState, webSpeech]));

  // Auto-scroll (skip when editing)
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

  // Close popover on outside click
  useEffect(() => {
    if (!popoverBlockId) return;
    const close = () => setPopoverBlockId(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [popoverBlockId]);

  // Mic level meter (#1: AudioContext 리소스 관리)
  const startMicLevel = useCallback((stream: MediaStream) => {
    try {
      // Close previous AudioContext if exists
      audioCtxRef.current?.close().catch(() => {});
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        setMicLevel(Math.min(avg / 128, 1));
        animFrameRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {}
  }, []);

  const stopMicLevel = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = null;
    analyserRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setMicLevel(0);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  // Importance tagging
  const setBlockImportance = useCallback((blockId: string, importance: ImportanceLevel | null) => {
    setBlocks((prev) =>
      prev.map((b) =>
        b.block_id === blockId
          ? { ...b, importance, importance_source: importance ? 'user' : null }
          : b
      )
    );
    setPopoverBlockId(null);
  }, []);

  // Keyboard: importance (1/2/3/4/0), navigation (↑/↓), Enter to edit
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (editingBlockId) return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;

      const importanceMap: Record<string, ImportanceLevel | null> = {
        '1': 'high', '2': 'medium', '3': 'low', '4': 'lowest', '0': null,
      };

      if (e.key in importanceMap && focusedBlockId) {
        e.preventDefault();
        setBlockImportance(focusedBlockId, importanceMap[e.key]);
        return;
      }

      if (e.key === 'Enter' && focusedBlockId) {
        e.preventDefault();
        const block = blocks.find((b) => b.block_id === focusedBlockId);
        if (block) handleEditStart(block);
        return;
      }

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedBlockId((prev) => {
          const idx = blocks.findIndex((b) => b.block_id === prev);
          if (e.key === 'ArrowDown') return blocks[Math.min(idx + 1, blocks.length - 1)]?.block_id ?? prev;
          return blocks[Math.max(idx - 1, 0)]?.block_id ?? prev;
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editingBlockId, focusedBlockId, blocks, setBlockImportance]);

  // #3: 편집 진입은 더블클릭 (decisions.md)
  const handleEditStart = useCallback((block: Block) => {
    setEditingBlockId(block.block_id);
    setEditingText(block.text);
    setEditingOriginalText(block.text);
    setFocusedBlockId(block.block_id);
  }, []);

  const handleEditConfirm = useCallback(async () => {
    if (!editingBlockId) return;
    const textChanged = editingText !== editingOriginalText;
    setBlocks((prev) =>
      prev.map((b) =>
        b.block_id === editingBlockId
          ? {
              ...b,
              text: editingText,
              is_edited: textChanged ? true : b.is_edited,
              source: textChanged ? 'user_edit' as const : b.source,
            }
          : b
      )
    );
    // 서버에 저장 (변경된 경우만)
    if (textChanged && session) {
      try {
        await api.patch(`/sessions/${session.session_id}/blocks/${editingBlockId}`, { text: editingText });
      } catch {}
    }
    setEditingBlockId(null);
    setEditingText('');
    setEditingOriginalText('');
  }, [editingBlockId, editingText, editingOriginalText, session]);

  const handleSplit = useCallback(async (blockId: string, cursorPos: number) => {
    if (!session) return;
    try {
      await api.post(`/sessions/${session.session_id}/blocks/${blockId}/split`, { cursor_position: cursorPos });
      const updated = await getSession(session.session_id);
      setSession(updated);
      setBlocks(updated.blocks);
      setEditingBlockId(null);
    } catch {}
  }, [session, setSession]);

  const handleMerge = useCallback(async (blockId: string, direction: 'prev' | 'next') => {
    if (!session) return;
    try {
      await api.post(`/sessions/${session.session_id}/blocks/${blockId}/merge`, { direction });
      const updated = await getSession(session.session_id);
      setSession(updated);
      setBlocks(updated.blocks);
    } catch {}
  }, [session, setSession]);

  const handleEditCancel = useCallback(() => {
    setEditingBlockId(null);
    setEditingText('');
    setEditingOriginalText('');
  }, []);

  // Interim 클릭 → 강제 확정 (decisions.md: recognition.stop → 현재 interim이 final로 확정 → onend에서 자동 재시작)
  const handleInterimForceFinalize = useCallback(() => {
    if (recordingState !== 'recording') return;
    webSpeech.flush();
  }, [recordingState, webSpeech]);

  const handleStartRecording = async () => {
    try {
      await audioStream.connect();
      const stream = await audioStream.startRecording();
      if (stream) startMicLevel(stream);
      webSpeech.start();
      startTimer();
      silentAudio.start();
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

  const handleStopRecording = async () => {
    webSpeech.stop();
    stopTimer();
    stopMicLevel();
    silentAudio.stop();
    await audioStream.stopRecording(); // Wait for last chunk to be sent
    stoppedAtRef.current = Date.now();
    setInterimText('');
    setRecordingState('post_recording');
    // Sync status to server
    if (session) {
      try { await stopRecording(session.session_id); } catch {}
    }
  };

  const handleResumeRecording = async () => {
    try {
      const gapSeconds = stoppedAtRef.current ? (Date.now() - stoppedAtRef.current) / 1000 : 0;
      const lastBlock = blocks[blocks.length - 1];
      if (lastBlock && gapSeconds > 0) {
        setGaps((prev) => [...prev, { type: 'gap', after_block_id: lastBlock.block_id, gap_seconds: gapSeconds }]);
      }
      // Sync status to server
      if (session) await resumeRecording(session.session_id);
      audioStream.sendResumed(gapSeconds);
      const stream = await audioStream.startRecording();
      if (stream) startMicLevel(stream);
      webSpeech.start();
      startTimer();
      setRecordingState('recording');
    } catch (err: any) {
      setToast({ message: `녹음 재개 실패: ${err?.message || '알 수 없는 오류'}`, visible: true });
    }
  };

  const handleNext = async () => {
    if (recordingState === 'recording') {
      await handleStopRecording();
    }
    audioStream.disconnect();
    navigate('/processing');
  };

  const formatTs = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const formatGap = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)}초`;
    return `${Math.round(seconds / 60)}분`;
  };

  const renderItems: Array<Block | GapMarker> = [];
  for (const block of blocks) {
    renderItems.push(block);
    const gap = gaps.find((g) => g.after_block_id === block.block_id);
    if (gap) renderItems.push(gap);
  }

  return (
    <WizardLayout
      prevRoute="/setup"
      prevDisabled={recordingState === 'recording'}
      homeModalMessage={recordingState === 'recording' ? '녹음을 중지하고 홈으로 돌아가시겠어요?' : undefined}
      onBeforeHome={recordingState === 'recording' ? () => handleStopRecording() : undefined}
    >
      <div className="max-w-3xl mx-auto flex flex-col pt-20 px-6 md:px-10" style={{ minHeight: 'calc(100vh - 120px)' }}>
        {/* 상태바 (sticky top) */}
        <div className="flex items-center gap-3 mb-4 sticky top-0 z-10 bg-bg py-3 -mx-6 px-6 md:-mx-10 md:px-10">
          <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${recordingState === 'recording' ? 'bg-recording animate-pulse' : 'bg-text-tertiary'}`} />
          <span className="text-xs font-medium text-text-secondary">
            {recordingState === 'idle' && '녹음 대기'}
            {recordingState === 'recording' && '녹음 중'}
            {recordingState === 'post_recording' && '녹음 중지됨'}
          </span>
          <span className="text-xs font-mono text-text-secondary">{formatTimestamp(elapsed)}</span>
          {recordingState === 'recording' && (
            <div className="w-16 h-1.5 bg-border rounded-full overflow-hidden shrink-0">
              <div className="h-full bg-success rounded-full transition-all duration-75" style={{ width: `${micLevel * 100}%` }} />
            </div>
          )}
          <span className="text-xs text-text-tertiary ml-auto">{session?.metadata.language || 'ko-KR'}</span>
        </div>

        {/* #1: 회의 정보 요약 (편집 가능, 접기/펼치기) */}
        <div className="bg-bg-subtle rounded-xl mb-4">
          <button
            onClick={() => setInfoExpanded((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-3 cursor-pointer"
          >
            <span className="text-sm font-medium text-text">{metaTitle || '제목 없음'}</span>
            {infoExpanded ? <ChevronUp size={16} className="text-text-tertiary" /> : <ChevronDown size={16} className="text-text-tertiary" />}
          </button>
          {infoExpanded && (
            <div className="px-5 pb-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">제목</label>
                <input
                  value={metaTitle}
                  onChange={(e) => setMetaTitle(e.target.value)}
                  onBlur={saveMetadata}
                  className="w-full bg-bg rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">참여자</label>
                <TagInput
                  values={metaParticipants}
                  onChange={(v) => { handleParticipantsChange(v); }}
                  suggestions={contactParticipants.map((c) => c.name)}
                  placeholder="이름 입력 후 Enter"
                  highlighted={false}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">장소</label>
                <input
                  value={metaLocation}
                  onChange={(e) => setMetaLocation(e.target.value)}
                  onBlur={saveMetadata}
                  list="rec-location-suggestions"
                  className="w-full bg-bg rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                />
                <datalist id="rec-location-suggestions">
                  {contactLocations.map((l) => <option key={l.id} value={l.name} />)}
                </datalist>
              </div>
            </div>
          )}
        </div>

        {/* 컨트롤 바 (sticky bottom) */}
        <div className="flex items-center gap-3 mb-6 sticky bottom-0 z-10 bg-bg py-3 -mx-6 px-6 md:-mx-10 md:px-10">
          {recordingState === 'idle' && (
            <button onClick={handleStartRecording} className="flex items-center gap-2 px-5 py-3 bg-success text-white rounded-lg text-[15px] font-semibold hover:opacity-90 transition-opacity cursor-pointer">
              <Mic size={20} /> 녹음 시작
            </button>
          )}
          {recordingState === 'recording' && (
            <button onClick={handleStopRecording} className="flex items-center gap-2 px-5 py-3 bg-recording text-white rounded-lg text-[15px] font-semibold hover:opacity-90 transition-opacity cursor-pointer">
              <Square size={16} /> 중지
            </button>
          )}
          {recordingState === 'post_recording' && (
            <button onClick={handleResumeRecording} className="flex items-center gap-2 px-5 py-3 bg-success text-white rounded-lg text-[15px] font-semibold hover:opacity-90 transition-opacity cursor-pointer">
              <Mic size={20} /> 녹음 재개
            </button>
          )}
        </div>

        {/* 전사 영역 */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden mb-6 min-h-[300px]">
          {blocks.length === 0 && !interimText && (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-text-tertiary">
                {recordingState === 'idle' ? '녹음을 시작하면 전사 내용이 여기에 표시됩니다' : '음성을 인식하고 있습니다...'}
              </p>
            </div>
          )}

          <div className="space-y-3">
            {renderItems.map((item) => {
              if ('type' in item && item.type === 'gap') {
                return (
                  <div key={`gap-${item.after_block_id}`} className="flex items-center gap-2 py-1 text-xs text-text-tertiary">
                    <div className="flex-1 border-t border-border-light" />
                    <span>⏸ {formatGap(item.gap_seconds)} 경과</span>
                    <div className="flex-1 border-t border-border-light" />
                  </div>
                );
              }

              const block = item as Block;
              const isFocused = focusedBlockId === block.block_id;

              return (
                <div
                  key={block.block_id}
                  className={`group flex items-start gap-1.5 py-2 rounded-lg px-3 -mx-3 transition-colors ${isFocused ? 'bg-bg-subtle' : 'hover:bg-bg-subtle'}`}
                  onClick={() => setFocusedBlockId(block.block_id)}
                >
                  {/* 화자 슬롯 — MVP: 빈 원 */}
                  <div className="w-5 h-5 rounded-full border border-border shrink-0 mt-0.5" />

                  {/* #2: 중요도 바 — 클릭 시 팝오버 */}
                  <div className="relative shrink-0 self-stretch flex items-stretch">
                    <div
                      className={`w-1 rounded-full cursor-pointer ${
                        block.importance && block.importance !== 'lowest' ? IMPORTANCE_COLORS[block.importance] : 'bg-border-light hover:bg-border'
                      }`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setPopoverBlockId(popoverBlockId === block.block_id ? null : block.block_id);
                      }}
                    />
                    {popoverBlockId === block.block_id && (
                      <div className="absolute left-3 top-0 z-20 flex gap-1 bg-bg rounded-lg shadow-lg p-1.5 border border-border" onClick={(e) => e.stopPropagation()}>
                        {IMPORTANCE_OPTIONS.map((opt) => (
                          <button
                            key={opt.label}
                            onClick={() => setBlockImportance(block.block_id, opt.level)}
                            className={`w-6 h-6 rounded-full ${opt.color} cursor-pointer hover:ring-2 hover:ring-primary/30 transition-all`}
                            title={opt.label}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Timestamp */}
                  <span className="text-xs font-mono text-text-tertiary shrink-0 pt-0.5 w-12">{formatTs(block.timestamp_start)}</span>

                  {/* Edited indicator */}
                  {block.is_edited && <Pencil size={12} className="text-primary shrink-0 mt-1" />}

                  {editingBlockId === block.block_id ? (
                    <textarea
                      ref={editInputRef}
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.shiftKey) return; // 줄바꿈
                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                          e.preventDefault();
                          handleSplit(block.block_id, e.currentTarget.selectionStart);
                          return;
                        }
                        if (e.key === 'Enter') { e.preventDefault(); handleEditConfirm(); return; }
                        if (e.key === 'Escape') { handleEditCancel(); return; }
                        if (e.key === 'Backspace' && e.currentTarget.selectionStart === 0) {
                          const idx = blocks.findIndex((b) => b.block_id === block.block_id);
                          if (idx > 0) { e.preventDefault(); handleMerge(block.block_id, 'prev'); }
                          return;
                        }
                        if (e.key === 'Delete' && e.currentTarget.selectionStart === editingText.length) {
                          const idx = blocks.findIndex((b) => b.block_id === block.block_id);
                          if (idx < blocks.length - 1) { e.preventDefault(); handleMerge(block.block_id, 'next'); }
                        }
                      }}
                      onBlur={handleEditConfirm}
                      className="flex-1 text-[15px] text-text leading-relaxed bg-bg ring-2 ring-primary rounded-lg px-3 py-1 resize-none focus:outline-none"
                      rows={Math.max(1, Math.ceil(editingText.length / 60))}
                    />
                  ) : (
                    /* 더블클릭=편집 */
                    <p
                      className="flex-1 text-[15px] text-text leading-relaxed cursor-text select-text"
                      onDoubleClick={() => handleEditStart(block)}
                    >
                      {block.text}
                    </p>
                  )}
                </div>
              );
            })}

            {/* Interim — 싱글클릭으로 강제 확정 */}
            {interimText && (
              <div
                className="flex items-start gap-1.5 py-2 px-3 -mx-3 border-l-2 border-primary/30 cursor-pointer hover:bg-bg-subtle rounded-lg transition-colors"
                onClick={handleInterimForceFinalize}
                title="클릭하여 현재 텍스트를 확정"
              >
                <div className="w-5 h-5 rounded-full border border-border-light shrink-0 mt-0.5" />
                <div className="w-1 self-stretch shrink-0" />
                <span className="text-xs font-mono text-text-tertiary shrink-0 pt-0.5 w-12">{formatTs(getElapsedSeconds())}</span>
                <p className="text-[15px] text-text/60 leading-relaxed">{interimText}</p>
              </div>
            )}
          </div>
          <div ref={transcriptEndRef} />
        </div>

        {/* #4: post_recording에서만 활성 */}
        <div className="flex justify-end pb-4">
          <button
            onClick={handleNext}
            disabled={recordingState !== 'post_recording' || editingBlockId !== null}
            className="flex items-center gap-1.5 px-5 py-3 bg-primary text-white text-[15px] font-semibold rounded-lg hover:bg-primary-hover transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
          >
            다음 단계
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <Toast message={toast.message} visible={toast.visible} onHide={() => setToast((prev) => ({ ...prev, visible: false }))} />
    </WizardLayout>
  );
}
