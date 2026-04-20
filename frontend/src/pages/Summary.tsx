import { useEffect } from 'react';
import WizardLayout from '../components/wizard/WizardLayout';
import { useWizardStore } from '../stores/wizardStore';

export default function Summary() {
  const setStep = useWizardStore((s) => s.setStep);

  useEffect(() => {
    setStep(6);
  }, [setStep]);

  return (
    <WizardLayout prevRoute="/editing">
      <div className="text-center py-16">
        <h2 className="text-lg font-semibold text-text mb-2">
          요약 & 액션 아이템
        </h2>
        <p className="text-sm text-text-secondary">6단계 — 준비 중</p>
      </div>
    </WizardLayout>
  );
}
