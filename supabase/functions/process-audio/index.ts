
// Follow this setup guide to integrate the Supabase Edge Functions Starter:
// https://supabase.com/docs/guides/functions/quickstart

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.2'
import { corsHeaders } from '../_shared/cors.ts'

const openAIApiKey = Deno.env.get('OPENAI_API_KEY')

interface RequestPayload {
  audioUrl: string
  fileName: string
  userId: string
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

  try {
    // Create a Supabase client with the Auth context of the function
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    // Get the request payload
    const { audioUrl, fileName, userId } = await req.json() as RequestPayload
    
    if (!audioUrl || !fileName || !userId) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if OpenAI API key is available
    if (!openAIApiKey) {
      return new Response(
        JSON.stringify({ error: 'OpenAI API key is not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 1. Download the audio file from the URL
    const audioResponse = await fetch(audioUrl)
    if (!audioResponse.ok) {
      throw new Error(`Failed to fetch audio file: ${audioResponse.statusText}`)
    }

    // 2. Get audio data as blob
    const audioBlob = await audioResponse.blob()
    
    // 3. Create a FormData object for the OpenAI API
    const formData = new FormData()
    formData.append('file', audioBlob, fileName)
    formData.append('model', 'whisper-1')
    formData.append('language', 'en') // You can make this dynamic later
    
    // 4. Call the OpenAI API for transcription
    const transcriptionResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`
      },
      body: formData
    })

    if (!transcriptionResponse.ok) {
      const errorDetails = await transcriptionResponse.text()
      throw new Error(`OpenAI API error: ${errorDetails}`)
    }

    const transcriptionData = await transcriptionResponse.json()
    const transcription = transcriptionData.text

    // 5. Process the transcription with GPT to extract summary and action items
    const analysisResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
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
        max_tokens: 1000
      })
    })

    if (!analysisResponse.ok) {
      const errorDetails = await analysisResponse.text()
      throw new Error(`OpenAI Analysis API error: ${errorDetails}`)
    }

    const analysisData = await analysisResponse.json()
    const analysisText = analysisData.choices[0].message.content

    // Extract summary and action items from the analysis
    let summary = ''
    const actionItems: string[] = []

    // Simple parsing of the analysis response
    const sections = analysisText.split('\n\n')
    for (const section of sections) {
      if (section.toLowerCase().includes('summary')) {
        summary = section.replace(/^summary:?/i, '').trim()
      } else if (section.toLowerCase().includes('action item')) {
        // Split into individual action items
        const items = section.split('\n')
        for (const item of items) {
          if (item.trim() && !item.toLowerCase().includes('action item')) {
            actionItems.push(item.trim())
          }
        }
      }
    }

    // 6. Store the results in the database
    const { error: dbError } = await supabaseClient
      .from('transcriptions')
      .insert({
        user_id: userId,
        title: `Meeting on ${new Date().toLocaleDateString()}`,
        content: transcription,
        summary,
        action_items: actionItems
      })

    if (dbError) {
      throw new Error(`Database error: ${dbError.message}`)
    }

    // 7. Return the results
    const result: TranscriptionResult = {
      transcription,
      summary,
      actionItems
    }

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
    return new Response(
      JSON.stringify({ error: error.message }),
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
