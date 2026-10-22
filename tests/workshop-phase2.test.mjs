import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { readFile } from 'node:fs/promises'
import { createAdminEventsHandler } from '../api/admin-auth.js'
import { buildWorkshopInvitationsCsv, createAdminEventsService } from '../api/_lib/admin-events.js'
import { createWorkshopHandler } from '../api/_lib/workshop-handlers.js'
import { createWorkshopsService } from '../api/_lib/workshops.js'
import {
  buildWorkshopQrPayload, deriveStableWorkshopToken, generateWorkshopToken, hashWorkshopToken,
  prepareStableWorkshopCredential, tokenFromWorkshopQrPayload,
} from '../api/_lib/workshop-tokens.js'
import { eventSchedule, workshopBadgeFileName } from '../src/pages/workshops/workshopBadge.js'
import {
  normalizeParticipantName, validateScannerContextBody, validateWorkshopCheckInBody, validateWorkshopRegistrationBody,
} from '../api/_lib/workshop-validation.js'
import {
  validateEventAttendanceFinalizeBody, validateEventInvitationExportBody, validateEventInvitationLinkBody,
  validateEventScannerCredentialBody, validateEventTransitionBody,
} from '../api/_lib/admin-events-validation.js'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const TOKEN_A = 'A'.repeat(43)
const TOKEN_B = 'B'.repeat(43)
const TOKEN_C = 'C'.repeat(43)
const EVENT_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const ORGANIZER_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const NOW = new Date('2026-10-28T07:00:00.000Z')
const LINK_ENV = { WORKSHOP_INVITATION_LINK_SECRET: 'correct-horse-battery-staple-workshop-secret-2026' }

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
  const stable = prepareStableWorkshopCredential({
    purpose: 'invitation', invitationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    credentialVersion: 1, env: LINK_ENV,
  })
  assert.equal(stable.rawToken.length, 43)
  assert.equal(stable.tokenHash, hashWorkshopToken(stable.rawToken))
  assert.equal(stable.rawToken, deriveStableWorkshopToken({
    purpose: 'invitation', invitationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    credentialVersion: 1, derivationVersion: 1,
  }, LINK_ENV.WORKSHOP_INVITATION_LINK_SECRET))
  assert.notEqual(stable.rawToken, prepareStableWorkshopCredential({
    purpose: 'invitation', invitationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    credentialVersion: 2, env: LINK_ENV,
  }).rawToken)
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

