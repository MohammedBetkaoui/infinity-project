import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { readFile } from 'node:fs/promises'
import { createWorkshopHandler } from '../api/_lib/workshop-handlers.js'
import { createWorkshopsService } from '../api/_lib/workshops.js'
import { createWorkshopsStore } from '../api/_lib/workshops-store.js'
import {
  validateEventAttendanceFinalizeBody, validateEventInvitationExportBody, validateEventInvitationLinkBody,
  validateEventScannerActionBody, validateEventTransitionBody,
} from '../api/_lib/admin-events-validation.js'
import {
  buildWorkshopQrPayload, buildWorkshopRegistrationUrl, buildWorkshopScannerUrl, deriveStableWorkshopToken,
  generateWorkshopToken, hashWorkshopToken, prepareStableWorkshopCredential, tokenFromWorkshopQrPayload,
} from '../api/_lib/workshop-tokens.js'
import {
  isUniversitySpeciality, normalizeUniversitySpeciality, validateScannerContextBody,
  validateWorkshopCheckInBody, validateWorkshopRegistrationBody,
} from '../api/_lib/workshop-validation.js'
import { eventSchedule, workshopBadgeFileName } from '../src/pages/workshops/workshopBadge.js'
import { planWorkshopSpeciality } from '../src/pages/workshops/workshopPassLayout.js'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const TOKEN_A = 'A'.repeat(43)
const TOKEN_B = 'B'.repeat(43)
const TOKEN_C = 'C'.repeat(43)
const EVENT_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const INVITATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const NOW = new Date('2026-10-28T07:00:00.000Z')
const LINK_ENV = { WORKSHOP_INVITATION_LINK_SECRET: 'correct-horse-battery-staple-workshop-secret-2026', WORKSHOP_REGISTRATION_OPEN: 'true' }
const ORIGIN = 'https://www.infinty-bba.com'

const stableInvitationCredential = (invitationId, credentialVersion = 1) => {
  const credential = prepareStableWorkshopCredential({
    purpose: 'invitation', subjectId: invitationId, credentialVersion, env: LINK_ENV,
  })
  return {
    invite_token_hash: credential.tokenHash,
    credential_version: credentialVersion,
    credential_derivation_version: 1,
  }
}

// What public_open_event_invitation returns: the application identity plus the
// registration (when it exists) that anchors the stable QR credential.
const invitationRow = (changes = {}) => ({
  invitation_id: INVITATION_ID, invitation_status: 'invited', full_name: 'Amel Benali',
  event_id: EVENT_ID, event_title: 'Introduction to Machine Learning', starts_at: '2026-10-28T08:00:00.000Z',
  ends_at: '2026-10-28T11:00:00.000Z', location: 'FMI · Room 03', speaker_name: 'Dr Ahmed',
  registration_status: null, university_speciality: null, qr_credential_version: null, qr_derivation_version: null,
  ...changes,
})

test('workshop credentials use 256-bit random tokens and SHA-256 hashes', () => {
  const raw = generateWorkshopToken((bytes) => Buffer.alloc(bytes, 7))
  assert.equal(raw.length, 43)
  assert.match(raw, /^[A-Za-z0-9_-]{43}$/)
  assert.equal(hashWorkshopToken(raw).length, 64)
  assert.notEqual(hashWorkshopToken(TOKEN_A), TOKEN_A)
  const stable = prepareStableWorkshopCredential({
    purpose: 'invitation', subjectId: INVITATION_ID, credentialVersion: 1, env: LINK_ENV,
  })
  assert.equal(stable.rawToken.length, 43)
  assert.equal(stable.tokenHash, hashWorkshopToken(stable.rawToken))
  assert.equal(stable.rawToken, deriveStableWorkshopToken({
    purpose: 'invitation', subjectId: INVITATION_ID, credentialVersion: 1, derivationVersion: 1,
  }, LINK_ENV.WORKSHOP_INVITATION_LINK_SECRET))
  assert.notEqual(stable.rawToken, prepareStableWorkshopCredential({
    purpose: 'invitation', subjectId: INVITATION_ID, credentialVersion: 2, env: LINK_ENV,
  }).rawToken)
  // The derivation subject is the stable row id: invitations, participant
  // passes and the shared event scanner all derive from pre-existing rows.
  assert.notEqual(stable.rawToken, prepareStableWorkshopCredential({
    purpose: 'participant-pass', subjectId: INVITATION_ID, credentialVersion: 1, env: LINK_ENV,
  }).rawToken)
  assert.notEqual(stable.rawToken, prepareStableWorkshopCredential({
    purpose: 'event-scanner', subjectId: EVENT_ID, credentialVersion: 1, env: LINK_ENV,
  }).rawToken)
  assert.throws(() => prepareStableWorkshopCredential({ purpose: 'invitation', env: LINK_ENV }))
})

test('QR payload is opaque, contains no PII and parses only the check-in route', () => {
  const payload = buildWorkshopQrPayload(ORIGIN, TOKEN_A)
  assert.equal(payload, `${ORIGIN}/workshops/check-in/${TOKEN_A}`)
  for (const pii of ['Amel', 'Benali', '@', EVENT_ID]) assert.equal(payload.includes(pii), false)
  assert.equal(tokenFromWorkshopQrPayload(payload), TOKEN_A)
  assert.equal(tokenFromWorkshopQrPayload(`${ORIGIN}/workshops/register?t=${TOKEN_A}`), '')
  // Private links stay on their own opaque routes.
  assert.equal(buildWorkshopRegistrationUrl(ORIGIN, TOKEN_A), `${ORIGIN}/workshops/register?t=${TOKEN_A}`)
  assert.equal(buildWorkshopScannerUrl(ORIGIN, TOKEN_B), `${ORIGIN}/workshops/scan?t=${TOKEN_B}`)
})

test('registration validation asks only for the university speciality', () => {
  assert.equal(normalizeUniversitySpeciality('  Software   Engineering '), 'Software Engineering')
  assert.equal(normalizeUniversitySpeciality('Télécoms\u00A0&\u00A0Réseaux'), 'Télécoms & Réseaux')
  assert.equal(isUniversitySpeciality('Software Engineering'), true)
  assert.equal(isUniversitySpeciality('Info (SIQ) 2ème cycle, LMD - S/T & Web'), true)
  for (const invalid of ['', 'x', 'a'.repeat(161), 'Software <script>', 'Bio 😊', null, 42]) {
    assert.equal(isUniversitySpeciality(invalid), false, String(invalid))
  }
  assert.deepEqual(validateWorkshopRegistrationBody({ token: TOKEN_A, universitySpeciality: ' Software   Engineering ' }), {
    ok: true, value: { token: TOKEN_A, universitySpeciality: 'Software Engineering' },
  })
  assert.equal(validateWorkshopRegistrationBody({ token: 'short', universitySpeciality: 'Software Engineering' }).ok, false)
  assert.equal(validateWorkshopRegistrationBody({ token: TOKEN_A, universitySpeciality: 'x' }).ok, false)
  assert.equal(validateWorkshopRegistrationBody({ token: TOKEN_A }).ok, false)
})

