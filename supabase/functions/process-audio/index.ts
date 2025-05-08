
// Follow this setup guide to integrate the Supabase Edge Functions Starter:
// https://supabase.io/docs/guides/functions/quickstart

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.2'

// Define CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Environment variables
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')

// Constants
const AUDIO_BUCKET_NAME = 'audio-recordings'
const FUNCTION_TIMEOUT_MS = 25000 // 25 seconds
const DOWNLOAD_TIMEOUT_MS = 10000 // 10 seconds
const API_TIMEOUT_MS = 20000 // 20 seconds
const MAX_FILE_SIZE_MB = 25 // OpenAI's limit

// Types
interface RequestPayload {
  audioUrl: string
  fileName: string
  userId: string
  fileSize?: number
}

interface TranscriptionResult {
  transcription: string
  summary?: string
  actionItems?: string[]
}

// Helper functions
function createJsonResponse(body: unknown, status: number) {
  return new Response(
    JSON.stringify(body),
    { 
      status: status, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    }
  )
}

function handleError(error: unknown, errorType: string, status = 500, additionalInfo = {}) {
  console.error(`${errorType} error:`, error)
  
  // Extract error message
  let errorMessage = 'Unknown error occurred'
  if (error instanceof Error) {
    errorMessage = error.message
  } else if (typeof error === 'string') {
    errorMessage = error
  } else if (typeof error === 'object' && error !== null) {
    errorMessage = JSON.stringify(error)
  }
  
  return createJsonResponse({ 
    error: errorMessage, 
    errorType,
    ...additionalInfo
  }, status)
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  
  try {
    const result = await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener('abort', () => reject(new Error(errorMessage)))
      })
    ]) as T
    
    clearTimeout(timeoutId)
    return result
  } catch (error) {
    clearTimeout(timeoutId)
    throw error
  }
}

