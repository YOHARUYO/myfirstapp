import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Send, Download, Check, AlertCircle, ChevronDown, ChevronUp,
  Loader2, Home, Clock, Trash2, MessageSquare, Paperclip, Bot, User,
} from 'lucide-react';
import WizardLayout from '../components/wizard/WizardLayout';
import Toast from '../components/common/Toast';
import Modal from '../components/common/Modal';
import { useWizardStore } from '../stores/wizardStore';
import { useSessionStore } from '../stores/sessionStore';
import { getSession } from '../api/sessions';
import api from '../api/client';
import { listChannels, listMessages, sendSlackMessage, deleteSlackMessage } from '../api/slack';
import type { SlackChannel, SlackMessage } from '../api/slack';

type SendMode = 'new' | 'thread';
type TaskStatus = 'idle' | 'loading' | 'success' | 'error';

export default function SendSave() {
  const navigate = useNavigate();
  const setStep = useWizardStore((s) => s.setStep);
  const session = useSessionStore((s) => s.session);
  const editMode = useSessionStore((s) => s.editMode);
  const apiBase = editMode === 'meeting' ? '/meetings' : '/sessions';
  const setSession = useSessionStore((s) => s.setSession);

  // Checkboxes
  const [sendSlack, setSendSlack] = useState(true);
  const [saveMd, setSaveMd] = useState(true);
  const [exportPath, setExportPath] = useState('');

  // Slack options
  const [channels, setChannels] = useState<SlackChannel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState('');
  const [sendMode, setSendMode] = useState<SendMode>('new');
  const [threadMessages, setThreadMessages] = useState<SlackMessage[]>([]);
  const [selectedThread, setSelectedThread] = useState<string | null>(null);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [threadsLoading, setThreadsLoading] = useState(false);

  // Preview
  const [previewExpanded, setPreviewExpanded] = useState(false);

  // Execution state
  const [executing, setExecuting] = useState(false);
  const [slackStatus, setSlackStatus] = useState<TaskStatus>('idle');
  const [mdStatus, setMdStatus] = useState<TaskStatus>('idle');
  const [slackResult, setSlackResult] = useState<string>('');
  const [mdResult, setMdResult] = useState<string>('');
  const [completed, setCompleted] = useState(false);

  // Slack delete
  const [slackMessageTs, setSlackMessageTs] = useState<string | null>(null);
  const [deleteModal, setDeleteModal] = useState(false);
  const [slackDeleted, setSlackDeleted] = useState(false);

  // Missing metadata modal
  const [missingModal, setMissingModal] = useState(false);

  const [toast, setToast] = useState({ message: '', visible: false });
  const showToast = (msg: string) => setToast({ message: msg, visible: true });

  useEffect(() => {
    setStep(7);
    // Fetch latest session data (ensures 6단계 편집이 반영됨)
    if (session) {
      getSession(session.session_id).then(setSession).catch(() => {});
    }
  }, [setStep]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Load channels
  useEffect(() => {
    setChannelsLoading(true);
    listChannels()
      .then((chs) => {
        setChannels(chs);
        if (chs.length > 0) setSelectedChannel(chs[0].id);
      })
      .catch(() => {})
      .finally(() => setChannelsLoading(false));
  }, []);

  const buildPreviewText = () => {
    if (!session) return '';
    const header = `[${session.metadata.date} ${session.metadata.title}]`;
    const summaryBullets: string[] = [];
    if (session.summary_markdown) {
      const lines = session.summary_markdown.split('\n');
      let inTopic = false;
      let foundBullet = false;
      for (const line of lines) {
        if (line.startsWith('### ')) { inTopic = true; foundBullet = false; continue; }
        if (line.startsWith('## ')) { inTopic = false; continue; }
        if (inTopic && !foundBullet && line.trim().startsWith('- ') && !line.includes('F/U')) {
          summaryBullets.push(`• ${line.trim().slice(2)}`);
          foundBullet = true;
        }
      }
    }
    const fuBullets = (session.action_items || []).map((item) => {
      let line = item.assignee ? `• [@${item.assignee}] ${item.task}` : `• ${item.task}`;
      if (item.deadline) line += ` ~${item.deadline}`;
      return line;
    });
    return `${header}\n\n📋 *핵심 요약*\n${summaryBullets.join('\n') || '(요약 없음)'}\n\n✅ *F/U 필요 사항*\n${fuBullets.join('\n') || '(없음)'}\n\n📎 전체 회의록 첨부`;
  };

  // Load thread messages when switching to thread mode
  useEffect(() => {
    if (sendMode === 'thread' && selectedChannel) {
      setThreadsLoading(true);
      listMessages(selectedChannel, 20)
        .then(setThreadMessages)
        .catch(() => setThreadMessages([]))
        .finally(() => setThreadsLoading(false));
    }
  }, [sendMode, selectedChannel]);

  const handleExecute = async () => {
    if (!session) return;

    // Check missing metadata
    const missingFields = [];
    if (!session.metadata.participants?.length) missingFields.push('참여자');
    if (!session.metadata.location) missingFields.push('장소');
    if (missingFields.length > 0 && !completed) {
      setMissingModal(true);
      return;
    }

    await doExecute();
  };

  const doExecute = async () => {
    if (!session || executing) return;
    setMissingModal(false);
    setExecuting(true);

    // 1. .md export 먼저 (Slack 첨부에 필요)
    if (saveMd) {
      setMdStatus('loading');
      try {
        const res = await api.post(`${apiBase}/${session.session_id}/export-md`);
        setMdStatus('success');
        setMdResult(`${res.data.filename} 저장 완료`);
      } catch (e: any) {
        setMdStatus('error');
        setMdResult(e?.response?.data?.detail || '.md 저장 실패');
      }
    }

    // 2. Slack 전송 (이제 .md 파일이 존재)
    if (sendSlack && selectedChannel) {
      setSlackStatus('loading');
      try {
        const result = await sendSlackMessage(
          session.session_id,
          selectedChannel,
          sendMode === 'thread' ? selectedThread : null,
          saveMd,
        );
        setSlackStatus('success');
        setSlackResult(`${result.channel_name} 전송 완료`);
        setSlackMessageTs(result.message_ts);
      } catch (e: any) {
        setSlackStatus('error');
        setSlackResult(e?.response?.data?.detail || 'Slack 전송 실패');
      }
    }

    // 3. Complete session (JSON history)
    try {
      if (editMode !== 'meeting') {
        try { await api.post(`/sessions/${session.session_id}/complete`); } catch {}
      }
    } catch {}

    setExecuting(false);
    setCompleted(true);
  };

  const channelName = channels.find((c) => c.id === selectedChannel)?.name || '';

  // Completion screen
  if (completed) {
    return (
      <WizardLayout prevRoute={false}>
        <div className="pt-20 max-w-md mx-auto text-center">
          <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto">
            <Check size={32} className="text-success" />
          </div>
          <h1 className="text-[40px] font-bold leading-tight text-text mt-8">
            모두 완료되었습니다!
          </h1>

          <div className="mt-12 space-y-3 text-left">
            {slackStatus === 'success' && (
              <div className="flex items-center gap-3 text-[15px] text-text">
                <Check size={16} className="text-success shrink-0" />
                Slack {slackResult}
                {slackDeleted ? (
                  <span className="ml-auto text-xs text-text-tertiary">삭제됨</span>
                ) : slackMessageTs && (
                  <button
                    onClick={() => setDeleteModal(true)}
                    className="ml-auto text-sm text-text-tertiary hover:text-recording cursor-pointer"
                  >
                    삭제
                  </button>
                )}
              </div>
            )}
            {slackStatus === 'error' && (
              <div className="flex items-center gap-3 text-[15px] text-recording">
                <AlertCircle size={16} className="shrink-0" />
                Slack: {slackResult}
                <div className="ml-auto flex gap-2">
                  <button
                    onClick={() => setSlackStatus('idle')}
                    className="px-3 py-1 text-sm font-medium text-text-secondary bg-bg-subtle rounded-lg hover:bg-bg-hover cursor-pointer"
                  >
                    건너뛰기
                  </button>
                  <button
                    onClick={async () => {
                      setSlackStatus('loading');
                      try {
                        const result = await sendSlackMessage(
                          session!.session_id, selectedChannel,
                          sendMode === 'thread' ? selectedThread : null, saveMd,
                        );
                        setSlackStatus('success');
                        setSlackResult(`${result.channel_name} 전송 완료`);
                        setSlackMessageTs(result.message_ts);
                      } catch (e: any) {
                        setSlackStatus('error');
                        setSlackResult(e?.response?.data?.detail || 'Slack 전송 실패');
                      }
                    }}
                    className="px-3 py-1 text-sm font-medium text-bg bg-primary rounded-lg hover:bg-primary-hover cursor-pointer"
                  >
                    재시도
                  </button>
                </div>
              </div>
            )}
            {mdStatus === 'success' && (
              <div className="flex items-center gap-3 text-[15px] text-text">
                <Check size={16} className="text-success shrink-0" />
                {mdResult}
              </div>
            )}
            {mdStatus === 'error' && (
              <div className="flex items-center gap-3 text-[15px] text-recording">
                <AlertCircle size={16} className="shrink-0" />
                {mdResult}
                <button
                  onClick={async () => {
                    setMdStatus('loading');
                    try {
                      const res = await api.post(`${apiBase}/${session!.session_id}/export-md`);
                      setMdStatus('success');
                      setMdResult(`${res.data.filename} 저장 완료`);
                    } catch (e: any) {
                      setMdStatus('error');
                      setMdResult(e?.response?.data?.detail || '.md 저장 실패');
                    }
                  }}
                  className="ml-auto px-3 py-1 text-sm font-medium text-bg bg-primary rounded-lg hover:bg-primary-hover cursor-pointer"
                >
                  재시도
                </button>
              </div>
            )}
            <div className="flex items-center gap-3 text-[15px] text-text">
              <Check size={16} className="text-success shrink-0" />
              히스토리 기록 완료
            </div>
          </div>

          <div className="mt-12 flex gap-3 justify-center">
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-2 px-5 py-3 text-[15px] font-semibold text-text bg-bg-subtle rounded-lg hover:bg-bg-hover cursor-pointer"
            >
              <Home size={20} />
              홈으로
            </button>
            <button
              onClick={() => navigate('/history')}
              className="flex items-center gap-2 px-5 py-3 text-[15px] font-semibold text-bg bg-primary rounded-lg hover:bg-primary-hover cursor-pointer"
            >
              <Clock size={20} />
              히스토리에서 보기
            </button>
          </div>
        </div>
      </WizardLayout>
    );
  }

  return (
    <WizardLayout
      prevRoute="/summary"
      nextSlot={
        <button
          onClick={handleExecute}
          disabled={executing || (!sendSlack && !saveMd)}
          className="flex items-center gap-2 px-5 py-3 text-[15px] font-semibold text-bg bg-primary rounded-lg hover:bg-primary-hover transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {executing ? (
            <><Loader2 size={20} className="animate-spin" /> 실행 중...</>
          ) : (
            <><Send size={20} /> 실행</>
          )}
        </button>
      }
    >
      <div className="pt-20">
        <h1 className="text-[40px] font-bold leading-tight text-text">전송 & 저장</h1>
        <p className="text-[13px] text-text-secondary mt-2">Slack 전송, 로컬 .md 저장, 히스토리 기록</p>

        {/* Slack section */}
        <div className="mt-20 bg-bg-subtle rounded-xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <input
              type="checkbox"
              checked={sendSlack}
              onChange={(e) => setSendSlack(e.target.checked)}
              className="w-4 h-4 rounded cursor-pointer"
            />
            <h2 className="text-[28px] font-bold text-text">Slack 전송</h2>
          </div>

          {sendSlack && (
            <div className="space-y-4 ml-7">
              {/* Channel select */}
              <div>
                <label className="text-xs font-medium text-text-secondary block mb-1">채널</label>
                {channelsLoading ? (
                  <div className="flex items-center gap-2 text-sm text-text-tertiary py-2">
                    <Loader2 size={14} className="animate-spin" /> 채널 목록 로딩 중...
                  </div>
                ) : channels.length === 0 ? (
                  <p className="text-sm text-text-tertiary">참여 중인 채널이 없습니다</p>
                ) : (
                  <select
                    value={selectedChannel}
                    onChange={(e) => setSelectedChannel(e.target.value)}
                    className="w-full bg-bg-subtle rounded-lg px-4 py-3 text-[15px] focus:bg-bg focus:ring-2 focus:ring-primary focus:outline-none cursor-pointer"
                  >
                    {channels.map((ch) => (
                      <option key={ch.id} value={ch.id}>#{ch.name}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Send mode */}
              <div>
                <label className="text-xs font-medium text-text-secondary block mb-1">전송 방식</label>
                <div className="flex gap-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="sendMode"
                      checked={sendMode === 'new'}
                      onChange={() => setSendMode('new')}
                    />
                    <span className="text-sm text-text">새 메시지</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="sendMode"
                      checked={sendMode === 'thread'}
                      onChange={() => setSendMode('thread')}
                    />
                    <span className="text-sm text-text">스레드 답장</span>
                  </label>
                </div>
              </div>

              {/* Thread selection */}
              {sendMode === 'thread' && (
                <div>
                  <label className="text-xs font-medium text-text-secondary block mb-1">스레드 선택</label>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {threadsLoading && (
                      <div className="flex items-center gap-2 text-sm text-text-tertiary py-2">
                        <Loader2 size={14} className="animate-spin" /> 메시지 불러오는 중...
                      </div>
                    )}
                    {!threadsLoading && threadMessages.length === 0 && (
                      <p className="text-sm text-text-tertiary py-2">최근 메시지가 없습니다</p>
                    )}
                    {threadMessages.map((msg) => {
                      const sentDate = msg.sent_at ? new Date(msg.sent_at) : null;
                      const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
                      const dateStr = sentDate
                        ? `${String(sentDate.getMonth() + 1).padStart(2, '0')}/${String(sentDate.getDate()).padStart(2, '0')}(${weekdays[sentDate.getDay()]}) ${String(sentDate.getHours()).padStart(2, '0')}:${String(sentDate.getMinutes()).padStart(2, '0')}`
                        : '';
                      return (
                        <button
                          key={msg.ts}
                          onClick={() => setSelectedThread(msg.ts)}
                          className={`w-full text-left px-4 py-3 rounded-xl cursor-pointer transition-colors border ${
                            selectedThread === msg.ts
                              ? 'border-primary bg-primary/5'
                              : 'border-border-light bg-bg-subtle hover:bg-bg-hover'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
                              {msg.is_bot ? <Bot size={12} /> : <User size={12} />}
                              {msg.user_name}
                            </div>
                            <span className="text-xs text-text-tertiary">{dateStr}</span>
                          </div>
                          <p className="text-sm text-text truncate">
                            {msg.text_preview || '(내용 없음)'}
                          </p>
                          <div className="flex items-center gap-3 mt-1">
                            {msg.reply_count > 0 && (
                              <span className="flex items-center gap-1 text-xs text-text-tertiary">
                                <MessageSquare size={10} />
                                {msg.reply_count}개 답글
                              </span>
                            )}
                            {msg.has_attachments && (
                              <span className="flex items-center gap-1 text-xs text-text-tertiary">
                                <Paperclip size={10} />
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Preview */}
              <button
                onClick={() => setPreviewExpanded(!previewExpanded)}
                className="flex items-center gap-1.5 text-sm font-medium text-text-secondary cursor-pointer"
              >
                미리보기
                {previewExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {previewExpanded && session && (
                <div className="bg-bg-subtle rounded-xl p-4 text-sm text-text whitespace-pre-wrap font-mono">
                  {buildPreviewText()}
                </div>
              )}
            </div>
          )}
        </div>

        {/* .md save section */}
        <div className="mt-8 bg-bg-subtle rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <input
              type="checkbox"
              checked={saveMd}
              onChange={(e) => setSaveMd(e.target.checked)}
              className="w-4 h-4 rounded cursor-pointer"
            />
            <h2 className="text-[28px] font-bold text-text">로컬 저장</h2>
          </div>
          {saveMd && (
            <div className="ml-7 mt-2">
              <p className="text-sm text-text-secondary">.md 파일로 저장됩니다</p>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-text-tertiary shrink-0">경로:</span>
                <span className="text-xs text-text-secondary truncate">{exportPath || 'exports/'}</span>
                <button
                  onClick={async () => {
                    try {
                      if ('showDirectoryPicker' in window) {
                        const handle = await (window as any).showDirectoryPicker();
                        setExportPath(handle.name);
                      } else {
                        const path = prompt('저장 경로를 입력하세요', exportPath);
                        if (path !== null) setExportPath(path);
                      }
                    } catch {}
                  }}
                  className="text-xs text-primary hover:text-primary-hover cursor-pointer shrink-0"
                >
                  폴더 선택
                </button>
              </div>
            </div>
          )}
        </div>

        {/* JSON history */}
        <div className="mt-12 ml-7">
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <Check size={14} className="text-success" />
            JSON 히스토리 — 자동 저장됩니다
          </div>
        </div>

      </div>

      {/* Delete Slack message modal */}
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
            onClick={async () => {
              setDeleteModal(false);
              if (!slackMessageTs || !selectedChannel) return;
              try {
                await deleteSlackMessage(selectedChannel, slackMessageTs);
                setSlackDeleted(true);
                showToast('Slack 메시지가 삭제되었습니다');
              } catch (e: any) {
                showToast(e?.response?.data?.detail || '삭제 실패 — 이미 삭제되었거나 권한이 없습니다');
              }
            }}
            className="px-4 py-2 text-sm font-medium text-bg bg-recording rounded-lg hover:opacity-90 cursor-pointer"
          >
            삭제
          </button>
        </div>
      </Modal>

      {/* Missing metadata modal */}
      <Modal open={missingModal} onClose={() => setMissingModal(false)}>
        <h3 className="text-lg font-semibold text-text mb-2">미입력 항목 확인</h3>
        <p className="text-sm text-text-secondary mb-6">
          {!session?.metadata.participants?.length && !session?.metadata.location
            ? '참여자, 장소가'
            : !session?.metadata.participants?.length
            ? '참여자가'
            : '장소가'
          } 비어 있습니다. 이대로 저장하시겠어요?
        </p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={() => { setMissingModal(false); navigate('/editing'); }}
            className="px-4 py-2 text-sm font-medium text-text bg-bg-subtle rounded-lg hover:bg-bg-hover cursor-pointer"
          >
            돌아가서 입력
          </button>
          <button
            onClick={doExecute}
            className="px-4 py-2 text-sm font-medium text-bg bg-primary rounded-lg hover:bg-primary-hover cursor-pointer"
          >
            이대로 진행
          </button>
        </div>
      </Modal>

      <Toast message={toast.message} visible={toast.visible} onHide={() => setToast((prev) => ({ ...prev, visible: false }))} />
    </WizardLayout>
  );
}
