import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const MIGRATION = new URL('../supabase/migrations/20261001120000_aivex_admin_state_transition_guards.sql', import.meta.url)

async function migrationSql() {
  return (await readFile(MIGRATION, 'utf8')).toLowerCase()
}

test('AIVEX state guard keeps submitted -> under_review as the only manual review start', async () => {
  const sql = await migrationSql()

  assert.match(sql, /when p_action = 'start_review'[\s\S]*p_registration_status = 'submitted'[\s\S]*p_document_status = 'signed_document_uploaded'[\s\S]*not p_has_open_correction/)
  assert.match(sql, /raise exception 'aivex_invalid_state_transition' using errcode = '55000'/)
})

test('AIVEX state guard denies reopening rejected, cancelled, and validated files', async () => {
  const sql = await migrationSql()

  assert.match(sql, /when p_registration_status in \('rejected', 'cancelled'\)[\s\S]*or p_document_status = 'validated'[\s\S]*then false/)
  assert.match(sql, /when p_action = 'approve_registration'[\s\S]*p_registration_status = 'under_review'[\s\S]*p_document_status = 'under_review'[\s\S]*not p_has_open_correction/)
  assert.match(sql, /when p_action in \('reject_registration', 'cancel_registration'\)[\s\S]*p_registration_status in \('submitted', 'under_review'\)/)
})

test('approved plus validated cannot reject, cancel, or reopen through the admin action RPC', async () => {
  const sql = await migrationSql()
  const closedGuard = sql.indexOf("when p_registration_status in ('rejected', 'cancelled')")
  const validatedGuard = sql.indexOf("or p_document_status = 'validated'", closedGuard)
  const actionBranches = sql.indexOf("when p_action = 'start_review'", validatedGuard)

  assert(closedGuard >= 0)
  assert(validatedGuard > closedGuard)
  assert(actionBranches > validatedGuard, 'the validated terminal guard must run before action-specific branches')
})

test('AIVEX guarded RPC preserves optimistic concurrency before transition evaluation', async () => {
  const sql = await migrationSql()
  const wrapper = sql.slice(sql.indexOf('create or replace function public.admin_apply_aivex_action('))
  const conflict = wrapper.indexOf('aivex_registration_conflict')
  const transitionCheck = wrapper.indexOf('if not public.aivex_admin_action_transition_allowed')
  const delegate = wrapper.indexOf('return public.admin_apply_aivex_action_unchecked')

  assert(conflict >= 0)
  assert(transitionCheck > conflict)
  assert(delegate > transitionCheck)
  assert.match(wrapper, /where registration\.id = p_registration_id[\s\S]*for update/)
})

test('unguarded implementation is private and valid review/correction/final acceptance routes remain intact', async () => {
  const sql = await migrationSql()
  const store = (await readFile(new URL('../api/_lib/admin-aivex-store.js', import.meta.url), 'utf8')).toLowerCase()
  const correctionMigration = (await readFile(new URL('../supabase/migrations/20260930120000_aivex_administrative_workflow_completion.sql', import.meta.url), 'utf8')).toLowerCase()
  const acceptanceMigration = (await readFile(new URL('../supabase/migrations/20260928140000_aivex_correction_workflow_guards.sql', import.meta.url), 'utf8')).toLowerCase()

  assert.match(sql, /rename to admin_apply_aivex_action_unchecked/)
  assert.match(sql, /revoke all on function public\.admin_apply_aivex_action_unchecked\([\s\S]*from public, anon, authenticated, service_role/)
  assert.match(sql, /security definer[\s\S]*set search_path = public/)
  assert.match(sql, /grant execute on function public\.admin_apply_aivex_action\([\s\S]*to service_role/)

  assert.match(store, /action === 'validate_file'[\s\S]*admin_accept_aivex_team/)
  assert.match(store, /action === 'request_corrections'[\s\S]*admin_request_aivex_corrections/)
  assert.match(store, /admin_apply_aivex_review_action/)
  assert.match(correctionMigration, /registration_status = 'submitted'[\s\S]*document_status = 'signed_document_uploaded'[\s\S]*set registration_status = 'under_review', document_status = 'under_review'/)
  assert.match(correctionMigration, /document_status = 'changes_required'/)
  assert.match(acceptanceMigration, /set registration_status = 'approved', document_status = 'validated'/)
  assert.match(acceptanceMigration, /correction\.resolved_at is null/)
})
