
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

  // Track total recording size to monitor for OpenAI's 25MB limit
  const [estimatedSize, setEstimatedSize] = useState<number>(0);
  const MAX_SIZE_MB = 25;

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
    setEstimatedSize(0);
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000, // 16kHz for speech - matches what we'll convert to
          channelCount: 1, // Mono recording - better for speech
        } 
      });
      
      // Try to use uncompressed audio format for highest quality
      const mimeType = MediaRecorder.isTypeSupported('audio/wav') 
        ? 'audio/wav' 
        : MediaRecorder.isTypeSupported('audio/webm') 
          ? 'audio/webm'
          : 'audio/mp3';
      
      console.log(`Using MIME type: ${mimeType} for recording`);
      
      // Use high quality audio for best transcription results
      const options: MediaRecorderOptions = {
        mimeType: mimeType,
        audioBitsPerSecond: 128000, // 128kbps for good quality source
      };
      
      mediaRecorderRef.current = new MediaRecorder(stream, options);
      
      mediaRecorderRef.current.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          // Update estimated size
          const newEstimatedSize = audioChunksRef.current.reduce((total, chunk) => total + chunk.size, 0) / (1024 * 1024);
          setEstimatedSize(newEstimatedSize);
          
          // Warn if getting close to limit
          if (newEstimatedSize > (MAX_SIZE_MB * 0.8) && newEstimatedSize < MAX_SIZE_MB) {
            toast({
              title: "Recording size warning",
              description: `Recording is approaching the 25MB limit (${newEstimatedSize.toFixed(1)}MB)`,
              variant: "default"
            });
          } else if (newEstimatedSize >= MAX_SIZE_MB) {
            // Auto-stop if exceeding limit
            stopRecording();
            toast({
              title: "Recording stopped",
              description: `Recording exceeded the ${MAX_SIZE_MB}MB limit. Processing shorter recording.`,
              variant: "destructive"
            });
          }
        }
      });
      
      mediaRecorderRef.current.addEventListener('stop', () => {
        console.log(`Recording stopped. Chunks: ${audioChunksRef.current.length}, Est. size: ${estimatedSize.toFixed(2)}MB`);
        
        if (audioChunksRef.current.length === 0) {
          toast({
            variant: "destructive",
            title: "Recording error",
            description: "No audio was recorded. Please try again.",
          });
          return;
        }
        
        // Use the original format since we aren't converting
        const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorderRef.current?.mimeType || 'audio/webm' });
        const url = URL.createObjectURL(audioBlob);
        setAudioURL(url);
        
        console.log('Recording stopped. Audio blob:', audioBlob.type, 'size:', (audioBlob.size / (1024 * 1024)).toFixed(2) + 'MB');
        
        // Process the recording using the transcription service
        if (user) {
          setIsProcessing(true);
          processRecording(
            audioBlob, 
            user.id, 
            onTranscriptionReady,
            () => {
              // Just set processing to false if there's an error
              setIsProcessing(false);
            }
          ).finally(() => setIsProcessing(false));
        }
      });
      
      // Start recording with smaller timeslice for more frequent chunks and size monitoring
      mediaRecorderRef.current.start(500);
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
        description: `Processing your recording (${estimatedSize.toFixed(1)}MB)...`,
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
                ? `Capturing audio (${estimatedSize.toFixed(1)}MB / ${MAX_SIZE_MB}MB)...` 
                : isProcessing
                  ? 'Processing your recording...'
                  : 'Click the button below to start recording your meeting'}
            </p>
            {isRecording && (
              <p className="text-xs text-blue-600 mt-1">
                Recording in original format. Max file size: {MAX_SIZE_MB}MB
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