test('invalid, expired or cancelled invitations fail through one generic response', async () => {
  for (const reason of ['invalid', 'expired', 'cancelled']) {
    const service = createWorkshopsService({ store: { openInvitation: async () => null }, now: () => NOW, origin: ORIGIN })
    const result = await service.invitation(TOKEN_A)
    assert.equal(result.ok, false, reason)
    assert.equal(result.message, 'This private workshop link is invalid or no longer active.')
  }
})

test('the invitation view serves the server-resolved identity and any stored registration', async () => {
  const service = createWorkshopsService({
    store: { openInvitation: async () => invitationRow({ registration_status: 'registered', university_speciality: 'Software Engineering', qr_credential_version: 1, qr_derivation_version: 1 }) },
    now: () => NOW, origin: ORIGIN,
  })
  const result = await service.invitation(TOKEN_A)
  assert.equal(result.ok, true)
  assert.equal(result.invitation.status, 'invited')
  assert.equal(result.invitation.alreadyRegistered, true)
  assert.equal(result.invitation.fullName, 'Amel Benali')
  assert.deepEqual(result.registration, { status: 'registered', universitySpeciality: 'Software Engineering' })
  assert.equal(result.event.title, 'Introduction to Machine Learning')
  const fresh = createWorkshopsService({ store: { openInvitation: async () => invitationRow() }, now: () => NOW, origin: ORIGIN, env: LINK_ENV })
  const notRegistered = await fresh.invitation(TOKEN_B)
  assert.equal(notRegistered.invitation.alreadyRegistered, false)
  assert.equal(notRegistered.registration, null)
})

test('closed registration turns away unregistered people but still serves registered participants their pass', async () => {
  const registeredRow = invitationRow({ registration_status: 'registered', university_speciality: 'Software Engineering', qr_credential_version: 1, qr_derivation_version: 1 })
  const closedMessage = { ok: false, status: 'closed', message: 'Workshop registration is closed.' }
  for (const env of [{ ...LINK_ENV, WORKSHOP_REGISTRATION_OPEN: undefined }, { ...LINK_ENV, WORKSHOP_REGISTRATION_OPEN: 'false' }, {}]) {
    let registerCalls = 0
    const unregistered = createWorkshopsService({
      store: { openInvitation: async () => invitationRow(), register: async () => { registerCalls += 1 } },
      now: () => NOW, origin: ORIGIN, env,
    })
    assert.deepEqual(await unregistered.invitation(TOKEN_A), closedMessage)
    assert.deepEqual(await unregistered.register({ token: TOKEN_A, universitySpeciality: 'Software Engineering' }), closedMessage)
    assert.equal(registerCalls, 0, 'a closed registration never reaches the database')

    const registered = createWorkshopsService({
      store: {
        openInvitation: async () => registeredRow,
        register: async (input) => ({ ...registeredRow, already_registered: true, qr_expires_at: input.qrExpiresAt.toISOString() }),
      },
      now: () => NOW, origin: ORIGIN, env: { ...LINK_ENV, WORKSHOP_REGISTRATION_OPEN: undefined, ...env },
    })
    const view = await registered.invitation(TOKEN_A)
    assert.equal(view.ok, true)
    assert.equal(view.invitation.alreadyRegistered, true)
    const pass = await registered.register({ token: TOKEN_A, universitySpeciality: 'Software Engineering' })
    assert.equal(pass.ok, true)
    assert.equal(pass.alreadyRegistered, true)
    assert.equal(pass.pass.participantName, 'Amel Benali')
  }
})

test('registration stores only the speciality, keeps identity server-resolved and repeats the opaque QR', async () => {
  let registered = false
  const calls = []
  const store = {
    async openInvitation() {
      return invitationRow(registered
        ? { registration_status: 'registered', university_speciality: 'Software Engineering', qr_credential_version: 1, qr_derivation_version: 1 }
        : {})
    },
    async register(input) {
      calls.push(input)
      registered = true
      return {
        ...invitationRow({ registration_status: 'registered', university_speciality: input.universitySpeciality }),
        already_registered: calls.length > 1, qr_expires_at: input.qrExpiresAt.toISOString(),
      }
    },
  }
  const service = createWorkshopsService({ store, now: () => NOW, origin: ORIGIN, env: LINK_ENV })
  const first = await service.register({ token: TOKEN_C, universitySpeciality: 'Software Engineering' })
  const second = await service.register({ token: TOKEN_C, universitySpeciality: 'Software Engineering' })

  assert.equal(first.alreadyRegistered, false)
  assert.equal(second.alreadyRegistered, true)
  // Identity never travels through the request: it is fully server-resolved.
  assert.equal(first.pass.participantName, 'Amel Benali')
  assert.equal(first.pass.universitySpeciality, 'Software Engineering')
  assert.equal(first.pass.event.title, 'Introduction to Machine Learning')
  assert.equal(first.pass.qrPayload, second.pass.qrPayload)
  assert.equal(new Set(calls.map((call) => call.universitySpeciality)).has(undefined), false)
  assert.deepEqual(calls.map((call) => call.universitySpeciality), ['Software Engineering', 'Software Engineering'])
  // The badge derives from the invitation behind the token, so a revisit
  // re-derives byte-identical credentials from v1.
  assert.equal(calls[0].qrExpiresAt.toISOString(), '2026-10-29T11:00:00.000Z')
  assert.equal(first.pass.qrPayload, `${ORIGIN}/workshops/check-in/${prepareStableWorkshopCredential({
    purpose: 'participant-pass', subjectId: INVITATION_ID, credentialVersion: 1, env: LINK_ENV,
  }).rawToken}`)
})

test('the workshop store goes through the hashed-token RPCs with the speciality argument', async () => {
  const calls = []
  const supabase = {
    async rpc(name, args) {
      calls.push({ name, args })
      if (name === 'public_open_event_invitation') return { data: [invitationRow()], error: null }
      if (name === 'public_register_event_participant') return { data: [{ already_registered: false }], error: null }
      return { data: null, error: null }
    },
  }
  const store = createWorkshopsStore(supabase)
  const opened = await store.openInvitation({ tokenHash: hashWorkshopToken(TOKEN_A), now: NOW })
  assert.equal(opened.invitation_id, INVITATION_ID)
  assert.deepEqual(calls[0], { name: 'public_open_event_invitation', args: { p_token_hash: hashWorkshopToken(TOKEN_A), p_now: NOW.toISOString() } })
  await store.register({
    invitationTokenHash: hashWorkshopToken(TOKEN_A), universitySpeciality: 'Software Engineering',
    qrTokenHash: hashWorkshopToken(TOKEN_B), qrCredentialVersion: 1, qrDerivationVersion: 1,
    qrExpiresAt: NOW, now: NOW,
  })
  assert.equal(calls[1].name, 'public_register_event_participant')
  assert.deepEqual(Object.keys(calls[1].args), [
    'p_invitation_token_hash', 'p_university_speciality', 'p_qr_token_hash', 'p_qr_credential_version',
    'p_qr_derivation_version', 'p_qr_expires_at', 'p_now',
  ])
  assert.equal(calls[1].args.p_university_speciality, 'Software Engineering')
  await assert.rejects(() => createWorkshopsStore({
    rpc: async () => ({ data: null, error: new Error('registration_not_open') }),
  }).register({ qrExpiresAt: NOW, now: NOW }), /workshop_registration/)
})

