// Sets one campaign-wide deadline for every existing Staff confirmation link.
// Dry-run by default. Only aggregate counts are printed; no candidate data,
// private tokens, or record identifiers are logged.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { STAFF_CONFIRMATION_DEADLINE_ISO } from '../api/_lib/staff-confirmation-tokens.js'

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
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
  throw new Error('Missing server-side Supabase configuration.')
}

const secretKey = process.env.SUPABASE_SECRET_KEY
const apiKeyOnlyFetch = async (input, init = {}) => {
  const headers = new Headers(init.headers)
  if (secretKey.startsWith('sb_secret_')) headers.delete('Authorization')
  return fetch(input, { ...init, headers })
}
const supabase = createClient(process.env.SUPABASE_URL, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: apiKeyOnlyFetch },
})

async function loadDeadlines(table) {
  const rows = []
  const batchSize = 1000
  for (let from = 0; ; from += batchSize) {
    const { data, error } = await supabase.from(table)
      .select('id, expires_at')
      .order('id', { ascending: true })
      .range(from, from + batchSize - 1)
    if (error) throw new Error(`Could not inspect ${table} (${error.code || 'database_error'}): ${error.message || 'unknown database error'}`)
    rows.push(...(data || []))
    if (!data || data.length < batchSize) break
  }
  return rows
}

const sameDeadline = (value) => new Date(value).toISOString() === STAFF_CONFIRMATION_DEADLINE_ISO
const before = await Promise.all([
  loadDeadlines('membership_staff_confirmations'),
  loadDeadlines('membership_staff_confirmation_tokens'),
])
const [confirmations, tokens] = before
const confirmationChanges = confirmations.filter((row) => !sameDeadline(row.expires_at)).length
const tokenChanges = tokens.filter((row) => !sameDeadline(row.expires_at)).length

console.log(`Target deadline: 1 November 2026 at 23:59:59 (Africa/Algiers).`)
console.log(`${confirmations.length} confirmation(s): ${confirmationChanges} require an update.`)
console.log(`${tokens.length} private-link token(s): ${tokenChanges} require an update.`)
if (!execute) {
  console.log('Dry run only. Re-run with --execute to apply and verify the update.')
  process.exit(0)
}

const changedAt = new Date().toISOString()
for (const [table, total] of [
  ['membership_staff_confirmations', confirmations.length],
  ['membership_staff_confirmation_tokens', tokens.length],
]) {
  if (total === 0) continue
  const { error } = await supabase.from(table)
    .update({ expires_at: STAFF_CONFIRMATION_DEADLINE_ISO, updated_at: changedAt })
    .not('id', 'is', null)
  if (error) throw new Error(`Could not update ${table} (${error.code || 'database_error'}): ${error.message || 'unknown database error'}. Re-run the command safely after resolving the database error.`)
}

const [verifiedConfirmations, verifiedTokens] = await Promise.all([
  loadDeadlines('membership_staff_confirmations'),
  loadDeadlines('membership_staff_confirmation_tokens'),
])
const invalidConfirmations = verifiedConfirmations.filter((row) => !sameDeadline(row.expires_at)).length
const invalidTokens = verifiedTokens.filter((row) => !sameDeadline(row.expires_at)).length
if (invalidConfirmations || invalidTokens) {
  throw new Error(`Deadline verification failed: ${invalidConfirmations} confirmation(s), ${invalidTokens} token(s) still differ.`)
}

console.log(`Update verified: ${verifiedConfirmations.length} confirmation(s) and ${verifiedTokens.length} token(s) now share the deadline.`)
