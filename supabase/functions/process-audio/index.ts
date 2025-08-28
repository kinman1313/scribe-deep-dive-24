// Follow this setup guide to integrate the Supabase Edge Functions Starter:
// https://supabase.io/docs/guides/functions/quickstart

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.2'
import { corsHeaders } from '../_shared/cors.ts'

// Environment variables
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

// Types
interface RequestPayload {
  audioUrl?: string;
  fileName?: string;
  userId?: string;
  fileSize?: number;
  analyze?: boolean; // Whether to run additional analysis
  operation?: 'process-recording' | 'ask-question'; // Operation type
  question?: string; // For ask-question operation
  transcription?: string; // For ask-question operation
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
  answer?: string; // For ask-question operation
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
function createJsonResponse(body: unknown, status = 200, headers = corsHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  })
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

serve(async (req) => {
  const requestId = crypto.randomUUID()
  console.log(`[${requestId}] Process audio function called [${new Date().toISOString()}]`)

  if (req.method === 'OPTIONS') {
    console.log(`[${requestId}] ✅ Handling CORS preflight request for process-audio`)
    return new Response('ok', { headers: corsHeaders, status: 200 })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      console.error(`[${requestId}] Missing Authorization header`)
      return createJsonResponse({ error: 'Missing Authorization header' }, 401)
    }
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: {
        headers: { Authorization: authHeader },
      },
    })

    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      console.error(`[${requestId}] Authentication error:`, userError?.message)
      return createJsonResponse({ error: 'Authentication failed' }, 401)
    }
    
    console.log(`[${requestId}] User authenticated: ${user.id}`)

    let requestData: RequestPayload
    try {
      requestData = await req.json()
      console.log(`[${requestId}] Request payload received with properties:`, Object.keys(requestData))
    } catch (parseError) {
      console.error(`[${requestId}] Error parsing request body:`, parseError)
      return createJsonResponse({ error: 'Invalid JSON in request body' }, 400)
    }

    const operation = requestData.operation || 'process-recording'
    console.log(`[${requestId}] Operation: ${operation}`)

    if (operation === 'ask-question') {
      if (!requestData.question || !requestData.transcription) {
        console.error(`[${requestId}] Missing question or transcription for ask-question operation`)
        return createJsonResponse({ error: 'Missing question or transcription' }, 400)
      }
      console.log(`[${requestId}] Processing question: ${requestData.question?.substring(0, 50)}...`)
      return await answerQuestion(requestData.question, requestData.transcription, requestId)
    }
    
    const { filePath, fileName, analyze = false } = requestData
    if (!filePath || !fileName) {
      console.error(`[${requestId}] Missing required fields in payload:`, {
        hasFilePath: !!filePath,
        hasFileName: !!fileName,
      })
      return createJsonResponse({ error: 'Missing required fields: filePath and fileName' }, 400)
    }

    if (!OPENAI_API_KEY || !OPENAI_API_KEY.startsWith('sk-')) {
      console.error(`[${requestId}] OpenAI API key not configured or invalid`)
      return createJsonResponse({ error: 'OpenAI API key is not configured or invalid' }, 500)
    }
    
    try {
      console.log(`[${requestId}] Attempting to download audio file from path: ${filePath}`)
      const { data: audioBlob, error: downloadError } = await supabaseAdmin.storage
        .from('audio-recordings')
        .download(filePath)

      if (downloadError) {
        console.error(`[${requestId}] Error downloading audio from Supabase Storage:`, downloadError)
        return createJsonResponse({ error: `Failed to download audio: ${downloadError.message}` }, 500)
      }

      if (!audioBlob || audioBlob.size === 0) {
        console.error(`[${requestId}] Empty audio file downloaded`)
        return createJsonResponse({ error: 'Empty audio file' }, 400)
      }
      
      console.log(`[${requestId}] Audio file downloaded successfully, size: ${audioBlob.size} bytes, type: ${audioBlob.type}`);
      
      // Prepare audio file for OpenAI API
      const formData = new FormData();
      formData.append('file', audioBlob, fileName);
      formData.append('model', 'whisper-1');
      formData.append('language', 'en');
      formData.append('response_format', 'json');
      
      console.log(`[${requestId}] Calling OpenAI transcription API with valid key`)

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 25000)

      let transcriptionResponse
      try {
        transcriptionResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
          },
          body: formData,
          signal: controller.signal,
        })
        clearTimeout(timeoutId)
        console.log(`[${requestId}] OpenAI API response status:`, transcriptionResponse.status)
      } catch (apiError) {
        clearTimeout(timeoutId)
        console.error(`[${requestId}] Error calling OpenAI API:`, apiError)
        const errorMessage = apiError instanceof Error && apiError.name === 'AbortError'
          ? 'OpenAI API timeout'
          : 'OpenAI API error'
        return createJsonResponse({ error: errorMessage }, 500)
      }
      
      if (!transcriptionResponse.ok) {
        const errorText = await transcriptionResponse.text()
        console.error(`[${requestId}] OpenAI API error ${transcriptionResponse.status}: ${errorText}`)
        return createJsonResponse(
          { error: `OpenAI API returned error: ${transcriptionResponse.status}`, details: errorText },
          500
        )
      }
      
      const transcriptionData = await transcriptionResponse.json()

      if (!transcriptionData || !transcriptionData.text) {
        console.error(`[${requestId}] Invalid response from OpenAI API:`, transcriptionData)
        return createJsonResponse({ error: 'Invalid response from OpenAI API' }, 500)
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
      
      console.log(`[${requestId}] Successfully received transcription from OpenAI` + (analyze ? ' with analysis' : ''))
      return createJsonResponse(result, 200)
    } catch (error) {
      console.error(`[${requestId}] Unhandled error during transcription process:`, error)
      return createJsonResponse({ error: 'Unexpected error during processing' }, 500)
    }
  } catch (error) {
    console.error(`[${requestId}] Unhandled top-level error in edge function:`, error)
    return createJsonResponse({ error: 'Server error' }, 500)
  }
})


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

