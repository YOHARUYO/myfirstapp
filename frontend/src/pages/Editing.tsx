import { useEffect } from 'react';
import WizardLayout from '../components/wizard/WizardLayout';
import { useWizardStore } from '../stores/wizardStore';

export default function Editing() {
  const setStep = useWizardStore((s) => s.setStep);

  useEffect(() => {
    setStep(5);
  }, [setStep]);

  return (
    <WizardLayout prevDisabled>
      <div className="text-center py-16">
        <h2 className="text-lg font-semibold text-text mb-2">
          회의록 편집
        </h2>
        <p className="text-sm text-text-secondary">5단계 — 준비 중</p>
      </div>
    </WizardLayout>
  );
}
