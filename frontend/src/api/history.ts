import api from './client';
import type { MeetingListItem, Meeting } from '../types';

export async function listMeetings(): Promise<MeetingListItem[]> {
  const res = await api.get('/meetings');
  return res.data;
}

export async function getMeeting(meetingId: string): Promise<Meeting> {
  const res = await api.get(`/meetings/${meetingId}`);
  return res.data;
}

export async function searchMeetings(q?: string, from?: string, to?: string): Promise<MeetingListItem[]> {
  const res = await api.get('/meetings/search', { params: { q, from, to } });
  return res.data;
}
