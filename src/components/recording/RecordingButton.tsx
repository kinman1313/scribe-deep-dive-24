
import { Mic, MicOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatTime } from './utils';

interface RecordingButtonProps {
  isRecording: boolean;
  isProcessing: boolean;
  recordingTime: number;
  onStartRecording: () => void;
  onStopRecording: () => void;
}

export function RecordingButton({
  isRecording,
  isProcessing,
  recordingTime,
  onStartRecording,
  onStopRecording
}: RecordingButtonProps) {
  return (
    <div className="flex flex-col items-center space-y-6">
      <div className="relative">
        <div 
          className={cn(
            "h-20 w-20 rounded-full flex items-center justify-center",
            isRecording 
              ? "bg-red-500 animate-pulse-recording" 
              : isProcessing
                ? "bg-amber-500 animate-pulse"
                : "bg-scribe-primary"
          )}
        >
          {isRecording ? (
            <MicOff className="h-8 w-8 text-white" />
          ) : (
            <Mic className="h-8 w-8 text-white" />
          )}
        </div>
        {isRecording && (
          <div className="absolute -top-2 -right-2 bg-red-600 text-white text-xs px-2 py-1 rounded-full">
            {formatTime(recordingTime)}
          </div>
        )}
      </div>
      
      <Button
        onClick={isRecording ? onStopRecording : onStartRecording}
        variant="default"
        size="lg"
        className={cn(
          "w-full max-w-xs",
          isRecording 
            ? "bg-red-500 hover:bg-red-600" 
            : "bg-scribe-primary hover:bg-scribe-secondary"
        )}
        disabled={isProcessing}
      >
        {isRecording ? 'Stop Recording' : isProcessing ? 'Processing...' : 'Start Recording'}
      </Button>
    </div>
  );
}
