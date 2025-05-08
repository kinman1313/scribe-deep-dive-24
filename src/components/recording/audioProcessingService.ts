
import { toast } from '@/components/ui/use-toast';
import { generateRealisticTranscription } from './utils';
import { invokeEdgeFunction } from '@/integrations/supabase/client';
import { TranscriptionResult } from './types';

/**
 * Process a recording by sending it to the Edge Function or using demo data
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
      description: "Sending to transcription service...",
    });
    
    console.log("Processing audio recording, size:", 
      (audioBlob.size / (1024 * 1024)).toFixed(2) + "MB");
    
    // Generate unique filename
    const timestamp = Date.now();
    const extension = audioBlob.type.includes('webm') ? '.webm' : '.mp3';
    const fileName = `recording_${timestamp}${extension}`;
    
    // Upload to Supabase Storage
    const { supabase } = await import('@/integrations/supabase/client');
    
    // Upload the file to Supabase Storage
    const filePath = `${userId}/${fileName}`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('audio-recordings')
      .upload(filePath, audioBlob);
      
    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`);
    }
    
    // Get file URL
    const { data: urlData } = supabase.storage
      .from('audio-recordings')
      .getPublicUrl(filePath);
      
    if (!urlData || !urlData.publicUrl) {
      throw new Error('Failed to get file URL');
    }
    
    // Call Edge Function
    const result = await invokeEdgeFunction<TranscriptionResult>('process-audio', {
      audioUrl: urlData.publicUrl,
      fileName,
      userId,
      fileSize: audioBlob.size
    });
    
    if (!result || !result.transcription) {
      throw new Error('Empty transcription result');
    }
    
    // Log any error message from the edge function (didn't prevent success)
    if (result.error) {
      console.warn('Edge function warning:', result.error);
    }
    
    // Call completion handler
    onComplete(result.transcription);
    
    // Show success message
    toast({
      title: "Transcription complete",
      description: "Your recording has been processed successfully.",
    });
    
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
