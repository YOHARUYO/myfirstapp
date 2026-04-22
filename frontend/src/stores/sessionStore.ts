import { create } from 'zustand';
import type { Session } from '../types';

interface SessionState {
  session: Session | null;
  editMode: 'session' | 'meeting';
  editingMeetingId: string | null;
  setSession: (session: Session | null) => void;
  setEditMode: (mode: 'session' | 'meeting', meetingId?: string | null) => void;
  reset: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  session: null,
  editMode: 'session',
  editingMeetingId: null,
  setSession: (session) => set({ session }),
  setEditMode: (mode, meetingId = null) => set({ editMode: mode, editingMeetingId: meetingId }),
  reset: () => set({ session: null, editMode: 'session', editingMeetingId: null }),
}));
