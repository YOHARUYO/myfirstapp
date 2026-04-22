import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, Clock, ChevronRight, Settings, AlertCircle, Trash2 } from 'lucide-react';
import { listMeetings } from '../api/history';
import { listRecoverable } from '../api/recovery';
import { deleteSession, getSession } from '../api/sessions';
import { useWizardStore } from '../stores/wizardStore';
import { useSessionStore } from '../stores/sessionStore';
import { formatDuration } from '../utils/formatTime';
import type { MeetingListItem, RecoverableSession } from '../types';

const STATUS_LABELS: Record<string, string> = {
  idle: '정보 입력 전',
  recording: '녹음 완료',
  post_recording: '녹음 완료',
  processing: 'Whisper 처리 중',
  editing: '편집 중',
  summarizing: '요약 중',
};

const STATUS_ROUTES: Record<string, string> = {
  idle: '/setup',
  recording: '/recording',
  post_recording: '/recording',
  processing: '/processing',
  editing: '/editing',
  summarizing: '/summary',
};

export default function Home() {
  const navigate = useNavigate();
  const reset = useWizardStore((s) => s.reset);
  const [meetings, setMeetings] = useState<MeetingListItem[]>([]);
  const [recoverable, setRecoverable] = useState<RecoverableSession[]>([]);
  const [loadError, setLoadError] = useState(false);

  const loadData = () => {
    setLoadError(false);
    Promise.all([
      listMeetings().then((data) => setMeetings(data.slice(0, 5))),
      listRecoverable().then(setRecoverable),
    ]).catch(() => setLoadError(true));
  };

  useEffect(() => {
    reset();
    loadData();
  }, [reset]);

  const setSession = useSessionStore((s) => s.setSession);

  const handleResume = async (r: RecoverableSession) => {
    try {
      const session = await getSession(r.session_id);
      setSession(session);
      navigate(STATUS_ROUTES[r.status] || '/setup');
    } catch {}
  };

  const handleDeleteSession = async (sessionId: string) => {
    try {
      await deleteSession(sessionId);
      setRecoverable((prev) => prev.filter((r) => r.session_id !== sessionId));
    } catch {}
  };

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col items-center pt-20 px-6 md:px-10 pb-12">
      {loadError && (
        <div className="w-full mb-4 text-center">
          <p className="text-sm text-text-tertiary">데이터를 불러올 수 없습니다</p>
          <button onClick={loadData} className="text-sm text-primary mt-1 cursor-pointer">다시 시도</button>
        </div>
      )}

      {/* 복구 배너 */}
      {recoverable.map((r) => (
        <div key={r.session_id} className="w-full mb-8 bg-bg-subtle rounded-xl p-5">
          <p className="text-sm font-medium text-text">진행 중인 회의가 있습니다</p>
          <p className="text-[15px] text-text mt-2">
            {r.title || '제목 없음'} · {r.date}
            {r.participants.length > 0 && ` · ${r.participants[0]}${r.participants.length > 1 ? ` 외 ${r.participants.length - 1}명` : ''}`}
          </p>
          <p className="text-xs text-text-tertiary mt-1">
            마지막 상태: {STATUS_LABELS[r.status] || r.status}
          </p>
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => handleResume(r)}
              className="px-4 py-2 text-sm font-medium text-bg bg-primary rounded-lg hover:bg-primary-hover cursor-pointer"
            >
              이어서 진행
            </button>
            <button
              onClick={() => handleDeleteSession(r.session_id)}
              className="px-4 py-2 text-sm font-medium text-text bg-bg-hover rounded-lg hover:bg-border-light cursor-pointer"
            >
              삭제하고 새로 시작
            </button>
          </div>
        </div>
      ))}

      {/* 히어로 — Display (40px/700) */}
      <div className="text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-5">
          <Mic size={32} className="text-primary" />
        </div>
        <h1 className="text-[40px] font-bold text-text leading-tight tracking-tight">
          회의 기록
        </h1>
        <p className="mt-3 text-sm text-text-secondary leading-relaxed">
          대면 회의를 녹음하고, AI가 요약과 액션 아이템을<br />
          자동으로 정리해 Slack으로 전송합니다
        </p>
      </div>

      {/* CTA */}
      <button
        onClick={() => navigate('/setup')}
        disabled={recoverable.length > 0}
        className="w-full max-w-xs mt-8 py-3 px-5 bg-primary text-white rounded-lg text-[15px] font-semibold hover:bg-primary-hover transition-colors cursor-pointer flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <Mic size={20} />
        새 회의 시작
      </button>
      {recoverable.length > 0 && (
        <p className="mt-2 text-xs text-text-tertiary text-center">
          진행 중인 회의를 완료하거나 삭제한 후 새 회의를 시작할 수 있습니다
        </p>
      )}

      {/* 최근 회의 — Title (28px/700) */}
      <div className="w-full mt-20">
        <h2 className="text-[28px] font-bold text-text">
          최근 회의
        </h2>

        {meetings.length > 0 ? (
          <div className="mt-6 space-y-2">
            {meetings.map((m) => (
              <div
                key={m.meeting_id}
                onClick={() => navigate(`/history/${m.meeting_id}`)}
                className="flex items-center justify-between p-5 rounded-xl bg-bg-subtle hover:bg-bg-hover cursor-pointer transition-colors group"
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
                      <Clock size={14} />
                      {formatDuration(m.duration_seconds)}
                    </span>
                  )}
                  <ChevronRight size={16} className="text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-6 py-8 text-center border border-dashed border-border rounded-lg">
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
            <Settings size={16} />
            설정
          </button>
        </div>
      </div>
    </div>
  );
}
