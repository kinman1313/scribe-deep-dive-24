
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
    
    // Check if session is valid
    if (!session || !session.user) {
      throw new Error("Your session has expired. Please sign in again.");
    }
    
    // Upload the file to Supabase Storage
    const filePath = `${userId}/${fileName}`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('audio-recordings')
      .upload(filePath, audioBlob);
      
    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      throw new Error(`Upload failed: ${uploadError.message}`);
    }
    
    console.log("File uploaded successfully:", uploadData);
    
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
    
    console.log("Edge function response received:", result);
    
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
    
    // Check if the transcription contains the mock data indicator
    const isMockData = result.message && result.message.includes('mock data');
    
    // Show a message if mock data was used (helpful for debugging)
    if (isMockData) {
      console.warn("Using mock transcription data:", result.message);
      toast({
        title: "OpenAI API Key Issue",
        description: result.message || "Using mock data. Check the Edge Function logs for details.",
        variant: "destructive"
      });
    } else {
      // Success message for actual transcription
      toast({
        title: "Transcription complete",
        description: "Your recording has been processed successfully.",
      });
    }
    
    // Call completion handler with actual transcription
    onComplete(result.transcription);
    
  } catch (error) {
    console.error('Error in processRecording:', error);
    
    // Show detailed error message
    toast({
      variant: "destructive",
      title: "Transcription failed",
      description: error instanceof Error ? error.message : "An unknown error occurred during transcription",
    });
    
    // Additional troubleshooting toast with common fixes
    toast({
      variant: "default",
      title: "Troubleshooting tips",
      description: "Check your Edge Function logs in the Supabase dashboard to see detailed error messages. Verify that your OpenAI API key is correctly formatted (starts with 'sk-').",
    });
    
    // Call error handler
    onError();
  }
}
