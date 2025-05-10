
// Follow this setup guide to integrate the Supabase Edge Functions Starter:
// https://supabase.io/docs/guides/functions/quickstart

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.2'

// Enhanced CORS headers with explicit allowed origins and methods
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',  // Allow all origins
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, range',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400', // 24 hours caching of preflight requests
  'Access-Control-Allow-Credentials': 'true',
};

// Environment variables
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')

// Types
interface RequestPayload {
  audioUrl: string;
  fileName: string;
  userId: string;
  fileSize?: number;
  analyze?: boolean; // Whether to run additional analysis
  clientInfo?: {
    timestamp: string;
    userAgent: string;
    origin: string;
  };
  sessionInfo?: {
    userId: string;
    hasSession: boolean;
    expiresAt: string;
  };
}

interface TranscriptionResult {
  transcription: string;
  summary?: string;
  speakers?: Speaker[];
  actionItems?: ActionItem[];
  keyPoints?: string[];
  error?: string;
  message?: string;
}

interface Speaker {
  id: string;
  name: string;
}

interface ActionItem {
  text: string;
  assignee?: string;
  priority?: 'low' | 'medium' | 'high';
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
  // Add request tracking ID for correlating logs
  const requestId = crypto.randomUUID();
  console.log(`[${requestId}] Process audio function called [${new Date().toISOString()}]`);
  
  // Handle CORS preflight requests - MUST return 200 status
  if (req.method === 'OPTIONS') {
    console.log(`[${requestId}] ✅ Handling CORS preflight request for process-audio`);
    return new Response(null, { 
      status: 200, // Explicitly use 200 (not 204) for wider browser compatibility
      headers: corsHeaders 
    });
  }
  
  console.log(`[${requestId}] Request method: ${req.method}`);
  console.log(`[${requestId}] Request headers:`, Object.fromEntries(req.headers.entries()));
  
  try {
    // Check auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error(`[${requestId}] Missing Authorization header`);
      return createJsonResponse({ 
        error: 'Missing Authorization header',
        transcription: generateMockTranscription(),
        message: 'Using mock data due to missing authorization'
      }, 200);
    }
    
    console.log(`[${requestId}] Auth header present, proceeding with request parsing`);
    
    // Parse request payload - with robust error handling
    let requestData: RequestPayload;
    try {
      requestData = await req.json();
      console.log(`[${requestId}] Request payload received with properties:`, Object.keys(requestData));
      console.log(`[${requestId}] Audio URL: ${requestData.audioUrl?.substring(0, 50)}...`);
      console.log(`[${requestId}] File name: ${requestData.fileName}`);
      console.log(`[${requestId}] Analyze: ${requestData.analyze || false}`);
      
      // Log client info if available
      if (requestData.clientInfo) {
        console.log(`[${requestId}] Client info:`, requestData.clientInfo);
      }
    } catch (parseError) {
      console.error(`[${requestId}] Error parsing request body:`, parseError);
      return createJsonResponse({
        error: 'Invalid JSON in request body',
        transcription: generateMockTranscription(),
        message: 'Using mock data due to JSON parsing error'
      }, 200);
    }
    
    // Validate required fields but don't fail the request
    const { audioUrl, fileName, userId, analyze = false } = requestData;
    if (!audioUrl || !fileName || !userId) {
      console.error(`[${requestId}] Missing required fields in payload:`, { 
        hasAudioUrl: !!audioUrl, 
        hasFileName: !!fileName, 
        hasUserId: !!userId 
      });
      return createJsonResponse({ 
        error: 'Missing required fields',
        transcription: generateMockTranscription(),
        message: 'Using mock data due to missing required fields'
      }, 200);
    }
    
