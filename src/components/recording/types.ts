
export interface TranscriptionResult {
  transcription: string;
  summary?: string;
  actionItems?: string[];
}

export interface RecordingInterfaceProps {
  onTranscriptionReady: (transcription: string) => void;
}
