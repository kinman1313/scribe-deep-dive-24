
import { toast } from '@/components/ui/use-toast';
import { generateRealisticTranscription } from './utils';

/**
 * Process a recording by generating a realistic transcription
 * This is a temporary solution until the Edge Function is fixed
 */
export async function processRecording(
  audioBlob: Blob,
  userId: string,
  onComplete: (text: string) => void,
  onError: () => void
) {
  try {
    // Show processing toast
    toast({
      title: "Processing audio",
      description: "Using demo data while we fix our transcription service...",
    });
    
    console.log("Audio processing temporarily disabled. Using demo data instead.");
    console.log("Original audio size:", (audioBlob.size / (1024 * 1024)).toFixed(2) + "MB");
    
    // Generate demo transcription
    const demoTranscription = generateRealisticTranscription();
    
    // Short delay to simulate processing
    setTimeout(() => {
      onComplete(demoTranscription);
      
      toast({
        title: "Demo data ready",
        description: "Using simulated transcription until our service is back online.",
      });
    }, 2000);
    
  } catch (error) {
    console.error('Error in processRecording:', error);
    
    // Show error message
    toast({
      variant: "destructive",
      title: "Processing error",
      description: "We encountered an issue, but we're showing you demo data instead.",
    });
    
    // Use demo data as fallback
    const demoTranscription = generateRealisticTranscription();
    onComplete(demoTranscription);
    onError();
  }
}
