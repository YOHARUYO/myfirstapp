import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Loader2, AlertCircle, ArrowRight } from 'lucide-react';
import WizardLayout from '../components/wizard/WizardLayout';
import { useWizardStore } from '../stores/wizardStore';
import { useSessionStore } from '../stores/sessionStore';
import { startProcessing, getProcessingStatus, getSession } from '../api/sessions';
import type { ProcessingStatus } from '../api/sessions';

const STAGE_LABELS: Record<string, string> = {
  audio_merge: '오디오 파일 병합',
  whisper: 'Whisper 전사 처리',
  block_merge: '사용자 수정 병합',
  ai_tagging: 'AI 중요도 태깅',
};

const STAGE_ORDER = ['audio_merge', 'whisper', 'block_merge', 'ai_tagging'];

function StageIcon({ status }: { status: string }) {
  if (status === 'completed' || status === 'skipped') {
    return <Check size={16} className="text-success" />;
  }
  if (status === 'in_progress') {
    return <Loader2 size={16} className="text-primary animate-spin" />;
  }
  return <div className="w-4 h-4 rounded-full border-2 border-border" />;
}

export default function Processing() {
  const navigate = useNavigate();
  const setStep = useWizardStore((s) => s.setStep);
  const session = useSessionStore((s) => s.session);
  const setSession = useSessionStore((s) => s.setSession);

  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    setStep(4);
  }, [setStep]);

  // Update page title on completion
  useEffect(() => {
    if (isComplete) {
      document.title = '✓ 처리 완료 — Meeting Recorder';
    }
    return () => {
      document.title = 'Meeting Recorder';
    };
  }, [isComplete]);

  // kickOff를 컴포넌트 레벨 함수로 분리
  const kickOff = useCallback(async () => {
    if (!session) return;
    try {
      await startProcessing(session.session_id);
      pollingRef.current = setInterval(async () => {
        try {
          const status = await getProcessingStatus(session.session_id);
          setProcessingStatus(status);

          if (status.status === 'completed') {
            if (pollingRef.current) clearInterval(pollingRef.current);
            setIsComplete(true);
            const updated = await getSession(session.session_id);
            setSession(updated);
          } else if (status.status === 'error') {
            if (pollingRef.current) clearInterval(pollingRef.current);
            setError(status.error || '처리 중 오류가 발생했습니다');
          }
        } catch {}
      }, 2000);
    } catch (e: any) {
      setError(e?.response?.data?.detail || '처리를 시작할 수 없습니다');
    }
  }, [session, setSession]);

  // Start processing and begin polling
  useEffect(() => {
    if (!session || startedRef.current) return;
    startedRef.current = true;
    kickOff();
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [session, kickOff]);

  // beforeunload + popstate warning during processing
  useEffect(() => {
    if (isComplete || error) return;
    const unloadHandler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    const popHandler = () => { window.history.pushState(null, '', window.location.href); };
    window.history.pushState(null, '', window.location.href);
    window.addEventListener('beforeunload', unloadHandler);
    window.addEventListener('popstate', popHandler);
    return () => {
      window.removeEventListener('beforeunload', unloadHandler);
      window.removeEventListener('popstate', popHandler);
    };
  }, [isComplete, error]);

  const handleRetry = async () => {
    if (!session) return;
    setError(null);
    setIsComplete(false);
    setProcessingStatus(null);
    if (pollingRef.current) clearInterval(pollingRef.current);
    kickOff();
  };

  const handleSkipToWebSpeech = async () => {
    if (!session) return;
    // Skip Whisper, go to editing with Web Speech results
    const updated = await getSession(session.session_id);
    setSession(updated);
    navigate('/editing');
  };

  // Calculate overall progress
  const overallProgress = (() => {
    if (!processingStatus) return 0;
    let completed = 0;
    for (const stage of STAGE_ORDER) {
      const s = processingStatus.stages[stage];
      if (s?.status === 'completed' || s?.status === 'skipped') completed++;
      else if (s?.status === 'in_progress') {
        completed += (s.progress || 0.3);
      }
    }
    return Math.round((completed / STAGE_ORDER.length) * 100);
  })();

  return (
    <WizardLayout homeDisabled={!isComplete && !error} prevRoute={false}>
      <div className="pt-20 max-w-md mx-auto">
        {/* Title */}
        <h1 className="text-[40px] font-bold leading-tight text-text">
          {isComplete ? '처리 완료' : error ? '처리 오류' : 'Whisper 처리 중'}
        </h1>

        {/* Progress bar */}
        {!error && (
          <div className="mt-8">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-text-secondary">
                {isComplete ? '완료' : `${overallProgress}%`}
              </span>
              {processingStatus?.estimated_remaining_seconds && !isComplete && (
                <span className="text-xs text-text-tertiary">
                  예상 잔여 시간: ~{Math.ceil(processingStatus.estimated_remaining_seconds / 60)}분
                </span>
              )}
            </div>
            <div className="w-full h-2 bg-bg-subtle rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: `${isComplete ? 100 : overallProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Stage checklist */}
        <div className="mt-12 space-y-4">
          {STAGE_ORDER.map((stage) => {
            const stageStatus = processingStatus?.stages[stage]?.status || 'pending';
            const isActive = stageStatus === 'in_progress';

            return (
              <div
                key={stage}
                className={`flex items-center gap-3 py-2 ${
                  isActive ? 'text-text' : stageStatus === 'pending' ? 'text-text-tertiary' : 'text-text'
                }`}
              >
                <StageIcon status={stageStatus} />
                <span className={`text-[15px] ${isActive ? 'font-medium' : ''}`}>
                  {STAGE_LABELS[stage]}
                </span>
                {stageStatus === 'in_progress' && processingStatus?.stages[stage]?.progress ? (
                  <span className="text-xs text-text-tertiary ml-auto">
                    {Math.round((processingStatus.stages[stage].progress || 0) * 100)}%
                  </span>
                ) : null}
                {stageStatus === 'skipped' && (
                  <span className="text-xs text-text-tertiary ml-auto">건너뜀</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Error state */}
        {error && (
          <div className="mt-12 bg-warning-bg rounded-xl p-5">
            <div className="flex items-start gap-3">
              <AlertCircle size={20} className="text-warning mt-0.5 shrink-0" />
              <div>
                <p className="text-[15px] text-warning-text font-medium">처리 중 오류 발생</p>
                <p className="text-sm text-warning-text/80 mt-1">{error}</p>
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={handleRetry}
                    className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary-hover cursor-pointer"
                  >
                    재시도
                  </button>
                  <button
                    onClick={handleSkipToWebSpeech}
                    className="px-4 py-2 text-sm font-medium text-text bg-bg-subtle rounded-lg hover:bg-bg-hover cursor-pointer"
                  >
                    Web Speech 결과만으로 계속
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Complete state */}
        {isComplete && (
          <div className="mt-12">
            <button
              onClick={() => navigate('/editing')}
              className="w-full flex items-center justify-center gap-2 px-5 py-3 text-[15px] font-semibold text-white bg-primary rounded-lg hover:bg-primary-hover cursor-pointer"
            >
              다음 단계
              <ArrowRight size={20} />
            </button>
          </div>
        )}
      </div>
    </WizardLayout>
  );
}
