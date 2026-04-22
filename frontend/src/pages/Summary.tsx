import { useCallback, useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronRight, ChevronDown, ChevronUp, Loader2, RefreshCw,
  Plus, X, Pencil,
} from 'lucide-react';
import WizardLayout from '../components/wizard/WizardLayout';
import Toast from '../components/common/Toast';
import Modal from '../components/common/Modal';
import { useWizardStore } from '../stores/wizardStore';
import { useSessionStore } from '../stores/sessionStore';
import { summarizeSession, getSession, updateSummaryMarkdown, updateActionItems } from '../api/sessions';
import type { ActionItem } from '../types';

import { formatTs } from '../utils/formatTime';

/** Parse summary_markdown into editable blocks by ## / ### headings. */
function parseSummaryBlocks(md: string): { id: string; heading: string; body: string }[] {
  if (!md || !md.trim()) return [];
  const lines = md.split('\n');
  const blocks: { id: string; heading: string; body: string }[] = [];
  let currentHeading = '';
  let currentBody: string[] = [];
  let blockIdx = 0;

  const flush = () => {
    const body = currentBody.join('\n').trim();
    if (currentHeading || body) {
      blocks.push({
        id: `sb_${blockIdx++}`,
        heading: currentHeading,
        body,
      });
    }
    currentHeading = '';
    currentBody = [];
  };

  for (const line of lines) {
    if (line.startsWith('# ')) {
      // Title line — skip (already shown as page title)
      continue;
    }
    if (line.startsWith('## ') || line.startsWith('### ')) {
      flush();
      currentHeading = line;
      currentBody = [];
    } else {
      currentBody.push(line);
    }
  }
  flush();

  return blocks;
}

/** Rebuild markdown from blocks. */
function rebuildMarkdown(title: string, blocks: { heading: string; body: string }[]): string {
  const parts = [title];
  for (const block of blocks) {
    if (block.heading) parts.push(block.heading);
    if (block.body) parts.push(block.body);
    parts.push('');
  }
  return parts.join('\n').trim();
}