test('duplicate registration returns the existing registration and the same opaque QR pass', async () => {
  let registered = false
  const seenHashes = []
  const store = {
    async openInvitation() { return invitationRow({ qr_credential_version: registered ? 1 : null, qr_derivation_version: registered ? 1 : null }) },
    async register(input) {
      seenHashes.push(input.qrTokenHash)
      const already = registered
      registered = true
      return { ...invitationRow(), first_name: input.firstName, last_name: input.lastName, already_registered: already, qr_credential_version: 1, qr_derivation_version: 1, qr_expires_at: input.qrExpiresAt.toISOString() }
    },
  }
  const service = createWorkshopsService({ store, now: () => NOW, origin: 'https://www.infinty-bba.com', env: LINK_ENV })
  const first = await service.register({ token: TOKEN_C, firstName: 'Amel', lastName: 'Benali' })
  const second = await service.register({ token: TOKEN_C, firstName: 'Amel', lastName: 'Benali' })
  assert.equal(first.alreadyRegistered, false)
  assert.equal(second.alreadyRegistered, true)
  assert.equal(first.pass.qrPayload, second.pass.qrPayload)
  assert.equal(new Set(seenHashes).size, 1)
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

test('stable workshop links repeat across CSV exports and regeneration invalidates the old credential', async () => {
  const invitationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const event = { id: EVENT_ID, title: 'ML, safely', starts_at: NOW.toISOString(), ends_at: '2026-10-28T11:00:00.000Z', event_type: 'workshop', status: 'registration_open' }
  const candidate = {
    id: invitationId, event_id: EVENT_ID, invitation_status: 'invited', invited_at: NOW.toISOString(), registered_at: null,
    token_hash: null, token_expires_at: null, credential_version: null, credential_derivation_version: null, link_revoked_at: null,
    participant_first_name: null, participant_last_name: null,
    member: { full_name: '=Amel, "Benali"', email: 'amel@example.com', phone: '+213555000000', primary_pole: 'AI\nEngineering', study_year: 'M1' },
  }
  let credential = { ...candidate }
  const audits = []
  const store = {
    find: async () => event,
    exportInvitationRows: async () => [{ ...candidate, ...credential }],
    invitationCredential: async () => credential,
    async setInvitationLink(input) {
      credential = {
        ...credential, token_hash: input.tokenHash, token_expires_at: input.expiresAt.toISOString(),
        credential_version: input.credentialVersion, credential_derivation_version: input.derivationVersion, link_revoked_at: null,
      }
      return {
        invitation_id: invitationId, token_hash: input.tokenHash, expires_at: input.expiresAt.toISOString(),
        credential_version: input.credentialVersion, derivation_version: input.derivationVersion, revoked_at: null,
      }
    },
    async recordInvitationExport(input) { audits.push({ rowCount: input.rowCount }); return true },
  }
  const service = createAdminEventsService({ store, now: () => NOW, origin: 'https://www.infinty-bba.com', env: LINK_ENV })
  const admin = { id: '11111111-1111-4111-8111-111111111111', role: 'super_admin' }
  assert.equal((await service.exportInvitations(EVENT_ID, { ...admin, role: 'reviewer' })).status, 403)
  const first = await service.exportInvitations(EVENT_ID, admin)
  const second = await service.exportInvitations(EVENT_ID, admin)
  const firstLink = first.csv.match(/https:\/\/www\.infinty-bba\.com\/workshops\/register\?t=[A-Za-z0-9_-]{43}/)?.[0]
  const secondLink = second.csv.match(/https:\/\/www\.infinty-bba\.com\/workshops\/register\?t=[A-Za-z0-9_-]{43}/)?.[0]
  assert.equal(firstLink, secondLink)
  assert.match(first.csv, /^\uFEFF"workshop_reference","workshop_title"/)
  assert.match(first.csv, /"amel@example\.com"/)
  assert.match(first.csv, /"'=Amel, ""Benali"""/)
  assert.match(first.csv, /"AI\nEngineering"/)
  assert.deepEqual(audits, [{ rowCount: 1 }, { rowCount: 1 }])
  assert.equal(JSON.stringify(audits).includes(firstLink), false)

  const regenerated = await service.invitationLink(EVENT_ID, invitationId, { action: 'regenerate' }, admin)
  assert.equal(regenerated.ok, true)
  assert.notEqual(regenerated.privateLink, firstLink)
  assert.equal(credential.credential_version, 2)
  assert.notEqual(credential.token_hash, hashWorkshopToken(firstLink.split('t=')[1]))
})

test('CSV formula protection applies to member fields while preserving the opaque HTTPS link', () => {
  const csv = buildWorkshopInvitationsCsv([{
    workshopReference: 'EVT-1234', workshopTitle: '+SUM(1,2)', invitation_status: 'invited', registered_at: null,
    privateRegistrationLink: `https://www.infinty-bba.com/workshops/register?t=${TOKEN_A}`,
    member: { full_name: '@member', email: '-unsafe@example.com', phone: '=1+1', primary_pole: 'Web', study_year: 'L1' },
  }])
  assert.match(csv, /"'\+SUM\(1,2\)"/)
  assert.match(csv, /"'@member"/)
  assert.match(csv, /"'-unsafe@example\.com"/)
  assert.match(csv, /"'=1\+1"/)
  assert.match(csv, new RegExp(`"https://www\\.infinty-bba\\.com/workshops/register\\?t=${TOKEN_A}"`))
})

test('workshop invitation CSV endpoint rejects unauthenticated and non-full admins', async () => {
  const makeRequest = () => {
    const req = Readable.from([Buffer.from(JSON.stringify({ confirm: true }))])
    req.method = 'POST'
    req.url = `/api/admin-auth?__admin_path=events/${EVENT_ID}/invitations/export`
    req.headers = { 'content-type': 'application/json', origin: 'https://club.test', host: 'club.test' }
    return req
  }
  const makeResponse = () => ({
    statusCode: 0, headers: {}, body: null,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value },
    end(value) { this.body = value ? JSON.parse(value) : null },
  })
  const common = { enabled: () => true, trustedOrigin: () => true, env: {}, createService: () => { throw new Error('service_must_not_run') } }
  const unauthenticated = createAdminEventsHandler({ ...common, requireSession: async () => null })
  const unauthenticatedResponse = makeResponse()
  await unauthenticated(makeRequest(), unauthenticatedResponse)
  assert.equal(unauthenticatedResponse.statusCode, 401)
  const reviewer = createAdminEventsHandler({ ...common, requireSession: async () => ({ user: { id: 'r', role: 'reviewer' } }) })
  const reviewerResponse = makeResponse()
  await reviewer(makeRequest(), reviewerResponse)
  assert.equal(reviewerResponse.statusCode, 403)
})

test('admin phase-2 actions validate UUIDs, confirmations and lifecycle input', () => {
  assert.equal(validateEventInvitationExportBody({ confirm: true }).ok, true)
  assert.equal(validateEventInvitationExportBody({ confirm: false }).ok, false)
  assert.deepEqual(validateEventInvitationLinkBody({ action: 'reveal' }), { ok: true, value: { action: 'ensure' } })
  assert.equal(validateEventInvitationLinkBody({ action: 'regenerate', confirm: false }).ok, false)
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
  const correctionSql = (await read('supabase/migrations/20261024120000_stable_workshop_invitation_links.sql')).toLowerCase()
  const phaseOneSql = (await read('supabase/migrations/20261022120000_admin_club_events.sql')).toLowerCase()
  for (const expected of [
    'club_event_participant_credentials', 'club_event_scanner_sessions', "token_hash ~ '^[a-f0-9]{64}$'",
    'for update', 'wrong_workshop', 'already_checked_in', 'admin_transition_club_event',
    'admin_finalize_club_event_attendance', "attendance_status = 'absent'", 'scanner_enabled = true',
    'participant_checked_in', 'scanner_access_generated',
  ]) assert.match(sql, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.match(sql, /foreign key \(scanner_access_id, event_id\)/)
  assert.match(phaseOneSql, /foreign key \(event_organizer_id, event_id\)/)
  for (const expected of [
    'credential_version', 'link_revoked_at', 'admin_set_event_invitation_link',
    'workshop_invitation_links_exported', 'participant_credential_conflict', 'for update',
  ]) assert.match(correctionSql, new RegExp(expected))
  assert.match(correctionSql, /drop function if exists public\.admin_prepare_event_invitation_delivery/)
  assert.match(correctionSql, /jsonb_build_object\('row_count', p_row_count\)/)
  assert.doesNotMatch(correctionSql, /raw_token|private_registration_link/)
})

test('historical invitations, private routes and scanner sessionStorage are wired without localStorage', async () => {
  const [app, eventsUi, hooks, register, badgePass, scanner, vercel] = await Promise.all([
    read('src/App.jsx'), read('src/admin/EventsPages.jsx'), read('src/admin/useAdminEvents.js'),
    read('src/pages/workshops/WorkshopRegistrationPage.jsx'), read('src/pages/workshops/WorkshopPass.jsx'),
    read('src/pages/workshops/WorkshopScannerPage.jsx'), read('vercel.json'),
  ])
  assert.match(app, /path="\/workshops\/register"/)
  assert.match(app, /path="\/workshops\/scan"/)
  assert.match(eventsUi, /Invited participants/)
  assert.match(eventsUi, /Generate access/)
  assert.match(eventsUi, /Finalize remaining as absent/)
  assert.match(hooks, /\/invitations\/export/)
  assert.match(eventsUi, /Export invitations CSV/)
  assert.match(eventsUi, /Copy link/)
  assert.match(eventsUi, /Regenerate link/)
  assert.match(badgePass, /Download badge/)
  assert.match(register, /sessionStorage/)
  assert.doesNotMatch(register + badgePass + scanner, /localStorage/)
  assert.match(scanner, /sessionStorage/)
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
  assert.match(badge, /'Africa\/Algiers'/)
  assert.equal((theme.match(/width: 1054/)?.length ?? 0) >= 1, true)
  assert.equal((theme.match(/height: 1493/)?.length ?? 0) >= 1, true)
  assert.match(theme, /canvasWidth: 2108/)
  assert.match(theme, /canvasHeight: 2986/)
  assert.match(theme, /scale: 2/)
  assert.match(theme, /'#002A1E'/)
  assert.match(theme, /'#094A36'/)
  assert.match(theme, /'#F6F3EA'/)
  assert.match(theme, /'#8FD9B8'/)
  assert.match(theme, /'#D8C58A'/)
  assert.match(theme, /panel: \{ x: 55, y: 368, width: 944, height: 852, radius: 44 \}/)
  assert.match(theme, /cardWidth: 448, codeSize: 350, cardRadius: 28,[\r\n\s]*minCardHeight: 390, maxCardHeight: 410/)
  assert.match(theme, /participantTopGap: 28, labelGap: 28/)
  assert.match(theme, /metaGap: 58, metaGapFloor: 44/)
  assert.match(theme, /valueGap: 42, valueGapFloor: 36/)
  assert.match(theme, /topGap: 32, topGapFloor: 24/)
})

test('the workshop badge is authored on the official 1054:1493 grid and exported at 2x', async () => {
  const { WORKSHOP_BADGE } = await import('../src/pages/workshops/workshopBadgeTheme.js')
  assert.equal(WORKSHOP_BADGE.width, 1054)
  assert.equal(WORKSHOP_BADGE.height, 1493)
  assert.equal(WORKSHOP_BADGE.canvasWidth, WORKSHOP_BADGE.width * WORKSHOP_BADGE.scale)
  assert.equal(WORKSHOP_BADGE.canvasHeight, WORKSHOP_BADGE.height * WORKSHOP_BADGE.scale)
  assert.equal(WORKSHOP_BADGE.canvasWidth, 2108)
  assert.equal(WORKSHOP_BADGE.canvasHeight, 2986)
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

test('scanner context exposes the lifecycle status and keeps registered/present/remaining current', async () => {
  const contextRow = { event_id: EVENT_ID, event_title: 'Introduction to Machine Learning', organizer_name: 'Dr Ahmed', starts_at: NOW.toISOString(), location: 'FMI · Room 03', event_status: 'ongoing', registered: '12', present: '5', session_expires_at: NOW.toISOString() }
  const store = {
    async scannerContext() { return contextRow },
    async exchangeScanner() { return { ...contextRow, event_status: 'registration_closed' } },
  }
  const service = createWorkshopsService({ store, now: () => NOW, origin: 'https://www.infinty-bba.com' })
  const context = await service.scannerContext(TOKEN_A)
  assert.equal(context.ok, true)
  assert.equal(context.context.eventStatus, 'ongoing')
  assert.equal(context.context.registered, 12)
  assert.equal(context.context.present, 5)
  assert.equal(context.context.remaining, 7)
  const granted = await service.exchangeScanner(TOKEN_B)
  assert.equal(granted.context.eventStatus, 'registration_closed')
  const exhausted = { ...contextRow, registered: '4', present: '9' }
  const other = createWorkshopsService({ store: { async scannerContext() { return exhausted } }, now: () => NOW, origin: 'https://www.infinty-bba.com' })
  assert.equal((await other.scannerContext(TOKEN_A)).context.remaining, 0)
})

test('check_in_not_open keeps the server status instead of reporting Invalid QR', async () => {
  const store = { async checkIn() { throw Object.assign(new Error('main: RPC failed'), { databaseMessage: 'check_in_not_open' }) } }
  const service = createWorkshopsService({ store, now: () => NOW, origin: 'https://www.infinty-bba.com' })
  const result = await service.checkIn({ sessionToken: TOKEN_A, qrToken: TOKEN_B })
  assert.equal(result.ok, false)
  assert.equal(result.status, 'not_open')
  assert.equal(result.message, 'Workshop check-in is not open.')
  const through = { async checkIn() { return { status: 'expired' } } }
  assert.equal((await createWorkshopsService({ store: through, now: () => NOW, origin: 'https://www.infinty-bba.com' }).checkIn({ sessionToken: TOKEN_A, qrToken: TOKEN_B })).result.status, 'expired')

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

test('scanner page maps every server status and never converts not_open into Invalid QR', async () => {
  const scanner = await read('src/pages/workshops/WorkshopScannerPage.jsx')
  for (const status of ['checked_in', 'already_checked_in', 'invalid', 'expired', 'wrong_workshop', 'not_open']) {
    assert.match(scanner, new RegExp(`\\b${status}:`))
  }
  assert.match(scanner, /not_open: \{ title: 'Check-in not open'/)
  assert.match(scanner, /The workshop has not started yet\./)
  assert.match(scanner, /SCAN_STATUSES\.includes\(payload\.status\)/)
  assert.match(scanner, /response\.status >= 500 \? 'network_error' : 'invalid'/)
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
  const store = { async scannerContext() { return { event_id: EVENT_ID, event_title: 't', organizer_name: 'o', starts_at: NOW.toISOString(), location: 'l', event_status: 'registration_closed', registered: '3', present: '1', session_expires_at: NOW.toISOString() } } }
  const gated = await createWorkshopsService({ store, now: () => NOW, origin: 'https://www.infinty-bba.com' }).scannerContext(TOKEN_A)
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

test('scanner context SQL reports the lifecycle status without weakening the ongoing check-in gate', async () => {
  const sql = await read('supabase/migrations/20261025120000_workshop_scanner_context_status.sql')
  const base = (await read('supabase/migrations/20261023120000_workshop_registration_and_checkin.sql')).toLowerCase()
  assert.match(sql, /create or replace function public\.public_event_scanner_context/)
  assert.match(sql, /create or replace function public\.public_exchange_event_scanner_token/)
  assert.equal((sql.match(/'event_status', event(_row)?\.status/g) || []).length, 2)
  assert.doesNotMatch(sql, /create (or replace )?function public\.public_check_in_event_participant/)
  assert.doesNotMatch(sql, /drop function if exists public\.public_check_in_event_participant/)
  assert.match(sql, /invitation_status = 'registered'/)
  assert.match(sql, /attendance_status = 'present'/)
  assert.match(base, /status = 'ongoing'\)\s*\n\s*then raise exception 'check_in_not_open'/)
  assert.match(base, /i\.invitation_status = 'registered'/)
  assert.match(base, /a\.attendance_status = 'present'/)
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
  assert.match(passComponent, /workshop-pass__footer/)
  assert.match(passComponent, /workshop-pass__watermark/)
  assert.match(passComponent, /Scan at check-in/)
  assert.match(passComponent, /pass\.participantName/)
  assert.match(passComponent, /text-transform: uppercase|workshop-pass__line/)
  assert.doesNotMatch(passComponent, /<span>∞<\/span>/)
  assert.match(badgeStyles, /min\(100%, 527px\)/)
  assert.match(badgeStyles, /aspect-ratio: 1054 \/ 1493/)
  assert.match(badgeStyles, /container-type: inline-size/)
  assert.match(badgeStyles, /1cqw/)
  assert.match(badgeStyles, /#002A1E/)
  assert.match(badgeStyles, /#094A36/)
  assert.match(badgeStyles, /#F6F3EA/)
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
  assert.match(badge, /import \{ planWorkshopPass \} from '\.\/workshopPassLayout\.js'/)
  assert.match(component, /import \{ planWorkshopPass \} from '\.\/workshopPassLayout\.js'/)
  assert.doesNotMatch(component, /wrapLines|fitText|ResizeObserver/)
  assert.match(badge, /planWorkshopPass\(measureOn\(context\)/)
  assert.match(component, /planWorkshopPass\(measure, \{ title: eventTitle, name: participantName, location: eventLocation \}\)/)
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
})


