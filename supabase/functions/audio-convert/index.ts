
// Follow this setup guide to integrate the Supabase Edge Functions Starter:
// https://supabase.io/docs/guides/functions/quickstart

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.2';
import { FFmpeg } from 'https://esm.sh/@ffmpeg/ffmpeg@0.12.10';
import { fetchFile, toBlobURL } from 'https://esm.sh/@ffmpeg/util@0.12.1';

// Define CORS headers with explicit allowed origins
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',  // More restrictive in production
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, range',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400', // 24 hours caching of preflight requests
  'Access-Control-Allow-Credentials': 'true',
};

// Environment variables
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';

serve(async (req) => {
  // Handle CORS preflight requests - must return 200 status
  if (req.method === 'OPTIONS') {
    console.log('Handling CORS preflight request');
    return new Response(null, { 
      status: 200, 
      headers: corsHeaders 
    });
  }
  
  // Set up basic logging for troubleshooting
  console.log(`Audio convert function called [${new Date().toISOString()}]`);
  
  try {
    // Check auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error("Missing Authorization header");
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
    const formData = await req.formData();
    const audioFile = formData.get('audioFile');
    
    if (!audioFile || !(audioFile instanceof File)) {
      return new Response(
        JSON.stringify({ error: 'No audio file provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`Received audio file: ${audioFile.name}, type: ${audioFile.type}, size: ${audioFile.size} bytes`);
    
    // Initialize FFmpeg
    console.log("Initializing FFmpeg...");
    const ffmpeg = new FFmpeg();
    
    try {
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
      
      console.log("FFmpeg loaded successfully");
      
      // Convert the File to ArrayBuffer
      const inputBuffer = await audioFile.arrayBuffer();
      
      // Write the file to FFmpeg virtual filesystem
      ffmpeg.writeFile('input', new Uint8Array(inputBuffer));
      
      // Generate output filename
      const timestamp = Date.now();
      const outputFilename = `converted_${timestamp}.wav`;
      
      console.log("Converting audio to WAV format...");
      
      // Run FFmpeg command to convert to WAV
      // Format: 16-bit PCM, 16kHz, mono (good for speech recognition)
      await ffmpeg.exec([
        '-i', 'input',
        '-ar', '16000',
        '-ac', '1',
        '-c:a', 'pcm_s16le',
        'output.wav'
      ]);
      
      console.log("Conversion completed successfully");
      
      // Read the converted file
      const outputData = await ffmpeg.readFile('output.wav');
      const wavBlob = new Blob([outputData], { type: 'audio/wav' });
      
      console.log(`Converted WAV file size: ${wavBlob.size} bytes`);
      
      // Generate unique file path
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }
      
      const filePath = `${user.id}/converted_${timestamp}.wav`;
      
      // Upload the WAV file to storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('audio-recordings')
        .upload(filePath, wavBlob);
        
      if (uploadError) {
        console.error("Error uploading converted WAV:", uploadError);
        throw new Error(`Failed to upload WAV: ${uploadError.message}`);
      }
      
      // Get public URL for the WAV file
      const { data: urlData } = supabase.storage
        .from('audio-recordings')
        .getPublicUrl(filePath);
        
      if (!urlData || !urlData.publicUrl) {
        throw new Error('Failed to get URL for converted WAV file');
      }
      
      console.log("WAV conversion complete. File URL:", urlData.publicUrl);
      
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
      
    } catch (ffmpegError) {
      console.error("FFmpeg error:", ffmpegError);
      
      // If FFmpeg fails, return original file
      console.log("Returning original file without conversion");
      
      // Generate unique file path for the original file
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }
      
      const timestamp = Date.now();
      const filePath = `${user.id}/original_${timestamp}.${audioFile.name.split('.').pop() || 'mp3'}`;
      
      // Upload the original file
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('audio-recordings')
        .upload(filePath, audioFile);
        
      if (uploadError) {
        console.error("Error uploading original file:", uploadError);
        throw new Error(`Failed to upload original file: ${uploadError.message}`);
      }
      
      // Get public URL for the original file
      const { data: urlData } = supabase.storage
        .from('audio-recordings')
        .getPublicUrl(filePath);
        
      // Return original file URL
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
    }
    
  } catch (error) {
    console.error("Unhandled error in audio conversion:", error);
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
