
import { useState, useRef, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { RecordingButton } from './recording/RecordingButton';
import { AudioPreview } from './recording/AudioPreview';
import { TranscriptionFeatures } from './recording/TranscriptionFeatures';
import { processRecording } from './recording/audioProcessingService';
import { RecordingInterfaceProps } from './recording/types';

export function RecordingInterface({ onTranscriptionReady }: RecordingInterfaceProps) {
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingTime, setRecordingTime] = useState<number>(0);
  const [audioURL, setAudioURL] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [useDemoData, setUseDemoData] = useState<boolean>(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const { user } = useAuth();

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
    setUseDemoData(false);
    
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
        
        // Process the recording using the real transcription service
        if (user) {
          setIsProcessing(true);
          processRecording(
            audioBlob, 
            user.id, 
            onTranscriptionReady,
            () => setUseDemoData(true)
          ).finally(() => setIsProcessing(false));
        }
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
                  ? 'Transcribing and analyzing your recording...'
                  : 'Click the button below to start recording your meeting'}
            </p>
            {useDemoData && (
              <p className="text-xs text-amber-600 mt-2">
                Note: Currently showing demo data. Check console for debugging information.
              </p>
            )}
          </div>
          
          <RecordingButton
            isRecording={isRecording}
            isProcessing={isProcessing}
            recordingTime={recordingTime}
            onStartRecording={startRecording}
            onStopRecording={stopRecording}
          />
          
          <AudioPreview audioURL={audioURL} />
          
          <TranscriptionFeatures />
        </div>
      </CardContent>
    </Card>
  );
}
