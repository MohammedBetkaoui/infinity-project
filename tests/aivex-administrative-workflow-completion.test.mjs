import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import test from 'node:test'
import { createAdminAivexService } from '../api/_lib/admin-aivex.js'
import { canManageAivex } from '../api/_lib/admin-aivex-permissions.js'
import {
  validateAdminIdentityUploadFinalizeBody, validateAdminIdentityUploadInitBody,
} from '../api/_lib/admin-aivex-validation.js'
import { validateAdminIdentityReplacementV4 } from '../api/_lib/aivex-validation-v4.js'
import { createMagicLinkVerifyHandler } from '../api/aivex/magic-link/verify.js'
import { aivexDateKey, isCorrectionDeadlineExpired } from '../shared/aivex/correction-deadline.js'
import { statusStrings } from '../src/pages/aivex/status/statusI18n.js'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const MIGRATION = 'supabase/migrations/20260930120000_aivex_administrative_workflow_completion.sql'
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')
const REGISTRATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const REFERENCE = 'AIVEX2-7K9M2P4R'

function jsonRequest(body, address = '127.0.0.40') {
  const request = Readable.from([Buffer.from(JSON.stringify(body))])
  request.method = 'POST'
  request.headers = { 'content-type': 'application/json' }
  request.socket = { remoteAddress: address }
  return request
}

function jsonResponse() {
  return {
    headers: {}, statusCode: 0, body: null,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value },
    end(value) { this.body = value ? JSON.parse(value) : null },
  }
}

test('identity replacement is an administrator-only capability with strict request and byte validation', async () => {
  assert.equal(canManageAivex('reviewer', 'replace_identity_document'), false)
  assert.equal(canManageAivex('administrator', 'replace_identity_document'), true)
  assert.equal(canManageAivex('super_admin', 'replace_identity_document'), true)

  const valid = {
    uploadId: '11111111-1111-4111-8111-111111111111',
    documentKey: 'delegation-leader',
    expectedUpdatedAt: '2026-09-27T10:00:00.000Z',
    file: { name: 'replacement.JPEG', mime: 'image/jpeg', size: 512 },
  }
  assert.equal(validateAdminIdentityUploadInitBody(valid).ok, true)
  assert.equal(validateAdminIdentityUploadInitBody({ ...valid, documentKey: 'student-1' }).ok, false)
  assert.equal(validateAdminIdentityUploadInitBody({ ...valid, file: { ...valid.file, name: 'replacement.pdf' } }).ok, false)
  assert.equal(validateAdminIdentityUploadInitBody({ ...valid, file: { ...valid.file, size: 0 } }).ok, false)
  assert.equal(validateAdminIdentityUploadInitBody({ ...valid, file: { ...valid.file, size: 5 * 1024 * 1024 + 1 } }).ok, false)
  assert.equal(validateAdminIdentityUploadFinalizeBody({ uploadSessionId: valid.uploadId }).ok, true)

  const accepted = await validateAdminIdentityReplacementV4('driver', {
    buffer: PNG, size: PNG.length, mimeType: 'image/png', filename: 'driver.png',
  })
  assert.equal(accepted.ok, true)
  assert.equal(accepted.mime, 'image/png')
  assert.match(accepted.sha256, /^[0-9a-f]{64}$/)

  const spoofed = await validateAdminIdentityReplacementV4('driver', {
    buffer: PNG, size: PNG.length, mimeType: 'image/jpeg', filename: 'driver.jpg',
  })
  assert.equal(spoofed.ok, false)
  assert.equal(spoofed.status, 415)
})

