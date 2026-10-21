import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { readFile } from 'node:fs/promises'
import { createWorkshopEmailProvider, workshopInvitationEmail } from '../api/_lib/admin-events-email.js'
import { createWorkshopHandler } from '../api/_lib/workshop-handlers.js'
import { createWorkshopsService } from '../api/_lib/workshops.js'
import {
  buildWorkshopQrPayload, generateWorkshopToken, hashWorkshopToken, tokenFromWorkshopQrPayload,
} from '../api/_lib/workshop-tokens.js'
import {
  normalizeParticipantName, validateScannerContextBody, validateWorkshopCheckInBody, validateWorkshopRegistrationBody,
} from '../api/_lib/workshop-validation.js'
import {
  validateEventAttendanceFinalizeBody, validateEventInvitationSendBody,
  validateEventScannerCredentialBody, validateEventTransitionBody,
} from '../api/_lib/admin-events-validation.js'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const TOKEN_A = 'A'.repeat(43)
const TOKEN_B = 'B'.repeat(43)
const TOKEN_C = 'C'.repeat(43)
const EVENT_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const ORGANIZER_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const NOW = new Date('2026-10-28T07:00:00.000Z')

const invitationRow = (changes = {}) => ({
  invitation_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', invitation_status: 'invited', member_name: 'Amel Benali',
  event_id: EVENT_ID, event_title: 'Introduction to Machine Learning', starts_at: '2026-10-28T08:00:00.000Z',
  ends_at: '2026-10-28T11:00:00.000Z', location: 'FMI · Room 03', speaker_name: 'Dr Ahmed',
  registered_first_name: null, registered_last_name: null, ...changes,
})

test('workshop credentials use 256-bit random tokens and SHA-256 hashes', () => {
  const raw = generateWorkshopToken((bytes) => Buffer.alloc(bytes, 7))
  assert.equal(raw.length, 43)
  assert.match(raw, /^[A-Za-z0-9_-]{43}$/)
  assert.equal(hashWorkshopToken(raw).length, 64)
  assert.notEqual(hashWorkshopToken(TOKEN_A), TOKEN_A)
})

test('participant QR payload is opaque, contains no PII and parses only the check-in route', () => {
  const payload = buildWorkshopQrPayload('https://www.infinty-bba.com', TOKEN_A)
  assert.equal(payload, `https://www.infinty-bba.com/workshops/check-in/${TOKEN_A}`)
  for (const pii of ['Amel', 'Benali', '@', EVENT_ID]) assert.equal(payload.includes(pii), false)
  assert.equal(tokenFromWorkshopQrPayload(payload), TOKEN_A)
  assert.equal(tokenFromWorkshopQrPayload('https://evil.test/workshops/register?t=' + TOKEN_A), '')
})

test('registration validation normalizes names and refuses malformed tokens or names', () => {
  assert.equal(normalizeParticipantName('  Amel   Benali '), 'Amel Benali')
  assert.deepEqual(validateWorkshopRegistrationBody({ token: TOKEN_A, firstName: ' Amel ', lastName: ' Benali ' }), {
    ok: true, value: { token: TOKEN_A, firstName: 'Amel', lastName: 'Benali' },
  })
  assert.equal(validateWorkshopRegistrationBody({ token: 'short', firstName: 'Amel', lastName: 'Benali' }).ok, false)
  assert.equal(validateWorkshopRegistrationBody({ token: TOKEN_A, firstName: '123', lastName: 'Benali' }).ok, false)
})

test('invalid, expired or cancelled invitations fail through one generic response', async () => {
  for (const reason of ['invalid', 'expired', 'cancelled']) {
    const service = createWorkshopsService({ store: { openInvitation: async () => null }, now: () => NOW, origin: 'https://www.infinty-bba.com' })
    const result = await service.invitation(TOKEN_A)
    assert.equal(result.ok, false, reason)
    assert.equal(result.message, 'This private workshop link is invalid or no longer active.')
  }
})

