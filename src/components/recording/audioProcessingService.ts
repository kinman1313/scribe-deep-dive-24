import { toast } from '@/components/ui/use-toast'
import { TranscriptionResult } from './types'
import { supabase } from '@/integrations/supabase/client'

function generateDemoTranscription(): string {
  return `John: Good morning everyone, let's get started with our Q3 marketing plan review.
Sarah: Thanks John. Before we dive in, I'd like to share some interesting data from our Q2 campaigns. Our LinkedIn ads are showing a 24% higher conversion rate compared to other platforms.
Michael: That's impressive. Do we have a breakdown of the costs per acquisition across channels?
Sarah: Yes, LinkedIn is slightly more expensive but given the higher conversion rate, the ROI actually works out better.
John: Based on these numbers, I think we should consider increasing our LinkedIn budget by about 15% for Q3.`
}

export async function processRecording(
  audioBlob: Blob,
  userId: string,
  onComplete: (text: string) => void,
  onError: () => void
) {
  try {
    toast({
      title: 'Processing audio',
      description: 'Uploading and preparing your recording...',
    })

    console.log('Processing audio recording, size:', `${(audioBlob.size / (1024 * 1024)).toFixed(2)}MB`)

    const extension = audioBlob.type.includes('wav') ? 'wav' : audioBlob.type.includes('mp3') ? 'mp3' : 'webm'
    const fileName = `recording_${Date.now()}.${extension}`
    const filePath = `${userId}/${fileName}`

    console.log(`Using original audio format: ${audioBlob.type}, file: ${fileName}`)

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('audio-recordings')
      .upload(filePath, audioBlob)

    if (uploadError) {
      console.error('Storage upload error:', uploadError)
      throw new Error(`Upload failed: ${uploadError.message}`)
    }

    console.log('File uploaded successfully:', uploadData)

    toast({
      title: 'Transcribing audio',
      description: 'Your recording is being processed by the AI...',
    })

    const payload = {
      filePath: uploadData.path,
      fileName,
      analyze: true,
    }

    const { data: functionData, error: functionError } = await supabase.functions.invoke<TranscriptionResult>(
      'process-audio',
      { body: payload }
    )

    if (functionError) {
      console.error('Edge function invocation error:', functionError)
      // Check for specific error types from the function response if available
      const errorBody = await functionError.context?.json()
      if (errorBody && errorBody.error) {
        throw new Error(`Transcription service error: ${errorBody.error}`)
      }
      throw new Error(`Edge function error: ${functionError.message}`)
    }

    if (!functionData) {
      throw new Error('Empty result from edge function')
    }

    if (functionData.error) {
      console.error('Edge function returned error:', functionData.error)
      throw new Error(functionData.error)
    }

    if (!functionData.transcription) {
      console.error('No transcription in result:', functionData)
      throw new Error('Empty transcription result')
    }

    toast({
      title: 'Transcription complete',
      description: 'Your recording has been processed successfully.',
    })

    onComplete(functionData.transcription)
  } catch (error) {
    console.error('Error in processRecording:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)

    // Log a more descriptive error toast
    toast({
      variant: 'destructive',
      title: 'Transcription failed',
      description: errorMessage || 'An unknown error occurred.',
    })

    // Check if we should fall back to demo data for specific unrecoverable errors
    const isConnectivityError = errorMessage.includes('network') || errorMessage.includes('failed to fetch')
    if (isConnectivityError) {
      toast({
        title: 'Using Demo Data',
        description: 'Could not connect to the transcription service. Displaying demo data.',
      })
      const demoText = generateDemoTranscription()
      onComplete(demoText)
    }

    onError()
  }
}