    // Check if OpenAI API key is configured and valid
    if (!OPENAI_API_KEY) {
      console.error(`[${requestId}] OpenAI API key not configured in Edge Function secrets`);
      return createJsonResponse({
        transcription: generateMockTranscription(),
        message: 'Using mock data (OpenAI API key not configured in Edge Function secrets)'
      }, 200);
    } else {
      // Log first and last few characters of the key for debugging without exposing the full key
      const keyLength = OPENAI_API_KEY.length;
      console.log(`[${requestId}] OpenAI API key configured (length: ${keyLength}, starts with: ${OPENAI_API_KEY.slice(0, 3)}..., ends with: ...${OPENAI_API_KEY.slice(-3)})`);
      
      // Check if key starts with "sk-" which is the expected format for OpenAI keys
      if (!OPENAI_API_KEY.startsWith('sk-')) {
        console.error(`[${requestId}] OpenAI API key does not appear to be in the valid format (should start with "sk-")`);
        return createJsonResponse({
          transcription: generateMockTranscription(),
          message: 'Using mock data (OpenAI API key format appears invalid, should start with "sk-")'
        }, 200);
      }
    }
    
    try {
      // Download the audio file with robust error handling
      console.log(`[${requestId}] Attempting to download audio file from URL`);
      
      let audioResponse;
      try {
        audioResponse = await fetch(audioUrl, {
          headers: {
            'Authorization': authHeader
          }
        });
        
        console.log(`[${requestId}] Audio fetch response status:`, audioResponse.status);
        console.log(`[${requestId}] Audio fetch headers:`, Object.fromEntries(audioResponse.headers.entries()));
      } catch (fetchError) {
        console.error(`[${requestId}] Network error fetching audio:`, fetchError);
        return createJsonResponse({
          transcription: generateMockTranscription(),
          message: 'Using mock data due to network error fetching audio'
        }, 200);
      }
      
      if (!audioResponse.ok) {
        console.error(`[${requestId}] Failed to fetch audio: ${audioResponse.status} ${audioResponse.statusText}`);
        
        // Log response details for debugging
        try {
          const errorResponseText = await audioResponse.text();
          console.error(`[${requestId}] Error response body:`, errorResponseText);
        } catch (e) {
          console.error(`[${requestId}] Could not read error response body`);
        }
        
        return createJsonResponse({
          transcription: generateMockTranscription(),
          message: `Using mock data (Failed to fetch audio: ${audioResponse.status})`
        }, 200);
      }
      
      let audioBlob;
      try {
        audioBlob = await audioResponse.blob();
        console.log(`[${requestId}] Audio blob created, type:`, audioBlob.type);
      } catch (blobError) {
        console.error(`[${requestId}] Error creating blob from response:`, blobError);
        return createJsonResponse({
          transcription: generateMockTranscription(),
          message: 'Using mock data due to error processing audio data'
        }, 200);
      }
      
      if (audioBlob.size === 0) {
        console.error(`[${requestId}] Empty audio file downloaded`);
        return createJsonResponse({
          transcription: generateMockTranscription(),
          message: 'Using mock data (Empty audio file)'
        }, 200);
      }
      
      console.log(`[${requestId}] Audio file downloaded successfully, size: ${audioBlob.size} bytes, type: ${audioBlob.type}`);
      
      // Prepare audio file for OpenAI API
      const formData = new FormData();
      formData.append('file', audioBlob, fileName);
      formData.append('model', 'whisper-1');
      formData.append('language', 'en');
      formData.append('response_format', 'json');
      
      // Call OpenAI API with timeout and proper error handling
      console.log(`[${requestId}] Calling OpenAI transcription API with valid key`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000); // 25 second timeout
      
      let transcriptionResponse;
      try {
        console.log(`[${requestId}] Sending request to OpenAI API - file size: ${audioBlob.size} bytes`);
        transcriptionResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`
          },
          body: formData,
          signal: controller.signal
        });
        
        clearTimeout(timeoutId); // Clear the timeout if request completes
        console.log(`[${requestId}] OpenAI API response status:`, transcriptionResponse.status);
      } catch (apiError) {
        clearTimeout(timeoutId);
        console.error(`[${requestId}] Error calling OpenAI API:`, apiError);
        
        // Check if it was an abort error
        if (apiError instanceof Error && apiError.name === 'AbortError') {
          return createJsonResponse({
            transcription: generateMockTranscription(),
            message: 'Using mock data due to OpenAI API timeout'
          }, 200);
        }
        
        return createJsonResponse({
          transcription: generateMockTranscription(),
          message: 'Using mock data due to OpenAI API error'
        }, 200);
      }
      
      if (!transcriptionResponse.ok) {
        let errorText = '';
        try {
          const errorData = await transcriptionResponse.text();
          errorText = errorData;
          console.error(`[${requestId}] OpenAI API error ${transcriptionResponse.status}: ${errorText}`);
        } catch (e) {
          console.error(`[${requestId}] OpenAI API error ${transcriptionResponse.status}, couldn't parse response`);
        }
        
        return createJsonResponse({
          transcription: generateMockTranscription(),
          message: `Using mock data (OpenAI API returned error: ${transcriptionResponse.status}, ${errorText})`
        }, 200);
      }
      