test('duplicate registration returns the existing registration while rotating one opaque QR', async () => {
  let registered = false
  const seenHashes = []
  const store = {
    async openInvitation() { return invitationRow() },
    async register(input) {
      seenHashes.push(input.qrTokenHash)
      const already = registered
      registered = true
      return { ...invitationRow(), first_name: input.firstName, last_name: input.lastName, already_registered: already, qr_expires_at: input.qrExpiresAt.toISOString() }
    },
  }
  const tokens = [TOKEN_A, TOKEN_B]
  const service = createWorkshopsService({ store, now: () => NOW, origin: 'https://www.infinty-bba.com', tokenGenerator: () => tokens.shift() })
  const first = await service.register({ token: TOKEN_C, firstName: 'Amel', lastName: 'Benali' })
  const second = await service.register({ token: TOKEN_C, firstName: 'Amel', lastName: 'Benali' })
  assert.equal(first.alreadyRegistered, false)
  assert.equal(second.alreadyRegistered, true)
  assert.notEqual(first.pass.qrPayload, second.pass.qrPayload)
  assert.equal(new Set(seenHashes).size, 2)
})

test('scanner permission, revoked/expired access and session validation fail closed', async () => {
  for (const databaseMessage of ['scanner_not_enabled', 'invalid_scanner_access', 'scanner_not_available']) {
    const store = { exchangeScanner: async () => { throw Object.assign(new Error('denied'), { databaseMessage }) } }
    const service = createWorkshopsService({ store, now: () => NOW, origin: 'https://www.infinty-bba.com', tokenGenerator: () => TOKEN_B })
    const result = await service.exchangeScanner(TOKEN_A)
    assert.equal(result.ok, false)
    assert.equal(result.status, 'invalid')
  }
  assert.equal(validateScannerContextBody({ sessionToken: TOKEN_A }).ok, true)
  assert.equal(validateScannerContextBody({ sessionToken: 'admin-cookie' }).ok, false)
})

test('valid and simultaneous duplicate check-ins produce one first check-in', async () => {
  let attendance = 'expected'
  let gate = Promise.resolve()
  const store = {
    checkIn(input) {
      const operation = gate.then(async () => {
        if (input.qrTokenHash === hashWorkshopToken(TOKEN_C)) return { status: 'wrong_workshop' }
        if (attendance === 'present') return { status: 'already_checked_in', participant_name: 'Amel Benali', checked_in_at: NOW.toISOString() }
        attendance = 'present'
        return { status: 'checked_in', participant_name: 'Amel Benali', checked_in_at: NOW.toISOString() }
      })
      gate = operation.then(() => undefined)
      return operation
    },
  }
  const service = createWorkshopsService({ store, now: () => NOW, origin: 'https://www.infinty-bba.com' })
  const results = await Promise.all([
    service.checkIn({ sessionToken: TOKEN_A, qrToken: TOKEN_B }),
    service.checkIn({ sessionToken: TOKEN_A, qrToken: TOKEN_B }),
  ])
  assert.deepEqual(results.map((item) => item.result.status).sort(), ['already_checked_in', 'checked_in'])
  assert.equal((await service.checkIn({ sessionToken: TOKEN_A, qrToken: TOKEN_C })).result.status, 'wrong_workshop')
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
    createService: () => ({ invitation: async () => ({ ok: true, invitation: { status: 'invited' }, event: invitationRow() }) }),
    requireAdminSession: () => { adminCalled = true },
  })
  const res = response()
  await handler(request({ token: TOKEN_A }), res)
  assert.equal(res.statusCode, 200)
  assert.equal(adminCalled, false)
})

