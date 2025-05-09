// Follow this setup guide to integrate the Supabase Edge Functions Starter:
// https://supabase.io/docs/guides/functions/quickstart

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.2';
import { FFmpeg } from 'https://esm.sh/@ffmpeg/ffmpeg@0.12.10';
import { fetchFile, toBlobURL } from 'https://esm.sh/@ffmpeg/util@0.12.1';

// Enhanced CORS headers with explicit allowed origins
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',  // Allow all origins
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, range',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400', // 24 hours caching of preflight requests
  'Access-Control-Allow-Credentials': 'true',
};

// Environment variables
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';

serve(async (req) => {
  // Add request tracking ID for correlating logs
  const requestId = crypto.randomUUID();
  
  // Handle CORS preflight requests - MUST return 200 status for better compatibility
  if (req.method === 'OPTIONS') {
    console.log(`[${requestId}] ✅ Handling CORS preflight request`);
    return new Response(null, { 
      status: 200, // Use 200 instead of 204 for wider browser compatibility
      headers: corsHeaders 
    });
  }
  
  // Log request details for debugging
  console.log(`[${requestId}] Audio convert function called [${new Date().toISOString()}]`);
  console.log(`[${requestId}] Request method: ${req.method}`);
  console.log(`[${requestId}] Request headers:`, Object.fromEntries(req.headers.entries()));
  
  try {
    // Check auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error(`[${requestId}] Missing Authorization header`);
      return new Response(
        JSON.stringify({ error: 'Missing Authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Create a Supabase client for storage operations
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });
    
    // Parse the request as formData
    let formData;
    try {
      formData = await req.formData();
      console.log(`[${requestId}] FormData parsed successfully`);
    } catch (formDataError) {
      console.error(`[${requestId}] Error parsing FormData:`, formDataError);
      return new Response(
        JSON.stringify({ error: 'Could not parse form data: ' + formDataError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const audioFile = formData.get('audioFile');
    
    if (!audioFile || !(audioFile instanceof File)) {
      console.error(`[${requestId}] No audio file provided or invalid file type`);
      return new Response(
        JSON.stringify({ error: 'No audio file provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`[${requestId}] Received audio file: ${audioFile.name}, type: ${audioFile.type}, size: ${audioFile.size} bytes`);
    
    // Initialize FFmpeg
    console.log(`[${requestId}] Initializing FFmpeg...`);
    const ffmpeg = new FFmpeg();
    
    try {
      console.log(`[${requestId}] Loading FFmpeg core...`);
      // Load FFmpeg core
      await ffmpeg.load({
        coreURL: await toBlobURL(
          'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js',
          'application/javascript'
        ),
        wasmURL: await toBlobURL(
          'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm',
          'application/wasm'
        ),
      });
      
      console.log(`[${requestId}] FFmpeg loaded successfully`);
      
      // Convert the File to ArrayBuffer
      let inputBuffer;
      try {
        inputBuffer = await audioFile.arrayBuffer();
        console.log(`[${requestId}] Audio file converted to ArrayBuffer, size: ${inputBuffer.byteLength} bytes`);
      } catch (arrayBufferError) {
        console.error(`[${requestId}] Error converting file to ArrayBuffer:`, arrayBufferError);
        throw new Error(`Failed to read audio file data: ${arrayBufferError.message}`);
      }
      
      // Write the file to FFmpeg virtual filesystem
      try {
        ffmpeg.writeFile('input', new Uint8Array(inputBuffer));
        console.log(`[${requestId}] Audio file written to FFmpeg virtual filesystem`);
      } catch (writeFileError) {
        console.error(`[${requestId}] Error writing to FFmpeg virtual filesystem:`, writeFileError);
        throw new Error(`Failed to process audio file in FFmpeg: ${writeFileError.message}`);
      }
      
      // Generate output filename
      const timestamp = Date.now();
      const outputFilename = `converted_${timestamp}.wav`;
      
      console.log(`[${requestId}] Converting audio to WAV format...`);
      
      // Run FFmpeg command to convert to WAV
      // Format: 16-bit PCM, 16kHz, mono (good for speech recognition)
      try {
        await ffmpeg.exec([
          '-i', 'input',
          '-ar', '16000',
          '-ac', '1',
          '-c:a', 'pcm_s16le',
          'output.wav'
        ]);
        console.log(`[${requestId}] FFmpeg conversion command executed successfully`);
      } catch (ffmpegExecError) {
        console.error(`[${requestId}] Error executing FFmpeg conversion:`, ffmpegExecError);
        throw new Error(`FFmpeg conversion failed: ${ffmpegExecError.message}`);
      }
      
      console.log(`[${requestId}] Conversion completed successfully`);
      
      // Read the converted file
      let outputData;
      try {
        outputData = await ffmpeg.readFile('output.wav');
        console.log(`[${requestId}] Converted file read from FFmpeg filesystem, size: ${outputData.length} bytes`);
      } catch (readFileError) {
        console.error(`[${requestId}] Error reading converted file:`, readFileError);
        throw new Error(`Failed to read converted file: ${readFileError.message}`);
      }
      
      const wavBlob = new Blob([outputData], { type: 'audio/wav' });
      console.log(`[${requestId}] Converted WAV file size: ${wavBlob.size} bytes`);
      
      // Generate unique file path
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError) {
          console.error(`[${requestId}] Auth error:`, userError);
          throw new Error(`User authentication failed: ${userError.message}`);
        }
        
        if (!user) {
          console.error(`[${requestId}] User not authenticated`);
          throw new Error('User not authenticated');
        }
        
        const filePath = `${user.id}/converted_${timestamp}.wav`;
        
        // Upload the WAV file to storage
        console.log(`[${requestId}] Uploading WAV file to storage at path: ${filePath}`);
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('audio-recordings')
          .upload(filePath, wavBlob);
          
        if (uploadError) {
          console.error(`[${requestId}] Error uploading converted WAV:`, uploadError);
          throw new Error(`Failed to upload WAV: ${uploadError.message}`);
        }
        
        console.log(`[${requestId}] WAV file uploaded successfully: ${JSON.stringify(uploadData)}`);
        
        // Get public URL for the WAV file
        const { data: urlData } = supabase.storage
          .from('audio-recordings')
          .getPublicUrl(filePath);
          
        if (!urlData || !urlData.publicUrl) {
          console.error(`[${requestId}] Failed to get URL for converted WAV file`);
          throw new Error('Failed to get URL for converted WAV file');
        }
        
        console.log(`[${requestId}] WAV conversion complete. File URL: ${urlData.publicUrl}`);
        
        // Return success response
        return new Response(
          JSON.stringify({
            success: true,
            audioUrl: urlData.publicUrl,
            format: 'wav',
            size: wavBlob.size
          }),
          { 
            status: 200, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      } catch (storageError) {
        console.error(`[${requestId}] Supabase storage error:`, storageError);
        throw new Error(`Storage operation failed: ${storageError.message}`);
      }
      
    } catch (ffmpegError) {
      console.error(`[${requestId}] FFmpeg error:`, ffmpegError);
      
      // If FFmpeg fails, return original file
      console.log(`[${requestId}] Returning original file without conversion`);
      
      try {
        // Generate unique file path for the original file
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError) {
          console.error(`[${requestId}] Auth error:`, userError);
          throw new Error(`User authentication failed: ${userError.message}`);
        }
        
        if (!user) {
          console.error(`[${requestId}] User not authenticated`);
          throw new Error('User not authenticated');
        }
        
        const timestamp = Date.now();
        const filePath = `${user.id}/original_${timestamp}.${audioFile.name.split('.').pop() || 'mp3'}`;
        
        // Upload the original file
        console.log(`[${requestId}] Uploading original file to storage at path: ${filePath}`);
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('audio-recordings')
          .upload(filePath, audioFile);
          
        if (uploadError) {
          console.error(`[${requestId}] Error uploading original file:`, uploadError);
          throw new Error(`Failed to upload original file: ${uploadError.message}`);
        }
        
        console.log(`[${requestId}] Original file uploaded successfully: ${JSON.stringify(uploadData)}`);
        
        // Get public URL for the original file
        const { data: urlData } = supabase.storage
          .from('audio-recordings')
          .getPublicUrl(filePath);
          
        if (!urlData || !urlData.publicUrl) {
          console.error(`[${requestId}] Failed to get URL for original file`);
          throw new Error('Failed to get URL for original file');
        }
        
        // Return original file URL
        console.log(`[${requestId}] Original file URL: ${urlData.publicUrl}`);
        return new Response(
          JSON.stringify({
            success: true,
            audioUrl: urlData.publicUrl,
            format: 'original',
            size: audioFile.size,
            message: 'Using original format - FFmpeg conversion failed'
          }),
          { 
            status: 200, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      } catch (fallbackError) {
        console.error(`[${requestId}] Error in fallback handling:`, fallbackError);
        throw fallbackError;
      }
    }
    
  } catch (error) {
    console.error(`[${requestId}] Unhandled error in audio conversion:`, error);
    return new Response(
      JSON.stringify({
        error: 'Audio conversion failed',
        message: error instanceof Error ? error.message : String(error)
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
