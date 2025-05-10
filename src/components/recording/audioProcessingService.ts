import { toast } from '@/components/ui/use-toast';
import { TranscriptionResult } from './types';
import { supabase } from '@/integrations/supabase/client';

/**
 * Generate demo transcription when real transcription fails
 */
function generateDemoTranscription(): string {
  return `
John: Good morning everyone, let's get started with our Q3 marketing plan review.

Sarah: Thanks John. Before we dive in, I'd like to share some interesting data from our Q2 campaigns. Our LinkedIn ads are showing a 24% higher conversion rate compared to other platforms.

Michael: That's impressive. Do we have a breakdown of the costs per acquisition across channels?

Sarah: Yes, LinkedIn is slightly more expensive but given the higher conversion rate, the ROI actually works out better.

John: Based on these numbers, I think we should consider increasing our LinkedIn budget by about 15% for Q3.
`;
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
      description: "Sending to transcription service...",
    });
    
    console.log("Processing audio recording, size:", 
      (audioBlob.size / (1024 * 1024)).toFixed(2) + "MB");
    
    // Generate unique filename based on original format
    const timestamp = Date.now();
    const extension = audioBlob.type.includes('wav') ? '.wav' : 
                     audioBlob.type.includes('mp3') ? '.mp3' : '.webm';
    const fileName = `recording_${timestamp}${extension}`;
    
    console.log(`Using original audio format: ${audioBlob.type}, file: ${fileName}`);
    
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
    
    // Upload directly to the existing bucket (no need to try creating it)
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
    
    // Call Edge Function with enhanced client information for debugging
    const clientInfo = {
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      origin: window.location.origin,
      pathname: window.location.pathname,
      host: window.location.host,
      href: window.location.href
    };
    
    console.log("Preparing to call process-audio edge function with:", {
      audioUrl: urlData.publicUrl,
      fileName,
      userId,
      fileSize: audioBlob.size,
      sessionInfo,
      clientInfo
    });
    
    // Call the Edge Function using the Supabase client
    try {
      toast({
        title: "Transcribing audio",
        description: "Processing your recording...",
      });
      
      console.log("Calling process-audio edge function");
      
      const payload = {
        audioUrl: urlData.publicUrl,
        fileName,
        userId,
        fileSize: audioBlob.size,
        sessionInfo,
        clientInfo,
        analyze: true // Request additional analysis
      };
      
      // Make the actual call
      const { data: functionData, error: functionError } = await supabase.functions.invoke<TranscriptionResult>(
        'process-audio',
        {
          body: payload
        }
      );
      
      if (functionError) {
        console.error("Edge function error:", functionError);
        throw new Error(`Edge function error: ${functionError.message}`);
      }
      
      console.log("Edge function response received:", functionData);
      
      if (!functionData) {
        throw new Error('Empty result from edge function');
      }
      
      // Check for error in the result
      if (functionData.error) {
        console.error("Edge function returned error:", functionData.error);
        throw new Error(functionData.error);
      }
      
      // Check for transcription in result
      if (!functionData.transcription) {
        console.error("No transcription in result:", functionData);
        throw new Error('Empty transcription result');
      }
      
      // Check if the transcription contains the mock data indicator
      const isMockData = functionData.message && functionData.message.includes('mock data');
      
      // Show a message if mock data was used (helpful for debugging)
      if (isMockData) {
        console.warn("Using mock transcription data:", functionData.message);
        toast({
          title: "Using Demo Data",
          description: functionData.message || "Using demo data. Check the Edge Function logs for details.",
          variant: "default"
        });
      } else {
        // Success message for actual transcription
        toast({
          title: "Transcription complete",
          description: "Your recording has been processed successfully.",
        });
      }
      
      // Call completion handler with actual transcription
      onComplete(functionData.transcription);
    } catch (error) {
      console.error('Error calling process-audio edge function:', error);
      
      // Check if this is a deployment issue
      const errorString = String(error);
      if (errorString.includes('not found') || 
          errorString.includes('404') || 
          errorString.includes('not deployed') || 
          errorString.includes('NetworkError') ||
          errorString.includes('net::ERR_FAILED')) {
        
        console.error('Function deployment error detected:', errorString);
        
        toast({
          variant: "destructive",
          title: "Edge Function Connectivity Issue",
          description: "Cannot reach the transcription service. Using demo data instead.",
        });
        
        // Use demo data when function isn't deployed
        const demoText = generateDemoTranscription();
        onComplete(demoText);
      } else {
        // For other errors, rethrow
        throw error;
      }
    }
    
  } catch (error) {
    console.error('Error in processRecording:', error);
    
    // Enhanced error detection for different error types
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Specific error handling for different error types
    if (errorMessage.includes('CORS') || errorMessage.includes('cross-origin')) {
      toast({
        variant: "destructive",
        title: "CORS Error",
        description: "Server configuration issue detected. Using demo data instead.",
      });
    } else if (errorMessage.includes('session') || errorMessage.includes('expired')) {
      toast({
        variant: "destructive",
        title: "Session Error",
        description: "Your login session has expired. Please sign in again.",
      });
    } else if (errorMessage.includes('not found') || 
              errorMessage.includes('404') || 
              errorMessage.includes('not deployed') ||
              errorMessage.includes('NetworkError') ||
              errorMessage.includes('ERR_FAILED')) {
      toast({
        variant: "destructive",
        title: "Edge Function Error",
        description: "Cannot reach the transcription service. Using demo data instead.",
      });
    } else {
      // General error toast for other errors
      toast({
        variant: "destructive",
        title: "Transcription failed",
        description: errorMessage || "An unknown error occurred during transcription",
      });
    }
    
    // Use demo transcription if there was an error
    const demoText = generateDemoTranscription();
    onComplete(demoText);
    
    // Call error handler
    onError();
  }
}
