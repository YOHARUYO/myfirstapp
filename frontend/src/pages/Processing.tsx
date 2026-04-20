import { useEffect } from 'react';
import WizardLayout from '../components/wizard/WizardLayout';
import { useWizardStore } from '../stores/wizardStore';

export default function Processing() {
  const setStep = useWizardStore((s) => s.setStep);

  useEffect(() => {
    setStep(4);
  }, [setStep]);

  return (
    <WizardLayout homeDisabled prevRoute={false}>
      <div className="text-center py-16">
        <h2 className="text-lg font-semibold text-text mb-2">
          Whisper 후처리
        </h2>
        <p className="text-sm text-text-secondary">4단계 — 준비 중</p>
      </div>
    </WizardLayout>
  );
}
