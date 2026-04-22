import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, ChevronDown, ChevronUp, Pencil, Send, Download,
  Clock, Users, MapPin, Globe, Trash2,
} from 'lucide-react';
import Modal from '../components/common/Modal';
import Toast from '../components/common/Toast';
import { getMeeting } from '../api/history';
import { deleteSlackMessage } from '../api/slack';
import { useSessionStore } from '../stores/sessionStore';
import api from '../api/client';
import type { Meeting, ActionItem, Session } from '../types';

import { formatTs } from '../utils/formatTime';

function formatDuration(seconds: number | null): string {
  if (!seconds) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
}

export default function HistoryDetail() {
  const navigate = useNavigate();
  const { meetingId } = useParams<{ meetingId: string }>();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [loading, setLoading] = useState(true);

  // UI state
  const [summaryExpanded, setSummaryExpanded] = useState(true);
  const [transcriptExpanded, setTranscriptExpanded] = useState(false);
  const [tsMode, setTsMode] = useState<'relative' | 'absolute'>('relative');
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleteMeetingModal, setDeleteMeetingModal] = useState(false);
  const [toast, setToast] = useState({ message: '', visible: false });

  useEffect(() => {
    if (!meetingId) return;
    getMeeting(meetingId)
      .then(setMeeting)
      .catch(() => setToast({ message: '회의를 불러올 수 없습니다', visible: true }))
      .finally(() => setLoading(false));
  }, [meetingId]);

  const showToast = (msg: string) => setToast({ message: msg, visible: true });

  const handleDeleteSlackMessage = async () => {
    if (!meeting?.slack_sent) return;
    setDeleteModal(false);
    try {
      await deleteSlackMessage(meeting.slack_sent.channel_id, meeting.slack_sent.message_ts);
      setMeeting({
        ...meeting,
        slack_sent: { ...meeting.slack_sent, deleted: true, deleted_at: new Date().toISOString() },
      });
      showToast('Slack 메시지가 삭제되었습니다');
    } catch (e: any) {
      showToast(e?.response?.data?.detail || '삭제 실패 — 이미 삭제되었거나 권한이 없습니다');
    }
  };

  // Parse summary markdown into rendered sections
  const renderSummary = (md: string) => {
    return md.split('\n').map((line, i) => {
      if (line.startsWith('# ')) return null; // Title already shown
      if (line.startsWith('## ')) {
        return <h2 key={i} className="text-[28px] font-bold text-text mt-12 mb-4">{line.replace('## ', '')}</h2>;
      }
      if (line.startsWith('### ')) {
        return <h3 key={i} className="text-xl font-semibold text-text mt-8 mb-3">{line.replace('### ', '')}</h3>;
      }
      if (!line.trim()) return <div key={i} className="h-2" />;

      const isBullet = line.trim().startsWith('- ');
      const content = isBullet ? line.replace(/^-\s*/, '').trim() : line;
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
            <span className="text-[15px] text-text leading-relaxed">{parts}</span>
          </div>
        );
      }
      return <div key={i} className="text-[15px] text-text leading-relaxed">{parts}</div>;
    });
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto min-h-screen px-6 md:px-10 pt-20">
        <p className="text-sm text-text-tertiary text-center py-8">로딩 중...</p>
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="max-w-3xl mx-auto min-h-screen px-6 md:px-10 pt-20">
        <p className="text-sm text-text-tertiary text-center py-8">회의를 찾을 수 없습니다</p>
      </div>
    );
  }

  const meta = meeting.metadata;
  const slackSent = meeting.slack_sent;

  return (
    <div className="max-w-3xl mx-auto min-h-screen px-6 md:px-10 pt-20 pb-12">
      {/* Header */}
      <button
        onClick={() => navigate('/history')}
        className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text transition-colors cursor-pointer mb-6"
      >
        <ArrowLeft size={16} />
        목록으로
      </button>

      <h1 className="text-[40px] font-bold leading-tight text-text">
        {meta.date && <span className="text-text-secondary font-normal text-[28px] mr-3">{meta.date}</span>}
        {meta.title}
      </h1>
      <p className="text-[13px] text-text-secondary mt-2">회의 상세 정보와 요약</p>

      {/* Meta info */}
      <div className="mt-6 bg-bg-subtle rounded-xl p-6 flex flex-wrap gap-4 text-sm text-text-secondary">
        {meta.duration_seconds && (
          <span className="flex items-center gap-1.5">
            <Clock size={14} />
            {meta.start_time && meta.end_time ? `${meta.start_time} ~ ${meta.end_time}` : ''} ({formatDuration(meta.duration_seconds)})
          </span>
        )}
        {meta.location && (
          <span className="flex items-center gap-1.5">
            <MapPin size={14} />
            {meta.location}
          </span>
        )}
        {meta.participants.length > 0 && (
          <span className="flex items-center gap-1.5">
            <Users size={14} />
            {meta.participants.join(', ')}
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <Globe size={14} />
          {meta.language}
        </span>
      </div>

      {/* Slack sent info */}
      {slackSent && (
        <div className="mt-6 bg-bg-subtle rounded-xl p-4">
          <p className="text-sm text-text-secondary">
            Slack 전송 이력: {slackSent.channel_name} · {slackSent.sent_at?.split('T')[0]} 전송
            {slackSent.deleted && <span className="text-text-tertiary"> · 삭제됨</span>}
          </p>
          {!slackSent.deleted && (
            <button
              onClick={() => setDeleteModal(true)}
              className="mt-2 flex items-center gap-1.5 text-sm text-text-tertiary hover:text-recording cursor-pointer"
            >
              <Trash2 size={14} />
              메시지 삭제
            </button>
          )}
        </div>
      )}

      {/* Summary */}
      <div className="mt-20">
        <button
          onClick={() => setSummaryExpanded(!summaryExpanded)}
          className="flex items-center gap-2 text-[28px] font-bold text-text cursor-pointer"
        >
          요약 & F/U
          {summaryExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>
        {summaryExpanded && meeting.summary_markdown && (
          <div className="mt-4">
            {renderSummary(meeting.summary_markdown)}

            {/* Action items */}
            {meeting.action_items.length > 0 && (
              <div className="mt-12">
                <h2 className="text-[28px] font-bold text-text mb-4">전체 F/U 요약</h2>
                <div className="space-y-2">
                  {meeting.action_items.map((item: ActionItem) => (
                    <div key={item.fu_id} className="flex items-start gap-2 py-1">
                      <span className="text-text-tertiary shrink-0 mt-0.5">•</span>
                      <span className="text-[15px] text-text">
                        {item.assignee && <span className="text-primary font-medium">@{item.assignee} </span>}
                        {item.task}
                        {item.deadline && <span className="text-text-secondary"> ~{item.deadline}</span>}
                        {item.source_topic && <span className="text-text-tertiary text-xs ml-2">— {item.source_topic}</span>}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Transcript */}
      <div className="mt-20">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setTranscriptExpanded(!transcriptExpanded)}
            className="flex items-center gap-2 text-[15px] font-medium text-text-secondary cursor-pointer"
          >
            전사 원본 ({meeting.blocks.length}블록)
            {transcriptExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          {transcriptExpanded && (
            <button
              onClick={() => setTsMode(tsMode === 'relative' ? 'absolute' : 'relative')}
              className="text-xs text-text-tertiary hover:text-text cursor-pointer"
            >
              {tsMode === 'relative' ? '절대 시각' : '상대 시각'}
            </button>
          )}
        </div>
        {transcriptExpanded && (
          <div className="mt-4 space-y-2 max-h-[500px] overflow-y-auto">
            {meeting.blocks.map((block) => {
              let tsDisplay: string;
              if (tsMode === 'absolute' && meta.start_time) {
                const parts = meta.start_time.split(':').map(Number);
                const h = parts[0] || 0;
                const m = parts[1] || 0;
                const s = parts[2] || 0;
                if (!isNaN(h) && !isNaN(m)) {
                  const baseSeconds = h * 3600 + m * 60 + s;
                  const total = baseSeconds + block.timestamp_start;
                  const hh = Math.floor(total / 3600) % 24;
                  const mm = Math.floor((total % 3600) / 60);
                  tsDisplay = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
                } else {
                  tsDisplay = formatTs(block.timestamp_start);
                }
              } else {
                tsDisplay = formatTs(block.timestamp_start);
              }
              return (
                <div key={block.block_id} className="flex items-start gap-2">
                  <span className="text-xs font-mono text-text-tertiary shrink-0 w-12 pt-0.5">
                    {tsDisplay}
                  </span>
                  <p className="text-[15px] text-text leading-relaxed flex-1">{block.text}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="mt-12 flex gap-3">
        <button
          onClick={() => {
            if (!meeting) return;
            const sessionLike: Session = {
              session_id: meeting.meeting_id,
              status: 'editing',
              created_at: meeting.created_at,
              input_mode: 'realtime',
              metadata: meeting.metadata,
              audio_chunks_dir: '',
              audio_chunk_count: 0,
              blocks: meeting.blocks,
              recording_gaps: [],
              ai_tagging_skipped: false,
              summary_markdown: meeting.summary_markdown,
              action_items: meeting.action_items,
              keywords: meeting.keywords,
            };
            useSessionStore.getState().setSession(sessionLike);
            useSessionStore.getState().setEditMode('meeting', meeting.meeting_id);
            navigate('/editing');
          }}
          className="flex items-center gap-2 px-5 py-3 text-[15px] font-semibold text-text bg-bg-subtle rounded-lg hover:bg-bg-hover cursor-pointer"
        >
          <Pencil size={18} />
          재편집
        </button>
        <button
          onClick={() => {
            if (!meeting) return;
            const sessionLike: Session = {
              session_id: meeting.meeting_id,
              status: 'summarizing',
              created_at: meeting.created_at,
              input_mode: 'realtime',
              metadata: meeting.metadata,
              audio_chunks_dir: '',
              audio_chunk_count: 0,
              blocks: meeting.blocks,
              recording_gaps: [],
              ai_tagging_skipped: false,
              summary_markdown: meeting.summary_markdown,
              action_items: meeting.action_items,
              keywords: meeting.keywords,
            };
            useSessionStore.getState().setSession(sessionLike);
            useSessionStore.getState().setEditMode('meeting', meeting.meeting_id);
            navigate('/send');
          }}
          className="flex items-center gap-2 px-5 py-3 text-[15px] font-semibold text-text bg-bg-subtle rounded-lg hover:bg-bg-hover cursor-pointer"
        >
          <Send size={18} />
          재전송
        </button>
        <button
          onClick={async () => {
            try {
              const res = await api.post(`/meetings/${meeting.meeting_id}/export-md`);
              showToast(`${res.data.filename} 다운로드 준비 완료`);
            } catch { showToast('.md 생성에 실패했습니다'); }
          }}
          className="flex items-center gap-2 px-5 py-3 text-[15px] font-semibold text-text bg-bg-subtle rounded-lg hover:bg-bg-hover cursor-pointer"
        >
          <Download size={18} />
          .md 다운로드
        </button>
        <button
          onClick={() => setDeleteMeetingModal(true)}
          className="flex items-center gap-2 px-5 py-3 text-[15px] font-semibold text-recording bg-bg-subtle rounded-lg hover:bg-bg-hover cursor-pointer"
        >
          <Trash2 size={18} />
          삭제
        </button>
      </div>

      {/* Delete meeting modal */}
      <Modal open={deleteMeetingModal} onClose={() => setDeleteMeetingModal(false)}>
        <h3 className="text-lg font-semibold text-text mb-2">회의록 삭제</h3>
        <p className="text-sm text-text-secondary mb-2">
          이 회의록을 삭제할까요? 이 작업은 취소할 수 없습니다.
        </p>
        {meeting?.slack_sent && !meeting.slack_sent.deleted && (
          <p className="text-xs text-text-tertiary mb-4">
            Slack에 전송된 메시지는 별도로 삭제해야 합니다.
          </p>
        )}
        <div className="flex gap-2 justify-end mt-4">
          <button onClick={() => setDeleteMeetingModal(false)}
            className="px-4 py-2 text-sm font-medium text-text bg-bg-subtle rounded-lg hover:bg-bg-hover cursor-pointer">취소</button>
          <button onClick={async () => {
            try {
              await api.delete(`/meetings/${meeting!.meeting_id}`);
              navigate('/history');
            } catch { showToast('삭제에 실패했습니다'); }
            setDeleteMeetingModal(false);
          }} className="px-4 py-2 text-sm font-medium text-bg bg-recording rounded-lg hover:opacity-90 cursor-pointer">삭제</button>
        </div>
      </Modal>

      {/* Delete Slack modal */}
      <Modal open={deleteModal} onClose={() => setDeleteModal(false)}>
        <h3 className="text-lg font-semibold text-text mb-2">메시지 삭제</h3>
        <p className="text-sm text-text-secondary mb-6">
          Slack에서 메시지를 삭제할까요? 이 작업은 취소할 수 없습니다.
        </p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={() => setDeleteModal(false)}
            className="px-4 py-2 text-sm font-medium text-text bg-bg-subtle rounded-lg hover:bg-bg-hover cursor-pointer"
          >
            취소
          </button>
          <button
            onClick={handleDeleteSlackMessage}
            className="px-4 py-2 text-sm font-medium text-bg bg-recording rounded-lg hover:opacity-90 cursor-pointer"
          >
            삭제
          </button>
        </div>
      </Modal>

      <Toast message={toast.message} visible={toast.visible} onHide={() => setToast((prev) => ({ ...prev, visible: false }))} />
    </div>
  );
}
