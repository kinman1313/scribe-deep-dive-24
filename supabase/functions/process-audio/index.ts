
// Follow this setup guide to integrate the Supabase Edge Functions Starter:
// https://supabase.io/docs/guides/functions/quickstart

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
  fileSize?: number
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
    
    const { audioUrl, fileName, userId, fileSize } = requestData as RequestPayload;
    
    console.log('Request payload received:', { 
      audioUrl, 
      fileName, 
      userId, 
      fileSize: fileSize ? `${(fileSize / (1024 * 1024)).toFixed(2)}MB` : 'Not specified' 
    });
    
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
    
    // Check file size if provided
    if (fileSize && fileSize > 25 * 1024 * 1024) {
      return new Response(
        JSON.stringify({ 
          error: `Audio file size (${(fileSize / (1024 * 1024)).toFixed(1)}MB) exceeds the OpenAI 25MB limit`,
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
    let downloadMethod = "";
    try {
      // First attempt to download using Supabase storage API
      downloadMethod = "supabase.storage.download";
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
      console.log('Successfully downloaded file from Supabase Storage, size:', 
        (audioBlob.size / (1024 * 1024)).toFixed(2) + 'MB', 
        'type:', audioBlob.type);
    } catch (storageError) {
      console.error('Supabase storage download failed, falling back to URL fetch:', storageError);
      
      // Fall back to the public URL if direct download fails
      try {
        // Download the audio file from the URL
        downloadMethod = "direct URL fetch";
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
        
        // Get audio data as blob
        audioBlob = await audioResponse.blob();
        console.log('Audio blob created via URL fetch. Size:', 
          (audioBlob.size / (1024 * 1024)).toFixed(2) + 'MB', 
          'Type:', audioBlob.type);
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
    
    // Double check the audio blob size against OpenAI's limit
    const audioSizeMB = audioBlob.size / (1024 * 1024);
    if (audioSizeMB > 25) {
      return new Response(
        JSON.stringify({ 
          error: `Audio file size (${audioSizeMB.toFixed(1)}MB) exceeds the OpenAI 25MB limit`,
          errorType: 'request'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // Verify the audio blob type
    console.log(`Audio blob details - Size: ${(audioBlob.size / (1024 * 1024)).toFixed(2)}MB, Type: ${audioBlob.type || 'unknown'}`);
    console.log(`Downloaded using method: ${downloadMethod}`);
    
    // Get file extension from filename
    const fileExtension = fileName.includes('.') ? fileName.substring(fileName.lastIndexOf('.')).toLowerCase() : '';
    console.log(`File extension from filename: '${fileExtension}'`);
    
    // For debugging, report elapsed time
    console.log(`Audio retrieval completed in ${Date.now() - requestStartTime}ms`);
    
    // Ensure we have the correct file extension for OpenAI
    // OpenAI supports MP3, MP4, MPEG, MPGA, M4A, WAV, and WEBM
    let finalFileName = fileName;
    
    // If the audio blob has a type, use that to determine the extension
    if (audioBlob.type && audioBlob.type !== '') {
      if (audioBlob.type.includes('mp3')) {
        finalFileName = finalFileName.replace(/\.[^/.]+$/, '') + '.mp3';
      } else if (audioBlob.type.includes('mp4')) {
        finalFileName = finalFileName.replace(/\.[^/.]+$/, '') + '.mp4';
      } else if (audioBlob.type.includes('mpeg')) {
        finalFileName = finalFileName.replace(/\.[^/.]+$/, '') + '.mpga'; // OpenAI uses mpga extension
      } else if (audioBlob.type.includes('m4a')) {
        finalFileName = finalFileName.replace(/\.[^/.]+$/, '') + '.m4a';
      } else if (audioBlob.type.includes('wav')) {
        finalFileName = finalFileName.replace(/\.[^/.]+$/, '') + '.wav';
      } else if (audioBlob.type.includes('webm')) {
        finalFileName = finalFileName.replace(/\.[^/.]+$/, '') + '.webm';
      }
    }
    
    console.log('Using filename for OpenAI request:', finalFileName);
    
    // 3. Create a FormData object for the OpenAI API
    const formData = new FormData();
    formData.append('file', audioBlob, finalFileName);
    
    // Try using the older whisper-1 model instead of gpt-4o-mini-transcribe which might have issues
    formData.append('model', 'whisper-1');
    formData.append('language', 'en');
    formData.append('response_format', 'json');
    
    // Add a descriptive prompt to help with transcription accuracy
    formData.append('prompt', 'This is a recording of a business meeting or conversation.');
    
    console.log('Calling OpenAI transcription API with model: whisper-1');
    console.log(`Sending ${(audioBlob.size / (1024 * 1024)).toFixed(2)}MB audio file named ${finalFileName}`);
    
    // 4. Call the OpenAI API for transcription
    let transcriptionResponse;
    try {
      console.log('Sending request to OpenAI API...');
      console.log('FormData contains file named:', finalFileName);
      
      transcriptionResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAIApiKey}`
        },
        body: formData
      });
      
      console.log('OpenAI API response status:', transcriptionResponse.status);
      
      // Log more details about the response
      if (!transcriptionResponse.ok) {
        const responseText = await transcriptionResponse.text();
        console.error(`OpenAI API error ${transcriptionResponse.status}: ${responseText}`);
        
        return new Response(
          JSON.stringify({
            error: `OpenAI API error (${transcriptionResponse.status}): ${responseText}`,
            errorType: 'openai',
            model: 'whisper-1',
            audioType: audioBlob.type,
            audioSize: `${(audioBlob.size / (1024 * 1024)).toFixed(2)}MB`
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } catch (error) {
      console.error('OpenAI API fetch error:', error);
      return new Response(
        JSON.stringify({ 
          error: `OpenAI API request failed: ${error instanceof Error ? error.message : 'Network error'}`,
          errorType: 'openai',
          model: 'whisper-1'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!transcriptionResponse || !transcriptionResponse.ok) {
      let errorDetails = 'Unknown error';
      try {
        errorDetails = await transcriptionResponse?.text() || 'No error details available';
        console.log('Raw error response from OpenAI:', errorDetails);
      } catch (e) {
        console.error('Error getting transcription error details:', e);
      }
      
      console.error('OpenAI API error. Status:', transcriptionResponse?.status);
      console.error('Error details:', errorDetails);
      
      return new Response(
        JSON.stringify({ 
          error: `OpenAI API error: ${errorDetails}`, 
          status: transcriptionResponse?.status,
          errorType: 'openai',
          model: 'whisper-1'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    console.log('OpenAI transcription successful with whisper-1 model');

    // For debugging, report elapsed time
    console.log(`Transcription completed in ${Date.now() - requestStartTime}ms`);

    let transcriptionData;
    try {
      transcriptionData = await transcriptionResponse.json();
      console.log('Transcription data preview:', 
        transcriptionData?.text ? 
        `First 50 chars: ${transcriptionData.text.substring(0, 50)}...` : 
        'No text field found');
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
          errorType: 'openai',
          response: transcriptionData
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    const transcription = transcriptionData.text;
    console.log('Transcription received, length:', transcription.length);
    
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

    // Return just the transcription
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
