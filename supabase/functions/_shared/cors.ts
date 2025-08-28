// supabase/functions/_shared/cors.ts

/**
 * Standardized CORS headers for Supabase Edge Functions.
 *
 * This module provides a consistent set of CORS headers to be used across
 * all edge functions in the project. Using a shared module helps to avoid
 * inconsistencies and makes it easier to manage CORS policies globally.
 *
 * The headers are configured to be permissive for development purposes,
 * allowing requests from any origin ('*'). For production environments,
 * it is recommended to restrict the 'Access-Control-Allow-Origin' to a
 * specific domain.
 *
 * The headers include:
 * - Access-Control-Allow-Origin: Specifies which origins are permitted to
 *   access the resource.
 * - Access-Control-Allow-Headers: Lists the headers that are allowed in
 *   the actual request. This includes standard headers like 'authorization',
 *   'x-client-info', and 'apikey', as well as 'content-type'.
 * - Access-Control-Allow-Methods: Defines the HTTP methods that are
 *   allowed when accessing the resource, such as 'POST' for submitting data
 *   and 'OPTIONS' for preflight requests.
 */
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-control-allow-headers': 'authorization, x-client-info, apikey, content-type, range',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
