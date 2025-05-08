
export interface Speaker {
  name: string;
  color: string;
}

export interface ActionItem {
  text: string;
  speaker: string;
  timestamp: string;
}

export interface TodoItem {
  task: string;
  assignee: string;
  completed: boolean;
}

export interface MockTranscriptionData {
  transcription: string;
  speakers: Speaker[];
  summary: string;
  actionItems: ActionItem[];
  todoList: TodoItem[];
  insights: string;
}

export interface RecordingInterfaceProps {
  onTranscriptionReady: (text: string) => void;
}

export interface TranscriptionResult {
  transcription: string;
  error?: string;
  message?: string;
}
