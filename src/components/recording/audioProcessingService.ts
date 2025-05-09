import { toast } from '@/components/ui/use-toast';
import { invokeEdgeFunction } from '@/integrations/supabase/client';
import { TranscriptionResult } from './types';

/**
 * Convert audio blob to WAV format using FFmpeg
 */
async function convertToWAV(audioBlob: Blob): Promise<Blob> {
  try {
    console.log("Converting audio to WAV format for better transcription compatibility...");
    
    // Create a File object from the Blob
    const originalFile = new File([audioBlob], "original-recording", { type: audioBlob.type });
    
    // Create FormData to send to the Edge Function
    const formData = new FormData();
    formData.append('audioFile', originalFile);
    
    // Add origin information for debugging CORS issues
    const originInfo = {
      origin: window.location.origin,
      host: window.location.host,
      pathname: window.location.pathname
    };
    console.log("Origin information for CORS debugging:", originInfo);
    
    // Call the audio-convert Edge Function directly with formData
    const { supabase } = await import('@/integrations/supabase/client');
    
    console.log("Calling audio-convert edge function with formData containing audioFile...");
    
    // Add custom headers to help with CORS debugging
    const { data: conversionResult, error: conversionError } = await supabase.functions.invoke('audio-convert', {
      body: formData,
      headers: {
        'X-Client-Origin': window.location.origin,
        'X-Client-Info': navigator.userAgent
      }
    });
    
    if (conversionError) {
      console.error("Error converting audio:", conversionError);
      
      // Enhanced CORS error detection
      const errorMessage = conversionError.message || '';
      if (
        errorMessage.includes('CORS') || 
        errorMessage.includes('cross-origin') || 
        errorMessage.includes('blocked by') ||
        errorMessage.includes('preflight')
      ) {
        console.error("CORS error detected:", errorMessage);
        console.error("Client origin:", window.location.origin);
        console.error("User agent:", navigator.userAgent);
        throw new Error(`CORS policy error: ${errorMessage}. This is likely a server configuration issue. Please try again in a few minutes.`);
      }
      
      throw new Error(`Conversion failed: ${conversionError.message || 'Unknown error'}`);
    }
    
    if (!conversionResult || !conversionResult.audioUrl) {
      throw new Error('No audio URL returned from conversion');
    }
    
    // Fetch the converted WAV file
    const wavResponse = await fetch(conversionResult.audioUrl);
    if (!wavResponse.ok) {
      throw new Error(`Failed to fetch converted WAV: ${wavResponse.status}`);
    }
    
    const wavBlob = await wavResponse.blob();
    console.log("Audio successfully converted to WAV format:", 
      (wavBlob.size / (1024 * 1024)).toFixed(2) + "MB");
    
    return wavBlob;
  } catch (error) {
    console.error("WAV conversion failed:", error);
    toast({
      title: "Audio conversion failed",
      description: "Proceeding with original format. This may affect transcription quality.",
      variant: "destructive"
    });
    // Return original blob if conversion fails
    return audioBlob;
  }
}

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
      description: "Converting and sending to transcription service...",
    });
    
    console.log("Processing audio recording, size:", 
      (audioBlob.size / (1024 * 1024)).toFixed(2) + "MB");
    
    // Convert audio to WAV format for better OpenAI compatibility
    const processedBlob = await convertToWAV(audioBlob);
    
    // Generate unique filename
    const timestamp = Date.now();
    const extension = '.wav'; // Always use WAV extension after conversion
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
      .upload(filePath, processedBlob);
      
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
    
    // Call Edge Function with enhanced client information for debugging
    const clientInfo = {
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      origin: window.location.origin,
      pathname: window.location.pathname,
      host: window.location.host,
      href: window.location.href
    };
    
    console.log("Invoking edge function process-audio with:", {
      audioUrl: urlData.publicUrl,
      fileName,
      userId,
      fileSize: processedBlob.size,
      sessionInfo,
      clientInfo
    });
    
    // Set a longer timeout for the edge function call
    const result = await invokeEdgeFunction<TranscriptionResult>('process-audio', {
      audioUrl: urlData.publicUrl,
      fileName,
      userId,
      fileSize: processedBlob.size,
      sessionInfo,
      clientInfo
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
    
    // Enhanced error detection for different error types
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Specific error handling for different error types
    if (errorMessage.includes('CORS') || errorMessage.includes('cross-origin')) {
      toast({
        variant: "destructive",
        title: "CORS Error",
        description: "Server configuration issue detected. We're working on resolving this. Please try again later.",
      });
    } else if (errorMessage.includes('session') || errorMessage.includes('expired')) {
      toast({
        variant: "destructive",
        title: "Session Error",
        description: "Your login session has expired. Please sign in again.",
      });
    } else {
      // General error toast for other errors
      toast({
        variant: "destructive",
        title: "Transcription failed",
        description: errorMessage || "An unknown error occurred during transcription",
      });
    }
    
    // Diagnostic information toast for all errors
    toast({
      variant: "default",
      title: "Technical details",
      description: `Error type: ${error instanceof Error ? error.name : 'Unknown'}, Origin: ${window.location.origin}`,
    });
    
    // Call error handler
    onError();
  }
}
