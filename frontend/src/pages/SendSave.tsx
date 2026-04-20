import { useEffect } from 'react';
import WizardLayout from '../components/wizard/WizardLayout';
import { useWizardStore } from '../stores/wizardStore';

export default function SendSave() {
  const setStep = useWizardStore((s) => s.setStep);

  useEffect(() => {
    setStep(7);
  }, [setStep]);

  return (
    <WizardLayout prevRoute="/summary">
      <div className="text-center py-16">
        <h2 className="text-lg font-semibold text-text mb-2">
          전송 & 저장
        </h2>
        <p className="text-sm text-text-secondary">7단계 — 준비 중</p>
      </div>
    </WizardLayout>
  );
}