serve(async (req) => {
  // Set overall function timeout
  const functionTimeout = setTimeout(() => {
    console.error('Function execution timed out after 25 seconds')
  }, FUNCTION_TIMEOUT_MS)
  
  try {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
      clearTimeout(functionTimeout)
      return new Response('ok', { headers: corsHeaders })
    }
    
    // Get auth header and log request info
    const authHeader = req.headers.get('Authorization')
    console.log(`Edge function process-audio - received ${req.method} request with auth: ${authHeader ? 'present' : 'missing'}`)
    
    const requestStartTime = Date.now()
    
    // Check for required environment variables
    if (!OPENAI_API_KEY) {
      console.error('OpenAI API key is not configured')
      clearTimeout(functionTimeout)
      return handleError('OpenAI API key is not configured', 'configuration')
    }
    
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.error('Supabase URL or anon key is not configured')
      clearTimeout(functionTimeout)
      return handleError('Supabase configuration is missing', 'configuration')
    }
    
    // Check for auth header
    if (!authHeader) {
      console.error('Missing Authorization header')
      clearTimeout(functionTimeout)
      return handleError('Missing Authorization header. Make sure you are signed in.', 'auth', 401)
    }
    
    console.log('Auth header received:', authHeader.substring(0, 20) + '...')
    
    // Create supabase client
    const supabaseClient = createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    )
    
    // Validate authentication
    try {
      const { data: authData, error: authError } = await supabaseClient.auth.getUser()
      if (authError) {
        console.error('Auth validation error:', authError)
        clearTimeout(functionTimeout)
        return handleError(`Auth validation failed: ${authError.message}`, 'auth', 401)
      }
      
      console.log('Auth validated successfully for user:', authData.user?.id)
    } catch (authValidationError) {
      console.error('Auth validation exception:', authValidationError)
      clearTimeout(functionTimeout)
      return handleError(
        `Auth validation exception: ${authValidationError instanceof Error ? authValidationError.message : 'Unknown error'}`, 
        'auth', 
        401
      )
    }
    
    console.log('Edge function started - Supabase client created and auth validated')
    
    // Parse request payload
    let requestData: RequestPayload
    try {
      requestData = await withTimeout(
        req.json(),
        5000,
        'Request parsing timed out after 5 seconds'
      )
      
      console.log('Request data successfully parsed:', JSON.stringify(requestData, null, 2))
    } catch (error) {
      console.error('Error parsing request JSON:', error)
      clearTimeout(functionTimeout)
      return handleError('Invalid or malformed request body', 'request', 400)
    }
    
    // Validate required fields
    const { audioUrl, fileName, userId, fileSize } = requestData
    
    if (!audioUrl || !fileName || !userId) {
      clearTimeout(functionTimeout)
      return handleError('Missing required fields', 'request', 400, {
        received: { audioUrl: !!audioUrl, fileName: !!fileName, userId: !!userId }
      })
    }
    
    // Check file size if provided
    if (fileSize && fileSize > MAX_FILE_SIZE_MB * 1024 * 1024) {
      clearTimeout(functionTimeout)
      return handleError(
        `Audio file size (${(fileSize / (1024 * 1024)).toFixed(1)}MB) exceeds the OpenAI ${MAX_FILE_SIZE_MB}MB limit`,
        'request',
        400
      )
    }
    
    console.log('Attempting to fetch audio file from URL:', audioUrl)
    
    // Verify storage access
    try {
      const { data: storageData, error: storageError } = await supabaseClient.storage
        .from(AUDIO_BUCKET_NAME)
        .list(userId)
        
      if (storageError) {
        console.error('Error listing bucket contents:', storageError)
        clearTimeout(functionTimeout)
        return handleError(`Failed to list bucket contents: ${storageError.message}`, 'storage')
      } 
      
      console.log('Successfully accessed bucket. Found files:', storageData.map(f => f.name).join(', '))
    } catch (error) {
      console.error('Exception accessing bucket:', error)
      clearTimeout(functionTimeout)
      return handleError(
        `Exception accessing bucket: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'storage'
      )
    }
    
    // Download audio file
    let audioBlob: Blob
    let downloadMethod = ""
    
    try {
      // First try to download using Supabase storage API
      try {
        downloadMethod = "supabase.storage.download"
        const { data: fileData, error: fileError } = await withTimeout(
          supabaseClient.storage
            .from(AUDIO_BUCKET_NAME)
            .download(`${userId}/${fileName}`),
          DOWNLOAD_TIMEOUT_MS,
          'Supabase storage download timed out'
        )
        
        if (fileError) {
          throw new Error(`Supabase storage download failed: ${fileError.message}`)
        }
        
        if (!fileData) {
          throw new Error('File download successful but returned null data')
        }
        
        audioBlob = fileData
        console.log('Successfully downloaded file from Supabase Storage, size:', 
          (audioBlob.size / (1024 * 1024)).toFixed(2) + 'MB', 
          'type:', audioBlob.type)
      } catch (storageError) {
        // Fall back to URL fetch if direct storage download fails
        console.error('Supabase storage download failed, falling back to URL fetch:', storageError)
        
        downloadMethod = "direct URL fetch"
        const audioResponse = await withTimeout(
          fetch(audioUrl),
          DOWNLOAD_TIMEOUT_MS,
          'Audio download timed out after 10 seconds'
        )
        
        if (!audioResponse.ok) {
          console.error(`Failed to fetch audio file. Status: ${audioResponse.status}, Status text: ${audioResponse.statusText}`)
          clearTimeout(functionTimeout)
          return handleError(
            `Failed to fetch audio file: ${audioResponse.statusText}`,
            'storage',
            500,
            { status: audioResponse.status, url: audioUrl }
          )
        }
        
        // Get audio data as blob
        audioBlob = await audioResponse.blob()
        console.log('Audio blob created via URL fetch. Size:', 
          (audioBlob.size / (1024 * 1024)).toFixed(2) + 'MB', 
          'Type:', audioBlob.type)
      }
    } catch (fetchError) {
      console.error('Both storage methods failed:', fetchError)
      clearTimeout(functionTimeout)
      return handleError(
        `Failed to access audio file by any method: ${fetchError instanceof Error ? fetchError.message : 'Unknown error'}`,
        'storage'
      )
    }
    
    // Validate audio blob
    if (!audioBlob || audioBlob.size === 0) {
      clearTimeout(functionTimeout)
      return handleError(
        audioBlob ? 'Audio blob is empty (zero size)' : 'Failed to convert audio response to blob',
        'conversion'
      )
    }
    
    // Verify audio size
    const audioSizeMB = audioBlob.size / (1024 * 1024)
    if (audioSizeMB > MAX_FILE_SIZE_MB) {
      clearTimeout(functionTimeout)
      return handleError(
        `Audio file size (${audioSizeMB.toFixed(1)}MB) exceeds the OpenAI ${MAX_FILE_SIZE_MB}MB limit`,
        'request',
        400
      )
    }
    
    // Log audio details
    console.log(`Audio blob details - Size: ${audioSizeMB.toFixed(2)}MB, Type: ${audioBlob.type || 'unknown'}`)
    console.log(`Downloaded using method: ${downloadMethod}`)
    
    // Get file extension from filename
    const fileExtension = fileName.includes('.') ? fileName.substring(fileName.lastIndexOf('.')).toLowerCase() : ''
    console.log(`File extension from filename: '${fileExtension}'`)
    
    // For debugging, report elapsed time
    console.log(`Audio retrieval completed in ${Date.now() - requestStartTime}ms`)
    
    // Ensure we have the correct file extension for OpenAI
    let finalFileName = fileName
    
    // Determine correct filename based on content type
    if (audioBlob.type && audioBlob.type !== '') {
      if (audioBlob.type.includes('mp3')) {
        finalFileName = finalFileName.replace(/\.[^/.]+$/, '') + '.mp3'
      } else if (audioBlob.type.includes('mp4')) {
        finalFileName = finalFileName.replace(/\.[^/.]+$/, '') + '.mp4'
      } else if (audioBlob.type.includes('mpeg')) {
        finalFileName = finalFileName.replace(/\.[^/.]+$/, '') + '.mpga' // OpenAI uses mpga extension
      } else if (audioBlob.type.includes('m4a')) {
        finalFileName = finalFileName.replace(/\.[^/.]+$/, '') + '.m4a'
      } else if (audioBlob.type.includes('wav')) {
        finalFileName = finalFileName.replace(/\.[^/.]+$/, '') + '.wav'
      } else if (audioBlob.type.includes('webm')) {
        finalFileName = finalFileName.replace(/\.[^/.]+$/, '') + '.webm'
      }
    }
    
    console.log('Using filename for OpenAI request:', finalFileName)
    
    // Create FormData for OpenAI API
    const formData = new FormData()
    formData.append('file', audioBlob, finalFileName)
    formData.append('model', 'whisper-1')
    formData.append('language', 'en')
    formData.append('response_format', 'json')
    formData.append('prompt', 'This is a recording of a business meeting or conversation. Please transcribe it accurately.')
    
    console.log(`Sending ${audioSizeMB.toFixed(2)}MB audio file named ${finalFileName} to OpenAI API`)
    
    // Call OpenAI API
    let transcriptionResponse
    try {
      console.log('Sending request to OpenAI API...')
      
      transcriptionResponse = await withTimeout(
        fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`
          },
          body: formData
        }),
        API_TIMEOUT_MS,
        'OpenAI API call timed out after 20 seconds'
      )
      
      console.log('OpenAI API response status:', transcriptionResponse.status)
      
      // Handle API errors
      if (!transcriptionResponse.ok) {
        let errorText
        try {
          errorText = await transcriptionResponse.text()
        } catch (e) {
          errorText = 'Could not extract error text'
        }
        
        console.error(`OpenAI API error ${transcriptionResponse.status}: ${errorText}`)
        
        clearTimeout(functionTimeout)
        return handleError(
          `OpenAI API error (${transcriptionResponse.status}): ${errorText}`,
          'openai',
          500,
          {
            model: 'whisper-1',
            audioType: audioBlob.type,
            audioSize: `${audioSizeMB.toFixed(2)}MB`
          }
        )
      }
    } catch (error) {
      console.error('OpenAI API fetch error:', error)
      clearTimeout(functionTimeout)
      return handleError(
        `OpenAI API request failed: ${error instanceof Error ? error.message : 'Network error'}`,
        'openai',
        500,
        { model: 'whisper-1' }
      )
    }
    
    console.log('OpenAI transcription successful with whisper-1 model')
    
    // Parse transcription response
    let transcriptionData
    try {
      transcriptionData = await transcriptionResponse.json()
      console.log('Transcription data preview:', 
        transcriptionData?.text ? 
        `First 50 chars: ${transcriptionData.text.substring(0, 50)}...` : 
        'No text field found')
    } catch (error) {
      console.error('Error parsing transcription response:', error)
      clearTimeout(functionTimeout)
      return handleError(
        `Failed to parse OpenAI response: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'parsing'
      )
    }
    
    if (!transcriptionData || !transcriptionData.text) {
      clearTimeout(functionTimeout)
      return handleError(
        'Invalid or empty response from OpenAI API',
        'openai',
        500,
        { response: transcriptionData }
      )
    }
    
    const transcription = transcriptionData.text
    console.log('Transcription received, length:', transcription.length)
    
    // Store the results in database
    try {
      const { error: dbError } = await supabaseClient
        .from('transcriptions')
        .insert({
          user_id: userId,
          title: `Meeting on ${new Date().toLocaleDateString()}`,
          content: transcription
        })

      if (dbError) {
        console.error('Database error:', dbError)
        // Continue anyway to return the transcription
      } else {
        console.log('Transcription saved to database')
      }
    } catch (dbError) {
      console.error('Exception during database insert:', dbError)
      // Continue anyway to return the transcription
    }

    // Return the transcription
    const result: TranscriptionResult = {
      transcription
    }
    
    console.log('Edge function completed successfully')
    console.log(`Total execution time: ${Date.now() - requestStartTime}ms`)

    clearTimeout(functionTimeout)
    return createJsonResponse(result, 200)
  } catch (error) {
    console.error('Uncaught error in edge function:', error)
    
    clearTimeout(functionTimeout)
    return handleError(
      error instanceof Error ? error.message : 'Unknown error occurred',
      'server',
      500,
      {
        location: error instanceof Error && error.stack ? error.stack : 'No stack trace available',
        time: new Date().toISOString()
      }
    )
  }
})