export default function Summary() {
  const navigate = useNavigate();
  const setStep = useWizardStore((s) => s.setStep);
  const editedAfterSummary = useWizardStore((s) => s.editedAfterSummary);
  const clearEditedFlag = useWizardStore((s) => s.clearEditedAfterSummary);
  const session = useSessionStore((s) => s.session);
  const setSession = useSessionStore((s) => s.setSession);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summaryBlocks, setSummaryBlocks] = useState<{ id: string; heading: string; body: string }[]>([]);
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [titleLine, setTitleLine] = useState('');
  const [toast, setToast] = useState({ message: '', visible: false });

  // Editing state
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [editingFuId, setEditingFuId] = useState<string | null>(null);
  const [editingFuText, setEditingFuText] = useState('');
  const [cheatlineVisible, setCheatlineVisible] = useState(false);

  // Re-summarize modal
  const [resummarizeModal, setResummarizeModal] = useState(false);

  // Transcript panel
  const [transcriptExpanded, setTranscriptExpanded] = useState(false);

  const editRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setStep(6);
  }, [setStep]);

  // Load or generate summary
  const generateSummary = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const result = await summarizeSession(session.session_id);
      const updated = await getSession(session.session_id);
      setSession(updated);

      // Parse title line
      const firstLine = result.summary_markdown.split('\n')[0] || '';
      setTitleLine(firstLine);
      setSummaryBlocks(parseSummaryBlocks(result.summary_markdown));
      setActionItems(result.action_items);
    } catch (e: any) {
      setError(e?.response?.data?.detail || '요약 생성에 실패했습니다');
    } finally {
      setLoading(false);
    }
  }, [session, setSession]);

  const loadExistingSummary = () => {
    if (!session) return;
    const firstLine = session.summary_markdown.split('\n')[0] || '';
    setTitleLine(firstLine);
    setSummaryBlocks(parseSummaryBlocks(session.summary_markdown));
    setActionItems(session.action_items || []);
  };

  // On mount: generate if no summary exists, else load existing
  useEffect(() => {
    if (!session) return;
    if (session.summary_markdown && editedAfterSummary) {
      setResummarizeModal(true);
    } else if (session.summary_markdown) {
      loadExistingSummary();
    } else {
      generateSummary();
    }
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const showToast = (message: string) => setToast({ message, visible: true });

  // Save summary to server via dedicated APIs
  const saveSummary = async (blocks: typeof summaryBlocks, items: ActionItem[]) => {
    if (!session) return;
    const md = rebuildMarkdown(titleLine, blocks);
    try {
      await updateSummaryMarkdown(session.session_id, md);
      await updateActionItems(session.session_id, items);
    } catch {}
  };

  // Block editing
  const handleBlockEditStart = (block: typeof summaryBlocks[0]) => {
    const fullText = block.heading
      ? `${block.heading}\n${block.body}`
      : block.body;
    setEditingBlockId(block.id);
    setEditingText(fullText);
    setCheatlineVisible(true);
    setTimeout(() => editRef.current?.focus(), 0);
  };

  const handleBlockEditConfirm = () => {
    if (!editingBlockId) return;
    const updated = summaryBlocks.map((b) => {
      if (b.id !== editingBlockId) return b;
      const lines = editingText.split('\n');
      const headingLine = lines.find((l) => l.startsWith('## ') || l.startsWith('### '));
      const bodyLines = lines.filter((l) => l !== headingLine);
      return {
        ...b,
        heading: headingLine || b.heading,
        body: bodyLines.join('\n').trim(),
      };
    });
    setSummaryBlocks(updated);
    saveSummary(updated, actionItems);
    setEditingBlockId(null);
    setEditingText('');
    setCheatlineVisible(false);
  };

  const handleBlockEditCancel = () => {
    setEditingBlockId(null);
    setEditingText('');
    setCheatlineVisible(false);
  };

  // Action item editing
  const handleFuEditStart = (item: ActionItem) => {
    setEditingFuId(item.fu_id);
    const text = [
      item.assignee ? `@${item.assignee}` : '',
      item.task,
      item.deadline ? `~${item.deadline}` : '',
    ].filter(Boolean).join(' ');
    setEditingFuText(text);
  };

  const handleFuEditConfirm = () => {
    if (!editingFuId) return;
    const text = editingFuText.trim();

    let assignee: string | null = null;
    const assigneeMatch = text.match(/[@＠](\S+)/);
    if (assigneeMatch) assignee = assigneeMatch[1];

    let deadline: string | null = null;
    const deadlineMatch = text.match(/[~～](\d{2}\/\d{2}|\d{4}-\d{2}-\d{2})/);
    if (deadlineMatch) deadline = deadlineMatch[1];

    let task = text;
    if (assigneeMatch) task = task.replace(assigneeMatch[0], '').trim();
    if (deadlineMatch) task = task.replace(deadlineMatch[0], '').trim();

    const updated = actionItems.map((item) => {
      if (item.fu_id !== editingFuId) return item;
      return { ...item, task, assignee, deadline };
    });
    setActionItems(updated);
    saveSummary(summaryBlocks, updated);
    setEditingFuId(null);
    setEditingFuText('');
  };

  const handleFuDelete = (fuId: string) => {
    const updated = actionItems.filter((item) => item.fu_id !== fuId);
    setActionItems(updated);
    saveSummary(summaryBlocks, updated);
  };

  const handleFuAdd = () => {
    const newItem: ActionItem = {
      fu_id: `fu_${Date.now()}`,
      assignee: null,
      task: '새 항목',
      deadline: null,
      source_topic: null,
    };
    const updated = [...actionItems, newItem];
    setActionItems(updated);
    setEditingFuId(newItem.fu_id);
    setEditingFuText('새 항목');
  };

  const handleNext = () => {
    navigate('/send');
  };

  // Render markdown-like text as React elements (no dangerouslySetInnerHTML)
  const renderBody = (text: string) => {
    return text.split('\n').map((line, i) => {
      if (!line.trim()) return <div key={i} className="h-2" />;

      const isBullet = line.trim().startsWith('- ');
      const content = isBullet ? line.replace(/^-\s*/, '').trim() : line;

      // Bold **text** → <strong>
      const parts = content.split(/(\*\*.+?\*\*)/g).map((part, j) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={j}>{part.slice(2, -2)}</strong>;
        }
        return <span key={j}>{part}</span>;
      });

      if (isBullet) {
        return (
          <div key={i} className="flex gap-2 ml-1">
            <span className="text-text-tertiary shrink-0">•</span>
            <span>{parts}</span>
          </div>
        );
      }
      return <div key={i}>{parts}</div>;
    });
  };

  const renderHeading = (heading: string) => {
    if (heading.startsWith('### ')) {
      return <h3 className="text-xl font-semibold text-text mt-12 mb-4">{heading.replace('### ', '')}</h3>;
    }
    if (heading.startsWith('## ')) {
      return <h2 className="text-[28px] font-bold text-text mt-20 mb-6">{heading.replace('## ', '')}</h2>;
    }
    return null;
  };

  return (
    <WizardLayout
      prevRoute="/editing"
      nextSlot={
        <button
          onClick={handleNext}
          className="flex items-center gap-1.5 px-5 py-3 bg-primary text-bg text-[15px] font-semibold rounded-lg hover:bg-primary-hover transition-colors cursor-pointer"
        >
          다음 단계
          <ChevronRight size={16} />
        </button>
      }
    >
      <div className="pt-20">
        {/* Page title */}
        <h1 className="text-[40px] font-bold leading-tight text-text">요약</h1>
        <p className="text-[13px] text-text-secondary mt-2">AI가 생성한 회의 요약과 F/U 항목</p>

        {/* Loading state — full screen overlay */}
        {loading && (
          <div className="fixed inset-0 z-50 bg-bg/80 flex flex-col items-center justify-center gap-4">
            <Loader2 size={32} className="text-primary animate-spin" />
            <p className="text-[15px] text-text-secondary">AI 요약을 생성하고 있습니다...</p>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="mt-12 bg-warning-bg rounded-xl p-5">
            <p className="text-[15px] text-warning-text font-medium">요약 생성 실패</p>
            <p className="text-sm text-warning-text/80 mt-1">{error}</p>
            <button
              onClick={generateSummary}
              className="mt-4 px-4 py-2 text-sm font-medium text-bg bg-primary rounded-lg hover:bg-primary-hover cursor-pointer"
            >
              재시도
            </button>
          </div>
        )}

        {/* Summary content */}
        {!loading && !error && summaryBlocks.length > 0 && (
          <>
            {/* Re-summarize button */}
            <div className="mt-8 flex justify-end">
              <button
                onClick={generateSummary}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-text bg-bg-subtle rounded-lg hover:bg-bg-hover cursor-pointer"
              >
                <RefreshCw size={14} />
                재요약
              </button>
            </div>

            {/* Summary blocks */}
            <div className="mt-6 bg-bg-subtle rounded-xl p-6">
              {summaryBlocks.map((block) => (
                <div key={block.id} className="group">
                  {editingBlockId === block.id ? (
                    <div className="my-4">
                      <textarea
                        ref={editRef}
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleBlockEditConfirm();
                          }
                          if (e.key === 'Escape') handleBlockEditCancel();
                        }}
                        onBlur={handleBlockEditConfirm}
                        className="w-full text-[15px] text-text leading-relaxed bg-bg ring-2 ring-primary rounded-lg px-4 py-3 resize-none focus:outline-none min-h-[120px]"
                        rows={Math.max(4, editingText.split('\n').length + 1)}
                      />
                    </div>
                  ) : (
                    <div
                      className="relative cursor-text"
                      onDoubleClick={() => handleBlockEditStart(block)}
                    >
                      {renderHeading(block.heading)}
                      <div className="text-[15px] text-text leading-relaxed">
                        {renderBody(block.body)}
                      </div>
                      <button
                        onClick={() => handleBlockEditStart(block)}
                        className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 p-1 text-text-tertiary hover:text-text transition-opacity cursor-pointer"
                      >
                        <Pencil size={14} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Cheatline */}
            {cheatlineVisible && (
              <div className="mt-4 text-center text-xs text-text-tertiary">
                Enter=확정 · Shift+Enter=줄바꿈 · Esc=취소
              </div>
            )}

            {/* Action items */}
            <div className="mt-20">
              <h2 className="text-[28px] font-bold text-text mb-6">전체 F/U 요약</h2>
              <div className="space-y-2">
                {actionItems.length === 0 && (
                  <p className="text-sm text-text-tertiary py-4">F/U 항목이 없습니다</p>
                )}
                {actionItems.map((item) => (
                  <div
                    key={item.fu_id}
                    className="group flex items-start gap-2 py-2 px-3 -mx-3 rounded-lg hover:bg-bg-subtle"
                  >
                    <span className="text-text-tertiary shrink-0 mt-0.5">•</span>
                    {editingFuId === item.fu_id ? (
                      <input
                        value={editingFuText}
                        onChange={(e) => setEditingFuText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); handleFuEditConfirm(); }
                          if (e.key === 'Escape') { setEditingFuId(null); setEditingFuText(''); }
                        }}
                        onBlur={handleFuEditConfirm}
                        autoFocus
                        className="flex-1 text-[15px] text-text bg-bg rounded-lg px-3 py-1 ring-2 ring-primary focus:outline-none"
                      />
                    ) : (
                      <div
                        className="flex-1 text-[15px] text-text cursor-text"
                        onDoubleClick={() => handleFuEditStart(item)}
                      >
                        {item.assignee && (
                          <span className="text-primary font-medium">@{item.assignee} </span>
                        )}
                        {item.task}
                        {item.deadline && (
                          <span className="text-text-secondary"> ~{item.deadline}</span>
                        )}
                        {item.source_topic && (
                          <span className="text-text-tertiary text-xs ml-2">— {item.source_topic}</span>
                        )}
                      </div>
                    )}
                    <button
                      onClick={() => handleFuDelete(item.fu_id)}
                      className="opacity-0 group-hover:opacity-100 p-0.5 text-text-tertiary hover:text-recording transition-opacity cursor-pointer shrink-0"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
                <button
                  onClick={handleFuAdd}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-text-secondary hover:text-text cursor-pointer"
                >
                  <Plus size={14} />
                  항목 추가
                </button>
              </div>
            </div>

            {/* Transcript reference panel (collapsed) */}
            <div className="mt-20">
              <button
                onClick={() => setTranscriptExpanded(!transcriptExpanded)}
                className="flex items-center gap-2 text-[15px] font-medium text-text-secondary cursor-pointer"
              >
                전사 원본
                {transcriptExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              {transcriptExpanded && session && (
                <div className="mt-4 space-y-2 max-h-[400px] overflow-y-auto">
                  {session.blocks.map((block) => (
                    <div key={block.block_id} className="flex items-start gap-2 text-sm text-text-secondary">
                      <span className="text-xs font-mono text-text-tertiary shrink-0 w-12 pt-0.5">
                        {formatTs(block.timestamp_start)}
                      </span>
                      <p className="flex-1">{block.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </>
        )}
      </div>

      <Toast message={toast.message} visible={toast.visible} onHide={() => setToast((prev) => ({ ...prev, visible: false }))} />

      <Modal open={resummarizeModal} onClose={() => setResummarizeModal(false)}>
        <h3 className="text-lg font-semibold text-text mb-2">요약 재생성</h3>
        <p className="text-sm text-text-secondary mb-6">
          태깅이나 전사를 수정했습니다. 요약을 다시 생성할까요?
        </p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={() => { setResummarizeModal(false); clearEditedFlag(); loadExistingSummary(); }}
            className="px-4 py-2 text-sm font-medium text-text bg-bg-subtle rounded-lg hover:bg-bg-hover cursor-pointer"
          >
            기존 요약 유지
          </button>
          <button
            onClick={() => { setResummarizeModal(false); clearEditedFlag(); generateSummary(); }}
            className="px-4 py-2 text-sm font-medium text-bg bg-primary rounded-lg hover:bg-primary-hover cursor-pointer"
          >
            재요약
          </button>
        </div>
      </Modal>
    </WizardLayout>
  );
}
