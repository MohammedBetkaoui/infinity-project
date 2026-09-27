import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { createAdminAivexService } from '../api/_lib/admin-aivex.js'

const MIGRATION = new URL('../supabase/migrations/20261002120000_aivex_atomic_first_review.sql', import.meta.url)
const REGISTRATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const REFERENCE = 'AIVEX2-ZQMB126C'
const UPDATED_AT = '2026-09-27T11:00:00.000Z'
const ADMIN = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', role: 'administrator' }

async function migrationSql() {
  return (await readFile(MIGRATION, 'utf8')).toLowerCase()
}

function reviewFunction(sql) {
  const start = sql.indexOf('create or replace function public.admin_apply_aivex_review_action(')
  const end = sql.indexOf('\nrevoke all on function public.admin_apply_aivex_review_action(', start)
  assert(start >= 0 && end > start)
  return sql.slice(start, end)
}

test('fresh submitted + signed_document_uploaded -> verify_document completes as under_review atomically', async () => {
  const body = reviewFunction(await migrationSql())

  assert.match(body, /p_action not in \('verify_activity_official', 'verify_document', 'invalidate_document'\)/)
  assert.match(body, /registration_status = 'submitted'[\s\S]*document_status = 'signed_document_uploaded'[\s\S]*v_next_registration_status := 'under_review'[\s\S]*v_next_document_status := 'under_review'/)
  assert.match(body, /p_action = 'verify_document'[\s\S]*then 'verified'/)
  assert.match(body, /set registration_status = v_next_registration_status,[\s\S]*document_status = v_next_document_status/)
  assert.doesNotMatch(body, /return public\.admin_apply_aivex_action\s*\(/)
})

test('fresh submitted + signed_document_uploaded -> verify_activity_official completes as under_review atomically', async () => {
  const body = reviewFunction(await migrationSql())

  assert.match(body, /if p_action = 'verify_activity_official' then[\s\S]*jsonb_typeof\(p_payload -> 'verified'\)[\s\S]*insert into public\.aivex_admin_case_reviews/)
  assert.match(body, /v_next_registration_status := 'under_review';[\s\S]*v_next_document_status := 'under_review';[\s\S]*if p_action = 'verify_activity_official'/)

  const registrationLocks = body.match(/from public\.aivex_registrations as registration[\s\S]{0,180}?for update/g) || []
  assert.equal(registrationLocks.length, 1, 'the review path must take one registration row lock')
})

test('stale expectedUpdatedAt returns a fast 409 and the database lock wait is bounded', async () => {
  const body = reviewFunction(await migrationSql())
  const preflightRead = body.indexOf('select registration.updated_at into v_observed_updated_at')
  const preflightConflict = body.indexOf("raise exception 'aivex_registration_conflict'", preflightRead)
  const rowLock = body.indexOf('for update;', preflightConflict)
  const lockedConflict = body.indexOf("raise exception 'aivex_registration_conflict'", rowLock)

  assert.match(body, /set lock_timeout = '3s'/)
  assert(preflightRead >= 0 && preflightConflict > preflightRead)
  assert(rowLock > preflightConflict, 'known-stale tokens must fail before waiting for a row lock')
  assert(lockedConflict > rowLock, 'the timestamp must be rechecked after acquiring the lock')

  const store = {
    findByReference: async () => ({ id: REGISTRATION_ID, updated_at: UPDATED_AT }),
    applyAction: async () => { throw Object.assign(new Error('aivex_action'), { code: '40001', databaseMessage: 'aivex_registration_conflict' }) },
  }
  const service = createAdminAivexService({ store, now: () => new Date('2026-09-27T12:00:00Z') })
  const result = await Promise.race([
    service.act(REFERENCE, { action: 'verify_activity_official', expectedUpdatedAt: UPDATED_AT, payload: { verified: true } }, ADMIN),
    new Promise((resolve) => setTimeout(() => resolve({ timeout: true }), 100)),
  ])

  assert.equal(result.timeout, undefined)
  assert.equal(result.status, 409)
})

test('unexpected row-lock contention maps to a controlled response instead of a function timeout', async () => {
  const store = {
    findByReference: async () => ({ id: REGISTRATION_ID, updated_at: UPDATED_AT }),
    applyAction: async () => { throw Object.assign(new Error('aivex_action'), { code: '55P03', databaseMessage: 'canceling statement due to lock timeout' }) },
  }
  const service = createAdminAivexService({ store, now: () => new Date('2026-09-27T12:00:00Z') })
  const result = await service.act(
    REFERENCE,
    { action: 'verify_document', expectedUpdatedAt: UPDATED_AT, payload: { documentKey: 'student-1' } },
    ADMIN,
  )

  assert.equal(result.status, 409)
  assert.match(result.message, /currently being updated/i)
})

test('rejected, cancelled, and validated files remain blocked before review writes', async () => {
  const body = reviewFunction(await migrationSql())
  const terminalGuard = body.indexOf("registration_status in ('rejected', 'cancelled')")
  const validatedGuard = body.indexOf("document_status = 'validated'", terminalGuard)
  const transitionError = body.indexOf("raise exception 'aivex_invalid_state_transition'", validatedGuard)
  const firstReviewWrite = body.indexOf('insert into public.aivex_admin_case_reviews')

  assert(terminalGuard >= 0)
  assert(validatedGuard > terminalGuard)
  assert(transitionError > validatedGuard)
  assert(firstReviewWrite > transitionError)
})

test('already-under_review teams keep their state and all three review actions remain supported', async () => {
  const body = reviewFunction(await migrationSql())

  assert.match(body, /v_next_registration_status := v_registration\.registration_status/)
  assert.match(body, /v_next_document_status := v_registration\.document_status/)
  assert.match(body, /if v_registration\.registration_status = 'submitted'[\s\S]*and v_registration\.document_status = 'signed_document_uploaded'/)
  assert.match(body, /verify_activity_official/)
  assert.match(body, /verify_document/)
  assert.match(body, /invalidate_document/)
  assert.match(body, /if p_action = 'invalidate_document' then[\s\S]*v_next_document_status := 'changes_required'/)
  assert.match(body, /remaining\.status <> 'verified'[\s\S]*v_next_document_status := 'under_review'/)
})