test('identity replacement is server-addressed, private, submitted for review, and path-free at the API boundary', async () => {
  const [service, store, directUpload, migration, ui] = await Promise.all([
    read('api/_lib/admin-aivex.js'),
    read('api/_lib/admin-aivex-store.js'),
    read('api/_lib/aivex-direct-upload.js'),
    read(MIGRATION),
    read('src/admin/AivexPages.jsx'),
  ])

  assert.match(directUpload, /path: `staging\/admin-identity\/\$\{sessionId\}\/\$\{documentKey\}/)
  assert.match(service, /identityCardStoragePath\(\s*registration\.id/)
  assert.doesNotMatch(ui, /aivex-id-cards|delegation_head_id_card_path|driver_id_card_path/)
  assert.match(store, /storage\.from\('aivex-id-cards'\)\.copy\(sourcePath, finalPath\)/)
  assert.match(migration, /set status = 'submitted', submitted_document_key = p_document_key/)
  assert.doesNotMatch(migration, /set status = 'verified', submitted_document_key = p_document_key/)
  assert.match(migration, /delete from public\.aivex_admin_document_reviews/)
  assert.match(migration, /'identity_document_replacement_uploaded', 'confidential'/)
  assert.match(migration, /jsonb_build_object\('document_key', p_document_key, 'correction_item', v_expected_item\)/)
  assert.doesNotMatch(migration, /jsonb_build_object\([^;]*(file_path|p_file_path)/)
})

test('administrator and super-admin receive an object-scoped identity upload, while reviewer is stopped before session creation', async () => {
  const created = []
  const correctionRequestId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const correctionItemId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  const store = {
    findByReference: async (reference) => reference === REFERENCE ? {
      id: REGISTRATION_ID, edition: 2, updated_at: '2026-09-27T10:00:00.000Z',
    } : null,
    corrections: async () => [{ id: correctionRequestId, resolved_at: null }],
    correctionItems: async () => [{
      id: correctionItemId, correction_request_id: correctionRequestId, item: 'Delegation leader ID', kind: 'document', status: 'open',
    }],
  }
  const sessions = {
    findAdminIdentitySession: async () => null,
    createSession: async (row) => { created.push(row); return row },
    signedCapabilities: async (manifest) => [{ field: manifest[0].field, signedUrl: 'https://storage.invalid/object-scoped-capability', alreadyUploaded: false }],
  }
  const service = createAdminAivexService({ store, documentStore: { uploadSessions: sessions }, now: () => new Date('2026-09-27T12:00:00Z') })
  const input = {
    uploadId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', documentKey: 'delegation-leader',
    expectedUpdatedAt: '2026-09-27T10:00:00.000Z', file: { name: 'replacement.png', mime: 'image/png', size: PNG.length },
  }

  const reviewer = await service.identityUploadInit(REFERENCE, input, { id: 'reviewer', role: 'reviewer' })
  assert.equal(reviewer.status, 403)
  assert.equal(created.length, 0)

  for (const [index, role] of ['administrator', 'super_admin'].entries()) {
    const result = await service.identityUploadInit(REFERENCE, {
      ...input, uploadId: `${index + 1}1111111-1111-4111-8111-111111111111`,
    }, { id: `${role}-id`, role })
    assert.equal(result.ok, true, role)
    assert.deepEqual(Object.keys(result).sort(), ['ok', 'upload', 'uploadSessionId'])
    assert.deepEqual(Object.keys(result.upload).sort(), ['alreadyUploaded', 'field', 'signedUrl'])
    assert.equal(result.upload.field, 'delegation-leader')
    assert.doesNotMatch(JSON.stringify(result), new RegExp(REGISTRATION_ID))
  }
  assert.equal(created.length, 2)
  assert(created.every((row) => row.kind === 'admin_identity_replacement' && row.registration_id === REGISTRATION_ID))
})

test('correction deadlines are inclusive on the due date and expire from server time in Algiers', () => {
  assert.equal(aivexDateKey(new Date('2026-09-30T22:59:59.000Z')), '2026-09-30')
  assert.equal(isCorrectionDeadlineExpired('2026-09-30', new Date('2026-09-29T23:00:00.000Z')), false, 'before deadline')
  assert.equal(isCorrectionDeadlineExpired('2026-09-30', new Date('2026-09-30T22:59:59.000Z')), false, 'last valid second in Algiers')
  assert.equal(isCorrectionDeadlineExpired('2026-09-30', new Date('2026-09-30T23:00:00.000Z')), true, 'first second after the due date in Algiers')
})

test('field corrections are accepted before and on the deadline, then rejected from authoritative server time', async () => {
  const token = 'a'.repeat(43)
  const fields = {
    name: 'Atlas Logic',
    wilaya: { code: '34', name: 'Bordj Bou Arréridj' },
    institution: { id: 'univ-bba', name: 'Université Mohamed El Bachir El Ibrahimi', custom: false },
  }

  for (const [index, [label, expected, clock]] of [
    ['before', 200, new Date('2026-09-29T12:00:00+01:00')],
    ['due', 200, new Date('2026-09-30T23:59:59+01:00')],
    ['after', 409, new Date('2026-10-01T00:00:00+01:00')],
  ].entries()) {
    let submissions = 0
    const magicLinkStore = {
      findByTokenHash: async () => ({ id: `link-${index}`, registration_id: REGISTRATION_ID, expires_at: '2026-12-01T00:00:00Z', revoked_at: null }),
      touchLastUsed: async () => {},
    }
    const correctionStore = {
      loadItem: async () => ({
        id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', registration_id: REGISTRATION_ID,
        correction_request_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', item: 'Team information', kind: 'field', status: 'open',
      }),
      loadActiveDeadline: async () => '2026-09-30',
      submitFieldItem: async () => { submissions += 1 },
    }
    const handler = createMagicLinkVerifyHandler({
      createMagicLinkStore: () => magicLinkStore,
      createCorrectionStore: () => correctionStore,
      now: () => clock,
    })
    const res = jsonResponse()
    await handler(jsonRequest({ token, itemId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', fields }, `127.0.0.${50 + index}`), res)
    assert.equal(res.statusCode, expected, label)
    assert.equal(submissions, expected === 200 ? 1 : 0)
    if (expected === 409) assert.equal(res.body.status, 'correction_deadline_expired')
  }
})

test('every candidate correction mutation has a database deadline guard and a stable API error', async () => {
  const [migration, verify, init, finalize, panel] = await Promise.all([
    read(MIGRATION),
    read('api/aivex/magic-link/verify.js'),
    read('api/aivex/magic-link/upload/init.js'),
    read('api/aivex/magic-link/upload/finalize.js'),
    read('src/pages/aivex/status/CorrectionRequestPanel.jsx'),
  ])

  assert.match(migration, /before update of status on public\.aivex_correction_items/)
  assert.match(migration, /old\.status = 'open' and new\.status = 'submitted'/)
  assert.match(migration, /raise exception 'correction_deadline_expired'/)
  assert.match(migration, /at time zone 'Africa\/Algiers'/)
  for (const [name, source] of Object.entries({ verify, init, finalize })) {
    assert.match(source, /isCorrectionDeadlineExpired/, name)
    assert.match(source, /correction_deadline_expired/, name)
  }
  assert.match(panel, /const expired = correctionRequest\?\.expired === true/)
  assert.match(panel, /fieldset[^>]*disabled=\{disabled\}/)
  assert.match(panel, /entry\.status === 'open' && isSelfServiceCard && !expired/)
  assert.match(panel, /correctionDeadlineExpiredText/)
})

test('only administrators extend a deadline and the old and new values are audited', async () => {
  assert.equal(canManageAivex('reviewer', 'extend_correction_deadline'), false)
  assert.equal(canManageAivex('administrator', 'extend_correction_deadline'), true)
  assert.equal(canManageAivex('super_admin', 'extend_correction_deadline'), true)
  const migration = await read(MIGRATION)
  assert.match(migration, /v_role not in \('super_admin', 'administrator'\)/)
  assert.match(migration, /v_new_deadline < \(p_now at time zone 'Africa\/Algiers'\)::date/)
  assert.match(migration, /jsonb_build_object\('old_deadline', v_request\.due_at, 'new_deadline', v_new_deadline\)/)
})

test('generic changes-required copy is localized and never claims the signed form is always required', async () => {
  assert.deepEqual(statusStrings.en.dossierStatus.changes_required, {
    title: 'Corrections required',
    text: 'The organisers have requested changes to your administrative file. Review the items below and submit only the information or documents requested.',
  })
  assert.deepEqual(statusStrings.fr.dossierStatus.changes_required, {
    title: 'Corrections requises',
    text: 'Les organisateurs ont demandé des corrections dans votre dossier administratif. Consultez les éléments ci-dessous et renvoyez uniquement les informations ou documents demandés.',
  })
  for (const [language, strings] of Object.entries(statusStrings)) {
    const generic = `${strings.dossierStatus.changes_required.title} ${strings.dossierStatus.changes_required.text}`
    assert.doesNotMatch(generic, /signed|signé|signature|موقّع|الموقعة/i, language)
  }

  const panel = await read('src/pages/aivex/status/CorrectionRequestPanel.jsx')
  assert.match(panel, /correctionRequest\?\.items/)
  assert.match(panel, /correctionRequest\?\.deadline/)
  assert.doesNotMatch(panel, /correctionRequest\?*\.message|team_message/)
})

test('structured correction data replaces generated English team prose without breaking old rows', async () => {
  const [service, magicStore, migration] = await Promise.all([
    read('api/_lib/admin-aivex.js'),
    read('api/_lib/aivex-magic-link-store.js'),
    read(MIGRATION),
  ])
  assert.doesNotMatch(service, /Corrections are required for:/)
  assert.doesNotMatch(service, /payload\.message/)
  assert.doesNotMatch(magicStore, /team_message/)
  assert.match(migration, /alter column team_message drop not null/)
  assert.match(migration, /items, team_message, internal_note, due_at,[\s\S]*p_registration_id, p_payload -> 'items', null, v_reason, v_deadline/)
})

test('meaningful review actions start review automatically without reopening closed states', async () => {
  const [migration, store, page] = await Promise.all([
    read(MIGRATION),
    read('api/_lib/admin-aivex-store.js'),
    read('src/admin/AivexPages.jsx'),
  ])
  assert.match(store, /\['verify_activity_official', 'verify_document', 'invalidate_document'\]\.includes\(action\)[\s\S]*admin_apply_aivex_review_action/)
  assert.match(migration, /registration_status = 'submitted'[\s\S]*document_status = 'signed_document_uploaded'[\s\S]*set registration_status = 'under_review', document_status = 'under_review'/)
  assert.match(migration, /when v_registration\.registration_status = 'submitted' then 'under_review'/)
  assert.match(migration, /document_status = 'changes_required'/)
  assert.doesNotMatch(migration, /registration_status in \('under_review', 'approved', 'rejected', 'cancelled'\)[\s\S]*set registration_status = 'under_review'/)
  assert.doesNotMatch(page, /'start_review'/)
})

test('the Magic Link token is captured once, removed from the URL, and never persisted', async () => {
  const [hook, config, panel, notices] = await Promise.all([
    read('src/pages/aivex/status/useAivexStatus.js'),
    read('vercel.json'),
    read('src/pages/aivex/status/CorrectionRequestPanel.jsx'),
    read('src/pages/aivex/status/StatusNotices.jsx'),
  ])
  assert.match(hook, /const \[token\] = useState\(captureTokenFromUrl\)/)
  assert.match(hook, /window\.history\.replaceState\(null, '', window\.location\.pathname\)/)
  assert.doesNotMatch(hook, /localStorage|sessionStorage|indexedDB|document\.cookie|console\./)
  const vercel = JSON.parse(config)
  const statusHeaders = vercel.headers.find((entry) => entry.source === '/aivex/status')?.headers || []
  assert.deepEqual(statusHeaders.find((entry) => entry.key === 'Referrer-Policy'), { key: 'Referrer-Policy', value: 'no-referrer' })
  for (const source of [panel, notices]) {
    for (const link of source.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)) {
      assert.match(link[0], /rel="noreferrer noopener"/)
    }
  }
})

test('the completion migration keeps private objects and privileged mutations service-role-only', async () => {
  const migration = await read(MIGRATION)
  for (const routine of [
    'admin_request_aivex_corrections', 'admin_apply_aivex_review_action',
    'admin_extend_aivex_correction_deadline', 'admin_submit_aivex_identity_replacement',
  ]) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${routine}`))
    assert.match(migration, new RegExp(`grant execute on function public\\.${routine}[\\s\\S]*to service_role`))
  }
  assert.doesNotMatch(migration, /create\s+policy|public\s*=\s*true|createpublicurl|getsignedurl/i)
})
