import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import WizardStepper from './WizardStepper';
import Modal from '../common/Modal';
import { useWizardStore } from '../../stores/wizardStore';

interface Props {
  children: ReactNode;
  showStepper?: boolean;
  /** Show "이전 단계" button. Pass the route path or false to hide */
  prevRoute?: string | false;
  /** Disable "이전 단계" button (e.g., during recording) */
  prevDisabled?: boolean;
  /** Disable home icon (e.g., during processing) */
  homeDisabled?: boolean;
  /** Custom message for the home modal */
  homeModalMessage?: string;
  /** Called before navigating home (e.g., to stop recording) */
  onBeforeHome?: () => void;
}

export default function WizardLayout({
  children,
  showStepper = true,
  prevRoute,
  prevDisabled,
  homeDisabled,
  homeModalMessage,
  onBeforeHome,
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

  return (
    <div className="max-w-3xl mx-auto min-h-screen flex flex-col overflow-x-hidden">
      {showStepper && (
        <div className="border-b border-border">
          <WizardStepper onHomeClick={handleHomeClick} homeDisabled={homeDisabled} />
        </div>
      )}
      <div className="flex-1 p-6">{children}</div>

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
