
// Follow this setup guide to integrate the Supabase Edge Functions Starter:
// https://supabase.com/docs/guides/functions/quickstart

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.2'

// Define CORS headers directly in this file
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const openAIApiKey = Deno.env.get('OPENAI_API_KEY')

interface RequestPayload {
  audioUrl: string
  fileName: string
  userId: string
  audioBlob?: Blob
}

interface TranscriptionResult {
  transcription: string
  summary?: string
  actionItems?: string[]
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  
  console.log(`Edge function process-audio - received ${req.method} request`);
  const requestStartTime = Date.now();

  try {
    // Check if OpenAI API key is available immediately
    if (!openAIApiKey) {
      console.error('OpenAI API key is not configured');
      return new Response(
        JSON.stringify({ 
          error: 'OpenAI API key is not configured', 
          errorType: 'configuration' 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // Create a Supabase client with the Auth context of the function
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('Supabase URL or anon key is not configured');
      return new Response(
        JSON.stringify({ 
          error: 'Supabase configuration is missing', 
          errorType: 'configuration' 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // Print the Supabase URL to debug
    console.log('Using Supabase URL:', supabaseUrl);
    
    const supabaseClient = createClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )
    
    console.log('Edge function started - Supabase client created');
    
    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('Missing Authorization header');
      return new Response(
        JSON.stringify({ 
          error: 'Missing Authorization header', 
          errorType: 'auth' 
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get the request payload
    let requestData;
    try {
      requestData = await req.json();
      console.log('Request data successfully parsed:', JSON.stringify(requestData, null, 2));
    } catch (error) {
      console.error('Error parsing request JSON:', error);
      return new Response(
        JSON.stringify({ 
          error: 'Invalid JSON in request body', 
          errorType: 'request' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    if (!requestData) {
      return new Response(
        JSON.stringify({ 
          error: 'Empty request body', 
          errorType: 'request' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    const { audioUrl, fileName, userId } = requestData as RequestPayload;
    
    console.log('Request payload received:', { audioUrl, fileName, userId });
    
    if (!audioUrl || !fileName || !userId) {
      return new Response(
        JSON.stringify({ 
          error: 'Missing required fields', 
          received: { audioUrl: !!audioUrl, fileName: !!fileName, userId: !!userId },
          errorType: 'request'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    console.log('Attempting to fetch audio file from URL:', audioUrl);
    
    // First try to list bucket contents to verify access
    try {
      const { data: storageData, error: storageError } = await supabaseClient.storage
        .from('audio-recordings')
        .list(userId);
        
      if (storageError) {
        console.error('Error listing bucket contents:', storageError);
        return new Response(
          JSON.stringify({
            error: `Failed to list bucket contents: ${storageError.message}`,
            errorType: 'storage'
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } 
      
      console.log('Successfully accessed bucket. Found files:', storageData.map(f => f.name).join(', '));
    } catch (error) {
      console.error('Exception accessing bucket:', error);
      return new Response(
        JSON.stringify({
          error: `Exception accessing bucket: ${error instanceof Error ? error.message : 'Unknown error'}`,
          errorType: 'storage'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Try to download the file directly using Supabase storage
    let audioBlob;
    try {
      // First attempt to download using Supabase storage API
      const { data: fileData, error: fileError } = await supabaseClient.storage
        .from('audio-recordings')
        .download(`${userId}/${fileName}`);
      
      if (fileError) {
        console.error('Error downloading from Supabase Storage:', fileError);
        throw new Error(`Supabase storage download failed: ${fileError.message}`);
      }
      
      if (!fileData) {
        throw new Error('File download successful but returned null data');
      }
      
      audioBlob = fileData;
      console.log('Successfully downloaded file from Supabase Storage, size:', audioBlob.size, 'type:', audioBlob.type);
    } catch (storageError) {
      console.error('Supabase storage download failed, falling back to URL fetch:', storageError);
      
      // Fall back to the public URL if direct download fails
      try {
        // 1. Download the audio file from the URL
        const audioResponse = await fetch(audioUrl);
        
        if (!audioResponse.ok) {
          const status = audioResponse.status;
          const statusText = audioResponse.statusText;
          console.error(`Failed to fetch audio file. Status: ${status}, Status text: ${statusText}`);
          
          return new Response(
            JSON.stringify({ 
              error: `Failed to fetch audio file: ${statusText}`,
              status: status,
              url: audioUrl,
              errorType: 'storage'
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        // 2. Get audio data as blob
        audioBlob = await audioResponse.blob();
        console.log('Audio blob created via URL fetch. Size:', audioBlob.size, 'Type:', audioBlob.type);
      } catch (fetchError) {
        console.error('Both storage methods failed:', fetchError);
        return new Response(
          JSON.stringify({ 
            error: `Failed to access audio file by any method: ${fetchError instanceof Error ? fetchError.message : 'Unknown error'}`,
            errorType: 'storage'
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }
    
    if (!audioBlob || audioBlob.size === 0) {
      return new Response(
        JSON.stringify({ 
          error: audioBlob ? 'Audio blob is empty (zero size)' : 'Failed to convert audio response to blob',
          errorType: 'conversion'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // Verify the audio blob type
    console.log(`Audio blob details - Size: ${audioBlob.size} bytes, Type: ${audioBlob.type || 'unknown'}`);
    
    // For debugging, report elapsed time
    console.log(`Audio retrieval completed in ${Date.now() - requestStartTime}ms`);
    
    // Ensure we have the correct file extension for OpenAI
    // OpenAI supports MP3, MP4, MPEG, MPGA, M4A, WAV, and WEBM
    let finalFileName = fileName;
    if (!finalFileName.endsWith('.wav') && !finalFileName.endsWith('.mp3') && 
        !finalFileName.endsWith('.mp4') && !finalFileName.endsWith('.webm') && 
        !finalFileName.endsWith('.m4a')) {
      finalFileName += '.wav'; // Default to WAV extension
    }
    
    console.log('Using filename for OpenAI request:', finalFileName);
    
    // 3. Create a FormData object for the OpenAI API
    const formData = new FormData();
    formData.append('file', audioBlob, finalFileName);
    formData.append('model', 'whisper-1');
    formData.append('language', 'en');
    
    console.log('Calling OpenAI transcription API');
    
    // 4. Call the OpenAI API for transcription
    let transcriptionResponse;
    try {
      console.log('Sending request to OpenAI API with API key starting with:', openAIApiKey.substring(0, 3) + '...');
      console.log('FormData contains file named:', finalFileName);
      
      transcriptionResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAIApiKey}`
        },
        body: formData
      });
      
      console.log('OpenAI API response status:', transcriptionResponse.status);
    } catch (error) {
      console.error('OpenAI API fetch error:', error);
      return new Response(
        JSON.stringify({ 
          error: `OpenAI API request failed: ${error instanceof Error ? error.message : 'Network error'}`,
          errorType: 'openai'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!transcriptionResponse || !transcriptionResponse.ok) {
      let errorDetails = 'Unknown error';
      try {
        errorDetails = await transcriptionResponse?.text() || 'No error details available';
      } catch (e) {
        console.error('Error getting transcription error details:', e);
      }
      
      console.error('OpenAI API error. Status:', transcriptionResponse?.status);
      console.error('Error details:', errorDetails);
      
      return new Response(
        JSON.stringify({ 
          error: `OpenAI API error: ${errorDetails}`, 
          status: transcriptionResponse?.status,
          errorType: 'openai'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    console.log('OpenAI transcription successful');

    // For debugging, report elapsed time
    console.log(`Transcription completed in ${Date.now() - requestStartTime}ms`);

    let transcriptionData;
    try {
      transcriptionData = await transcriptionResponse.json();
    } catch (error) {
      console.error('Error parsing transcription response:', error);
      return new Response(
        JSON.stringify({ 
          error: `Failed to parse OpenAI response: ${error instanceof Error ? error.message : 'Unknown error'}`,
          errorType: 'parsing'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    if (!transcriptionData || !transcriptionData.text) {
      return new Response(
        JSON.stringify({ 
          error: 'Invalid or empty response from OpenAI API',
          errorType: 'openai'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    const transcription = transcriptionData.text;
    console.log('Transcription received, length:', transcription.length);
    
    // For short transcriptions, return immediately without additional processing
    if (transcription.length < 50) {
      console.log('Transcription is very short, skipping analysis');
      
      // 6. Store the results in the database
      try {
        const { error: dbError } = await supabaseClient
          .from('transcriptions')
          .insert({
            user_id: userId,
            title: `Meeting on ${new Date().toLocaleDateString()}`,
            content: transcription
          });
    
        if (dbError) {
          console.error('Database error:', dbError);
        }
      } catch (dbError) {
        console.error('Exception during database insert:', dbError);
      }
      
      const result: TranscriptionResult = {
        transcription
      };
      
      return new Response(
        JSON.stringify(result),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // Here, use a simpler analysis for now to reduce complexity
    // Skip GPT analysis to simplify the process temporarily
    console.log('Skipping detailed analysis for now');
    
    // Store the results directly
    try {
      const { error: dbError } = await supabaseClient
        .from('transcriptions')
        .insert({
          user_id: userId,
          title: `Meeting on ${new Date().toLocaleDateString()}`,
          content: transcription
        });

      if (dbError) {
        console.error('Database error:', dbError);
        // Continue anyway to return the transcription
      } else {
        console.log('Transcription saved to database');
      }
    } catch (dbError) {
      console.error('Exception during database insert:', dbError);
      // Continue anyway to return the transcription
    }

    // Return just the transcription without additional processing
    const result: TranscriptionResult = {
      transcription
    };
    
    console.log('Edge function completed successfully');
    console.log(`Total execution time: ${Date.now() - requestStartTime}ms`);

    return new Response(
      JSON.stringify(result),
      { 
        status: 200, 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    )
  } catch (error) {
    console.error('Uncaught error in edge function:', error);
    
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        location: error instanceof Error && error.stack ? error.stack : 'No stack trace available',
        errorType: 'server'
      }),
      { 
        status: 500, 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    )
  }
})
