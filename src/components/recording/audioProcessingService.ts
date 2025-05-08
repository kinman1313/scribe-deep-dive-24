
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

/**
 * Convert the audioBlob to proper format for OpenAI API
 * OpenAI supports MP3, MP4, MPEG, MPGA, M4A, WAV, and WEBM
 * We'll convert to MP3 which is widely supported
 */
function ensureProperAudioFormat(audioBlob: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    // Create an audio context
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    const audioContext = new AudioContext();
    
    // Create a file reader to read the blob
    const fileReader = new FileReader();
    
    fileReader.onload = async () => {
      try {
        // Decode the audio data
        const arrayBuffer = fileReader.result as ArrayBuffer;
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        // Create an offline audio context to render the audio
        const offlineAudioContext = new OfflineAudioContext(
          audioBuffer.numberOfChannels,
          audioBuffer.length,
          audioBuffer.sampleRate
        );
        
        // Create a buffer source
        const source = offlineAudioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(offlineAudioContext.destination);
        source.start();
        
        // Render the audio
        const renderedBuffer = await offlineAudioContext.startRendering();
        
        // Convert the buffer to wav format
        const wavBlob = bufferToWav(renderedBuffer);
        
        console.log('Audio successfully converted to WAV format, size:', wavBlob.size);
        resolve(wavBlob);
      } catch (error) {
        console.error('Error converting audio format:', error);
        reject(error);
      }
    };
    
    fileReader.onerror = (error) => {
      console.error('FileReader error:', error);
      reject(error);
    };
    
    // Read the blob as an array buffer
    fileReader.readAsArrayBuffer(audioBlob);
  });
}

/**
 * Convert an AudioBuffer to a WAV Blob
 * This function creates a proper WAV file that OpenAI can process
 */
function bufferToWav(buffer: AudioBuffer): Blob {
  const numberOfChannels = buffer.numberOfChannels;
  const length = buffer.length * numberOfChannels * 2; // 2 bytes per sample (16-bit)
  const sampleRate = buffer.sampleRate;
  
  // Create a buffer for the WAV file
  const arrayBuffer = new ArrayBuffer(44 + length);
  const view = new DataView(arrayBuffer);
  
  // Write WAV header
  // "RIFF" chunk descriptor
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + length, true);
  writeString(view, 8, 'WAVE');
  
  // "fmt " sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // 16 bytes for PCM format
  view.setUint16(20, 1, true); // PCM format (1)
  view.setUint16(22, numberOfChannels, true); // Number of channels
  view.setUint32(24, sampleRate, true); // Sample rate
  view.setUint32(28, sampleRate * numberOfChannels * 2, true); // Byte rate
  view.setUint16(32, numberOfChannels * 2, true); // Block align
  view.setUint16(34, 16, true); // Bits per sample
  
  // "data" sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, length, true);
  
  // Write actual audio data
  const offset = 44;
  let index = 0;
  
  // Interleave channels
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numberOfChannels; channel++) {
      // Get the sample from the channel data
      const sample = buffer.getChannelData(channel)[i];
      
      // Convert float to 16-bit signed integer
      const sample16bit = Math.max(-1, Math.min(1, sample)) * 0x7FFF;
      
      // Write the 16-bit sample
      view.setInt16(offset + index, sample16bit, true);
      index += 2; // 2 bytes per sample
    }
  }
  
  return new Blob([view], { type: 'audio/wav' });
}

/**
 * Helper function to write strings to a DataView
 */
function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
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

    console.log('Original audio blob type:', audioBlob.type, 'size:', audioBlob.size);
    
    // Convert the audio to proper WAV format for OpenAI
    let processedAudioBlob;
    try {
      processedAudioBlob = await ensureProperAudioFormat(audioBlob);
      console.log('Processed audio blob type:', processedAudioBlob.type, 'size:', processedAudioBlob.size);
    } catch (error) {
      console.error('Error processing audio format:', error);
      throw new Error(`Failed to process audio format: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Generate a simple file name based on timestamp - avoiding special characters
    const timestamp = Date.now();
    const fileName = `audio_${timestamp}.wav`;
    
    // Create a File from the processed Blob
    const audioFile = new File([processedAudioBlob], fileName, { type: 'audio/wav' });
    
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
          userFacingErrorMessage = "OpenAI service error. The audio format may be unsupported.";
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
