
import { supabase, invokeEdgeFunction } from '@/integrations/supabase/client';
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
  
  // Upload to Supabase Storage
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from(AUDIO_BUCKET_NAME)
    .upload(filePath, audioFile);
    
  if (uploadError) {
    console.error('Upload error:', uploadError);
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
      
      // We could apply additional compression here if needed
      // For now, we're relying on the MediaRecorder settings in RecordingInterface.tsx
      // But we log a warning for monitoring
      toast({
        variant: "warning",
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
    
    // Call the Edge Function to process the audio
    console.log('Invoking edge function with payload:', {
      audioUrl,
      fileName,
      userId,
      fileSize: (audioFile.size / (1024 * 1024)).toFixed(2) + 'MB'
    });
    
    try {
      // Add a timeout promise to detect if the edge function takes too long
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Edge function timeout after 30 seconds')), 30000);
      });
      
      // Race the edge function call against the timeout
      const result = await Promise.race([
        invokeEdgeFunction<TranscriptionResult>('process-audio', {
          audioUrl,
          fileName,
          userId,
          fileSize: audioFile.size
        }),
        timeoutPromise
      ]) as TranscriptionResult;
      
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
      
      // Attempt to extract more detailed error information
      let errorMessage = "Unknown error";
      let errorType = "unknown";
      
      if (error && typeof error === 'object') {
        if ('message' in error) {
          errorMessage = error.message;
        }
        if ('error' in error && typeof error.error === 'object' && error.error && 'message' in error.error) {
          errorMessage = error.error.message;
        }
        if ('error' in error && typeof error.error === 'object' && error.error && 'errorType' in error.error) {
          errorType = error.error.errorType;
        }
      }
      
      console.error('Error details:', { errorMessage, errorType });
      
      // Provide more specific error message based on the error type
      let userFacingErrorMessage = "";
      switch(errorType) {
        case 'configuration':
          userFacingErrorMessage = "Server configuration error. The OpenAI API key may be missing.";
          break;
        case 'auth':
          userFacingErrorMessage = "Authentication failed. Please try logging out and back in.";
          break;
        case 'request':
          userFacingErrorMessage = "Invalid request to the transcription service.";
          break;
        case 'network':
        case 'storage':
          userFacingErrorMessage = "Failed to access the audio file. Storage permissions might be incorrect.";
          break;
        case 'conversion':
          userFacingErrorMessage = "Failed to process the audio file format.";
          break;
        case 'openai':
          userFacingErrorMessage = "OpenAI service error. The audio format may be unsupported or the file may be too large.";
          break;
        case 'parsing':
          userFacingErrorMessage = "Error processing the transcription response.";
          break;
        default:
          userFacingErrorMessage = `Processing error: ${errorMessage}`;
      }
      
      throw new Error(`Process-audio function failed: ${userFacingErrorMessage}`);
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
