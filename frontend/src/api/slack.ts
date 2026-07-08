import api from './client';

export interface SlackChannel {
  id: string;
  name: string;
}

export interface SlackMessage {
  ts: string;
  user_name: string;
  is_bot: boolean;
  text_preview: string;
  reply_count: number;
  has_attachments: boolean;
  sent_at: string;
}

export async function listChannels(): Promise<SlackChannel[]> {
  const res = await api.get('/slack/channels');
  return res.data.channels;
}

export async function listMessages(channelId: string, limit: number = 20): Promise<SlackMessage[]> {
  const res = await api.get(`/slack/channels/${channelId}/messages`, { params: { limit } });
  return res.data.messages;
}

export interface SlackSendResult {
  success: boolean;
  channel_name: string;
  message_ts: string;
  thread_ts: string | null;
  md_attached: boolean | null;
  // Phase 1B — multi-message 전송 결과
  main_ts?: string;
  topics_ts?: string | null;
  slack_sent?: {
    channel_id: string;
    channel_name: string;
    thread_ts: string | null;
    messages: Record<string, { ts: string; text: string; sent_at: string }>;
    message_ts: string;
    sent_at: string;
    deleted: boolean;
    deleted_at: string | null;
  };
}

export async function sendSlackMessage(
  sessionId: string,
  channelId: string,
  threadTs?: string | null,
  attachMd: boolean = true,
): Promise<SlackSendResult> {
  const res = await api.post('/slack/send', {
    session_id: sessionId,
    channel_id: channelId,
    thread_ts: threadTs || null,
    attach_md: attachMd,
  });
  return res.data;
}

export async function deleteSlackMessage(
  channelId: string,
  messageTs: string,
): Promise<{ success: boolean; deleted_ts: string }> {
  const res = await api.delete('/slack/message', {
    data: { channel_id: channelId, message_ts: messageTs },
  });
  return res.data;
}

export async function updateSlackMessage(
  channelId: string,
  messageTs: string,
  text: string,
  meetingId?: string,
  messageKey?: 'main' | 'topics',
): Promise<{ success: boolean; message_ts: string }> {
  const res = await api.patch('/slack/message', {
    channel_id: channelId,
    message_ts: messageTs,
    text,
    meeting_id: meetingId,
    message_key: messageKey,
  });
  return res.data;
}

export async function testConnection(): Promise<{ ok: boolean; bot_name?: string; error?: string }> {
  const res = await api.get('/slack/test');
  return res.data;
}
