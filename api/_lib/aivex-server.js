import { createClient } from '@supabase/supabase-js'

export function createServerSupabaseClient() {
  const url = process.env.SUPABASE_URL
  const secret = process.env.SUPABASE_SECRET_KEY
  if (!url || !secret) return null
  return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } })
}
