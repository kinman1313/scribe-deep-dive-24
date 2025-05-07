
import { supabase, invokeEdgeFunction } from '@/integrations/supabase/client';
import { TranscriptionResult } from './types';
import { toast } from '@/components/ui/use-toast';
import { generateRealisticTranscription } from './utils';

// Bucket name constant to ensure consistency
const AUDIO_BUCKET_NAME = 'audio_recordings';

/**
 * Ensures the audio recordings bucket exists in Supabase
 * Creates it if it doesn't exist
 */
async function ensureBucketExists() {
  try {
    // Check if bucket exists
    const { data: buckets, error } = await supabase.storage.listBuckets();
    
    if (error) {
      console.error('Error checking buckets:', error);
      throw error;
    }
    
    const bucketExists = buckets.some(bucket => bucket.name === AUDIO_BUCKET_NAME);
    
    // Create bucket if it doesn't exist
    if (!bucketExists) {
      console.log(`Creating bucket: ${AUDIO_BUCKET_NAME}`);
      const { error: createError } = await supabase.storage.createBucket(AUDIO_BUCKET_NAME, {
        public: true, // Allow public access to files
      });
      
      if (createError) {
        console.error('Error creating bucket:', createError);
        throw createError;
      }
      console.log(`Successfully created bucket: ${AUDIO_BUCKET_NAME}`);
    } else {
      console.log(`Bucket ${AUDIO_BUCKET_NAME} already exists`);
    }
    
    return true;
  } catch (error) {
    console.error('Error ensuring bucket exists:', error);
    return false;
  }
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

    // Ensure bucket exists before upload
    const bucketReady = await ensureBucketExists();
    if (!bucketReady) {
      throw new Error("Failed to prepare storage bucket");
    }

    // Generate a file name based on date and time
    const fileName = `recording_${Date.now()}.wav`;
    const filePath = `${userId}/${fileName}`;
    
    // Create a File from the Blob
    const audioFile = new File([audioBlob], fileName, { type: 'audio/wav' });
    
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

    const audioUrl = publicUrlData.publicUrl;
    console.log('Audio URL:', audioUrl);
    
    // Call the Edge Function to process the audio
    console.log('Invoking edge function with payload:', {
      audioUrl,
      fileName,
      userId
    });
    
    const result = await invokeEdgeFunction<TranscriptionResult>('process-audio', {
      audioUrl,
      fileName,
      userId
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
