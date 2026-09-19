// Administrative retry for AIVEX official documents (server-side only).
//
// Lists the registrations of an edition whose documents are not settled —
// document_status not_generated or generation_failed, or a 'generating'
// claim that went stale (an attempt that died mid-way) — and, with --apply,
// runs the same generation pipeline the registration API runs
// (api/_lib/aivex-document-generation.js). Idempotent: a registration that
// another process claims meanwhile is skipped, never generated twice.
//
// Usage (credentials from the environment or .env.local, never VITE_*):
//   node scripts/aivex-retry-documents.mjs              # dry run: list only
//   node scripts/aivex-retry-documents.mjs --apply      # regenerate
//   node scripts/aivex-retry-documents.mjs --edition 2 --apply
//
// Output: references and outcomes only — never names, phones, e-mails,
// RFIDs or Storage paths.

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { AIVEX_EDITION } from '../shared/aivex/contract-v4.js'
import { DOCUMENT_STALE_AFTER_MS, generateOfficialDocuments } from '../api/_lib/aivex-document-generation.js'
import { createSupabaseDocumentStore } from '../api/_lib/aivex-document-store.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// Same .env.local loader as scripts/dev-api.mjs: never overrides a variable
// already set in the environment.
if (existsSync(join(root, '.env.local'))) {
  for (const line of readFileSync(join(root, '.env.local'), 'utf8').split('\n')) {
    const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/)
    if (!match) continue
    let value = match[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    if (!(match[1] in process.env)) process.env[match[1]] = value
  }
}

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const editionArg = args.indexOf('--edition')
const edition = editionArg >= 0 ? Number(args[editionArg + 1]) : AIVEX_EDITION
if (!Number.isInteger(edition) || edition < 1) {
  console.error('Invalid --edition value.')
  process.exit(2)
}

const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env
if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SECRET_KEY must be set (environment or .env.local).')
  process.exit(2)
}

const store = createSupabaseDocumentStore(createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
}))

const now = new Date()
const staleBefore = new Date(now.getTime() - DOCUMENT_STALE_AFTER_MS)
const pending = await store.listRetryableRegistrations({ edition, staleBefore })

console.log(`Edition ${edition}: ${pending.length} registration(s) with unsettled documents.`)
for (const row of pending) console.log(`  ${row.reference}  ${row.document_status}`)

if (!apply) {
  if (pending.length) console.log('\nDry run. Re-run with --apply to regenerate their documents.')
  process.exit(0)
}

let failures = 0
for (const row of pending) {
  const result = await generateOfficialDocuments({ store, registrationId: row.id, now: new Date() })
  const outcome = !result.attempted ? `skipped (${result.reason})` : `docx ${result.docx ? 'generated' : 'FAILED'}`
  if (result.attempted && !result.docx) failures += 1
  console.log(`  ${row.reference}  ${outcome}`)
}
process.exit(failures ? 1 : 0)
