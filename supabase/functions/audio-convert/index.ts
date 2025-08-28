
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.2'
import { FFmpeg } from 'https://esm.sh/@ffmpeg/ffmpeg@0.12.10'
import { toBlobURL } from 'https://esm.sh/@ffmpeg/util@0.12.1'
import { corsHeaders } from '../_shared/cors.ts'

// Environment variables
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

// Initialize Supabase client with service role key
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

function createJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  const requestId = crypto.randomUUID()
  console.log(`[${requestId}] Audio convert function called [${new Date().toISOString()}]`)

  if (req.method === 'OPTIONS') {
    console.log(`[${requestId}] ✅ Handling CORS preflight request`)
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
    
    let formData
    try {
      formData = await req.formData()
      console.log(`[${requestId}] FormData parsed successfully`)
    } catch (formDataError) {
      console.error(`[${requestId}] Error parsing FormData:`, formDataError)
      return createJsonResponse({ error: `Could not parse form data: ${formDataError.message}` }, 400)
    }

    const audioFile = formData.get('audioFile')
    if (!audioFile || !(audioFile instanceof File)) {
      console.error(`[${requestId}] No audio file provided or invalid file type`)
      return createJsonResponse({ error: 'No audio file provided' }, 400)
    }
    
    console.log(`[${requestId}] Received audio file: ${audioFile.name}, type: ${audioFile.type}, size: ${audioFile.size} bytes`);
    
    console.log(`[${requestId}] Initializing FFmpeg...`)
    const ffmpeg = new FFmpeg()

    try {
      console.log(`[${requestId}] Loading FFmpeg core...`)
      await ffmpeg.load({
        coreURL: await toBlobURL('https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js', 'application/javascript'),
        wasmURL: await toBlobURL('https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm', 'application/wasm'),
      })
      
      console.log(`[${requestId}] FFmpeg loaded successfully`);
      
      const inputBuffer = await audioFile.arrayBuffer()
      console.log(`[${requestId}] Audio file converted to ArrayBuffer, size: ${inputBuffer.byteLength} bytes`)

      ffmpeg.writeFile('input', new Uint8Array(inputBuffer))
      console.log(`[${requestId}] Audio file written to FFmpeg virtual filesystem`)
      
      const timestamp = Date.now()
      console.log(`[${requestId}] Converting audio to WAV format...`)

      await ffmpeg.exec(['-i', 'input', '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', 'output.wav'])
      console.log(`[${requestId}] FFmpeg conversion command executed successfully`)

      console.log(`[${requestId}] Conversion completed successfully`)
      const outputData = await ffmpeg.readFile('output.wav')
      console.log(`[${requestId}] Converted file read from FFmpeg filesystem, size: ${outputData.length} bytes`)
      
      const wavBlob = new Blob([outputData], { type: 'audio/wav' })
      console.log(`[${requestId}] Converted WAV file size: ${wavBlob.size} bytes`)

      const filePath = `${user.id}/converted_${timestamp}.wav`
      console.log(`[${requestId}] Uploading WAV file to storage at path: ${filePath}`)

      const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
        .from('audio-recordings')
        .upload(filePath, wavBlob)

      if (uploadError) {
        console.error(`[${requestId}] Error uploading converted WAV:`, uploadError)
        throw new Error(`Failed to upload WAV: ${uploadError.message}`)
      }
      console.log(`[${requestId}] WAV file uploaded successfully:`, uploadData)

      return createJsonResponse({
        success: true,
        filePath: uploadData.path,
        format: 'wav',
        size: wavBlob.size,
      })
      
    } catch (ffmpegError) {
      console.error(`[${requestId}] FFmpeg error:`, ffmpegError)
      console.log(`[${requestId}] Returning original file without conversion`)

      const timestamp = Date.now()
      const extension = audioFile.name.split('.').pop() || 'mp3'
      const filePath = `${user.id}/original_${timestamp}.${extension}`

      console.log(`[${requestId}] Uploading original file to storage at path: ${filePath}`)
      const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
        .from('audio-recordings')
        .upload(filePath, audioFile)

      if (uploadError) {
        console.error(`[${requestId}] Error uploading original file:`, uploadError)
        throw new Error(`Failed to upload original file: ${uploadError.message}`)
      }
      console.log(`[${requestId}] Original file uploaded successfully:`, uploadData)

      return createJsonResponse({
        success: true,
        filePath: uploadData.path,
        format: 'original',
        size: audioFile.size,
        message: 'Using original format - FFmpeg conversion failed',
      })
    }
  } catch (error) {
    console.error(`[${requestId}] Unhandled error in audio conversion:`, error)
    return createJsonResponse(
      {
        error: 'Audio conversion failed',
        message: error instanceof Error ? error.message : String(error),
      },
      500
    )
  }
})
