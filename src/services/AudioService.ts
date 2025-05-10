import { supabase, checkAuthSession } from '@/integrations/supabase/client';
import { TranscriptionResult } from '@/components/recording/types';
import { logError, formatErrorMessage } from '@/utils/errorLogger';

const AUDIO_BUCKET_NAME = 'audio-recordings';
const MAX_FILE_SIZE_MB = 25; // OpenAI's limit is 25MB

export class AudioService {
  /**
   * Process a recording by uploading it to Supabase storage and sending it to the Edge Function
   */
  static async processRecording(
    audioBlob: Blob,
    userId: string,
    onTranscriptionReady: (text: string) => void,
    onFallbackToDemo: () => void
  ): Promise<void> {
    console.log('Starting audio processing');
    
    try {
      if (!userId) {
        throw new Error("User not authenticated");
      }

      // Check auth session first
      const isSessionValid = await checkAuthSession();
      if (!isSessionValid) {
        throw new Error("Your session has expired. Please sign in again before processing recordings");
      }

      // Check file size immediately
      const fileSizeMB = audioBlob.size / (1024 * 1024);
      if (fileSizeMB > MAX_FILE_SIZE_MB) {
        throw new Error(`Audio file size (${fileSizeMB.toFixed(1)}MB) exceeds the ${MAX_FILE_SIZE_MB}MB limit. Please record a shorter meeting or use higher compression.`);
      }
      
      // Prepare and upload the audio file
      console.log('Original audio blob type:', audioBlob.type, 'size:', fileSizeMB.toFixed(2) + 'MB');
      const { processedFile, fileName } = await this.prepareAudioFile(audioBlob);
      const audioUrl = await this.uploadFile(processedFile, userId, fileName);
      
      // Process the audio file
      const result = await this.processAudioWithEdgeFunction(audioUrl, fileName, userId, processedFile.size);
      
      // Handle the result
      if (result && result.transcription) {
        onTranscriptionReady(result.transcription);
      } else {
        throw new Error("Transcription failed or returned empty results");
      }
    } catch (error) {
      console.error('Error processing recording:', error);
      
      // Use demo data instead
      const demoTranscription = this.generateDemoTranscription();
      onTranscriptionReady(demoTranscription);
      onFallbackToDemo();
      
      // Re-throw for the caller to handle showing toast
      throw error;
    }
  }
  
  /**
   * Prepare the audio file for upload and processing
   */
  private static async prepareAudioFile(audioBlob: Blob): Promise<{ processedFile: File, fileName: string }> {
    // Determine the appropriate extension based on mime type
    const mimeType = audioBlob.type || 'audio/webm';
    let extension = '.mp3'; // Default
    
    if (mimeType.includes('webm')) {
      extension = '.webm';
    } else if (mimeType.includes('mp3') || mimeType.includes('mpeg')) {
      extension = '.mp3';
    } else if (mimeType.includes('m4a')) {
      extension = '.m4a';
    } else if (mimeType.includes('wav')) {
      extension = '.wav';
    } else if (mimeType.includes('mp4')) {
      extension = '.mp4';
    }
    
    // Generate a unique filename
    const timestamp = Date.now();
    const fileName = `recording_${timestamp}${extension}`;
    
    // Create a File from the Blob with the correct extension
    const processedFile = new File([audioBlob], fileName, { type: mimeType });
    
    console.log(`Prepared audio file: ${fileName}, Size: ${(processedFile.size / (1024 * 1024)).toFixed(2)}MB, Type: ${processedFile.type}`);
    
    return { processedFile, fileName };
  }
  