test('conflicting concurrent registrations and closed workshops fail through public errors', async () => {
  const conflict = createWorkshopsService({
    store: {
      async openInvitation() { return invitationRow({ registration_status: 'registered', qr_credential_version: 1, qr_derivation_version: 1 }) },
      async register() { throw Object.assign(new Error('failed'), { databaseMessage: 'participant_credential_conflict' }) },
    },
    now: () => NOW, origin: ORIGIN, env: LINK_ENV,
  })
  const blocked = createWorkshopsService({
    store: {
      async openInvitation() { return invitationRow() },
      async register() { throw Object.assign(new Error('failed'), { databaseMessage: 'registration_not_open' }) },
    },
    now: () => NOW, origin: ORIGIN, env: LINK_ENV,
  })
  const revoked = createWorkshopsService({
    store: {
      async openInvitation() { throw Object.assign(new Error('failed'), { databaseMessage: 'invalid_invitation' }) },
      async register() { throw new Error('unreachable') },
    },
    now: () => NOW, origin: ORIGIN, env: LINK_ENV,
  })
  for (const [service, expected] of [
    [conflict, { ok: false, status: 'invalid', message: 'This private workshop link is invalid or no longer active.' }],
    [blocked, { ok: false, status: 'closed', message: 'Workshop registration is not open.' }],
    [revoked, { ok: false, status: 'invalid', message: 'This private workshop link is invalid or no longer active.' }],
  ]) {
    assert.deepEqual(await service.register({ token: TOKEN_C, universitySpeciality: 'Software Engineering' }), expected)
  }
})

test('scanner permission, revoked/expired access and session validation fail closed', async () => {
  for (const databaseMessage of ['scanner_not_available', 'invalid_scanner_access', 'invalid_scanner_session']) {
    const store = { exchangeScanner: async () => { throw Object.assign(new Error('denied'), { databaseMessage }) } }
    const service = createWorkshopsService({ store, now: () => NOW, origin: ORIGIN, tokenGenerator: () => TOKEN_B })
    const result = await service.exchangeScanner(TOKEN_A)
    assert.equal(result.ok, false)
    assert.equal(result.status, 'invalid')
    assert.equal(result.message, 'This scanner access is invalid or no longer active.')
  }
  assert.equal(validateScannerContextBody({ sessionToken: TOKEN_A }).ok, true)
  assert.equal(validateScannerContextBody({ sessionToken: 'admin-cookie' }).ok, false)
})

test('valid and simultaneous duplicate check-ins produce one first check-in and one generic invalid', async () => {
  let attendance = 'expected'
  let gate = Promise.resolve()
  const store = {
    checkIn(input) {
      const operation = gate.then(async () => {
        if (input.qrTokenHash === hashWorkshopToken(TOKEN_C)) return { status: 'invalid' }
        if (attendance === 'present') {
          return { status: 'already_checked_in', participant_name: 'Amel Benali', university_speciality: 'Software Engineering', checked_in_at: NOW.toISOString() }
        }
        attendance = 'present'
        return { status: 'checked_in', participant_name: 'Amel Benali', university_speciality: 'Software Engineering', checked_in_at: NOW.toISOString() }
      })
      gate = operation.then(() => undefined)
      return operation
    },
  }
  const service = createWorkshopsService({ store, now: () => NOW, origin: ORIGIN })
  const results = await Promise.all([
    service.checkIn({ sessionToken: TOKEN_A, qrToken: TOKEN_B }),
    service.checkIn({ sessionToken: TOKEN_A, qrToken: TOKEN_B }),
  ])
  assert.deepEqual(results.map((item) => item.result.status).sort(), ['already_checked_in', 'checked_in'])
  assert.deepEqual(results.map((item) => item.result.participantName), ['Amel Benali', 'Amel Benali'])
  assert.deepEqual(results.map((item) => item.result.universitySpeciality), ['Software Engineering', 'Software Engineering'])
  // Removed statuses collapsed into the single generic invalid result that
  // carries no participant information at all.
  const invalid = await service.checkIn({ sessionToken: TOKEN_A, qrToken: TOKEN_C })
  assert.equal(invalid.ok, true)
  assert.equal(invalid.result.status, 'invalid')
  assert.equal(invalid.result.participantName, null)
  assert.equal(invalid.result.universitySpeciality, null)
  assert.equal(invalid.result.checkedInAt, null)
})

test('public workshop handler is same-origin, rate-limited and independent from admin auth', async () => {
  const request = (body) => {
    const req = Readable.from([Buffer.from(JSON.stringify(body))])
    req.method = 'POST'; req.url = '/api/join?__join_action=workshop-invitation'
    req.headers = { 'content-type': 'application/json', origin: 'https://club.test', host: 'club.test' }
    req.socket = { remoteAddress: '127.0.0.88' }
    return req
  }
  const response = () => ({ statusCode: 0, headers: {}, body: null, setHeader(k, v) { this.headers[k.toLowerCase()] = v }, end(v) { this.body = JSON.parse(v) } })
  let adminCalled = false
  const handler = createWorkshopHandler('invitation', {
    enabled: () => true, trustedOrigin: () => true, rateLimit: async () => ({ allowed: true }),
    createService: () => ({ invitation: async () => ({ ok: true, invitation: { status: 'invited', alreadyRegistered: false, fullName: 'Amel Benali' }, registration: null, event: invitationRow() }) }),
    requireAdminSession: () => { adminCalled = true },
  })
  const res = response()
  await handler(request({ token: TOKEN_A }), res)
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.invitation.fullName, 'Amel Benali')
  assert.equal(adminCalled, false)
})

test('public handlers reject wrong methods and malformed speciality-only bodies', async () => {
  const req = () => {
    const request = Readable.from([Buffer.from(JSON.stringify({ token: TOKEN_A, universitySpeciality: 'Software <b>Engineering</b>' }))])
    request.method = 'POST'; request.url = '/api/join?__join_action=workshop-register'
    request.headers = { 'content-type': 'application/json', origin: 'https://club.test', host: 'club.test' }
    request.socket = { remoteAddress: '127.0.0.88' }
    return request
  }
  const response = () => ({ statusCode: 0, headers: {}, body: null, setHeader(k, v) { this.headers[k.toLowerCase()] = v }, end(v) { this.body = JSON.parse(v) } })
  const handler = createWorkshopHandler('register', {
    enabled: () => true, trustedOrigin: () => true, rateLimit: async () => ({ allowed: true }),
    createService: () => { throw new Error('service_must_not_run') },
  })
  const res = response()
  await handler(req(), res)
  assert.equal(res.statusCode, 400)
  assert.equal(res.body.success, false)
  const get = req(); get.method = 'GET'
  const rejection = response()
  await handler(get, rejection)
  assert.equal(rejection.statusCode, 405)
})