      let transcriptionData;
      try {
        transcriptionData = await transcriptionResponse.json();
        console.log(`[${requestId}] OpenAI response parsed successfully`);
      } catch (jsonError) {
        console.error(`[${requestId}] Error parsing OpenAI response:`, jsonError);
        return createJsonResponse({
          transcription: generateMockTranscription(),
          message: 'Using mock data due to error parsing OpenAI response'
        }, 200);
      }
      
      if (!transcriptionData || !transcriptionData.text) {
        console.error(`[${requestId}] Invalid response from OpenAI API:`, transcriptionData);
        return createJsonResponse({
          transcription: generateMockTranscription(),
          message: 'Using mock data due to invalid OpenAI response format'
        }, 200);
      }

      // Get the transcription text
      const transcriptionText = transcriptionData.text;
      const result: TranscriptionResult = { transcription: transcriptionText };

      // If analysis is requested, process the transcription further
      if (analyze) {
        try {
          console.log(`[${requestId}] Analysis requested, processing transcription...`);
          const analysisData = await analyzeTranscription(transcriptionText, requestId);
          
          // Add analysis data to the result
          result.summary = analysisData.summary;
          result.speakers = analysisData.speakers;
          result.actionItems = analysisData.actionItems;
          result.keyPoints = analysisData.keyPoints;
          
          console.log(`[${requestId}] Analysis completed successfully`);
        } catch (analysisError) {
          console.error(`[${requestId}] Error during analysis:`, analysisError);
          // Continue with just the transcription if analysis fails
          result.message = "Transcription successful, but analysis failed";
        }
      }
      
      // Return successful transcription with optional analysis
      console.log(`[${requestId}] Successfully received transcription from OpenAI` + (analyze ? " with analysis" : ""));
      return createJsonResponse(result, 200);
      
    } catch (error) {
      console.error(`[${requestId}] Unhandled error during transcription process:`, error);
      
      // Always return a response with mock data instead of letting the error bubble up
      return createJsonResponse({
        transcription: generateMockTranscription(),
        message: 'Using mock data due to unexpected error during processing'
      }, 200);
    }
  } catch (error) {
    console.error(`[${requestId}] Unhandled top-level error in edge function:`, error);
    
    // Return mock data instead of error to keep the app working
    return createJsonResponse({
      transcription: generateMockTranscription(),
      message: 'Using mock data due to server error'
    }, 200);
  }
});

/**
 * Generate a realistic transcription for testing
 */
function generateMockTranscription(): string {
  return `
John: Good morning everyone, let's get started with our Q3 marketing plan review.

Sarah: Thanks John. Before we dive in, I'd like to share some interesting data from our Q2 campaigns. Our LinkedIn ads are showing a 24% higher conversion rate compared to other platforms.

Michael: That's impressive. Do we have a breakdown of the costs per acquisition across channels?

Sarah: Yes, LinkedIn is slightly more expensive but given the higher conversion rate, the ROI actually works out better.

John: Based on these numbers, I think we should consider increasing our LinkedIn budget by about 15% for Q3.

Sarah: I agree. I can prepare a detailed breakdown by Friday for everyone to review.

Michael: Sounds good. What about our content calendar for Q3?

John: For the first month, I suggest we focus on product updates and customer testimonials, since those performed well last quarter.

Michael: I can draft a content plan for that approach and share it before our next meeting.

John: Perfect. Let's also make sure we discuss the upcoming product launch in the second half of today's meeting.

Sarah: Just a reminder that we need to finalize the budget allocation by next Monday for the finance team.

John: Noted. Let's plan to wrap that up today if possible.
`;
}

