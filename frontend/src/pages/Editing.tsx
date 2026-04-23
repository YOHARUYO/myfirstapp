import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronRight, ChevronDown, ChevronUp, Pencil, Search, Replace,
  Undo2, Redo2, Eye, EyeOff, Keyboard, Sparkles, X, Loader2,
} from 'lucide-react';
import WizardLayout from '../components/wizard/WizardLayout';
import TagInput from '../components/common/TagInput';
import Toast from '../components/common/Toast';
import Modal from '../components/common/Modal';
import { useWizardStore } from '../stores/wizardStore';
import { useSessionStore } from '../stores/sessionStore';
import { getSession, updateMetadata, retagBlocks } from '../api/sessions';
import { listParticipants, listLocations } from '../api/contacts';
import api from '../api/client';
import type { Block, ImportanceLevel } from '../types';
import type { Contact } from '../api/contacts';

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

import { formatTs } from '../utils/formatTime';

export default function Editing() {
  const navigate = useNavigate();
  const setStep = useWizardStore((s) => s.setStep);
  const setEditedAfterSummary = useWizardStore((s) => s.setEditedAfterSummary);
  const session = useSessionStore((s) => s.session);
  const setSession = useSessionStore((s) => s.setSession);
  const editMode = useSessionStore((s) => s.editMode);

  // API base path depends on editMode
  const apiBase = editMode === 'meeting' ? '/meetings' : '/sessions';

  const [blocks, setBlocks] = useState<Block[]>([]);
  const [showCoreOnly, setShowCoreOnly] = useState(false);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [editingOriginalText, setEditingOriginalText] = useState('');
  const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null);
  const [popoverBlockId, setPopoverBlockId] = useState<string | null>(null);
  const [toast, setToast] = useState({ message: '', visible: false });
  const [cheatlineVisible, setCheatlineVisible] = useState(false);

  // Search/Replace
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [searchCaseSensitive, setSearchCaseSensitive] = useState(false);
  const [searchWholeWord, setSearchWholeWord] = useState(false);
  const [searchSkipEdited, setSearchSkipEdited] = useState(true);

  // Undo/Redo stacks
  const [undoStack, setUndoStack] = useState<Block[][]>([]);
  const [redoStack, setRedoStack] = useState<Block[][]>([]);

  // Metadata
  const [metaExpanded, setMetaExpanded] = useState(true);
  const [metaTitle, setMetaTitle] = useState('');
  const [metaParticipants, setMetaParticipants] = useState<string[]>([]);
  const [metaLocation, setMetaLocation] = useState('');
  const [contactParticipants, setContactParticipants] = useState<Contact[]>([]);
  const [contactLocations, setContactLocations] = useState<Contact[]>([]);

  // Shortcut help
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);

  const editInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setStep(5);
    listParticipants().then(setContactParticipants).catch(() => {});
    listLocations().then(setContactLocations).catch(() => {});
  }, [setStep]);

  // Load blocks from server on mount (ensures latest data from step 3)
  useEffect(() => {
    if (!session) return;
    getSession(session.session_id).then((updated) => {
      setSession(updated);
      setBlocks(updated.blocks);
      setMetaTitle(updated.metadata.title);
      setMetaParticipants(updated.metadata.participants);
      setMetaLocation(updated.metadata.location || '');
    }).catch(() => {
      // Fallback to store data
      setBlocks(session.blocks);
      setMetaTitle(session.metadata.title);
      setMetaParticipants(session.metadata.participants);
      setMetaLocation(session.metadata.location || '');
    });
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  // Close popover on outside click
  useEffect(() => {
    if (!popoverBlockId) return;
    const handler = () => setPopoverBlockId(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [popoverBlockId]);

  const showToast = (message: string) => setToast({ message, visible: true });

  // Undo/Redo
  const pushUndo = useCallback((current: Block[]) => {
    setUndoStack((prev) => [...prev.slice(-49), current.map((b) => ({ ...b }))]);
    setRedoStack([]);
  }, []);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setRedoStack((r) => [...r, blocks.map((b) => ({ ...b }))]);
    setUndoStack((u) => u.slice(0, -1));
    setBlocks(prev);
  }, [undoStack, blocks]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack((u) => [...u, blocks.map((b) => ({ ...b }))]);
    setRedoStack((r) => r.slice(0, -1));
    setBlocks(next);
  }, [redoStack, blocks]);

  // Block importance
  const setBlockImportance = async (blockId: string, level: ImportanceLevel | null) => {
    const prevBlock = blocks.find((b) => b.block_id === blockId);
    const prevImportance = prevBlock?.importance ?? null;
    const prevSource = prevBlock?.importance_source ?? null;

    pushUndo(blocks);
    setBlocks((prev) =>
      prev.map((b) =>
        b.block_id === blockId
          ? { ...b, importance: level, importance_source: level ? 'user' : null }
          : b
      )
    );
    setPopoverBlockId(null);
    if (session) {
      try {
        await api.patch(`${apiBase}/${session.session_id}/blocks/${blockId}/importance`, { importance: level });
      } catch {
        setBlocks((prev) =>
          prev.map((b) =>
            b.block_id === blockId
              ? { ...b, importance: prevImportance, importance_source: prevSource }
              : b
          )
        );
        showToast('중요도 저장에 실패했습니다');
      }
    }
  };

  // Edit start
  const handleEditStart = (block: Block) => {
    setEditingBlockId(block.block_id);
    setEditingText(block.text);
    setEditingOriginalText(block.text);
    setCheatlineVisible(true);
    setTimeout(() => editInputRef.current?.focus(), 0);
  };

  // Edit confirm
  const handleEditConfirm = async () => {
    if (!editingBlockId) return;
    const changed = editingText !== editingOriginalText;
    if (changed) {
      pushUndo(blocks);
      setBlocks((prev) =>
        prev.map((b) =>
          b.block_id === editingBlockId
            ? { ...b, text: editingText, is_edited: true, source: 'user_edit' as const }
            : b
        )
      );
      setEditedAfterSummary();
      if (session) {
        await api.patch(`${apiBase}/${session.session_id}/blocks/${editingBlockId}`, { text: editingText });
      }
    }
    setEditingBlockId(null);
    setEditingText('');
    setEditingOriginalText('');
    setCheatlineVisible(false);
  };

  const handleEditCancel = () => {
    setEditingBlockId(null);
    setEditingText('');
    setEditingOriginalText('');
    setCheatlineVisible(false);
  };

  // Block split (Shift+Enter)
  const handleSplit = async (blockId: string, cursorPos: number) => {
    if (!session) return;
    pushUndo(blocks);
    try {
      const res = await api.post(`${apiBase}/${session.session_id}/blocks/${blockId}/split`, {
        cursor_position: cursorPos,
      });
      // Reload blocks
      const updated = await getSession(session.session_id);
      setSession(updated);
      setBlocks(updated.blocks);
      setEditingBlockId(null);
      setCheatlineVisible(false);
    } catch {
      showToast('분할에 실패했습니다');
    }
  };

  // Block merge
  const handleMerge = async (blockId: string, direction: 'next' | 'prev') => {
    if (!session) return;
    pushUndo(blocks);
    try {
      await api.post(`${apiBase}/${session.session_id}/blocks/${blockId}/merge`, { direction });
      const updated = await getSession(session.session_id);
      setSession(updated);
      setBlocks(updated.blocks);
    } catch {
      showToast('병합에 실패했습니다');
    }
  };

  // Search/Replace
  const handleSearchReplace = async () => {
    if (!session || !searchText) return;
    pushUndo(blocks);
    try {
      const res = await api.post(`${apiBase}/${session.session_id}/blocks/search-replace`, {
        search: searchText,
        replace: replaceText,
        case_sensitive: searchCaseSensitive,
        whole_word: searchWholeWord,
        skip_edited_blocks: searchSkipEdited,
      });
      const data = res.data;
      if (data.replaced_count > 0) {
        const updated = await getSession(session.session_id);
        setSession(updated);
        setBlocks(updated.blocks);
        showToast(`${data.replaced_count}건 치환 완료${data.skipped_locked_count > 0 ? ` (잠금 ${data.skipped_locked_count}건 건너뜀)` : ''}`);
      } else {
        showToast('일치하는 항목이 없습니다');
      }
    } catch {
      showToast('치환에 실패했습니다');
    }
  };

  // AI re-tagging
  const [retagging, setRetagging] = useState(false);
  const handleRetag = async () => {
    if (!session) return;
    setRetagging(true);
    pushUndo(blocks);
    try {
      const res = await retagBlocks(session.session_id);
      const updated = await getSession(session.session_id);
      setSession(updated);
      setBlocks(updated.blocks);
      showToast(`${res.tagged_count}개 블록 태깅 완료`);
    } catch {
      showToast('AI 태깅에 실패했습니다');
    } finally {
      setRetagging(false);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Undo/Redo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
        return;
      }

      // Skip if editing text
      if (editingBlockId) return;

      // Skip if focus is in an input field
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;

      // Importance shortcuts
      if (focusedBlockId && ['1', '2', '3', '4', '0'].includes(e.key)) {
        const map: Record<string, ImportanceLevel | null> = {
          '1': 'high', '2': 'medium', '3': 'low', '4': 'lowest', '0': null,
        };
        setBlockImportance(focusedBlockId, map[e.key]);
        return;
      }

      // Arrow key navigation
      const visibleBlocks = showCoreOnly
        ? blocks.filter((b) => b.importance === 'high' || b.importance === 'medium')
        : blocks;

      if (visibleBlocks.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const idx = focusedBlockId ? visibleBlocks.findIndex((b) => b.block_id === focusedBlockId) : -1;
        const next = Math.min(idx + 1, visibleBlocks.length - 1);
        setFocusedBlockId(visibleBlocks[next].block_id);
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const idx = focusedBlockId ? visibleBlocks.findIndex((b) => b.block_id === focusedBlockId) : -1;
        const prev = Math.max(idx - 1, 0);
        setFocusedBlockId(visibleBlocks[prev].block_id);
      }
      if (e.key === 'Enter' && focusedBlockId && !editingBlockId) {
        const block = blocks.find((b) => b.block_id === focusedBlockId);
        if (block) handleEditStart(block);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [editingBlockId, focusedBlockId, blocks, showCoreOnly, handleUndo, handleRedo]);

  // Metadata save on blur
  const saveMetadata = async (field: string, value: any) => {
    if (!session) return;
    try {
      await updateMetadata(session.session_id, { [field]: value });
    } catch {}
  };

  const [navigating, setNavigating] = useState(false);
  const [skipSummaryModal, setSkipSummaryModal] = useState(false);

  const handleNext = () => {
    setSkipSummaryModal(true);
  };

  const handleGoToSummary = () => {
    setSkipSummaryModal(false);
    setNavigating(true);
    navigate('/summary');
  };

  const handleSkipToSend = () => {
    setSkipSummaryModal(false);
    navigate('/send');
  };

  // Filter blocks for display
  const visibleBlocks = showCoreOnly
    ? blocks.filter((b) => b.importance === 'high' || b.importance === 'medium')
    : blocks;

  // Highlight missing fields (빠른 시작 경로)
  const isMissingParticipants = metaParticipants.length === 0;
  const isMissingLocation = !metaLocation;

  if (!session) {
    return (
      <WizardLayout>
        <div className="pt-20 text-center">
          <p className="text-sm text-text-tertiary">세션 정보가 없습니다</p>
          <button onClick={() => navigate('/')} className="mt-4 text-sm text-primary cursor-pointer">홈으로 돌아가기</button>
        </div>
      </WizardLayout>
    );
  }

  return (
    <WizardLayout
      prevRoute="/recording"
      nextSlot={
        <button
          onClick={handleNext}
          disabled={editingBlockId !== null}
          className="flex items-center gap-1.5 px-5 py-3 bg-primary text-bg text-[15px] font-semibold rounded-lg hover:bg-primary-hover transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
        >
          다음 단계
          <ChevronRight size={16} />
        </button>
      }
    >
      <div className="pt-20">
        {/* Page title */}
        <h1 className="text-[40px] font-bold leading-tight text-text">회의록 편집</h1>
        <p className="text-[13px] text-text-secondary mt-2">블록 편집, 중요도 태깅, 일괄 치환</p>

        {/* Metadata section */}
        <div className="mt-12 bg-bg-subtle rounded-xl p-6">
          <button
            onClick={() => setMetaExpanded(!metaExpanded)}
            className="flex items-center gap-2 text-[15px] font-medium text-text-secondary cursor-pointer"
          >
            회의 정보
            {metaExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {metaExpanded && (
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-text-secondary block mb-1">제목</label>
                <input
                  value={metaTitle}
                  onChange={(e) => setMetaTitle(e.target.value)}
                  onBlur={() => saveMetadata('title', metaTitle)}
                  className="w-full bg-bg rounded-lg px-4 py-3 text-[15px] ring-1 ring-border-light focus:ring-2 focus:ring-primary focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-text-secondary block mb-1">참여자</label>
                <div className={isMissingParticipants ? 'rounded-lg ring-2 ring-warning/30' : ''}>
                  <TagInput
                    values={metaParticipants}
                    onChange={(v) => { setMetaParticipants(v); saveMetadata('participants', v); }}
                    suggestions={contactParticipants.map((c) => c.name)}
                    placeholder="참여자 입력"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-text-secondary block mb-1">장소</label>
                <input
                  value={metaLocation}
                  onChange={(e) => setMetaLocation(e.target.value)}
                  onBlur={() => saveMetadata('location', metaLocation)}
                  className={`w-full bg-bg rounded-lg px-4 py-3 text-[15px] ring-1 ring-border-light focus:ring-2 focus:ring-primary focus:outline-none ${isMissingLocation ? 'ring-2 ring-warning/30' : ''}`}
                  placeholder="장소 입력"
                />
              </div>
            </div>
          )}
        </div>

        {/* Toolbar (sticky) */}
        <div className="mt-12 sticky top-0 z-10 bg-bg py-3 border-b border-border-light">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Search/Replace */}
            <button
              onClick={() => setSearchOpen(!searchOpen)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-text bg-bg-subtle rounded-lg hover:bg-bg-hover cursor-pointer"
            >
              <Replace size={14} />
              치환
            </button>

            {/* Core only toggle */}
            <button
              onClick={() => setShowCoreOnly(!showCoreOnly)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg cursor-pointer ${
                showCoreOnly ? 'bg-primary text-white' : 'text-text bg-bg-subtle hover:bg-bg-hover'
              }`}
            >
              {showCoreOnly ? <Eye size={14} /> : <EyeOff size={14} />}
              {showCoreOnly ? '핵심만' : '전체'}
            </button>

            {/* Undo/Redo */}
            <button
              onClick={handleUndo}
              disabled={undoStack.length === 0}
              className="p-1.5 text-text-secondary hover:text-text bg-bg-subtle rounded-lg hover:bg-bg-hover cursor-pointer disabled:opacity-30"
              title="실행 취소 (Ctrl+Z)"
            >
              <Undo2 size={16} />
            </button>
            <button
              onClick={handleRedo}
              disabled={redoStack.length === 0}
              className="p-1.5 text-text-secondary hover:text-text bg-bg-subtle rounded-lg hover:bg-bg-hover cursor-pointer disabled:opacity-30"
              title="다시 실행 (Ctrl+Y)"
            >
              <Redo2 size={16} />
            </button>

            <div className="flex-1" />

            {/* AI re-tag */}
            <button
              onClick={handleRetag}
              disabled={retagging}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-text bg-bg-subtle rounded-lg hover:bg-bg-hover cursor-pointer disabled:opacity-50"
            >
              {retagging ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {retagging ? '태깅 중…' : 'AI 재태깅'}
            </button>

            {/* Shortcut help */}
            <button
              onClick={() => setShortcutHelpOpen(!shortcutHelpOpen)}
              className="p-1.5 text-text-secondary hover:text-text bg-bg-subtle rounded-lg hover:bg-bg-hover cursor-pointer"
              title="단축키 도움말"
            >
              <Keyboard size={16} />
            </button>
          </div>

          {/* Search/Replace bar */}
          {searchOpen && (
            <div className="mt-3 flex flex-wrap items-center gap-2 bg-bg-subtle rounded-xl p-3">
              <input
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="검색어"
                className="flex-1 min-w-[120px] bg-bg rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
              />
              <input
                value={replaceText}
                onChange={(e) => setReplaceText(e.target.value)}
                placeholder="치환어"
                className="flex-1 min-w-[120px] bg-bg rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
              />
              <div className="flex items-center gap-3 text-xs text-text-secondary">
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={searchCaseSensitive} onChange={(e) => setSearchCaseSensitive(e.target.checked)} className="rounded" />
                  대소문자
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={searchWholeWord} onChange={(e) => setSearchWholeWord(e.target.checked)} className="rounded" />
                  단어 단위
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={searchSkipEdited} onChange={(e) => setSearchSkipEdited(e.target.checked)} className="rounded" />
                  잠금 제외
                </label>
              </div>
              <button
                onClick={handleSearchReplace}
                className="px-3 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary-hover cursor-pointer"
              >
                일괄 치환
              </button>
              <button onClick={() => setSearchOpen(false)} className="p-1 text-text-tertiary hover:text-text cursor-pointer">
                <X size={16} />
              </button>
            </div>
          )}

          {/* Shortcut help */}
          {shortcutHelpOpen && (
            <div className="mt-3 bg-bg-subtle rounded-xl p-4 text-sm text-text-secondary space-y-1">
              <p><kbd className="font-mono bg-bg-subtle px-1.5 py-0.5 rounded text-xs">↑↓</kbd> 블록 이동</p>
              <p><kbd className="font-mono bg-bg-subtle px-1.5 py-0.5 rounded text-xs">1/2/3/4/0</kbd> 중요도 (상/중/하/최하/미지정)</p>
              <p><kbd className="font-mono bg-bg-subtle px-1.5 py-0.5 rounded text-xs">Enter</kbd> 편집 진입/확정</p>
              <p><kbd className="font-mono bg-bg-subtle px-1.5 py-0.5 rounded text-xs">Shift+Enter</kbd> 줄바꿈</p>
              <p><kbd className="font-mono bg-bg-subtle px-1.5 py-0.5 rounded text-xs">Ctrl+Enter</kbd> 블록 분할</p>
              <p><kbd className="font-mono bg-bg-subtle px-1.5 py-0.5 rounded text-xs">Esc</kbd> 편집 취소</p>
              <p><kbd className="font-mono bg-bg-subtle px-1.5 py-0.5 rounded text-xs">Ctrl+Z/Y</kbd> 실행 취소/다시 실행</p>
            </div>
          )}
        </div>

        {/* Block list */}
        <div className="mt-6 bg-bg-subtle rounded-xl p-6 space-y-3">
          {visibleBlocks.length === 0 && (
            <div className="py-8 text-center text-sm text-text-tertiary border border-dashed border-border rounded-lg">
              {showCoreOnly ? '상/중 태깅된 블록이 없습니다' : '전사 블록이 없습니다'}
            </div>
          )}

          {visibleBlocks.map((block) => {
            const isFocused = focusedBlockId === block.block_id;

            return (
              <div
                key={block.block_id}
                className={`group flex items-start gap-1.5 py-2 rounded-lg px-3 -mx-3 transition-colors ${
                  isFocused ? 'bg-bg-subtle' : 'hover:bg-bg-subtle'
                }`}
                onClick={() => setFocusedBlockId(block.block_id)}
              >
                {/* Speaker slot */}
                <div className="w-5 h-5 rounded-full border border-border shrink-0 mt-0.5" />

                {/* Importance bar + popover */}
                <div className="relative shrink-0 self-stretch flex items-stretch">
                  <div
                    className={`w-1 rounded-full cursor-pointer ${
                      block.importance && block.importance !== 'lowest'
                        ? IMPORTANCE_COLORS[block.importance]
                        : 'bg-border-light hover:bg-border'
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setPopoverBlockId(popoverBlockId === block.block_id ? null : block.block_id);
                    }}
                  />
                  {popoverBlockId === block.block_id && (
                    <div
                      className="absolute left-3 top-0 z-20 flex gap-1 bg-bg rounded-lg shadow-lg p-1.5 border border-border"
                      onClick={(e) => e.stopPropagation()}
                    >
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
                {/* Timestamp + edited indicator */}
                <div className="shrink-0 w-12 flex flex-col items-start pt-0.5">
                  <span className={`text-xs font-mono ${block.is_edited ? 'text-primary' : 'text-text-tertiary'}`}>
                    {formatTs(block.timestamp_start)}
                  </span>
                  {block.is_edited && <Pencil size={10} className="text-primary mt-0.5" />}
                </div>

                {/* Text or editor */}
                {editingBlockId === block.block_id ? (
                  <textarea
                    ref={editInputRef}
                    value={editingText}
                    onChange={(e) => setEditingText(e.target.value)}
                    onKeyDown={(e) => {
                      // Ctrl+Enter (Cmd+Enter): 블록 분할
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        const pos = e.currentTarget.selectionStart;
                        handleSplit(block.block_id, pos);
                        return;
                      }
                      // Shift+Enter: 줄바꿈 (기본 동작 허용)
                      if (e.key === 'Enter' && e.shiftKey) return;
                      // Enter: 편집 확정
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleEditConfirm();
                      }
                      if (e.key === 'Escape') handleEditCancel();
                      // Backspace at start: 위 블록과 병합 (첫 블록 가드)
                      if (e.key === 'Backspace' && e.currentTarget.selectionStart === 0) {
                        const idx = blocks.findIndex((b) => b.block_id === block.block_id);
                        if (idx > 0) {
                          e.preventDefault();
                          handleMerge(block.block_id, 'prev');
                        }
                      }
                      // Delete at end: 아래 블록과 병합 (마지막 블록 가드)
                      if (e.key === 'Delete' && e.currentTarget.selectionStart === editingText.length) {
                        const idx = blocks.findIndex((b) => b.block_id === block.block_id);
                        if (idx < blocks.length - 1) {
                          e.preventDefault();
                          handleMerge(block.block_id, 'next');
                        }
                      }
                    }}
                    onBlur={handleEditConfirm}
                    className="flex-1 text-[15px] text-text leading-relaxed bg-bg ring-2 ring-primary rounded-lg px-3 py-1 resize-none focus:outline-none"
                    rows={Math.max(1, Math.ceil(editingText.length / 60))}
                  />
                ) : (
                  <p
                    className="flex-1 text-[15px] text-text leading-relaxed cursor-text select-text whitespace-pre-wrap"
                    onDoubleClick={() => handleEditStart(block)}
                  >
                    {block.text}
                  </p>
                )}

                {/* Hover merge menu */}
                {!editingBlockId && isFocused && (
                  <div className="shrink-0 flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {blocks.indexOf(block) > 0 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleMerge(block.block_id, 'prev'); }}
                        className="text-[10px] text-text-tertiary hover:text-text px-1.5 py-0.5 rounded hover:bg-bg-hover cursor-pointer whitespace-nowrap"
                        title="위와 합치기"
                      >
                        ↑ 합치기
                      </button>
                    )}
                    {blocks.indexOf(block) < blocks.length - 1 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleMerge(block.block_id, 'next'); }}
                        className="text-[10px] text-text-tertiary hover:text-text px-1.5 py-0.5 rounded hover:bg-bg-hover cursor-pointer whitespace-nowrap"
                        title="아래와 합치기"
                      >
                        ↓ 합치기
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Cheatline */}
        {cheatlineVisible && (
          <div className="mt-4 text-center text-xs text-text-tertiary">
            Enter=확정 · Shift+Enter=줄바꿈 · Ctrl+Enter=분할 · Esc=취소
          </div>
        )}

        {/* Block stats */}
        <div className="mt-8 flex items-center gap-4 text-xs text-text-tertiary">
          <span>전체 {blocks.length}블록</span>
          <span>상 {blocks.filter((b) => b.importance === 'high').length}</span>
          <span>중 {blocks.filter((b) => b.importance === 'medium').length}</span>
          <span>하 {blocks.filter((b) => b.importance === 'low').length}</span>
          <span>최하 {blocks.filter((b) => b.importance === 'lowest').length}</span>
          <span>미지정 {blocks.filter((b) => !b.importance).length}</span>
        </div>

      </div>

      <Modal open={skipSummaryModal} onClose={() => setSkipSummaryModal(false)}>
        <h3 className="text-lg font-semibold text-text mb-2">다음 단계</h3>
        <p className="text-sm text-text-secondary mb-6">AI 요약을 생성할까요?</p>
        <div className="flex flex-col gap-2">
          <button onClick={handleGoToSummary}
            className="w-full px-4 py-3 text-sm font-semibold text-bg bg-primary rounded-lg hover:bg-primary-hover cursor-pointer">
            요약 생성
          </button>
          <button onClick={handleSkipToSend}
            className="w-full px-4 py-3 text-sm font-medium text-text bg-bg-subtle rounded-lg hover:bg-bg-hover cursor-pointer">
            건너뛰고 전송으로
          </button>
        </div>
      </Modal>

      {navigating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-backdrop">
          <div className="flex flex-col items-center gap-4 bg-bg rounded-xl p-8 shadow-lg">
            <Loader2 size={32} className="text-primary animate-spin" />
            <p className="text-[15px] text-text font-medium">AI 요약 생성 중…</p>
          </div>
        </div>
      )}

      <Toast message={toast.message} visible={toast.visible} onHide={() => setToast((prev) => ({ ...prev, visible: false }))} />
    </WizardLayout>
  );
}