test('admin phase-2 actions validate UUIDs, confirmations and lifecycle input', () => {
  assert.equal(validateEventInvitationExportBody({ confirm: true }).ok, true)
  assert.equal(validateEventInvitationExportBody({ confirm: false }).ok, false)
  assert.deepEqual(validateEventInvitationLinkBody({ action: 'reveal' }), { ok: true, value: { action: 'ensure' } })
  assert.equal(validateEventInvitationLinkBody({ action: 'regenerate', confirm: false }).ok, false)
  assert.equal(validateEventScannerActionBody({ action: 'generate' }).ok, true)
  assert.equal(validateEventScannerActionBody({ action: 'copy' }).ok, true)
  assert.equal(validateEventScannerActionBody({ action: 'regenerate', confirm: true }).ok, true)
  assert.equal(validateEventScannerActionBody({ action: 'regenerate' }).ok, false)
  assert.equal(validateEventScannerActionBody({ action: 'revoke', confirm: true }).ok, true)
  assert.equal(validateEventScannerActionBody({ action: 'grant_admin' }).ok, false)
  assert.equal(validateEventTransitionBody({ nextStatus: 'ongoing', expectedUpdatedAt: NOW.toISOString() }).ok, true)
  assert.equal(validateEventTransitionBody({ nextStatus: 'whatever', expectedUpdatedAt: NOW.toISOString() }).ok, false)
  assert.equal(validateEventAttendanceFinalizeBody({ confirm: true }).ok, true)
  assert.equal(validateEventAttendanceFinalizeBody({ confirm: false }).ok, false)
  assert.equal(validateWorkshopCheckInBody({ sessionToken: TOKEN_A, qrPayload: buildWorkshopQrPayload('https://club.test', TOKEN_B) }).ok, true)
})

