
import { supabase, invokeEdgeFunction } from '@/integrations/supabase/client';
import { TranscriptionResult } from './types';
import { toast } from '@/components/ui/use-toast';
import { generateRealisticTranscription } from './utils';

// Bucket name constant to ensure consistency - using hyphen instead of underscore
const AUDIO_BUCKET_NAME = 'audio-recordings';

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

    // Generate a file name based on timestamp with a reduced size - avoiding special characters
    const timestamp = Date.now();
    const fileName = `recording_${timestamp}.wav`;
    
    // Create a File from the Blob
    const audioFile = new File([audioBlob], fileName, { type: 'audio/wav' });
    
    console.log('File created:', fileName, 'Size:', audioFile.size, 'Type:', audioFile.type);
    
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
      userId
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
          userId
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
          userFacingErrorMessage = "OpenAI service error. The API key might be invalid or the service might be down.";
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
