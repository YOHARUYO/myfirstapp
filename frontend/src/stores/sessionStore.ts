import { create } from 'zustand';
import type { Session } from '../types';

interface SessionState {
  session: Session | null;
  setSession: (session: Session | null) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  session: null,
  setSession: (session) => set({ session }),
}));
