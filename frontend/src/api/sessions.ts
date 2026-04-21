import api from './client';
import type { Session, MeetingMetadata, ActionItem } from '../types';

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

export async function stopRecording(sessionId: string): Promise<Session> {
  const res = await api.post(`/sessions/${sessionId}/stop`);
  return res.data;
}

export async function resumeRecording(sessionId: string): Promise<Session> {
  const res = await api.post(`/sessions/${sessionId}/resume`);
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

export async function startProcessing(sessionId: string): Promise<void> {
  await api.post(`/sessions/${sessionId}/process`);
}

export interface ProcessingStatus {
  status: 'processing' | 'completed' | 'error';
  stage: string;
  stages: Record<string, { status: string; progress?: number }>;
  estimated_remaining_seconds?: number;
  error?: string;
}

export async function getProcessingStatus(sessionId: string): Promise<ProcessingStatus> {
  const res = await api.get(`/sessions/${sessionId}/process/status`);
  return res.data;
}

export async function retagBlocks(sessionId: string): Promise<{ tagged_count: number }> {
  const res = await api.post(`/sessions/${sessionId}/tag`);
  return res.data;
}

export interface SummarizeResult {
  summary_markdown: string;
  action_items: ActionItem[];
  keywords: string[];
}

export async function summarizeSession(sessionId: string): Promise<SummarizeResult> {
  const res = await api.post(`/sessions/${sessionId}/summarize`);
  return res.data;
}

export async function updateSummary(sessionId: string, data: {
  summary_markdown?: string;
  action_items?: ActionItem[];
}): Promise<void> {
  await api.patch(`/sessions/${sessionId}/metadata`, data);
}
