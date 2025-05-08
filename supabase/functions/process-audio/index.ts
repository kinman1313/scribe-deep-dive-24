
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

// Types
interface RequestPayload {
  audioUrl: string
  fileName: string
  userId: string
  fileSize?: number
}

interface TranscriptionResult {
  transcription: string
  error?: string
}

// Mock data for fallback
function generateMockTranscription() {
  return `
John: Good morning everyone, let's get started with our Q3 marketing plan review.

Sarah: Thanks John. Before we dive in, I'd like to share some interesting data from our Q2 campaigns. Our LinkedIn ads are showing a 24% higher conversion rate compared to other platforms.

Michael: That's impressive. Do we have a breakdown of the costs per acquisition across channels?

Sarah: Yes, LinkedIn is slightly more expensive but given the higher conversion rate, the ROI actually works out better.

John: Based on these numbers, I think we should consider increasing our LinkedIn budget by about 15% for Q3.
`;
}

// Helper functions
function createJsonResponse(body: unknown, status = 200) {
  return new Response(
    JSON.stringify(body),
    { 
      status, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    }
  )
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  
  try {
    // Check for auth header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return createJsonResponse({ 
        error: 'Missing Authorization header. Make sure you are signed in.' 
      }, 401)
    }
    
    // Create supabase client
    const supabaseClient = createClient(
      SUPABASE_URL || '',
      SUPABASE_ANON_KEY || '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    )
    
    // Validate authentication
    const { data: authData, error: authError } = await supabaseClient.auth.getUser()
    if (authError) {
      return createJsonResponse({ error: `Auth validation failed: ${authError.message}` }, 401)
    }
    
    // Parse request payload
    let requestData: RequestPayload
    try {
      requestData = await req.json()
    } catch (error) {
      return createJsonResponse({ error: 'Invalid or malformed request body' }, 400)
    }
    
    // Validate required fields
    const { audioUrl, fileName, userId } = requestData
    if (!audioUrl || !fileName || !userId) {
      return createJsonResponse({ 
        error: 'Missing required fields',
        received: { audioUrl: !!audioUrl, fileName: !!fileName, userId: !!userId }
      }, 400)
    }
    
    // Check if in demo mode (OpenAI key not configured)
    if (!OPENAI_API_KEY) {
      console.log('OpenAI API key not configured, returning mock data')
      return createJsonResponse({
        transcription: generateMockTranscription(),
        message: 'Demo mode: OpenAI API key not configured'
      })
    }
    
    // Basic flow (simplified):
    // 1. Download the audio file
    let audioBlob: Blob
    try {
      // Try fetching directly from URL first
      const audioResponse = await fetch(audioUrl, { 
        headers: { Authorization: authHeader }
      })
      
      if (!audioResponse.ok) {
        throw new Error(`Failed to fetch audio: ${audioResponse.status}`)
      }
      
      audioBlob = await audioResponse.blob()
      
      if (audioBlob.size === 0) {
        throw new Error('Empty audio file')
      }
    } catch (error) {
      console.error('Audio download error:', error)
      return createJsonResponse({
        transcription: generateMockTranscription(),
        error: `Failed to download audio: ${error instanceof Error ? error.message : 'Unknown error'}`,
        message: 'Returned mock data due to download error'
      })
    }
    
    // 2. Prepare audio file for OpenAI API
    const formData = new FormData()
    formData.append('file', audioBlob, fileName)
    formData.append('model', 'whisper-1')
    formData.append('language', 'en')
    formData.append('response_format', 'json')
    
    // 3. Call OpenAI API
    try {
      const transcriptionResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`
        },
        body: formData
      })
      
      if (!transcriptionResponse.ok) {
        const errorText = await transcriptionResponse.text()
        throw new Error(`OpenAI API error ${transcriptionResponse.status}: ${errorText}`)
      }
      
      const transcriptionData = await transcriptionResponse.json()
      
      if (!transcriptionData || !transcriptionData.text) {
        throw new Error('Invalid response from OpenAI API')
      }
      
      // 4. Return the transcription
      return createJsonResponse({
        transcription: transcriptionData.text
      })
    } catch (error) {
      console.error('Transcription error:', error)
      return createJsonResponse({
        transcription: generateMockTranscription(),
        error: `Transcription failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        message: 'Returned mock data due to transcription error'
      })
    }
  } catch (error) {
    console.error('Uncaught error:', error)
    return createJsonResponse({
      transcription: generateMockTranscription(),
      error: `Uncaught error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      message: 'Returned mock data due to internal error'
    })
  }
})
