
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
  sessionInfo?: {
    userId: string
    hasSession: boolean
    expiresAt: string
  }
}

interface TranscriptionResult {
  transcription: string
  error?: string
  message?: string
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
    // For troubleshooting
    console.log("Edge function called with request method:", req.method);
    
    // Check auth header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      console.error("Missing Authorization header");
      return createJsonResponse({ 
        error: 'Missing Authorization header',
        message: 'Authentication required'
      }, 401)
    }
    
    // Parse request payload - with error handling
    let requestData: RequestPayload;
    try {
      requestData = await req.json();
      console.log("Request payload parsed successfully");
    } catch (error) {
      console.error("Error parsing request body:", error);
      return createJsonResponse({
        error: 'Invalid JSON in request body',
        message: 'Could not parse request body'
      }, 400);
    }
    
    // Log request data (sanitized)
    console.log("Request data received:", {
      hasAudioUrl: !!requestData?.audioUrl,
      fileName: requestData?.fileName,
      hasUserId: !!requestData?.userId,
      fileSize: requestData?.fileSize
    });
    
    // Validate required fields
    const { audioUrl, fileName, userId } = requestData;
    if (!audioUrl || !fileName || !userId) {
      console.error("Missing required fields in request payload");
      return createJsonResponse({ 
        error: 'Missing required fields',
        message: 'audioUrl, fileName, and userId are required'
      }, 400);
    }
    
    // Check if OpenAI API key is configured
    if (!OPENAI_API_KEY) {
      console.error('OpenAI API key not configured');
      return createJsonResponse({
        error: 'OpenAI API key not configured',
        message: 'Server is not properly configured for transcription'
      }, 500);
    }
    
    // Download the audio file
    let audioBlob: Blob;
    try {
      const audioResponse = await fetch(audioUrl);      
      if (!audioResponse.ok) {
        throw new Error(`Failed to fetch audio: ${audioResponse.status}`);
      }
      
      audioBlob = await audioResponse.blob();
      
      if (audioBlob.size === 0) {
        throw new Error('Empty audio file');
      }
      
      console.log(`Audio file downloaded, size: ${audioBlob.size} bytes`);
    } catch (error) {
      console.error('Audio download error:', error);
      return createJsonResponse({
        error: `Failed to download audio: ${error instanceof Error ? error.message : 'Unknown error'}`,
        message: 'Could not process audio file'
      }, 500);
    }
    
    // Prepare audio file for OpenAI API
    const formData = new FormData();
    formData.append('file', audioBlob, fileName);
    formData.append('model', 'whisper-1');
    formData.append('language', 'en');
    formData.append('response_format', 'json');
    
    // Call OpenAI API
    try {
      console.log('Calling OpenAI transcription API');
      const transcriptionResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`
        },
        body: formData
      });
      
      if (!transcriptionResponse.ok) {
        const errorText = await transcriptionResponse.text();
        throw new Error(`OpenAI API error ${transcriptionResponse.status}: ${errorText}`);
      }
      
      const transcriptionData = await transcriptionResponse.json();
      
      if (!transcriptionData || !transcriptionData.text) {
        throw new Error('Invalid response from OpenAI API');
      }
      
      // Return the transcription
      console.log('Successfully received transcription from OpenAI');
      return createJsonResponse({
        transcription: transcriptionData.text
      }, 200);
    } catch (error) {
      console.error('Transcription error:', error);
      return createJsonResponse({
        error: `Transcription failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        message: 'Could not transcribe audio'
      }, 500);
    }
  } catch (error) {
    console.error('Uncaught error in edge function:', error);
    return createJsonResponse({
      error: `Uncaught error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      message: 'Internal server error'
    }, 500);
  }
})
