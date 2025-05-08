
import { toast } from '@/components/ui/use-toast';
import { TranscriptionResult } from './types';
import { AudioService } from '@/services/AudioService';
import { generateRealisticTranscription } from './utils';

/**
 * Process a recording by uploading it to Supabase storage and sending it to the Edge Function
 */
export async function processRecording(
  audioBlob: Blob,
  userId: string,
  onComplete: (text: string) => void,
  onError: () => void
) {
  // Show initial toast
  toast({
    title: "Transcribing audio",
    description: "Please wait while we analyze your meeting...",
  });
  
  try {
    // Use the AudioService to process the recording
    await AudioService.processRecording(
      audioBlob, 
      userId, 
      (transcription) => {
        onComplete(transcription);
        
        toast({
          title: "Transcription ready",
          description: "Your meeting has been transcribed successfully",
        });
      },
      onError
    );
  } catch (error) {
    console.error('Error in processRecording:', error);
    
    // Show appropriate error message
    const errorMessage = error instanceof Error 
      ? error.message 
      : "Unknown error occurred. Using demo data instead.";
    
    toast({
      variant: "destructive",
      title: "Processing failed",
      description: errorMessage,
    });
    
    // Fallback to demo data
    const demoTranscription = generateRealisticTranscription();
    onComplete(demoTranscription);
    onError();
  }
}
