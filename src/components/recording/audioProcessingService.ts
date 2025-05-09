
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
    
    if (result.error) {
      throw new Error(result.error);
    }
    
    if (!result.transcription) {
      throw new Error('Empty transcription result');
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
