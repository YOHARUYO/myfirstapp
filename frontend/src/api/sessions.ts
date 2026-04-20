import api from './client';
import type { Session, MeetingMetadata } from '../types';

export async function createSession(inputMode: string, metadata: Partial<MeetingMetadata>): Promise<Session> {
  const res = await api.post('/sessions', { input_mode: inputMode, metadata });
  return res.data;
}

export async function getSession(sessionId: string): Promise<Session> {
  const res = await api.get(`/sessions/${sessionId}`);
  return res.data;
}

export async function updateMetadata(sessionId: string, data: Partial<MeetingMetadata>): Promise<Session> {
  const res = await api.patch(`/sessions/${sessionId}/metadata`, data);
  return res.data;
}

export async function deleteSession(sessionId: string): Promise<void> {
  await api.delete(`/sessions/${sessionId}`);
}

export async function uploadAudioFile(sessionId: string, file: File): Promise<void> {
  const formData = new FormData();
  formData.append('file', file);
  await api.post(`/sessions/${sessionId}/upload`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}
