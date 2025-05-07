
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
        
        // Mock transcription service (in real app, you'd send to a transcription API)
        simulateTranscription(audioBlob);
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

  const simulateTranscription = (audioBlob: Blob) => {
    // Simulating an API call to transcribe the audio
    toast({
      title: "Transcribing audio",
      description: "Please wait while we analyze your meeting...",
    });
    
    // For demo purposes, we'll simulate a delay and then provide a mock transcription
    setTimeout(() => {
      const mockTranscription = `
John: Hi everyone, thanks for joining today's call about the Q3 marketing plan.
Sarah: Thanks John, I've prepared some data on our previous campaign performance.
John: Great! Let's start with the social media strategy.
Sarah: Based on our Q2 results, we should increase our budget for LinkedIn campaigns by 15%.
Michael: I agree with Sarah. The LinkedIn campaigns had a 24% higher conversion rate compared to other platforms.
John: Good point. We need to finalize the budget allocation by next Monday and share it with the finance team.
Sarah: I can prepare the breakdown and send it to everyone by Friday.
John: Perfect! Let's move on to the content calendar for Q3.
Michael: I suggest we focus on product updates and customer testimonials for the first month.
John: That makes sense. Can you prepare a draft content plan by our next meeting?
Michael: Yes, I'll have it ready by then.
Sarah: Should we also discuss our upcoming product launch?
John: Yes, that's on the agenda for the second half of the meeting.
      `;
      
      onTranscriptionReady(mockTranscription);
      
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
              {isRecording ? 'Recording in Progress' : 'Ready to Record'}
            </h3>
            <p className="text-scribe-muted">
              {isRecording 
                ? 'Capturing your meeting audio...' 
                : 'Click the button below to start recording your meeting'}
            </p>
          </div>
          
          <div className="relative">
            <div 
              className={cn(
                "h-20 w-20 rounded-full flex items-center justify-center",
                isRecording 
                  ? "bg-red-500 animate-pulse-recording" 
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
          >
            {isRecording ? 'Stop Recording' : 'Start Recording'}
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
