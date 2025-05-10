
export interface TranscriptionResult {
  transcription: string;
  summary?: string;
  speakers?: Speaker[];
  actionItems?: ActionItem[];
  keyPoints?: string[];
  error?: string;
  message?: string;
}

export interface Speaker {
  id: string;
  name: string;
}

export interface ActionItem {
  text: string;
  assignee?: string;
  priority?: 'low' | 'medium' | 'high';
}

export interface RecordingOptions {
  format: 'audio/webm' | 'audio/mp3' | 'audio/wav';
  duration?: number; // in seconds
  sampleRate?: number;
  channels?: number;
}

export interface TranscriptionAnalysis {
  summary: string;
  speakers: Speaker[];
  actionItems: ActionItem[];
  keyPoints: string[];
}
