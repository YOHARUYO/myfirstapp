export interface MeetingMetadata {
  title: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  duration_seconds: number | null;
  language: string;
  participants: string[];
  location: string | null;
  template_id: string | null;
}

export type ImportanceLevel = 'high' | 'medium' | 'low' | 'lowest';
export type ImportanceSource = 'user' | 'ai';
export type BlockSource = 'web_speech' | 'whisper' | 'user_edit';

export interface Block {
  block_id: string;
  timestamp_start: number;
  timestamp_end: number;
  text: string;
  source: BlockSource;
  is_edited: boolean;
  importance: ImportanceLevel | null;
  importance_source: ImportanceSource | null;
  speaker: string | null;
}

export type SessionStatus =
  | 'idle'
  | 'recording'
  | 'post_recording'
  | 'processing'
  | 'editing'
  | 'summarizing'
  | 'completed';

export type InputMode = 'realtime' | 'upload';

export interface RecordingGap {
  after_block_id: string;
  gap_seconds: number;
}

export interface Session {
  session_id: string;
  status: SessionStatus;
  created_at: string;
  input_mode: InputMode;
  metadata: MeetingMetadata;
  audio_chunks_dir: string;
  audio_chunk_count: number;
  blocks: Block[];
  recording_gaps: RecordingGap[];
  ai_tagging_skipped: boolean;
  summary_markdown: string;
  action_items: ActionItem[];
  keywords: string[];
}

export interface ActionItem {
  fu_id: string;
  assignee: string | null;
  task: string;
  deadline: string | null;
  source_topic: string | null;
}

export interface SlackSentInfo {
  channel_id: string;
  channel_name: string;
  thread_ts: string | null;
  message_ts: string;
  sent_at: string;
}

export interface Meeting {
  meeting_id: string;
  created_at: string;
  completed_at: string | null;
  metadata: MeetingMetadata;
  blocks: Block[];
  summary_markdown: string;
  action_items: ActionItem[];
  keywords: string[];
  slack_sent: SlackSentInfo | null;
  local_file_path: string | null;
  merged_audio_path?: string;
}

export interface MeetingListItem {
  meeting_id: string;
  title: string;
  date: string;
  duration_seconds: number | null;
  participants: string[];
  slack_sent: boolean;
  local_file_path: string | null;
}

export interface TemplateDefaults {
  title: string;
  participants: string[];
  location: string | null;
  language: string;
  slack_channel_id: string | null;
}

export interface Template {
  template_id: string;
  name: string;
  defaults: TemplateDefaults;
  created_at: string;
  updated_at: string;
}

export interface RecoverableSession {
  session_id: string;
  status: string;
  title: string;
  date: string;
  participants: string[];
  created_at: string;
}

export type WizardStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;
