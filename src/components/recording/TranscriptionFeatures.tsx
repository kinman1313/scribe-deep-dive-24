
import { FileText, CheckCheck, Speech } from 'lucide-react';

export function TranscriptionFeatures() {
  return (
    <div className="w-full flex items-center justify-center space-x-4 pt-2">
      <div className="flex items-center text-sm text-scribe-muted">
        <FileText className="h-4 w-4 mr-1" />
        <span>Transcription</span>
      </div>
      <div className="flex items-center text-sm text-scribe-muted">
        <CheckCheck className="h-4 w-4 mr-1" />
        <span>Action Items</span>
      </div>
      <div className="flex items-center text-sm text-scribe-muted">
        <Speech className="h-4 w-4 mr-1" />
        <span>Speaker ID</span>
      </div>
    </div>
  );
}