test('migration enforces per-application invitations, speciality-only registrations and one shared scanner link', async () => {
  const sql = (await read('supabase/migrations/20261031120000_workshop_application_invitations.sql')).toLowerCase()
  const match = (value) => assert.match(sql, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  // Eligibility is exactly join_type = 'member' for every review status.
  match("where id = any(p_application_ids) and join_type = 'member'")
  match("where join_type = 'member';")
  for (const expected of [
    'add column if not exists membership_application_id uuid',
    'rename column token_hash to invite_token_hash',
    'rename column token_expires_at to invite_expires_at',
    'drop constraint if exists club_event_invitation_registered_at_check',
    'drop column if exists member_id',
    'unique (event_id, membership_application_id)',
    "check (status in ('invited','registered','declined','cancelled'))",
    'create unique index if not exists club_event_invitation_invite_token_hash_unique',
    'create table public.club_event_registrations',
    'university_speciality text not null',
    'char_length(university_speciality) between 2 and 160',
    "check (status in ('registered','checked_in','cancelled'))",
    'qr_token_hash text not null unique',
    'unique (event_id, membership_application_id)',
    'foreign key (checked_in_by_scanner_access_id, event_id)',
    'references public.club_event_scanner_access (id, event_id) on delete set null',
    'constraint club_event_scanner_event_unique unique (event_id)',
    'constraint club_event_scanner_id_event_unique unique (id, event_id)',
    "token_hash ~ '^[a-f0-9]{64}$'",
    'admin_set_event_scanner_access(uuid,uuid,text,text,integer,timestamptz,timestamptz,timestamptz)',
    'admin_revoke_club_event_scanner_access(uuid,uuid,timestamptz)',
    "p_action not in ('ensure','regenerate')",
    "'scanner_credential_conflict' using errcode = '40001'",
    "raise exception 'check_in_not_open'",
    "jsonb_build_object('status', 'invalid')",
    'checked_in_by_scanner_access_id = access_row.id',
    'p_university_speciality text',
    "'participant_credential_conflict' using errcode = '40001'",
    "'registration_not_open'",
    'from public.club_event_scanner_sessions',
    'interval \'12 hours\'',
    'attendance_not_finalizable',
    'for update',
    'participant_registered',
    'scanner_access_generated',
    'grant select, insert, update, delete on table public.club_event_invitations to service_role',
    'grant select, insert, update, delete on table public.club_event_registrations,',
    'public.club_event_scanner_access, public.club_event_scanner_sessions to service_role',
    'never written back to the membership application',
  ]) match(expected)
  // The legacy organizer / attendance / credential stack is fully replaced.
  for (const forbidden of [
    'create table public.club_event_organizers',
    'scanner_enabled',
    'wrong_workshop',
    'raw_token',
    'create or replace function public.admin_assign_club_event_organizers',
    'create table public.club_event_attendance',
  ]) assert.doesNotMatch(sql, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.match(sql, /drop table if exists public\.club_event_organizers/)
  assert.match(sql, /drop function if exists public\.admin_assign_club_event_organizers/)
  assert.match(sql, /drop column if exists participant_first_name/)
  assert.match(sql, /update public\.club_event_registrations set absent_at = changed_at[\s\S]+status = 'registered' and checked_in_at is null and absent_at is null/)
})

test('scanner context SQL keeps the lifecycle gate and the shared-link session rules', async () => {
  const sql = (await read('supabase/migrations/20261031120000_workshop_application_invitations.sql')).toLowerCase()
  assert.match(sql, /create or replace function public\.public_event_scanner_context/)
  assert.match(sql, /create or replace function public\.public_exchange_event_scanner_token/)
  assert.equal((sql.match(/'event_status', event(_row)?\.status/g) || []).length, 2)
  assert.equal((sql.match(/select count\(\*\) from public\.club_event_registrations r where r\.event_id = event\.id and r\.status/g) || []).length >= 2, true)
  assert.match(sql, /session\.status = 'active' and session\.revoked_at is null/)
  assert.match(sql, /access\.status = 'active' and access\.revoked_at is null and access\.expires_at > changed_at/)
  assert.match(sql, /event\.status in \('registration_open','registration_closed','ongoing'\)/)
  assert.match(sql, /access_row\.expires_at <= changed_at/)
  assert.match(sql, /p_session_expires_at > changed_at \+ interval '12 hours'/)
  assert.match(sql, /create or replace function public\.public_check_in_event_participant/)
  assert.match(sql, /status = 'ongoing'\)\s*\n\s*then raise exception 'check_in_not_open'/)
  assert.match(sql, /qr_token_hash = p_qr_token_hash/)
  assert.match(sql, /if not found or registration_row\.event_id <> session_row\.event_id or registration_row\.status = 'cancelled'/)
})

test('historical invitations, private routes and scanner sessionStorage are wired without localStorage', async () => {
  const [app, eventsUi, hooks, register, badgePass, scanner, header, result, vercel] = await Promise.all([
    read('src/App.jsx'), read('src/admin/EventsPages.jsx'), read('src/admin/useAdminEvents.js'),
    read('src/pages/workshops/WorkshopRegistrationPage.jsx'), read('src/pages/workshops/WorkshopPass.jsx'),
    read('src/pages/workshops/WorkshopScannerPage.jsx'), read('src/pages/workshops/scanner/ScannerHeader.jsx'),
    read('src/pages/workshops/scanner/ScannerResult.jsx'), read('vercel.json'),
  ])
  assert.match(app, /path="\/workshops\/register"/)
  assert.match(app, /path="\/workshops\/scan"/)
  assert.match(eventsUi, /'Overview', 'Participants', 'Attendance', 'Scanner'/)
  assert.match(eventsUi, /Generate private links for all/)
  assert.match(eventsUi, /Generate for selected/)
  assert.match(eventsUi, /Copy link/)
  assert.match(eventsUi, /Regenerate link/)
  assert.match(eventsUi, /Export all links \(CSV\)/)
  assert.match(eventsUi, /Finalize remaining as absent/)
  assert.match(eventsUi, /Workshop scanner/)
  assert.doesNotMatch(eventsUi, /organizer/i)
  assert.match(hooks, /useAdminEventParticipants/)
  assert.match(hooks, /useAdminEventScanner/)
  assert.match(hooks, /\/participants/)
  assert.match(hooks, /\/scanner/)
  assert.match(register, /universitySpeciality/)
  assert.match(register, /Registered to <strong>\{state\.invitation\.fullName\}<\/strong>/)
  assert.match(badgePass, /Download badge/)
  assert.match(badgePass, /planWorkshopPass\(measure, \{ title: eventTitle, name: participantName, location: eventLocation \}\)/)
  assert.match(header, /Workshop scanner/)
  assert.doesNotMatch(header, /organizerName/)
  assert.match(result, /universitySpeciality/)
  assert.match(scanner, /sessionStorage/)
  assert.doesNotMatch(register + badgePass + scanner, /localStorage/)
  assert.match(scanner, /BarcodeDetector/)
  assert.match(scanner, /@zxing\/browser/)
  assert.match(vercel, /workshop-scanner-check-in/)
})

test('badge export has a safe PNG filename and complete high-resolution canvas content', async () => {
  assert.equal(workshopBadgeFileName('Mohammed Bétkaoui'), 'Infinity-Workshop-Mohammed-Betkaoui.png')
  assert.equal(workshopBadgeFileName('../../=danger'), 'Infinity-Workshop-danger.png')
  const [badge, theme] = await Promise.all([
    read('src/pages/workshops/workshopBadge.js'),
    read('src/pages/workshops/workshopBadgeTheme.js'),
  ])
  assert.match(badge, /import \{ WORKSHOP_BADGE \} from '\.\/workshopBadgeTheme\.js'/)
  assert.match(badge, /canvas\.width = WORKSHOP_BADGE\.canvasWidth/)
  assert.match(badge, /canvas\.height = WORKSHOP_BADGE\.canvasHeight/)
  assert.match(badge, /context\.scale\(WORKSHOP_BADGE\.scale, WORKSHOP_BADGE\.scale\)/)
  assert.match(badge, /getContext\('2d', \{ alpha: true \}\)/)
  assert.match(badge, /clearRect\(0, 0, canvas\.width, canvas\.height\)/)
  assert.match(badge, /OFFICIAL WORKSHOP PASS/)
  assert.match(badge, /NO LIMITS FOR INFINITERS/)
  assert.match(badge, /SCAN AT CHECK-IN/)
  assert.match(badge, /drawImage\(qrImage/)
  assert.match(badge, /new Path2D\(INFINITY_CLUB_PATH\)/)
  assert.match(badge, /planWorkshopSpeciality\(measureOn\(context\), pass\.universitySpeciality\)/)
  assert.match(badge, /SPECIALITY\.baseline/)
  assert.match(theme, /canvasWidth: 2108/)
  assert.match(theme, /canvasHeight: 2986/)
  assert.match(theme, /scale: 2/)
  assert.match(theme, /'#002A1E'/)
  assert.match(theme, /'#094A36'/)
  assert.match(theme, /'#F6F3EA'/)
  assert.match(theme, /'#8FD9B8'/)
  assert.match(theme, /'#D8C58A'/)
  assert.match(theme, /panel: \{ x: 55, y: 368, width: 944, height: 852, radius: 44 \}/)
  assert.match(theme, /participantTopGap: 28, labelGap: 28/)
  assert.match(theme, /metaGap: 58, metaGapFloor: 44/)
  assert.match(theme, /valueGap: 42, valueGapFloor: 36/)
  assert.match(theme, /topGap: 32, topGapFloor: 24/)
})

test('the workshop badge is authored on the official 1054:1493 grid with the speciality caption inside the panel', async () => {
  const { WORKSHOP_BADGE } = await import('../src/pages/workshops/workshopBadgeTheme.js')
  assert.equal(WORKSHOP_BADGE.width, 1054)
  assert.equal(WORKSHOP_BADGE.height, 1493)
  assert.equal(WORKSHOP_BADGE.canvasWidth, WORKSHOP_BADGE.width * WORKSHOP_BADGE.scale)
  assert.equal(WORKSHOP_BADGE.canvasHeight, WORKSHOP_BADGE.height * WORKSHOP_BADGE.scale)
  assert.equal(WORKSHOP_BADGE.canvasWidth, 2108)
  assert.equal(WORKSHOP_BADGE.canvasHeight, 2986)
  assert.equal(WORKSHOP_BADGE.name.lastBaseline, 1162)
  assert.equal(WORKSHOP_BADGE.speciality.baseline, 1204)
  assert.equal(WORKSHOP_BADGE.panel.y + WORKSHOP_BADGE.panel.height, 1220)
  assert.ok(WORKSHOP_BADGE.speciality.baseline > WORKSHOP_BADGE.name.lastBaseline, 'speciality sits under the name')
  assert.ok(WORKSHOP_BADGE.speciality.baseline <= WORKSHOP_BADGE.panel.y + WORKSHOP_BADGE.panel.height, 'speciality stays inside the panel')
})

test('pass layout keeps the participant clear of its label and stabilises the scannable QR', async () => {
  const { planWorkshopPass } = await import('../src/pages/workshops/workshopPassLayout.js')
  const { WORKSHOP_BADGE: BADGE } = await import('../src/pages/workshops/workshopBadgeTheme.js')
  const measure = (text, weight, size, spacing = 0) => String(text).length * 0.62 * size + (String(text).length - 1) * spacing
  const names = ['Ali Benali', 'Mohammed Betkaoui', 'Slimane Benabdallah', 'Abdelkader Bouabdellah', 'Mohammed Amine Ben Abderrahmane']
  const titles = ['Test', 'AI Workshop', 'Introduction to Artificial Intelligence', 'Modern Web Development & Artificial Intelligence']
  for (const name of names) {
    for (const title of titles) {
      const plan = planWorkshopPass(measure, { title, name, location: 'FMI · Room 03' })
      assert.ok(plan.name.capTop - plan.name.labelBaseline >= 20, `${name || title}: name overlaps PARTICIPANT label`)
      assert.ok(plan.qr.cardBottom <= plan.name.labelCapTop - 24, `${name || title}: QR card collides with PARTICIPANT label`)
      assert.ok(plan.name.lines.length <= 2, `${name}: name exceeds two lines`)
      assert.ok(plan.title.lines.length <= 3, `${title}: title exceeds three lines`)
      assert.ok(plan.qr.code >= 230, `${title}: QR code too small`)
      assert.ok(plan.qr.code <= BADGE.qr.codeSize, `${title}: QR code above its design target`)
      assert.ok(plan.meta.labelBaseline - plan.title.lastBaseline >= BADGE.meta.metaGapFloor, `${title}: meta gap too tight`)
      assert.ok(plan.meta.valueBaseline - plan.meta.labelBaseline >= BADGE.meta.valueGapFloor, `${title}: value gap too tight`)
    }
  }
  for (const name of ['Ali Benali', 'Mohammed Betkaoui', 'Slimane Benabdallah']) {
    for (const title of ['Test', 'AI Workshop']) {
      const plan = planWorkshopPass(measure, { title, name, location: 'FMI · Room 03' })
      assert.equal(plan.name.lines.length, 1, `${name}: did not get the single-line preference`)
      assert.equal(plan.qr.cardHeight, BADGE.qr.maxCardHeight, `${name || title}: card height not at nominal`)
      assert.equal(plan.qr.code, BADGE.qr.codeSize, `${name || title}: QR size not stable`)
      assert.ok(plan.qr.cardTop >= 620 && plan.qr.cardBottom <= 1070, `${name || title}: QR card outside the target band`)
    }
  }
  const long = planWorkshopPass(measure, { title: 'Introduction to Artificial Intelligence', name: 'Ali Benali', location: 'FMI · Room 03' })
  assert.equal(long.title.lines.length, 2)
  assert.ok(long.qr.code >= 300, 'long title should still leave a large QR code')
})

test('the speciality caption is a single uppercased line truncated to the panel width', async () => {
  const measure = (text, weight, size, spacing = 0) => String(text).length * 0.62 * size + (String(text).length - 1) * spacing
  assert.equal(planWorkshopSpeciality(measure, 'Genie Logiciel  Et  Big   Data'), 'GENIE LOGICIEL ET BIG DATA')
  assert.equal(planWorkshopSpeciality(measure, ''), '')
  assert.equal(planWorkshopSpeciality(measure, null), '')
  const long = planWorkshopSpeciality(measure, 'Ingénierie Logicielle Et Systèmes Intelligents Pour Les Réseaux De Télécommunications Modernes')
  assert.ok(long.endsWith('…'))
  assert.ok(measure(long, 700, 20, 3) <= 800, 'truncated caption must stay inside the panel width')
  assert.notEqual(long, planWorkshopSpeciality(measure, long.replace('…', '')))
})

test('badge schedule renders Algiers time compactly for the pass', () => {
  assert.equal(eventSchedule('2026-10-22T13:00:00.000Z'), '22 OCT 2026 • 14:00')
  assert.equal(eventSchedule('2026-10-22T21:30:00.000Z'), '22 OCT 2026 • 22:30')
  assert.equal(eventSchedule('not-a-date'), '')
})

test('internal Resend and workshop email-delivery code is removed', async () => {
  const [env, service, ui, hook] = await Promise.all([
    read('.env.example'), read('api/_lib/admin-events.js'), read('src/admin/EventsPages.jsx'), read('src/admin/useAdminEvents.js'),
  ])
  assert.doesNotMatch(env + service + ui + hook, /RESEND_API_KEY|EVENTS_EMAIL_PROVIDER|EVENTS_EMAIL_FROM|Send all invitations|invitations\/send/)
  await assert.rejects(read('api/_lib/admin-events-email.js'))
})

test('scanner context exposes lifecycle stats without organizing identity into the response', async () => {
  const contextRow = {
    event_id: EVENT_ID, event_title: 'Introduction to Machine Learning', starts_at: NOW.toISOString(),
    location: 'FMI · Room 03', event_status: 'ongoing', registered: '12', present: '5', session_expires_at: NOW.toISOString(),
  }
  const store = {
    async scannerContext() { return contextRow },
    async exchangeScanner() { return { ...contextRow, event_status: 'registration_closed' } },
  }
  const service = createWorkshopsService({ store, now: () => NOW, origin: ORIGIN })
  const context = await service.scannerContext(TOKEN_A)
  assert.equal(context.ok, true)
  assert.equal(context.context.eventStatus, 'ongoing')
  assert.equal(context.context.registered, 12)
  assert.equal(context.context.present, 5)
  assert.equal(context.context.remaining, 7)
  assert.equal('organizerName' in context.context, false)
  const granted = await service.exchangeScanner(TOKEN_B)
  assert.equal(granted.context.eventStatus, 'registration_closed')
  const exhausted = { ...contextRow, registered: '4', present: '9' }
  const other = createWorkshopsService({ store: { async scannerContext() { return exhausted } }, now: () => NOW, origin: ORIGIN })
  assert.equal((await other.scannerContext(TOKEN_A)).context.remaining, 0)
})

test('check_in_not_open keeps the server status instead of reporting Invalid QR', async () => {
  const store = { async checkIn() { throw Object.assign(new Error('main: RPC failed'), { databaseMessage: 'check_in_not_open' }) } }
  const service = createWorkshopsService({ store, now: () => NOW, origin: ORIGIN })
  const result = await service.checkIn({ sessionToken: TOKEN_A, qrToken: TOKEN_B })
  assert.equal(result.ok, false)
  assert.equal(result.status, 'not_open')
  assert.equal(result.message, 'Workshop check-in is not open.')
  const through = { async checkIn() { return { status: 'invalid' } } }
  assert.equal((await createWorkshopsService({ store: through, now: () => NOW, origin: ORIGIN }).checkIn({ sessionToken: TOKEN_A, qrToken: TOKEN_B })).result.status, 'invalid')

  const response = () => ({ statusCode: 0, headers: {}, body: null, setHeader(k, v) { this.headers[k.toLowerCase()] = v }, end(v) { this.body = JSON.parse(v) } })
  const request = (body) => {
    const req = Readable.from([Buffer.from(JSON.stringify(body))])
    req.method = 'POST'; req.url = '/api/join?__join_action=workshop-scanner-check-in'
    req.headers = { 'content-type': 'application/json', origin: 'https://club.test', host: 'club.test' }
    req.socket = { remoteAddress: '127.0.0.88' }
    return req
  }
  const handler = createWorkshopHandler('scanner-check-in', {
    enabled: () => true, trustedOrigin: () => true, rateLimit: async () => ({ allowed: true }),
    createService: () => ({ checkIn: async () => ({ ok: false, status: 'not_open', message: 'Workshop check-in is not open.' }) }),
  })
  const res = response()
  await handler(request({ sessionToken: TOKEN_A, qrPayload: buildWorkshopQrPayload('https://club.test', TOKEN_B) }), res)
  assert.equal(res.statusCode, 409)
  assert.equal(res.body.status, 'not_open')
  assert.notEqual(res.body.status, 'invalid')
})

test('scanner page maps every server status and merges every rejection into Invalid badge', async () => {
  const scanner = await read('src/pages/workshops/WorkshopScannerPage.jsx')
  for (const status of ['checked_in', 'already_checked_in', 'invalid', 'not_open']) {
    assert.match(scanner, new RegExp(`\\b${status}:`))
  }
  assert.doesNotMatch(scanner, /wrong_workshop/)
  assert.match(scanner, /invalid: \{ title: 'Invalid badge'/)
  assert.doesNotMatch(scanner, /'Pass expired'|'Pass for another workshop'/)
  assert.match(scanner, /not_open: \{ title: 'Check-in not open'/)
  assert.match(scanner, /The workshop has not started yet\./)
  assert.match(scanner, /SCAN_STATUSES\.includes\(payload\.status\)/)
  // Server errors and rate limiting (429) are retryable, never "Invalid badge".
  assert.match(scanner, /response\.status >= 500 \|\| response\.status === 429 \? 'network_error' : 'invalid'/)
  assert.match(scanner, /catch \{[\s\S]*status: 'network_error'/)
  assert.match(scanner, /finally \{[\s\S]*loadContext\(sessionToken\)\.catch/)
})

test('scanner disables QR check-in until ongoing and keeps live stats fresh', async () => {
  const [scanner, viewport, stats] = await Promise.all([
    read('src/pages/workshops/WorkshopScannerPage.jsx'),
    read('src/pages/workshops/scanner/ScannerViewport.jsx'),
    read('src/pages/workshops/scanner/ScannerStats.jsx'),
  ])
  assert.match(scanner, /checkInOpen = state\.context\?\.eventStatus === 'ongoing'/)
  assert.match(scanner, /if \(!checkInOpen\) \{ showResult\(\{ status: 'not_open'/)
  assert.match(viewport, /disabled=\{!checkInOpen \|\| isStarting\}/)
  assert.match(scanner, /workshop-scanner-banner/)
  assert.match(scanner, /Check-in not open/)
  assert.match(scanner, /Check-in opens when the workshop is started\./)
  assert.match(scanner, /CONTEXT_REFRESH_MS = 5000/)
  assert.match(scanner, /window\.setInterval\(\(\) => \{ loadContext\(sessionToken\)\.catch\(\(\) => \{\}\) \}, CONTEXT_REFRESH_MS\)/)
  assert.match(scanner, /window\.clearInterval\(timer\)/)
  assert.match(stats, /onClick=\{onRefresh\}/)
  assert.match(stats, /Live · Updated just now/)
  const store = { async scannerContext() { return { event_id: EVENT_ID, event_title: 't', starts_at: NOW.toISOString(), location: 'l', event_status: 'registration_closed', registered: '3', present: '1', session_expires_at: NOW.toISOString() } } }
  const gated = await createWorkshopsService({ store, now: () => NOW, origin: ORIGIN }).scannerContext(TOKEN_A)
  assert.equal(gated.context.eventStatus, 'registration_closed')
})

test('scanner rapid mode keeps camera fallbacks, explicit cooldowns and progressive controls', async () => {
  const [scanner, viewport, controls, manual, recent, styles] = await Promise.all([
    read('src/pages/workshops/WorkshopScannerPage.jsx'),
    read('src/pages/workshops/scanner/ScannerViewport.jsx'),
    read('src/pages/workshops/scanner/ScannerControls.jsx'),
    read('src/pages/workshops/scanner/ManualCheckIn.jsx'),
    read('src/pages/workshops/scanner/RecentScans.jsx'),
    read('src/pages/workshops/workshopScanner.css'),
  ])
  assert.match(scanner, /SAME_QR_COOLDOWN_MS = 3000/)
  assert.match(scanner, /NEXT_SCAN_DELAY_MS = 1000/)
  assert.match(scanner, /RESULT_OVERLAY_MS = 1200/)
  assert.match(scanner, /DETECTION_INTERVAL_MS = 200/)
  assert.match(scanner, /lastScan\.current\.value === value/)
  assert.match(scanner, /new window\.BarcodeDetector\(\{ formats: \['qr_code'\] \}\)/)
  assert.match(scanner, /BrowserQRCodeReader/)
  assert.match(scanner, /getCapabilities\?\.\(\)/)
  assert.match(scanner, /advanced: \[\{ torch: next \}\]/)
  assert.match(scanner, /NotAllowedError:[\s\S]*permission_denied/)
  assert.match(scanner, /NotReadableError:[\s\S]*Camera is busy/)
  assert.match(scanner, /navigator\.vibrate/)
  assert.match(viewport, /Start scanner/)
  assert.match(viewport, /Align QR inside frame/)
  assert.match(controls, /Sound on/)
  assert.match(manual, /onSubmit\(normalized\)/)
  assert.match(recent, /Recent scans/)
  assert.match(styles, /@keyframes scanner-line/)
  assert.match(styles, /prefers-reduced-motion: reduce/)
  assert.match(styles, /env\(safe-area-inset-bottom\)/)
})

test('the true Infinity emblem geometry is shared verbatim between UI and canvas', async () => {
  const [geometry, mark, badge] = await Promise.all([
    read('src/components/infinity-club-geometry.js'),
    read('src/components/InfinityClubMark.jsx'),
    read('src/pages/workshops/workshopBadge.js'),
  ])
  assert.equal(geometry.match(/INFINITY_CLUB_PATH = '([^']+)'/)[1].slice(0, 30), 'M1073.12.57H698.9L0,649.94l668')
  assert.match(mark, /import \{ INFINITY_CLUB_PATH, INFINITY_CLUB_VIEWBOX \} from '\.\/infinity-club-geometry\.js'/)
  assert.match(badge, /import \{ INFINITY_CLUB_PATH, INFINITY_CLUB_VIEWBOX, INFINITY_CLUB_ASPECT \} from '\.\.\/\.\.\/components\/infinity-club-geometry\.js'/)
})

test('workshop badge identity is Infinity green for web and PNG without the violet palette', async () => {
  const [passComponent, page, badgeStyles, badgeCanvas] = await Promise.all([
    read('src/pages/workshops/WorkshopPass.jsx'),
    read('src/pages/workshops/WorkshopRegistrationPage.jsx'),
    read('src/pages/workshops/workshopBadge.css'),
    read('src/pages/workshops/workshopBadge.js'),
  ])
  assert.match(page, /import WorkshopPass from '\.\/WorkshopPass\.jsx'/)
  assert.match(passComponent, /InfinityClubMark/)
  assert.match(passComponent, /value=\{pass\.qrPayload\}/)
  assert.match(passComponent, /workshop-pass__header/)
  assert.match(passComponent, /workshop-pass__panel/)
  assert.match(passComponent, /workshop-pass__event/)
  assert.match(passComponent, /workshop-pass__qr/)
  assert.match(passComponent, /workshop-pass__participant/)
  assert.match(passComponent, /workshop-pass__speciality/)
  assert.match(passComponent, /workshop-pass__footer/)
  assert.match(passComponent, /workshop-pass__watermark/)
  assert.match(passComponent, /Scan at check-in/)
  assert.match(passComponent, /pass\.participantName/)
  assert.match(passComponent, /pass\.universitySpeciality/)
  assert.match(passComponent, /text-transform: uppercase|workshop-pass__line/)
  assert.doesNotMatch(passComponent, /<span>∞<\/span>/)
  assert.match(badgeStyles, /min\(100%, 527px\)/)
  assert.match(badgeStyles, /aspect-ratio: 1054 \/ 1493/)
  assert.match(badgeStyles, /container-type: inline-size/)
  assert.match(badgeStyles, /\.workshop-pass__speciality \{/)
  assert.match(badgeStyles, /text-overflow: ellipsis/)
  assert.match(badgeStyles, /min-height: 50px/)
  assert.doesNotMatch(badgeStyles, /#7657ff|#5b35f2|#8c55ff|#8d70ff|#9d85ff/i)
  assert.doesNotMatch(badgeStyles, /url\(/)
  assert.match(badgeCanvas, /new Path2D\(INFINITY_CLUB_PATH\)/)
  assert.match(badgeCanvas, /'MOHAMED EL BACHIR EL IBRAHIMI UNIVERSITY'/)
  assert.doesNotMatch(badgeCanvas, /#7657ff|#5b35f2|#8c55ff|#8d70ff|#9d85ff|#a78bfa|#8b5cf6|#7c3aed/i)
})

test('the web badge and the PNG share one layout planner and keep the QR payload untouched', async () => {
  const [badge, component, styles] = await Promise.all([
    read('src/pages/workshops/workshopBadge.js'),
    read('src/pages/workshops/WorkshopPass.jsx'),
    read('src/pages/workshops/workshopBadge.css'),
  ])
  assert.match(badge, /import \{ planWorkshopPass, planWorkshopSpeciality \} from '\.\/workshopPassLayout\.js'/)
  assert.match(component, /import \{ planWorkshopPass, planWorkshopSpeciality \} from '\.\/workshopPassLayout\.js'/)
  assert.doesNotMatch(component, /wrapLines|fitText|ResizeObserver/)
  assert.match(badge, /planWorkshopPass\(measureOn\(context\)/)
  assert.match(component, /planWorkshopPass\(measure, \{ title: eventTitle, name: participantName, location: eventLocation \}\)/)
  assert.match(component, /planWorkshopSpeciality\(measure, speciality\)/)
  assert.match(component, /value=\{pass\.qrPayload\}/)
  assert.match(component, /size=\{420\}/)
  assert.match(component, /level="M"/)
  assert.match(component, /marginSize=\{2\}/)
  assert.match(badge, /svgImage\(qrSvgElement, 720\)/)
  assert.match(styles, /width: 42\.51cqw/)
  assert.match(styles, /border-radius: 2\.66cqw/)
  assert.match(styles, /box-shadow: 0 18px 42px rgba\(0, 42, 30, 0\.16\), 0 4px 12px rgba\(0, 42, 30, 0\.08\), inset 0 0 0 1px rgba\(0, 42, 30, 0\.07\)/)
  assert.match(styles, /font-size: 1\.33cqw/)
  assert.match(styles, /margin-top: 2\.66cqw/)
  assert.match(styles, /font-size: 1\.9cqw/)
})

test('the shared scanner link keeps every phone signed in at the same time', async () => {
  const sql = (await read('supabase/migrations/20261105120000_scanner_multi_device_sessions.sql')).toLowerCase()
  const code = sql.replace(/--.*\n/g, '\n')
  // One active session per link is no longer enforced.
  assert.match(code, /drop index if exists public\.club_event_scanner_session_active_unique;/)
  const exchange = code.slice(code.indexOf('create or replace function public.public_exchange_event_scanner_token'), code.indexOf('revoke all on function'))
  // Opening the link on a new phone never revokes the sessions of the others…
  assert.doesNotMatch(exchange, /set status = 'revoked'/)
  // …it only tidies sessions that have already run out.
  assert.match(exchange, /set status = 'expired'\s+where scanner_access_id = access_row\.id and status = 'active' and expires_at <= changed_at;/)
  // The link itself is still verified, and the status gate of 20261104 is kept.
  assert.match(exchange, /access_row\.status <> 'active' or access_row\.revoked_at is not null/)
  assert.match(exchange, /access_row\.starts_at > changed_at or access_row\.expires_at <= changed_at/)
  assert.match(exchange, /event_row\.status in \('completed','cancelled','archived'\)\s+then raise exception 'scanner_not_available'/)
  assert.match(exchange, /least\(p_session_expires_at, access_row\.expires_at\)/)
  assert.match(code, /grant execute on function public\.public_exchange_event_scanner_token\(text,text,timestamptz,timestamptz\) to service_role;/)
  // Regenerating or revoking the link still ends every phone's session at once.
  const linkSql = (await read('supabase/migrations/20261031120000_workshop_application_invitations.sql')).toLowerCase()
  assert.match(linkSql, /update public\.club_event_scanner_sessions set status = 'revoked', revoked_at = changed_at\s+where event_id = p_event_id and status = 'active';/)
  assert.match(linkSql, /update public\.club_event_scanner_sessions session set status = 'revoked', revoked_at = changed_at\s+where session\.event_id = p_event_id and session\.status = 'active';/)
})

test('scanner rate limits leave room for about ten phones on one venue IP', async () => {
  const limits = {}
  for (const kind of ['scanner-session', 'scanner-context', 'scanner-check-in']) {
    const handler = createWorkshopHandler(kind, {
      enabled: () => true, trustedOrigin: () => true,
      rateLimit: async (scope, ip, limit) => { limits[kind] = limit; return { allowed: false, retryAfterSeconds: 5 } },
      createService: () => { throw new Error('service_must_not_run') },
    })
    const req = Readable.from([Buffer.from('{}')])
    req.method = 'POST'; req.url = '/api/join'
    req.headers = { 'content-type': 'application/json', origin: 'https://club.test', host: 'club.test' }
    req.socket = { remoteAddress: '127.0.0.89' }
    const res = { statusCode: 0, headers: {}, body: null, setHeader(k, v) { this.headers[k.toLowerCase()] = v }, end(v) { this.body = JSON.parse(v) } }
    await handler(req, res)
    assert.equal(res.statusCode, 429, kind)
  }
  const fifteenMinutes = 15 * 60 * 1000
  for (const limit of Object.values(limits)) assert.equal(limit.windowMs, fifteenMinutes)
  // Each phone refreshes its context every 5 s (180 per 15 min) plus once per scan.
  assert.ok(limits['scanner-context'].max >= 10 * 180, `context ${limits['scanner-context'].max}`)
  // A busy door across all phones: at least one scan per second, sustained.
  assert.ok(limits['scanner-check-in'].max >= 900, `check-in ${limits['scanner-check-in'].max}`)
  assert.ok(limits['scanner-session'].max >= 30, `session ${limits['scanner-session'].max}`)
})
