import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Server-side Supabase client using the service_role key. Bypasses RLS — only
 * call from serverless functions or trusted server code. Never bundle this in
 * the browser.
 */
export function supabaseAdmin(): SupabaseClient {
  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url) {
    throw new Error('VITE_SUPABASE_URL (or SUPABASE_URL) env var missing.')
  }
  if (!serviceRole) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY env var missing.')
  }
  return createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/**
 * Extracts the Bearer token from an Authorization header and asks Supabase who
 * owns it. Returns the authenticated user id or null if unauthenticated.
 */
export async function getUserIdFromAuthHeader(
  authHeader: string | string[] | undefined,
): Promise<string | null> {
  const header = Array.isArray(authHeader) ? authHeader[0] : authHeader
  if (!header) return null
  const match = /^Bearer\s+(.+)$/i.exec(header)
  if (!match) return null
  const jwt = match[1]
  const { data, error } = await supabaseAdmin().auth.getUser(jwt)
  if (error || !data?.user) return null
  return data.user.id
}
