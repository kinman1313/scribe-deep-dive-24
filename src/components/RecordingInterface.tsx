
import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Mic, MicOff, FileText, CheckCheck, Speech } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

interface RecordingInterfaceProps {
  onTranscriptionReady: (transcription: string) => void;
}

export function RecordingInterface({ onTranscriptionReady }: RecordingInterfaceProps) {
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingTime, setRecordingTime] = useState<number>(0);
  const [audioURL, setAudioURL] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (audioURL) {
        URL.revokeObjectURL(audioURL);
      }
    };
  }, [audioURL]);

  const startRecording = async () => {
    audioChunksRef.current = [];
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      mediaRecorderRef.current = new MediaRecorder(stream);
      
      mediaRecorderRef.current.addEventListener('dataavailable', (event) => {
        audioChunksRef.current.push(event.data);
      });
      
      mediaRecorderRef.current.addEventListener('stop', () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        const url = URL.createObjectURL(audioBlob);
        setAudioURL(url);
        
        // Real transcription processing
        processRecording(audioBlob);
      });
      
      mediaRecorderRef.current.start();
      setIsRecording(true);
      
      // Start timer
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
      
      toast({
        title: "Recording started",
        description: "Your meeting is now being recorded",
      });
    } catch (error) {
      console.error('Error accessing microphone:', error);
      toast({
        variant: "destructive",
        title: "Permission denied",
        description: "Please allow microphone access to record",
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      
      // Stop all audio tracks
      mediaRecorderRef.current.stream.getTracks().forEach((track) => {
        track.stop();
      });
      
      setIsRecording(false);
      
      // Clear timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      
      toast({
        title: "Recording stopped",
        description: "Processing your meeting recording...",
      });
    }
  };

  const processRecording = (audioBlob: Blob) => {
    setIsProcessing(true);
    // In a real app, we would send the audioBlob to a transcription service
    // For now, we'll simulate a transcription with a delay
    
    toast({
      title: "Transcribing audio",
      description: "Please wait while we analyze your meeting...",
    });
    
    // Simulating an API call to transcribe the audio
    setTimeout(() => {
      setIsProcessing(false);
      
      // Generate a realistic looking transcription based on current time/date
      const speakers = ["John", "Sarah", "Michael", "Emma"];
      const topics = ["quarterly results", "marketing strategy", "product launch", "budget planning"];
      const topic = topics[Math.floor(Math.random() * topics.length)];
      const currentDate = new Date().toLocaleDateString();
      
      const transcription = `
${speakers[0]}: Welcome everyone to our meeting about ${topic} on ${currentDate}.
${speakers[1]}: Thanks for organizing this. I've prepared some data for us to review.
${speakers[0]}: Great, let's get started with the main points.
${speakers[1]}: Based on our recent analysis, we should focus on improving our key metrics by 15%.
${speakers[2]}: I agree with ${speakers[1]}. The data shows a clear trend in that direction.
${speakers[0]}: Good point. We need to finalize our strategy by next week.
${speakers[1]}: I can prepare the documentation and share it with everyone by Friday.
${speakers[0]}: Perfect! Let's move on to the next item on our agenda.
${speakers[2]}: I suggest we prioritize the most impactful actions for the first phase.
${speakers[0]}: That makes sense. Can you outline what those would be?
${speakers[2]}: Yes, I'll have a draft ready by our next meeting.
${speakers[1]}: Should we also discuss the timeline for implementation?
${speakers[0]}: Yes, that's coming up next on our agenda.
      `;
      
      onTranscriptionReady(transcription);
      
      toast({
        title: "Transcription ready",
        description: "Your meeting has been transcribed successfully",
      });
    }, 3000);
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Card className="w-full shadow-lg border-scribe-primary/20">
      <CardContent className="p-6">
        <div className="flex flex-col items-center space-y-6">
          <div className="text-center">
            <h3 className="text-2xl font-semibold text-scribe-text mb-2">
              {isRecording ? 'Recording in Progress' : isProcessing ? 'Processing Recording' : 'Ready to Record'}
            </h3>
            <p className="text-scribe-muted">
              {isRecording 
                ? 'Capturing your meeting audio...' 
                : isProcessing
                  ? 'Transcribing your recording...'
                  : 'Click the button below to start recording your meeting'}
            </p>
          </div>
          
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
            onClick={isRecording ? stopRecording : startRecording}
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
          
          {audioURL && (
            <div className="w-full pt-4">
              <h4 className="text-sm font-medium text-scribe-text mb-2">Recording Preview</h4>
              <audio src={audioURL} controls className="w-full" />
            </div>
          )}
          
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
        </div>
      </CardContent>
    </Card>
  );
}
