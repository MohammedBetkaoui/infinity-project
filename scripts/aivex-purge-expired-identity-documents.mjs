// Approval-gated identity-card purge. Dry-run by default; never prints PII,
// file names, object paths, tokens or registration identifiers.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { AIVEX_EDITION, IDENTITY_CARD_POLICY } from '../shared/aivex/contract-v4.js'

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
const editionIndex = process.argv.indexOf('--edition')
const edition = editionIndex >= 0 ? Number(process.argv[editionIndex + 1]) : AIVEX_EDITION
if (!Number.isInteger(edition) || edition < 1) throw new Error('Invalid --edition value.')
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) throw new Error('Missing server-side Supabase configuration.')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const { data: settings, error: settingsError } = await supabase.from('aivex_settings').select([
  'identity_document_retention_days', 'identity_document_retention_trigger', 'identity_document_retention_policy_version',
  'identity_document_retention_approved_at', 'identity_document_retention_approved_by', 'identity_document_purge_enabled',
].join(', ')).eq('edition', edition).maybeSingle()
if (settingsError) throw new Error('Could not load retention settings.')

const approved = Number.isInteger(settings?.identity_document_retention_days)
  && settings.identity_document_retention_days > 0
  && settings.identity_document_retention_trigger === 'registration_submitted_at'
  && Boolean(settings.identity_document_retention_policy_version)
  && Boolean(settings.identity_document_retention_approved_at)
  && Boolean(settings.identity_document_retention_approved_by)

if (!approved) {
  console.log(`Edition ${edition}: retention approval is incomplete; eligible objects were not evaluated.`)
  console.log('AUTOMATIC PURGE REMAINS DISABLED UNTIL UNIVERSITY APPROVAL')
  process.exit(0)
}
if (execute && settings.identity_document_purge_enabled !== true) {
  console.error('Execution refused: identity_document_purge_enabled is false.')
  process.exit(2)
}

const cutoff = new Date(Date.now() - settings.identity_document_retention_days * 24 * 60 * 60 * 1000).toISOString()
const { data: rows, error: rowsError } = await supabase.from('aivex_registrations').select([
  'id', 'delegation_head_id_card_path', 'driver_id_card_path',
].join(', ')).eq('edition', edition).lt('submitted_at', cutoff)
  .or('delegation_head_id_card_path.not.is.null,driver_id_card_path.not.is.null')
if (rowsError) throw new Error('Could not evaluate retention candidates.')

const eligibleObjects = rows.reduce((count, row) => count
  + Number(Boolean(row.delegation_head_id_card_path)) + Number(Boolean(row.driver_id_card_path)), 0)
console.log(`Edition ${edition}: ${rows.length} registration(s), ${eligibleObjects} identity object(s) eligible.`)
if (!execute) {
  console.log('Dry run only. No Storage object or database metadata was changed.')
  process.exit(0)
}

let removed = 0
let failed = 0
const bucket = supabase.storage.from(IDENTITY_CARD_POLICY.bucket)
for (const row of rows) {
  for (const subject of ['delegation_head', 'driver']) {
    const prefix = `${subject}_id_card`
    const path = row[`${prefix}_path`]
    if (!path) continue
    const { error: removeError } = await bucket.remove([path])
    if (removeError) { failed += 1; continue }
    const { error: clearError } = await supabase.from('aivex_registrations').update({
      [`${prefix}_path`]: null, [`${prefix}_mime`]: null, [`${prefix}_size`]: null, [`${prefix}_sha256`]: null,
      [`${prefix}_purged_at`]: new Date().toISOString(),
    }).eq('id', row.id).eq(`${prefix}_path`, path)
    if (clearError) { failed += 1; continue }
    removed += 1
  }
}
console.log(`Purge completed: ${removed} object(s) removed and metadata cleared; ${failed} failure(s).`)
process.exit(failed ? 1 : 0)
