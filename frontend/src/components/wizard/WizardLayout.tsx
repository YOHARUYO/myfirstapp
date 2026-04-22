import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import WizardStepper from './WizardStepper';
import Modal from '../common/Modal';
import { useWizardStore } from '../../stores/wizardStore';

interface Props {
  children: ReactNode;
  showStepper?: boolean;
  prevRoute?: string | false;
  prevDisabled?: boolean;
  homeDisabled?: boolean;
  homeModalMessage?: string;
  onBeforeHome?: () => void;
  /** Slot for the "next step" button — rendered in the bottom nav bar right side */
  nextSlot?: ReactNode;
}

export default function WizardLayout({
  children,
  showStepper = true,
  prevRoute,
  prevDisabled,
  homeDisabled,
  homeModalMessage,
  onBeforeHome,
  nextSlot,
}: Props) {
  const navigate = useNavigate();
  const currentStep = useWizardStore((s) => s.currentStep);
  const [homeModalOpen, setHomeModalOpen] = useState(false);

  const handleHomeClick = () => {
    if (currentStep <= 1) {
      navigate('/');
    } else {
      setHomeModalOpen(true);
    }
  };

  const handleHomeConfirm = () => {
    setHomeModalOpen(false);
    onBeforeHome?.();
    navigate('/');
  };

  const hasPrev = prevRoute !== false && !!prevRoute;
  const hasBottomBar = hasPrev || !!nextSlot;

  return (
    <div className="max-w-3xl mx-auto min-h-screen flex flex-col overflow-x-hidden">
      {showStepper && (
        <div className="border-b border-border">
          <WizardStepper onHomeClick={handleHomeClick} homeDisabled={homeDisabled} />
        </div>
      )}
      <div className="flex-1 p-6">{children}</div>

      {/* 하단 네비게이션 바 — 이전(Secondary) + 다음(Primary) 대칭 */}
      {hasBottomBar && (
        <div className={`px-6 pb-6 flex items-center ${hasPrev ? 'justify-between' : 'justify-end'}`}>
          {hasPrev && (
            <button
              onClick={() => navigate(prevRoute as string)}
              disabled={prevDisabled}
              className="flex items-center gap-1.5 bg-bg-subtle text-text-secondary rounded-lg px-5 py-3 text-[15px] font-medium hover:bg-bg-hover transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ArrowLeft size={16} />
              이전 단계
            </button>
          )}
          {nextSlot}
        </div>
      )}

      {/* Home confirmation modal */}
      <Modal open={homeModalOpen} onClose={() => setHomeModalOpen(false)}>
        <p className="text-[15px] text-text leading-relaxed">
          {homeModalMessage || '홈으로 돌아가시겠어요? 현재 진행 상태는 저장됩니다.'}
        </p>
        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={() => setHomeModalOpen(false)}
            className="px-4 py-2 text-sm font-medium text-text-secondary bg-bg-subtle rounded-lg hover:bg-bg-hover cursor-pointer"
          >
            취소
          </button>
          <button
            onClick={handleHomeConfirm}
            className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary-hover cursor-pointer"
          >
            홈으로
          </button>
        </div>
      </Modal>
    </div>
  );
}