/**
 * Answer a question about a transcription
 */
async function answerQuestion(question: string, transcription: string, requestId: string) {
  console.log(`[${requestId}] Processing question about transcription`);
  
  if (!OPENAI_API_KEY) {
    console.error(`[${requestId}] OpenAI API key not configured in Edge Function secrets`);
    return createJsonResponse({
      answer: "I'm sorry, but I don't have access to the AI service needed to answer your question."
    }, 200);
  }
  
  try {
    console.log(`[${requestId}] Calling OpenAI to answer question`);
    
    // Create a structured prompt for question answering
    const messages = [
      {
        role: "system",
        content: `You are an AI assistant who helps answer questions about meeting transcripts. 
        Use the provided transcript to give an accurate, helpful, and concise answer.
        Focus only on information present in the transcript.
        If the answer is not in the transcript, acknowledge this and provide general guidance.
        Format your responses using markdown for better readability.`
      },
      {
        role: "user",
        content: `Here is the transcript of a meeting:

${transcription}

My question is: ${question}`
      }
    ];
    
    // Call OpenAI API for question answering
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: messages,
        temperature: 0.2, // Lower temperature for more factual answers
        max_tokens: 800
      })
    });
    
    if (!response.ok) {
      console.error(`[${requestId}] OpenAI Q&A API error:`, response.status, response.statusText);
      return createJsonResponse({
        answer: "I'm sorry, but I encountered an error while processing your question. Please try again."
      }, 200);
    }
    
    const data = await response.json();
    if (!data.choices || !data.choices[0] || !data.choices[0].message || !data.choices[0].message.content) {
      console.error(`[${requestId}] Invalid response from OpenAI Q&A:`, data);
      return createJsonResponse({
        answer: "I'm sorry, but I received an invalid response while processing your question. Please try again."
      }, 200);
    }
    
    const answer = data.choices[0].message.content;
    console.log(`[${requestId}] Successfully generated answer for question`);
    
    return createJsonResponse({
      answer: answer
    }, 200);
    
  } catch (error) {
    console.error(`[${requestId}] Error answering question:`, error);
    return createJsonResponse({
      answer: "I'm sorry, but an error occurred while processing your question. Please try again."
    }, 200);
  }
}