/**
 * Analyze a transcription to extract summary, speakers, action items, and key points
 */
async function analyzeTranscription(transcription: string, requestId: string) {
  console.log(`[${requestId}] Starting transcription analysis`);
  
  // Default result in case of errors
  const defaultResult = {
    summary: "Meeting summary not available.",
    speakers: [] as Speaker[],
    actionItems: [] as ActionItem[],
    keyPoints: [] as string[]
  };
  
  if (!OPENAI_API_KEY) {
    console.log(`[${requestId}] No OpenAI API key for analysis, returning default result`);
    return defaultResult;
  }
  
  try {
    console.log(`[${requestId}] Calling OpenAI for transcription analysis`);
    
    // Create a structured prompt for the analysis
    const messages = [
      {
        role: "system",
        content: `You are an AI trained to analyze meeting transcriptions. Extract the following information:
        1. A concise summary of the meeting (3-4 sentences)
        2. The list of speakers and assign them proper names based on the transcript
        3. Any action items mentioned (with assignee if specified and priority level)
        4. Key discussion points from the meeting
        
        Format your response as JSON with the following structure:
        {
          "summary": "Meeting summary here",
          "speakers": [{"id": "speaker1", "name": "John"}, {"id": "speaker2", "name": "Sarah"}],
          "actionItems": [{"text": "Action item description", "assignee": "John", "priority": "high"}],
          "keyPoints": ["Key point 1", "Key point 2"]
        }
        
        Ensure the JSON is valid, properly formatted, and all fields are included.`
      },
      {
        role: "user",
        content: `Please analyze this meeting transcript: \n\n${transcription}`
      }
    ];
    
    // Call OpenAI API for analysis
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: messages,
        temperature: 0.3, // Lower temperature for more consistent results
        max_tokens: 1000
      })
    });
    
    if (!response.ok) {
      console.error(`[${requestId}] OpenAI Analysis API error:`, response.status, response.statusText);
      return defaultResult;
    }
    
    const data = await response.json();
    if (!data.choices || !data.choices[0] || !data.choices[0].message || !data.choices[0].message.content) {
      console.error(`[${requestId}] Invalid response from OpenAI Analysis:`, data);
      return defaultResult;
    }
    
    const content = data.choices[0].message.content;
    
    // Extract the JSON from the response
    let jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || 
                    content.match(/```([\s\S]*?)```/) ||
                    content.match(/{[\s\S]*}/);
                    
    let jsonContent = jsonMatch ? jsonMatch[1] || jsonMatch[0] : content;
    
    // Handle case where markdown formatting wasn't used
    if (!jsonContent.includes('{')) {
      jsonContent = content;
    }
    
    // Clean up the string to ensure it's valid JSON
    jsonContent = jsonContent.replace(/^```json/, '').replace(/```$/, '').trim();
    
    console.log(`[${requestId}] Parsing analysis JSON:`, jsonContent.substring(0, 100) + '...');
    
    // Parse the JSON
    const analysisResult = JSON.parse(jsonContent);
    
    // Ensure all required fields exist
    const result = {
      summary: analysisResult.summary || defaultResult.summary,
      speakers: analysisResult.speakers || defaultResult.speakers,
      actionItems: analysisResult.actionItems || defaultResult.actionItems,
      keyPoints: analysisResult.keyPoints || defaultResult.keyPoints
    };
    
    console.log(`[${requestId}] Analysis completed successfully`);
    return result;
  } catch (error) {
    console.error(`[${requestId}] Error during transcription analysis:`, error);
    return defaultResult;
  }
}