test('email provider never fakes delivery and sends no token to logs', async () => {
  assert.equal(createWorkshopEmailProvider({ env: {} }).configured, false)
  assert.deepEqual(await createWorkshopEmailProvider({ env: {} }).send({}), { ok: false, reason: 'not_configured' })
  let sentBody
  const provider = createWorkshopEmailProvider({
    env: { EVENTS_EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'secret', EVENTS_EMAIL_FROM: 'Infinity <events@example.com>' },
    fetchImpl: async (_url, init) => { sentBody = JSON.parse(init.body); return { ok: true, json: async () => ({ id: 'msg_123' }) } },
  })
  const message = workshopInvitationEmail({ ...invitationRow(), eventTitle: 'ML', memberName: 'Amel', startsAt: NOW.toISOString(), location: 'FMI', speakerName: 'Dr Ahmed', registrationUrl: `https://club.test/workshops/register?t=${TOKEN_A}` })
  assert.deepEqual(await provider.send({ to: 'amel@example.com', ...message }), { ok: true, messageId: 'msg_123' })
  assert.equal(sentBody.to[0], 'amel@example.com')
})

test('admin phase-2 actions validate UUIDs, confirmations and lifecycle input', () => {
  assert.equal(validateEventInvitationSendBody({ all: true }).ok, true)
  assert.equal(validateEventInvitationSendBody({ invitationIds: [EVENT_ID, EVENT_ID] }).ok, false)
  assert.equal(validateEventScannerCredentialBody({ eventOrganizerId: ORGANIZER_ID, action: 'generate' }).ok, true)
  assert.equal(validateEventScannerCredentialBody({ eventOrganizerId: EVENT_ID, action: 'grant_admin' }).ok, false)
  assert.equal(validateEventTransitionBody({ nextStatus: 'ongoing', expectedUpdatedAt: NOW.toISOString() }).ok, true)
  assert.equal(validateEventTransitionBody({ nextStatus: 'whatever', expectedUpdatedAt: NOW.toISOString() }).ok, false)
  assert.equal(validateEventAttendanceFinalizeBody({ confirm: true }).ok, true)
  assert.equal(validateEventAttendanceFinalizeBody({ confirm: false }).ok, false)
  assert.equal(validateWorkshopCheckInBody({ sessionToken: TOKEN_A, qrPayload: buildWorkshopQrPayload('https://club.test', TOKEN_B) }).ok, true)
})

test('migration enforces cross-event integrity, row locks, lifecycle and explicit absence finalization', async () => {
  const sql = (await read('supabase/migrations/20261023120000_workshop_registration_and_checkin.sql')).toLowerCase()
  const phaseOneSql = (await read('supabase/migrations/20261022120000_admin_club_events.sql')).toLowerCase()
  for (const expected of [
    'club_event_participant_credentials', 'club_event_scanner_sessions', "token_hash ~ '^[a-f0-9]{64}$'",
    'for update', 'wrong_workshop', 'already_checked_in', 'admin_transition_club_event',
    'admin_finalize_club_event_attendance', "attendance_status = 'absent'", 'scanner_enabled = true',
    'participant_checked_in', 'invitation_sent', 'scanner_access_generated',
  ]) assert.match(sql, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.match(sql, /foreign key \(scanner_access_id, event_id\)/)
  assert.match(phaseOneSql, /foreign key \(event_organizer_id, event_id\)/)
})

test('historical invitations, private routes and scanner sessionStorage are wired without localStorage', async () => {
  const [app, eventsUi, hooks, register, scanner, vercel] = await Promise.all([
    read('src/App.jsx'), read('src/admin/EventsPages.jsx'), read('src/admin/useAdminEvents.js'),
    read('src/pages/workshops/WorkshopRegistrationPage.jsx'), read('src/pages/workshops/WorkshopScannerPage.jsx'), read('vercel.json'),
  ])
  assert.match(app, /path="\/workshops\/register"/)
  assert.match(app, /path="\/workshops\/scan"/)
  assert.match(eventsUi, /Invited participants/)
  assert.match(eventsUi, /Generate access/)
  assert.match(eventsUi, /Finalize remaining as absent/)
  assert.match(hooks, /\/invitations\/send/)
  assert.match(scanner, /sessionStorage/)
  assert.doesNotMatch(register + scanner, /localStorage/)
  assert.match(scanner, /BarcodeDetector/)
  assert.match(scanner, /@zxing\/browser/)
  assert.match(vercel, /workshop-scanner-check-in/)
})

