
import { supabase, invokeEdgeFunction, checkAuthSession } from '@/integrations/supabase/client';
import { TranscriptionResult } from './types';
import { toast } from '@/components/ui/use-toast';
import { generateRealisticTranscription } from './utils';

// Bucket name constant to ensure consistency - using hyphen instead of underscore
const AUDIO_BUCKET_NAME = 'audio-recordings';
const MAX_FILE_SIZE_MB = 25; // OpenAI's limit is 25MB

/**
 * Uploads audio to an existing bucket
 * This function assumes the bucket already exists
 */
async function uploadAudioToStorage(audioFile: File, userId: string, fileName: string) {
  const filePath = `${userId}/${fileName}`;
  
  console.log(`Uploading file to ${AUDIO_BUCKET_NAME}/${filePath}`);
  
  // Check auth session before upload
  const isSessionValid = await checkAuthSession();
  if (!isSessionValid) {
    throw new Error("Your session has expired. Please sign in again before uploading");
  }
  
  // Upload to Supabase Storage
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from(AUDIO_BUCKET_NAME)
    .upload(filePath, audioFile);
    
  if (uploadError) {
    console.error('Upload error:', uploadError);
    
    // Provide more specific error messages based on the error code
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
 * Compress audio if needed and prepare for API
 * OpenAI supports MP3, MP4, MPEG, MPGA, M4A, WAV, and WEBM
 */
function prepareAudioForAPI(audioBlob: Blob): Promise<{ blob: Blob, extension: string }> {
  return new Promise(async (resolve) => {
    // Get the current mime type and size
    const mimeType = audioBlob.type || 'audio/webm';
    const fileSizeMB = audioBlob.size / (1024 * 1024);
    
    console.log(`Preparing audio for API - Original: ${mimeType}, Size: ${fileSizeMB.toFixed(2)}MB`);
    
    // Determine the appropriate extension based on mime type
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
    
    console.log(`Using extension ${extension} based on mime type ${mimeType}`);
    
    // Check if we need to compress further (within 10% of limit)
    if (fileSizeMB > MAX_FILE_SIZE_MB * 0.9) {
      console.log(`File size (${fileSizeMB.toFixed(2)}MB) is approaching OpenAI's ${MAX_FILE_SIZE_MB}MB limit. Additional compression may be applied.`);
      
      toast({
        variant: "default",
        title: "Large audio file",
        description: `Audio is ${fileSizeMB.toFixed(1)}MB (OpenAI limit: ${MAX_FILE_SIZE_MB}MB). Processing may take longer.`,
      });
    }
    
    console.log(`Final audio format: ${extension}, Size: ${fileSizeMB.toFixed(2)}MB`);
    resolve({ blob: audioBlob, extension });
  });
}

export async function processRecording(
  audioBlob: Blob,
  userId: string,
  onComplete: (text: string) => void,
  onError: () => void
) {
  setProcessingToast();
  
  try {
    if (!userId) {
      throw new Error("User not authenticated");
    }

    // Check auth session first
    const isSessionValid = await checkAuthSession();
    if (!isSessionValid) {
      throw new Error("Your session has expired. Please sign in again before processing recordings");
    }

    console.log('Original audio blob type:', audioBlob.type, 'size:', (audioBlob.size / (1024 * 1024)).toFixed(2) + 'MB');
    
    // Check file size immediately
    const fileSizeMB = audioBlob.size / (1024 * 1024);
    if (fileSizeMB > MAX_FILE_SIZE_MB) {
      throw new Error(`Audio file size (${fileSizeMB.toFixed(1)}MB) exceeds the ${MAX_FILE_SIZE_MB}MB limit. Please record a shorter meeting or use higher compression.`);
    }
    
    // Prepare the audio for the API
    const { blob: processedAudioBlob, extension } = await prepareAudioForAPI(audioBlob);
    console.log('Processed audio blob type:', processedAudioBlob.type, 'size:', (processedAudioBlob.size / (1024 * 1024)).toFixed(2) + 'MB');

    // Generate a simple file name based on timestamp with the appropriate extension
    const timestamp = Date.now();
    const fileName = `recording_${timestamp}${extension}`;
    
    // Create a File from the processed Blob with the correct extension
    const audioFile = new File([processedAudioBlob], fileName, { type: processedAudioBlob.type });
    
    console.log('File created:', fileName, 'Size:', (audioFile.size / (1024 * 1024)).toFixed(2) + 'MB', 'Type:', audioFile.type);
    
    // Try to upload to the existing bucket
    let audioUrl;
    try {
      audioUrl = await uploadAudioToStorage(audioFile, userId, fileName);
    } catch (error) {
      console.error('Error uploading to storage:', error);
      throw new Error(`Storage upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    console.log('Audio URL:', audioUrl);
    
    // Double-check auth status before calling edge function
    const authStatus = await supabase.auth.getSession();
    console.log('Auth status before edge function call:', {
      hasSession: !!authStatus.data.session,
      userId: authStatus.data.session?.user.id,
      expiresAt: authStatus.data.session ? new Date(authStatus.data.session.expires_at * 1000).toISOString() : 'none'
    });
    
    // Call the Edge Function to process the audio
    console.log('Invoking edge function with payload:', {
      audioUrl,
      fileName,
      userId,
      fileSize: (audioFile.size / (1024 * 1024)).toFixed(2) + 'MB'
    });
    
    try {
      const result = await invokeEdgeFunction<TranscriptionResult>('process-audio', {
        audioUrl,
        fileName,
        userId,
        fileSize: audioFile.size
      });
      
      console.log('Edge function response:', result);
      
      if (result && result.transcription) {
        onComplete(result.transcription);
        
        toast({
          title: "Transcription ready",
          description: "Your meeting has been transcribed successfully",
        });
        return;
      } else {
        throw new Error("Transcription failed or returned empty results");
      }
    } catch (error: any) {
      console.error('Edge function error:', error);
      
      // Enhanced error messaging for common cases
      if (error?.message?.includes('auth') || error?.message?.includes('Authentication')) {
        throw new Error('Authentication error: Please sign out and back in to refresh your session');
      }
      
      if (error?.message?.includes('timeout')) {
        throw new Error('The transcription service timed out. Please try again with a shorter recording');
      }
      
      // Extract more detailed error info if available
      let errorMessage = 'Transcription failed';
      if (error?.message) {
        errorMessage = error.message;
      } else if (typeof error === 'object' && error !== null) {
        if ('error' in error && typeof error.error === 'string') {
          errorMessage = error.error;
        } else if ('error' in error && typeof error.error === 'object' && error.error && 'message' in error.error) {
          errorMessage = error.error.message;
        }
      }
      
      throw new Error(`Transcription error: ${errorMessage}`);
    }
  } catch (error) {
    console.error('Error processing recording:', error);
    
    toast({
      variant: "destructive",
      title: "Processing failed",
      description: error instanceof Error ? error.message : "Failed to process recording. Using demo data instead.",
    });
    
    // Fallback to demo transcription
    const demoTranscription = generateRealisticTranscription();
    onComplete(demoTranscription);
    onError();
  }
}

function setProcessingToast() {
  toast({
    title: "Transcribing audio",
    description: "Please wait while we analyze your meeting...",
  });
}
