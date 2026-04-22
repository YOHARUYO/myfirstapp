import { Check, Home } from 'lucide-react';
import { useWizardStore } from '../../stores/wizardStore';
import type { WizardStep } from '../../types';

const STEPS: { step: WizardStep; label: string }[] = [
  { step: 1, label: '홈' },
  { step: 2, label: '정보' },
  { step: 3, label: '녹음' },
  { step: 4, label: '처리' },
  { step: 5, label: '편집' },
  { step: 6, label: '요약' },
  { step: 7, label: '전송' },
];

interface Props {
  onHomeClick?: () => void;
  homeDisabled?: boolean;
}

export default function WizardStepper({ onHomeClick, homeDisabled }: Props) {
  const { currentStep, inputMode } = useWizardStore();

  const isSkipped = (step: WizardStep) =>
    step === 3 && inputMode === 'upload';

  return (
    <div className="flex items-center justify-center gap-1 py-5 px-6">
      {/* Home icon */}
      {onHomeClick && (
        <button
          onClick={onHomeClick}
          disabled={homeDisabled}
          className="mr-3 p-1.5 rounded-lg text-text-secondary hover:text-text hover:bg-bg-subtle transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
          title="홈으로"
        >
          <Home size={18} />
        </button>
      )}

      {STEPS.map(({ step, label }, i) => {
        const skipped = isSkipped(step);
        const active = step === currentStep;
        const completed = step < currentStep;

        return (
          <div key={step} className="flex items-center">
            {i > 0 && (
              <div
                className={`w-4 md:w-10 h-px mx-0.5 md:mx-1.5 transition-colors ${
                  completed ? 'bg-primary' : 'bg-border'
                }`}
              />
            )}
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`w-6 h-6 md:w-8 md:h-8 rounded-full flex items-center justify-center text-[10px] md:text-xs font-medium transition-colors ${
                  active
                    ? 'bg-primary text-white'
                    : completed
                    ? 'bg-primary text-white'
                    : skipped
                    ? 'bg-bg-subtle text-text-tertiary border border-dashed border-importance-low'
                    : 'bg-bg-subtle text-text-secondary border border-border'
                }`}
              >
                {completed ? <Check size={14} strokeWidth={2.5} /> : step}
              </div>
              <span
                className={`text-xs hidden md:block ${
                  active
                    ? 'text-primary font-medium'
                    : skipped
                    ? 'text-text-tertiary'
                    : 'text-text-secondary'
                }`}
              >
                {skipped ? '건너뜀' : label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
