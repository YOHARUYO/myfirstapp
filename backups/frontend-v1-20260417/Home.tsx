import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, Clock, ChevronRight, Settings, AlertCircle, Trash2 } from 'lucide-react';
import { listMeetings } from '../api/history';
import { listRecoverable } from '../api/recovery';
import { deleteSession } from '../api/sessions';
import { useWizardStore } from '../stores/wizardStore';
import { formatDuration } from '../utils/formatTime';
import type { MeetingListItem, RecoverableSession } from '../types';

export default function Home() {
  const navigate = useNavigate();
  const reset = useWizardStore((s) => s.reset);
  const [meetings, setMeetings] = useState<MeetingListItem[]>([]);
  const [recoverable, setRecoverable] = useState<RecoverableSession[]>([]);

  const loadData = () => {
    listMeetings()
      .then((data) => setMeetings(data.slice(0, 5)))
      .catch(() => {});
    listRecoverable()
      .then(setRecoverable)
      .catch(() => {});
  };

  useEffect(() => {
    reset();
    loadData();
  }, [reset]);

  const handleDeleteSession = async (sessionId: string) => {
    try {
      await deleteSession(sessionId);
      setRecoverable((prev) => prev.filter((r) => r.session_id !== sessionId));
    } catch {}
  };

  return (
    <div className="max-w-xl mx-auto min-h-screen flex flex-col items-center pt-20 px-6 pb-12">
      {/* 복구 배너 */}
      {recoverable.length > 0 && (
        <div className="w-full mb-8 p-4 bg-warning-bg border border-warning/30 rounded-lg flex items-start gap-3">
          <AlertCircle size={18} className="text-warning mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-warning-text">
              복구 가능한 회의 {recoverable.length}건
            </p>
            {recoverable.map((r) => (
              <div
                key={r.session_id}
                className="mt-2 flex items-center justify-between"
              >
                <span className="text-sm text-warning-text/80">
                  {r.date} {r.title || '제목 없음'}
                </span>
                <button
                  onClick={() => handleDeleteSession(r.session_id)}
                  className="flex items-center gap-1 text-xs text-warning-text/60 hover:text-recording transition-colors cursor-pointer"
                >
                  <Trash2 size={12} />
                  삭제
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 히어로 */}
      <div className="text-center mb-10">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-5">
          <Mic size={28} className="text-primary" />
        </div>
        <h1 className="text-2xl font-semibold text-text tracking-tight">
          회의 기록 & AI 정리
        </h1>
        <p className="mt-2 text-sm text-text-secondary leading-relaxed">
          대면 회의를 녹음하고, AI가 요약과 액션 아이템을<br />
          자동으로 정리해 Slack으로 전송합니다
        </p>
      </div>

      {/* CTA */}
      <button
        onClick={() => navigate('/setup')}
        className="w-full max-w-xs py-3 px-6 bg-primary text-white rounded-lg font-medium hover:bg-primary-hover transition-colors cursor-pointer flex items-center justify-center gap-2"
      >
        <Mic size={18} />
        새 회의 시작
      </button>

      {/* 최근 회의 */}
      <div className="w-full mt-14">
        <h2 className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-3">
          최근 회의
        </h2>

        {meetings.length > 0 ? (
          <div className="space-y-1.5">
            {meetings.map((m) => (
              <div
                key={m.meeting_id}
                onClick={() => navigate(`/history/${m.meeting_id}`)}
                className="flex items-center justify-between p-3.5 rounded-lg border border-border hover:bg-bg-subtle cursor-pointer transition-colors group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs text-text-secondary font-mono shrink-0">
                    {m.date}
                  </span>
                  <span className="text-sm font-medium text-text truncate">
                    {m.title || '제목 없음'}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {m.duration_seconds && (
                    <span className="flex items-center gap-1 text-xs text-text-tertiary">
                      <Clock size={12} />
                      {formatDuration(m.duration_seconds)}
                    </span>
                  )}
                  <ChevronRight size={14} className="text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center border border-dashed border-border rounded-lg">
            <p className="text-sm text-text-tertiary">
              아직 기록된 회의가 없습니다
            </p>
            <p className="text-xs text-text-tertiary mt-1">
              새 회의를 시작하면 여기에 표시됩니다
            </p>
          </div>
        )}

        <div className="flex items-center justify-between mt-4">
          <button
            onClick={() => navigate('/history')}
            className="text-sm text-primary hover:text-primary-hover transition-colors cursor-pointer"
          >
            전체 히스토리 →
          </button>
          <button
            onClick={() => navigate('/settings')}
            className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text transition-colors cursor-pointer"
          >
            <Settings size={14} />
            설정
          </button>
        </div>
      </div>
    </div>
  );
}
