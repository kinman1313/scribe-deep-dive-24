
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

    // 1. Download the audio file from the URL
    let audioResponse;
    try {
      // For debugging, let's verify we can access the bucket and list files
      const { data: storageData, error: storageError } = await supabaseClient.storage
        .from('audio-recordings')
        .list(userId);
        
      if (storageError) {
        console.error('Error listing bucket contents:', storageError);
      } else {
        console.log('Found files in bucket:', storageData.map(f => f.name).join(', '));
      }
      
      audioResponse = await fetch(audioUrl);
      
      // Debug the response status
      console.log('Fetch response status:', audioResponse.status, audioResponse.statusText);
      console.log('Response headers:', JSON.stringify(Object.fromEntries(audioResponse.headers.entries()), null, 2));
    } catch (error) {
      console.error('Fetch error:', error);
      return new Response(
        JSON.stringify({ 
          error: `Failed to fetch audio file: ${error instanceof Error ? error.message : 'Network error'}`,
          url: audioUrl,
          errorType: 'network'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    if (!audioResponse || !audioResponse.ok) {
      const status = audioResponse?.status || 'unknown';
      const statusText = audioResponse?.statusText || 'unknown';
      console.error(`Failed to fetch audio file. Status: ${status}, Status text: ${statusText}`);
      
      return new Response(
        JSON.stringify({ 
          error: `Failed to fetch audio file: ${statusText}`,
          status: status,
          url: audioUrl,
          errorType: 'storage'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Audio file fetched successfully');

    // 2. Get audio data as blob
    let audioBlob;
    try {
      audioBlob = await audioResponse.blob();
      console.log('Audio blob created successfully. Size:', audioBlob.size, 'Type:', audioBlob.type);
    } catch (error) {
      console.error('Blob conversion error:', error);
      return new Response(
        JSON.stringify({ 
          error: `Failed to convert audio response to blob: ${error instanceof Error ? error.message : 'Unknown error'}`,
          errorType: 'conversion'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
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
    
    // 3. Create a FormData object for the OpenAI API
    const formData = new FormData()
    formData.append('file', audioBlob, fileName)
    formData.append('model', 'whisper-1')
    formData.append('language', 'en') // You can make this dynamic later
    
    console.log('Calling OpenAI transcription API');
    
    // 4. Call the OpenAI API for transcription
    let transcriptionResponse;
    try {
      console.log('Sending request to OpenAI API with API key starting with:', openAIApiKey.substring(0, 3) + '...');
      
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
    
    // 5. Process the transcription with GPT to extract summary and action items
    console.log('Calling OpenAI for analysis');
    
    let summary = '';
    const actionItems: string[] = [];
    
    try {
      const analysisResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAIApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: 'You are an AI assistant specializing in analyzing meeting transcripts. Extract a concise summary and list of action items from the provided meeting transcript.'
            },
            {
              role: 'user',
              content: `Please analyze this meeting transcript and provide: 
              1. A concise summary (maximum 3 paragraphs)
              2. A list of action items with assigned people where mentioned
              
              Transcript:
              ${transcription}`
            }
          ],
          temperature: 0.5,
          max_tokens: 800
        })
      });
  
      if (!analysisResponse.ok) {
        // Continue with just the transcription if analysis fails
        console.error('Analysis API error:', await analysisResponse.text());
      } else {
        const analysisData = await analysisResponse.json();
        const analysisText = analysisData.choices[0].message.content;
        console.log('Analysis received, processing sections');
    
        // Extract summary and action items from the analysis
        const sections = analysisText.split('\n\n');
        for (const section of sections) {
          if (section.toLowerCase().includes('summary')) {
            summary = section.replace(/^summary:?/i, '').trim();
          } else if (section.toLowerCase().includes('action item')) {
            // Split into individual action items
            const items = section.split('\n');
            for (const item of items) {
              if (item.trim() && !item.toLowerCase().includes('action item')) {
                actionItems.push(item.trim());
              }
            }
          }
        }
      }
    } catch (analysisError) {
      console.error('Error during analysis:', analysisError);
      // Continue with just the transcription
    }

    // 6. Store the results in the database
    try {
      const { error: dbError } = await supabaseClient
        .from('transcriptions')
        .insert({
          user_id: userId,
          title: `Meeting on ${new Date().toLocaleDateString()}`,
          content: transcription,
          summary,
          action_items: actionItems
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

    // 7. Return the results
    const result: TranscriptionResult = {
      transcription,
      summary,
      actionItems
    };
    
    console.log('Edge function completed successfully');

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
