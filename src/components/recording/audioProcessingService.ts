
import { toast } from '@/components/ui/use-toast';
import { invokeEdgeFunction } from '@/integrations/supabase/client';
import { TranscriptionResult } from './types';

/**
 * Process a recording by sending it to the Edge Function for transcription
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
    
    // Get current auth session info for debugging
    const { data: { session } } = await supabase.auth.getSession();
    const sessionInfo = session ? {
      userId: session.user.id,
      hasSession: true,
      expiresAt: new Date(session.expires_at * 1000).toISOString()
    } : {
      userId: 'none',
      hasSession: false,
      expiresAt: 'none'
    };
    
    console.log("Auth session check:", sessionInfo);
    
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
    
    // Call Edge Function with session info for debugging
    console.log("Invoking edge function process-audio with:", {
      audioUrl: urlData.publicUrl,
      fileName,
      userId,
      fileSize: audioBlob.size,
      sessionInfo
    });
    
    // Set a longer timeout for the edge function call
    const result = await invokeEdgeFunction<TranscriptionResult>('process-audio', {
      audioUrl: urlData.publicUrl,
      fileName,
      userId,
      fileSize: audioBlob.size,
      sessionInfo
    });
    
    if (!result) {
      throw new Error('Empty result from edge function');
    }
    
    // Check for error in the result
    if (result.error) {
      console.error("Edge function returned error:", result.error);
      throw new Error(result.error);
    }
    
    // Check for transcription in result
    if (!result.transcription) {
      console.error("No transcription in result:", result);
      throw new Error('Empty transcription result');
    }
    
    // Show a message if mock data was used (helpful for debugging)
    if (result.message && result.message.includes('mock data')) {
      console.warn("Using mock transcription data:", result.message);
      toast({
        title: "Using mock transcription",
        description: "Real transcription service unavailable. Using sample data.",
        variant: "default"
      });
    }
    
    // Call completion handler with actual transcription
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
      description: error instanceof Error ? error.message : "An unknown error occurred",
    });
    
    // Call error handler
    onError();
  }
}
