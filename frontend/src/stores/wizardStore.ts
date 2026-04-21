import { create } from 'zustand';
import type { WizardStep, InputMode } from '../types';

interface WizardState {
  currentStep: WizardStep;
  inputMode: InputMode;
  editMode: 'session' | 'meeting';
  editedAfterSummary: boolean;
  setStep: (step: WizardStep) => void;
  setInputMode: (mode: InputMode) => void;
  setEditMode: (mode: 'session' | 'meeting') => void;
  setEditedAfterSummary: () => void;
  clearEditedAfterSummary: () => void;
  reset: () => void;
}

export const useWizardStore = create<WizardState>((set) => ({
  currentStep: 1,
  inputMode: 'realtime',
  editMode: 'session',
  editedAfterSummary: false,
  setStep: (step) => set({ currentStep: step }),
  setInputMode: (mode) => set({ inputMode: mode }),
  setEditMode: (mode) => set({ editMode: mode }),
  setEditedAfterSummary: () => set({ editedAfterSummary: true }),
  clearEditedAfterSummary: () => set({ editedAfterSummary: false }),
  reset: () => set({ currentStep: 1, inputMode: 'realtime', editMode: 'session', editedAfterSummary: false }),
}));
