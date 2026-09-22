// Controlled cleanup for expired direct-upload sessions. Dry-run by default.
// Counts only are printed; staging paths and session/registration IDs are not.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
if (existsSync(join(root, '.env.local'))) {
  for (const line of readFileSync(join(root, '.env.local'), 'utf8').split('\n')) {
    const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/)
    if (!match) continue
    let value = match[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    if (!(match[1] in process.env)) process.env[match[1]] = value
  }
}

const execute = process.argv.includes('--execute')
const ALLOWED_BUCKETS = new Set(['aivex-student-cards', 'aivex-id-cards', 'aivex-signed-forms'])
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) throw new Error('Missing server-side Supabase configuration.')
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const { data: sessions, error } = await supabase.from('aivex_upload_sessions').select('id, expected_files')
  .lt('expires_at', new Date().toISOString()).neq('status', 'finalizing').limit(1000)
if (error) throw new Error('Could not list expired upload sessions.')
const objectCount = sessions.reduce((sum, session) => sum + (Array.isArray(session.expected_files) ? session.expected_files.length : 0), 0)
console.log(`${sessions.length} expired session(s), up to ${objectCount} staged object(s).`)
if (!execute) {
  console.log('Dry run only. Re-run with --execute after operational review.')
  process.exit(0)
}
let cleaned = 0
let failed = 0
for (const session of sessions) {
  const manifest = Array.isArray(session.expected_files) ? session.expected_files : []
  let sessionOk = true
  for (const item of manifest) {
    if (!ALLOWED_BUCKETS.has(item?.bucket) || !item?.path?.startsWith('staging/')) { sessionOk = false; continue }
    const { error: removeError } = await supabase.storage.from(item.bucket).remove([item.path])
    if (removeError) sessionOk = false
  }
  if (sessionOk) {
    const { error: deleteError } = await supabase.from('aivex_upload_sessions').delete().eq('id', session.id).lt('expires_at', new Date().toISOString())
    if (deleteError) sessionOk = false
  }
  if (sessionOk) cleaned += 1
  else failed += 1
}
console.log(`Cleanup completed: ${cleaned} session(s) removed; ${failed} failure(s).`)
process.exit(failed ? 1 : 0)