  /**
   * Upload the audio file to Supabase storage
   */
  private static async uploadFile(file: File, userId: string, fileName: string): Promise<string> {
    const filePath = `${userId}/${fileName}`;
    
    console.log(`Uploading file to ${AUDIO_BUCKET_NAME}/${filePath}`);
    
    // Check auth session before upload
    const isSessionValid = await checkAuthSession();
    if (!isSessionValid) {
      throw new Error("Your session has expired. Please sign in again before uploading");
    }
    
    // Upload to Supabase Storage (bucket should already exist from our SQL migration)
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(AUDIO_BUCKET_NAME)
      .upload(filePath, file);
      
    if (uploadError) {
      console.error('Upload error:', uploadError);
      
      if (uploadError.message.includes('storage.update_policy') || uploadError.message.includes('permission')) {
        throw new Error(`Storage permission error: You don't have access to upload files. Please sign in again.`);
      }
      
      throw new Error(`Error uploading audio: ${uploadError.message}`);
    }

    console.log('File uploaded successfully:', uploadData);

    // Get the public URL for the uploaded file
    const { data: publicUrlData } = supabase.storage
      .from(AUDIO_BUCKET_NAME)
      .getPublicUrl(filePath);

    if (!publicUrlData || !publicUrlData.publicUrl) {
      throw new Error("Failed to get public URL for audio file");
    }

    console.log('Got public URL:', publicUrlData.publicUrl);
    return publicUrlData.publicUrl;
  }
  
  /**
   * Process the audio file with the Edge Function
   */
  private static async processAudioWithEdgeFunction(
    audioUrl: string, 
    fileName: string, 
    userId: string, 
    fileSize: number
  ): Promise<TranscriptionResult> {
    console.log('Processing audio with Edge Function');
    
    // Double-check auth status before calling edge function
    const authStatus = await supabase.auth.getSession();
    console.log('Auth status before edge function call:', {
      hasSession: !!authStatus.data.session,
      userId: authStatus.data.session?.user.id,
      expiresAt: authStatus.data.session ? new Date(authStatus.data.session.expires_at * 1000).toISOString() : 'none'
    });
    
    try {
      // Add request timestamp and client info to help with debugging CORS issues
      const payload = {
        audioUrl,
        fileName,
        userId,
        fileSize,
        clientInfo: {
          timestamp: new Date().toISOString(),
          userAgent: navigator.userAgent,
          origin: window.location.origin
        }
      };
      
      console.log('Enhanced payload for edge function:', payload);
      
      // Call the Edge Function using the Supabase SDK
      const { data, error } = await supabase.functions.invoke<TranscriptionResult>(
        'process-audio',
        {
          body: payload
        }
      );
      
      if (error) {
        console.error('Edge function error:', error);
        throw new Error(`Edge function error: ${error.message}`);
      }
      
      if (!data) {
        throw new Error('Empty response from edge function');
      }
      
      console.log('Edge function response:', data);
      return data;
    } catch (error) {
      console.error('Edge function error:', error);
      
      // Enhanced error handling with CORS-specific detection
      if (error instanceof Error) {
        const errorMessage = error.message;
        
        // Check specifically for CORS errors
        if (errorMessage.includes('blocked by CORS') || errorMessage.includes('CORS policy')) {
          console.error('CORS error detected:', errorMessage);
          throw new Error('Cross-origin request blocked. Please check server CORS configuration.');
        }
        
        if (errorMessage.includes('auth') || errorMessage.includes('Authentication')) {
          throw new Error('Authentication error: Please sign out and back in to refresh your session');
        }
        
        if (errorMessage.includes('timeout')) {
          throw new Error('The transcription service timed out. Please try again with a shorter recording');
        }
      }
      
      throw error;
    }
  }
  
  /**
   * Generate a realistic transcription for demo purposes
   */
  private static generateDemoTranscription(): string {
    return `
John: Good morning everyone, let's get started with our Q3 marketing plan review.

Sarah: Thanks John. Before we dive in, I'd like to share some interesting data from our Q2 campaigns. Our LinkedIn ads are showing a 24% higher conversion rate compared to other platforms.

Michael: That's impressive. Do we have a breakdown of the costs per acquisition across channels?

Sarah: Yes, LinkedIn is slightly more expensive but given the higher conversion rate, the ROI actually works out better.

John: Based on these numbers, I think we should consider increasing our LinkedIn budget by about 15% for Q3.

Sarah: I agree. I can prepare a detailed breakdown by Friday for everyone to review.

Michael: Sounds good. What about our content calendar for Q3?

John: For the first month, I suggest we focus on product updates and customer testimonials, since those performed well last quarter.

Michael: I can draft a content plan for that approach and share it before our next meeting.

John: Perfect. Let's also make sure we discuss the upcoming product launch in the second half of today's meeting.

Sarah: Just a reminder that we need to finalize the budget allocation by next Monday for the finance team.

John: Noted. Let's plan to wrap that up today if possible.
`;
  }
}
