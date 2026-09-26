// Per-item AIVEX correction resubmission — the pure/structural pieces (node
// --test, no network, no database). The end-to-end candidate upload/finalize
// flow is exercised manually (see the plan's verification section); this
// file locks down the parts that can be checked without a live Supabase
// project: the shared item taxonomy, the permission/validation wiring, the
// i18n additions, and — the one security invariant this feature could
// easily violate by accident — that the new Magic-Link-reachable files never
// so much as mention an identity document.

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { canManageAivex } from '../api/_lib/admin-aivex-permissions.js'
import { validateAivexActionBody } from '../api/_lib/admin-aivex-validation.js'
import { STUDENT_CARD_POLICY } from '../shared/aivex/contract-v4.js'
import { CORRECTION_ITEMS, CORRECTION_ITEM_DOCUMENT_KEY, CORRECTION_ITEM_KIND, correctionCardSpec } from '../shared/aivex/correction-items.js'
import { statusStrings } from '../src/pages/aivex/status/statusI18n.js'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('CORRECTION_ITEM_KIND: exactly the 8 items the admin dashboard offers, each classified field or document', () => {
  assert.deepEqual([...CORRECTION_ITEMS].sort(), [
    'Activities manager', 'Delegation leader ID', 'Driver ID', 'Signed and stamped form',
    'Student card 01', 'Student card 02', 'Student card 03', 'Team information',
  ])
  for (const item of CORRECTION_ITEMS) assert.ok(['field', 'document'].includes(CORRECTION_ITEM_KIND[item]), item)
  assert.equal(CORRECTION_ITEM_KIND['Team information'], 'field')
  assert.equal(CORRECTION_ITEM_KIND['Activities manager'], 'field')
  for (const item of ['Delegation leader ID', 'Driver ID', 'Student card 01', 'Student card 02', 'Student card 03', 'Signed and stamped form']) {
    assert.equal(CORRECTION_ITEM_KIND[item], 'document', item)
  }
})

test('correctionCardSpec: only a student card is self-serviceable via the Magic Link', () => {
  for (let position = 1; position <= 3; position += 1) {
    const spec = correctionCardSpec(`Student card 0${position}`)
    assert.deepEqual(spec, { policy: STUDENT_CARD_POLICY, position })
  }
  // Identity documents (a national ID card image) are deliberately excluded
  // — see the function's own comment and tests/aivex-identity-documents.
  // test.mjs's "never reachable through the Magic Link" invariant.
  assert.equal(correctionCardSpec('Delegation leader ID'), null)
  assert.equal(correctionCardSpec('Driver ID'), null)
  // The signed form keeps its own, pre-existing upload flow.
  assert.equal(correctionCardSpec('Signed and stamped form'), null)
  assert.equal(correctionCardSpec('Team information'), null)
  assert.equal(correctionCardSpec('not a real item'), null)
})

test('CORRECTION_ITEM_DOCUMENT_KEY: matches the admin document_key vocabulary exactly', () => {
  assert.deepEqual(CORRECTION_ITEM_DOCUMENT_KEY, {
    'Delegation leader ID': 'delegation-leader',
    'Driver ID': 'driver',
    'Student card 01': 'student-1',
    'Student card 02': 'student-2',
    'Student card 03': 'student-3',
  })
  for (const key of Object.values(CORRECTION_ITEM_DOCUMENT_KEY)) {
    assert.match(key, /^(student-[1-3]|delegation-leader|driver)$/, key)
  }
})

test('admin permissions: resolve_correction_item is manageable by every role that may request a correction', () => {
  for (const role of ['super_admin', 'administrator', 'reviewer']) {
    assert.equal(canManageAivex(role, 'resolve_correction_item'), canManageAivex(role, 'request_corrections'), role)
  }
  assert.equal(canManageAivex('someone_else', 'resolve_correction_item'), false)
})

test('validateAivexActionBody: resolve_correction_item requires a uuid itemId and a known decision', () => {
  const base = { action: 'resolve_correction_item', expectedUpdatedAt: new Date().toISOString() }
  const itemId = '11111111-1111-4111-8111-111111111111'
  assert.equal(validateAivexActionBody({ ...base, payload: { itemId, decision: 'verified' } }).ok, true)
  assert.equal(validateAivexActionBody({ ...base, payload: { itemId, decision: 'rejected' } }).ok, true)
  assert.equal(validateAivexActionBody({ ...base, payload: { itemId, decision: 'maybe' } }).ok, false)
  assert.equal(validateAivexActionBody({ ...base, payload: { itemId: 'not-a-uuid', decision: 'verified' } }).ok, false)
  assert.equal(validateAivexActionBody({ ...base, payload: { decision: 'verified' } }).ok, false)
})

test('status strings: the new correction-panel keys exist, non-empty, with the same shape in every language', () => {
  const reference = statusStrings.en
  for (const [lang, strings] of Object.entries(statusStrings)) {
    assert.deepEqual(Object.keys(strings.correctionItemLabels).sort(), Object.keys(reference.correctionItemLabels).sort(), lang)
    assert.deepEqual(Object.keys(strings.correctionStatus).sort(), Object.keys(reference.correctionStatus).sort(), lang)
    assert.deepEqual(Object.keys(strings.correctionUpload).sort(), Object.keys(reference.correctionUpload).sort(), lang)
    assert.deepEqual(Object.keys(strings.correctionUpload.fileIssues).sort(), Object.keys(reference.correctionUpload.fileIssues).sort(), lang)
    assert.deepEqual(Object.keys(strings.correctionUpload.errors).sort(), Object.keys(reference.correctionUpload.errors).sort(), lang)
    for (const value of Object.values(strings.correctionItemLabels)) assert.ok(value.trim().length > 0, lang)
    for (const value of Object.values(strings.correctionStatus)) assert.ok(value.trim().length > 0, lang)
  }
})

test('security: the new candidate-facing correction files never mention an identity document', async () => {
  const files = ['api/_lib/aivex-correction-store.js', 'api/_lib/aivex-correction-upload.js']
  for (const file of files) {
    const code = await read(file)
    assert.doesNotMatch(code, /id_card|idCard|IdCard|IDENTITY_CARD|identityCard|identity_card|aivex-id-cards/, file)
  }
})
