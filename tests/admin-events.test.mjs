import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { readFile } from 'node:fs/promises'
import { createAdminEventsHandler } from '../api/admin-auth.js'
import { canAccessEvents, canManageEvents } from '../api/_lib/admin-events-permissions.js'
import { createAdminEventsService } from '../api/_lib/admin-events.js'
import { createAdminEventsStore } from '../api/_lib/admin-events-store.js'
import {
  parseEventAttendanceOptions, parseEventListOptions, parseEventParticipantOptions,
  validateEventCreateBody, validateEventInviteBody, validateEventScannerActionBody, validateEventUpdateBody,
} from '../api/_lib/admin-events-validation.js'
import { prepareStableWorkshopCredential, WORKSHOP_CREDENTIAL_DERIVATION_VERSION } from '../api/_lib/workshop-tokens.js'
import { buildEventPayload, validateEventForm } from '../src/admin/adminEventsModel.js'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const ADMIN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const EVENT_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const APPLICATION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const INVITATION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const SCANNER_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const NOW = new Date('2026-10-28T10:00:00.000Z')
const LINK_ENV = { WORKSHOP_INVITATION_LINK_SECRET: 'correct-horse-battery-staple-workshop-secret-2026' }
const ORIGIN = 'https://www.infinty-bba.com'
const user = { id: ADMIN_ID, role: 'super_admin', username: 'root' }

const eventRow = (changes = {}) => ({
  id: EVENT_ID, event_type: 'workshop', title: 'Introduction to Machine Learning', description: 'A practical introduction.',
  starts_at: '2026-10-28T08:00:00.000Z', ends_at: '2026-10-28T11:00:00.000Z', location: 'FMI · Room 03',
  speaker_name: 'Dr Ahmed', visibility: 'internal', status: 'registration_open',
  invited_count: 0, registered_count: 0, present_count: 0, not_checked_in_count: 0, absent_count: 0,
  attendance_count: 0, created_at: NOW.toISOString(), updated_at: NOW.toISOString(), ...changes,
})
const workshop = (changes = {}) => ({
  eventType: 'workshop', title: 'Introduction to Machine Learning', startsAt: '2026-10-28T08:00:00.000Z',
  endsAt: '2026-10-28T11:00:00.000Z', speakerName: 'Dr Ahmed', location: 'FMI · Room 03', status: 'planned', ...changes,
})
// membership_applications embeds read by the admin store: invitation arrays
// plus the optional registration. Empty embeds are the LEFT-JOIN signature of
// applications that were never invited.
const participantEmbed = (changes = {}) => ({
  id: APPLICATION_ID, full_name: 'Amel Benali', email: 'amel@example.com', speciality: 'Software Engineering',
  invitation: [{
    id: INVITATION_ID, status: 'invited', invited_at: NOW.toISOString(), registered_at: null, link_revoked_at: null,
    invite_token_hash: null, invite_expires_at: null, credential_version: null, credential_derivation_version: null,
  }],
  registration: null,
  ...changes,
})
const attendanceRow = (changes = {}) => ({
  id: '44444444-4444-4444-8444-444444444444', membership_application_id: APPLICATION_ID,
  university_speciality: 'Software Engineering', status: 'checked_in',
  registered_at: NOW.toISOString(), checked_in_at: NOW.toISOString(), absent_at: null,
  updated_at: NOW.toISOString(), application: { full_name: 'Amel Benali', email: 'amel@example.com', speciality: 'Software Engineering' },
  ...changes,
})

class MemoryEventsStore {
  constructor() { this.row = eventRow(); this.calls = []; this.access = null }
  async list() { return { rows: [this.row], count: 1 } }
  async summaryCounts() { return { upcoming: 1, ongoing: 0, completed: 0, total: 1 } }
  async find(id) { return id === EVENT_ID ? this.row : null }
  async audit() { return [] }
  async participants() { return { rows: [participantEmbed()], count: 1 } }
  async attendance() { return { rows: [attendanceRow()], count: 1 } }
  async scannerAccess() { return this.access }
  async persistScannerAccess(input) {
    this.calls.push(['scanner-persist', input])
    this.access = {
      id: SCANNER_ID, event_id: EVENT_ID, status: 'active', starts_at: input.startsAt.toISOString(),
      expires_at: input.expiresAt.toISOString(), last_used_at: null, revoked_at: null,
      credential_version: input.credentialVersion, credential_derivation_version: WORKSHOP_CREDENTIAL_DERIVATION_VERSION,
      token_hash: input.tokenHash,
    }
    return { token_hash: input.tokenHash, expires_at: input.expiresAt.toISOString(), credential_version: input.credentialVersion, status: 'active', revoked_at: null, id: SCANNER_ID, starts_at: input.startsAt.toISOString() }
  }
  async revokeScannerAccess(input) {
    this.calls.push(['scanner-revoke', input])
    this.access = { ...this.access, status: 'revoked', revoked_at: NOW.toISOString() }
    return true
  }
  async createEvent(input) { this.calls.push(['create', input]); return EVENT_ID }
  async updateEvent(input) { this.calls.push(['update', input]); return NOW.toISOString() }
  async inviteApplications(input) { this.calls.push(['invite', input]); return { requested: 2, added: 2 } }
  async transitionEvent(input) { this.calls.push(['transition', input]); return NOW.toISOString() }
  async finalizeAttendance(input) { this.calls.push(['finalize', input]); return 2 }
}

function request(method, path, body, headers = {}) {
  const [base, query = ''] = path.split('?')
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))])
  req.method = method
  // The gateway routes on __admin_path; data queries travel as their own
  // search parameters exactly like a browser request would.
  req.url = `/api/admin-auth?__admin_path=${encodeURIComponent(base)}${query ? `&${query}` : ''}`
  req.headers = headers
  return req
}
function response() {
  return { statusCode: 0, headers: {}, body: null, setHeader(name, value) { this.headers[name.toLowerCase()] = value }, end(value) { this.body = value ? JSON.parse(value) : null } }
}

test('workshop validation requires real fields and strict absolute datetimes', () => {
  assert.equal(validateEventCreateBody(workshop()).ok, true)
  for (const invalid of [
    workshop({ eventType: 'meeting' }), workshop({ speakerName: ' ' }), workshop({ title: 'x' }),
    workshop({ startsAt: '2026-02-30T09:00:00+01:00' }), workshop({ startsAt: '28 October 2026 09:00' }),
    workshop({ endsAt: '2026-10-28T07:59:00.000Z' }),
  ]) assert.equal(validateEventCreateBody(invalid).ok, false, JSON.stringify(invalid))
  assert.equal(validateEventUpdateBody({ ...workshop(), expectedUpdatedAt: NOW.toISOString() }).ok, true)
  assert.equal(validateEventUpdateBody({ ...workshop(), speakerName: '', expectedUpdatedAt: NOW.toISOString() }).ok, false)
  assert.deepEqual(validateEventForm({ title: 'ML', date: '2026-02-30', start: '09:00', end: '', speaker: 'Dr Ahmed', location: 'FMI', description: '' }).date, 'Choose the event date.')
  assert.equal(buildEventPayload({ title: ' ML Workshop ', date: '2026-10-28', start: '09:00', end: '12:00', speaker: ' Dr Ahmed ', location: ' FMI ', description: '' }).startsAt, '2026-10-28T08:00:00.000Z')
})

test('participant and attendance filters are bounded and registrations-only', () => {
  assert.equal(parseEventListOptions(new URLSearchParams('page=1&limit=12&type=workshop&status=upcoming&sort=starts_asc')).ok, true)
  assert.equal(parseEventParticipantOptions(new URLSearchParams('q=amel&page=2&limit=25')).ok, true)
  assert.equal(parseEventParticipantOptions(new URLSearchParams('')).ok, true)
  assert.equal(parseEventParticipantOptions(new URLSearchParams('limit=200')).ok, false)
  assert.equal(parseEventAttendanceOptions(new URLSearchParams('status=present')).ok, true)
  assert.equal(parseEventAttendanceOptions(new URLSearchParams('status=excused')).ok, false)
  assert.equal(validateEventInviteBody({ applicationIds: [APPLICATION_ID] }).ok, true)
  assert.equal(validateEventInviteBody({ applicationIds: [APPLICATION_ID, APPLICATION_ID] }).ok, false)
  assert.equal(validateEventInviteBody({ applicationIds: ['not-a-uuid'] }).ok, false)
  assert.equal(validateEventInviteBody({ scope: 'all_member_applicants' }).ok, true)
  assert.equal(validateEventInviteBody({ scope: 'primary_pole' }).ok, false)
  assert.equal(validateEventInviteBody({ applicationIds: [APPLICATION_ID], scope: 'all_member_applicants' }).ok, false)
  assert.equal(validateEventScannerActionBody({ action: 'generate' }).ok, true)
  assert.equal(validateEventScannerActionBody({ action: 'copy' }).ok, true)
  assert.equal(validateEventScannerActionBody({ action: 'revoke', enabled: true }).ok, false)
})

test('Events permissions fail closed outside the full super-admin workspace', () => {
  assert.equal(canAccessEvents('super_admin'), true)
  assert.equal(canAccessEvents('administrator'), false)
  assert.equal(canAccessEvents('reviewer'), false)
  assert.equal(canManageEvents('super_admin', 'create_event'), true)
  assert.equal(canManageEvents('super_admin', 'invite_applicants'), true)
  assert.equal(canManageEvents('super_admin', 'manage_scanner'), true)
  assert.equal(canManageEvents('super_admin', 'delete_event'), false)
  assert.equal(canManageEvents('administrator', 'create_event'), false)
})

test('event service uses the authenticated actor and the application-based participant read model', async () => {
  const store = new MemoryEventsStore()
  const service = createAdminEventsService({ store, now: () => NOW, origin: ORIGIN, env: LINK_ENV })
  const created = await service.create(workshop(), user)
  assert.equal(created.ok, true)
  assert.equal(created.event.title, 'Introduction to Machine Learning')
  assert.equal(store.calls[0][1].adminUserId, ADMIN_ID)
  const list = await service.list({ page: 1, limit: 12, sort: 'starts_desc' })
  assert.equal(list.data[0].statistics, undefined)
  assert.equal(list.summary.find((item) => item.key === 'upcoming').value, 1)

  const participants = await service.participants(EVENT_ID, { q: '', page: 1, limit: 50 })
  assert.equal(participants.pagination.total, 1)
  assert.deepEqual(participants.data[0], {
    id: APPLICATION_ID, invitationId: INVITATION_ID, name: 'Amel Benali', initials: 'AB',
    email: 'amel@example.com', universitySpeciality: 'Software Engineering', specialitySource: 'application',
    invitationStatus: 'Invited', invitationStatusKey: 'invited', invitationReady: true, privateLinkReady: false,
    invitedAt: NOW.toISOString(), registeredAt: null, registrationStatus: null, attendance: null,
    checkedInAt: null, absentAt: null,
  })

  const invited = await service.invite(EVENT_ID, { scope: 'all_member_applicants' }, user)
  assert.equal(invited.ok, true)
  assert.deepEqual(invited.invited, { requested: 2, added: 2 })
  assert.equal(store.calls[1][1].scope, 'all_member_applicants')
  assert.equal(store.calls[1][1].applicationIds, null)
})

test('participant speciality prefers the registration value and never asks club members', async () => {
  const store = new MemoryEventsStore()
  store.row = eventRow()
  const service = createAdminEventsService({ store, now: () => NOW, origin: ORIGIN, env: LINK_ENV })

  const embedded = participantEmbed({
    invitation: [{ ...participantEmbed().invitation[0], invite_token_hash: 'a'.repeat(64), credential_derivation_version: WORKSHOP_CREDENTIAL_DERIVATION_VERSION }],
    registration: { university_speciality: 'AI & Big Data', status: 'checked_in', registered_at: NOW.toISOString(), checked_in_at: NOW.toISOString(), absent_at: null },
  })
  store.participants = async () => ({ rows: [{ ...embedded }], count: 1 })
  const rows = (await service.participants(EVENT_ID, { q: '', page: 1, limit: 50 })).data
  assert.equal(rows[0].universitySpeciality, 'AI & Big Data')
  assert.equal(rows[0].specialitySource, 'registration')
  assert.equal(rows[0].attendance, 'present')
  assert.equal(rows[0].registrationStatus, 'Checked in')
  assert.equal(rows[0].privateLinkReady, true)

  const absent = participantEmbed({
    registration: { university_speciality: 'AI & Big Data', status: 'registered', registered_at: NOW.toISOString(), checked_in_at: null, absent_at: NOW.toISOString() },
  })
  store.participants = async () => ({ rows: [{ ...absent }], count: 1 })
  const absentRows = (await service.participants(EVENT_ID, { q: '', page: 1, limit: 50 })).data
  assert.equal(absentRows[0].attendance, 'absent')
  assert.equal(absentRows[0].absentAt, NOW.toISOString())

  const pending = participantEmbed({
    registration: { university_speciality: null, status: 'registered', registered_at: NOW.toISOString(), checked_in_at: null, absent_at: null },
  })
  store.participants = async () => ({ rows: [{ ...pending }], count: 1 })
  const pendingRows = (await service.participants(EVENT_ID, { q: '', page: 1, limit: 50 })).data
  assert.equal(pendingRows[0].attendance, 'not_checked_in')
  // The application speciality remains the display fallback.
  assert.equal(pendingRows[0].universitySpeciality, 'Software Engineering')

  const uninvited = { ...participantEmbed({ invitation: [], registration: null }) }
  store.participants = async () => ({ rows: [uninvited], count: 1 })
  const outsider = (await service.participants(EVENT_ID, { q: '', page: 1, limit: 50 })).data
  assert.equal(outsider[0].invitationStatus, 'Not invited')
  assert.equal(outsider[0].invitationId, null)
  assert.equal(outsider[0].invitationReady, false)
  assert.equal(outsider[0].privateLinkReady, false)
})

test('attendance rate divides present by present, not-checked-in and explicit absences', async () => {
  const store = new MemoryEventsStore()
  store.row = eventRow({ invited_count: 4, registered_count: 8, present_count: 5, not_checked_in_count: 3, absent_count: 2, attendance_count: 8 })
  const service = createAdminEventsService({ store, now: () => NOW, origin: ORIGIN, env: LINK_ENV })
  const detail = await service.detail(EVENT_ID)
  assert.equal(detail.statistics.attendanceRate, 50)
  assert.equal(detail.statistics.totalPresent, 5)
  assert.equal(detail.statistics.totalNotCheckedIn, 3)
  assert.equal(detail.statistics.totalAbsent, 2)
  assert.equal(detail.attendanceState, 'in_progress')

  const attendance = await service.attendance(EVENT_ID, { status: '', page: 1, limit: 50 })
  assert.equal(attendance.summary.present, 5)
  assert.equal(attendance.summary.notCheckedIn, 3)
  assert.equal(attendance.summary.absent, 2)
  assert.equal(attendance.summary.finalized, true)
  assert.equal(attendance.data[0].checkedInBy, 'Workshop scanner')
  assert.equal(attendance.data[0].universitySpeciality, 'Software Engineering')

  store.attendance = async () => ({
    rows: [{ ...attendanceRow({ status: 'registered', checked_in_at: null, application: { full_name: 'Nadir Haddad', email: 'nadir@example.com', speciality: 'Law' } }) }],
    count: 1,
  })
  const pending = await service.attendance(EVENT_ID, { status: 'not_checked_in', page: 1, limit: 50 })
  assert.equal(pending.data[0].checkedInBy, null)
  assert.equal(pending.data[0].name, 'Nadir Haddad')

  const notVisitedStore = new MemoryEventsStore()
  notVisitedStore.row = eventRow({ present_count: 0, not_checked_in_count: 0, absent_count: 0 })
  const notVisited = createAdminEventsService({ store: notVisitedStore, now: () => NOW, origin: ORIGIN, env: LINK_ENV })
  assert.equal((await notVisited.detail(EVENT_ID)).attendanceState, 'not_started')
})

test('Events API rejects unauthenticated/lower roles and protects POST and PATCH by origin', async () => {
  for (const session of [null, { user: { ...user, role: 'administrator' } }, { user: { ...user, role: 'reviewer' } }]) {
    let called = false
    const handler = createAdminEventsHandler({ enabled: () => true, requireSession: async () => session, createService: () => { called = true; return {} } })
    const res = response()
    await handler(request('GET', 'events'), res)
    assert.equal(res.statusCode, session ? 403 : 401)
    assert.equal(called, false)
  }
  const service = new MemoryEventsStore()
  const handler = createAdminEventsHandler({
    enabled: () => true, requireSession: async () => ({ user }),
    trustedOrigin: () => false,
    createService: () => createAdminEventsService({ store: service, now: () => NOW, origin: ORIGIN, env: LINK_ENV }),
  })
  for (const [method, path, body] of [
    ['POST', 'events', workshop()],
    ['PATCH', `events/${EVENT_ID}`, { ...workshop(), expectedUpdatedAt: NOW.toISOString() }],
  ]) {
    const res = response()
    await handler(request(method, path, body, { 'content-type': 'application/json' }), res)
    assert.equal(res.statusCode, 403, method)
  }
})

test('super administrator can create a workshop, read participants, statistics and finalize attendance through the gateway handler', async () => {
  const store = new MemoryEventsStore()
  const handler = createAdminEventsHandler({
    enabled: () => true, requireSession: async () => ({ user }), trustedOrigin: () => true,
    createService: () => createAdminEventsService({ store, now: () => NOW, origin: ORIGIN, env: LINK_ENV }),
  })
  const created = response()
  await handler(request('POST', 'events', workshop(), { 'content-type': 'application/json' }), created)
  assert.equal(created.statusCode, 201)
  assert.equal(created.body.event.id, EVENT_ID)
  assert.equal(store.calls[0][1].adminUserId, ADMIN_ID)

  const statistics = response()
  await handler(request('GET', `events/${EVENT_ID}/statistics`), statistics)
  assert.equal(statistics.statusCode, 200)
  assert.equal(statistics.body.statistics.totalInvited, 0)

  const participants = response()
  await handler(request('GET', `events/${EVENT_ID}/participants?q=&page=1&limit=50`), participants)
  assert.equal(participants.statusCode, 200)
  assert.equal(participants.body.data[0].name, 'Amel Benali')

  const scanner = response()
  await handler(request('GET', `events/${EVENT_ID}/scanner`), scanner)
  assert.equal(scanner.statusCode, 200)
  assert.deepEqual(scanner.body, { success: true, access: null, copyable: false })

  const finalize = response()
  await handler(request('POST', `events/${EVENT_ID}/attendance/finalize`, { confirm: true }, { 'content-type': 'application/json' }), finalize)
  assert.equal(finalize.statusCode, 200)
  assert.equal(finalize.body.finalized, 2)

  const unknown = response()
  await handler(request('GET', 'events/77777777-7777-4777-8777-777777777777/participants'), unknown)
  assert.equal(unknown.statusCode, 404)
})

test('workshop candidates without a shared scanner link can generate exactly one', async () => {
  const expected = prepareStableWorkshopCredential({ purpose: 'event-scanner', subjectId: EVENT_ID, credentialVersion: 1, env: LINK_ENV })
  const store = new MemoryEventsStore()
  const service = createAdminEventsService({ store, now: () => NOW, origin: ORIGIN, env: LINK_ENV })
  const generated = await service.scannerAction(EVENT_ID, { action: 'generate' }, user)
  assert.equal(generated.ok, true)
  assert.equal(generated.created, true)
  assert.equal(generated.regenerated, false)
  assert.equal(generated.privateUrl, `${ORIGIN}/workshops/scan?t=${expected.rawToken}`)
  assert.equal(generated.access.status, 'active')
  assert.equal(generated.copyable, true)
  assert.equal(store.calls[0][1].action, 'ensure')
  assert.equal(store.calls[0][1].credentialVersion, 1)
  assert.equal(store.calls[0][1].tokenHash, expected.tokenHash)
  // The shared link lives until the event ends plus a grace window.
  assert.equal(store.calls[0][1].expiresAt.toISOString(), '2026-10-28T23:00:00.000Z')
  // The same credential derives the same shared link for every reveal.
  const again = await service.scannerAction(EVENT_ID, { action: 'generate' }, user)
  assert.equal(again.ok, true)
  assert.equal(again.created, false)
  assert.equal(again.regenerated, false)
  assert.equal(again.privateUrl, generated.privateUrl)
  assert.equal(store.calls.filter(([kind]) => kind === 'scanner-persist').length, 1)
})

test('scanner regeneration rotates the version, copying reuses the active shared link and revoking closes the door', async () => {
  const stable = (credentialVersion) => prepareStableWorkshopCredential({ purpose: 'event-scanner', subjectId: EVENT_ID, credentialVersion, env: LINK_ENV })
  const store = new MemoryEventsStore()
  store.access = {
    id: SCANNER_ID, event_id: EVENT_ID, status: 'active', starts_at: NOW.toISOString(),
    expires_at: new Date(NOW.getTime() + 24 * 60 * 60 * 1000).toISOString(), last_used_at: null, revoked_at: null,
    credential_version: 1, credential_derivation_version: WORKSHOP_CREDENTIAL_DERIVATION_VERSION,
    token_hash: stable(1).tokenHash,
  }
  const service = createAdminEventsService({ store, now: () => NOW, origin: ORIGIN, env: LINK_ENV })

  const copied = await service.scannerAction(EVENT_ID, { action: 'copy' }, user)
  assert.equal(copied.ok, true)
  assert.equal(copied.copied, true)
  assert.equal(copied.privateUrl, `${ORIGIN}/workshops/scan?t=${stable(1).rawToken}`)
  assert.equal(copied.expiresAt, store.access.expires_at)
  assert.equal(store.calls.length, 0)

  const regenerate = await service.scannerAction(EVENT_ID, { action: 'regenerate' }, user)
  assert.equal(regenerate.ok, true)
  assert.equal(regenerate.regenerated, true)
  assert.equal(regenerate.created, false)
  assert.equal(regenerate.privateUrl, `${ORIGIN}/workshops/scan?t=${stable(2).rawToken}`)
  assert.equal(store.calls[0][1].action, 'regenerate')
  assert.equal(store.calls[0][1].credentialVersion, 2)

  const revoked = await service.scannerAction(EVENT_ID, { action: 'revoke' }, user)
  assert.equal(revoked.ok, true)
  assert.equal(revoked.revoked, true)
  assert.equal(revoked.access.status, 'revoked')
  assert.equal(revoked.copyable, false)

  const staleCopy = await service.scannerAction(EVENT_ID, { action: 'copy' }, user)
  assert.deepEqual(staleCopy, { ok: false, status: 409, message: 'There is no active workshop scanner link to copy. Generate one first.' })
  assert.equal(store.calls.length, 2)
})

test('scanner generation for a revoked or expired shared link rotates in place and conflicts are public', async () => {
  const stable = (credentialVersion) => prepareStableWorkshopCredential({ purpose: 'event-scanner', subjectId: EVENT_ID, credentialVersion, env: LINK_ENV })
  const store = new MemoryEventsStore()
  store.access = {
    id: SCANNER_ID, event_id: EVENT_ID, status: 'revoked', starts_at: NOW.toISOString(),
    expires_at: new Date(NOW.getTime() + 24 * 60 * 60 * 1000).toISOString(), last_used_at: null,
    revoked_at: NOW.toISOString(), credential_version: 1,
    credential_derivation_version: WORKSHOP_CREDENTIAL_DERIVATION_VERSION, token_hash: stable(1).tokenHash,
  }
  const service = createAdminEventsService({ store, now: () => NOW, origin: ORIGIN, env: LINK_ENV })

  const regenerated = await service.scannerAction(EVENT_ID, { action: 'generate' }, user)
  assert.equal(regenerated.ok, true)
  assert.equal(regenerated.created, false)
  assert.equal(regenerated.regenerated, true)
  assert.equal(regenerated.privateUrl, `${ORIGIN}/workshops/scan?t=${stable(2).rawToken}`)
  assert.equal(store.calls[0][1].action, 'regenerate')

  // The first generate persisted a usable row, so force it back into the
  // non-usable state before exercising the hash-mismatch conflict path.
  store.access = { ...store.access, status: 'revoked', revoked_at: NOW.toISOString() }
  store.persistScannerAccess = async () => ({ token_hash: 'f'.repeat(64) })
  const conflicted = await service.scannerAction(EVENT_ID, { action: 'generate' }, user)
  assert.equal(conflicted.ok, false)
  assert.equal(conflicted.status, 409)
  assert.equal(conflicted.message, 'The scanner link changed concurrently. Reload the scanner panel before retrying.')

  const meetingStore = new MemoryEventsStore()
  meetingStore.row = eventRow({ event_type: 'meeting' })
  meetingStore.access = null
  const meetingService = createAdminEventsService({
    store: meetingStore,
    now: () => NOW, origin: ORIGIN, env: LINK_ENV,
  })
  assert.deepEqual(await meetingService.scannerAction(EVENT_ID, { action: 'generate' }, user), {
    ok: false, status: 409, message: 'Scanner links are only available for workshops.',
  })
  assert.equal((await meetingService.scannerAction(EVENT_ID, { action: 'generate' }, { ...user, role: 'administrator' })).status, 403)
})

test('the participants store reads member applications through embedded invitations and registrations', async () => {
  const tables = []
  let last = null
  const chain = () => {
    const query = {
      calls: [],
      select(...args) { this.calls.push(['select', ...args]); return this },
      eq(...args) { this.calls.push(['eq', ...args]); return this },
      or(...args) { this.calls.push(['or', ...args]); return this },
      order(...args) { this.calls.push(['order', ...args]); return this },
      range() { return Promise.resolve({ data: [], error: null, count: 4 }) },
    }
    last = query
    return query
  }
  const store = createAdminEventsStore({ from: (table) => { tables.push(table); return chain() } })
  const result = await store.participants(EVENT_ID, { q: '', page: 1, limit: 50 })
  assert.equal(result.count, 4)
  assert.deepEqual(tables, ['membership_applications'])
  assert.deepEqual(last.calls.slice(0, 3), [
    ['select', 'id, full_name, email, speciality, invitation:club_event_invitations(id, status, invited_at, registered_at, link_revoked_at, invite_token_hash, invite_expires_at, credential_version, credential_derivation_version), registration:club_event_registrations(university_speciality, status, registered_at, checked_in_at, absent_at)', { count: 'exact' }],
    ['eq', 'join_type', 'member'],
    ['eq', 'invitation.event_id', EVENT_ID],
  ])
  assert.deepEqual(last.calls[3], ['order', 'full_name', { ascending: true }])

  const searched = createAdminEventsStore({ from: () => chain() })
  await searched.participants(EVENT_ID, { q: 'Amel Benali', page: 1, limit: 50 })
  assert.deepEqual(last.calls[3], ['or', 'full_name.ilike.%Amel Benali%,email.ilike.%Amel Benali%,speciality.ilike.%Amel Benali%'])
})

test('attendance filters translate the registration states exactly', async () => {
  const chainFactory = () => {
    const query = {
      calls: [],
      select() { return this },
      eq(...args) { this.calls.push(['eq', ...args]); return this },
      is(...args) { this.calls.push(['is', ...args]); return this },
      not(...args) { this.calls.push(['not', ...args]); return this },
      order() { return this },
      range() { return Promise.resolve({ data: [], error: null, count: 0 }) },
    }
    return query
  }
  let last = null
  const store = createAdminEventsStore({ from: () => { last = chainFactory(); return last } })
  for (const [status, expected] of [
    ['present', [['eq', 'event_id', EVENT_ID], ['eq', 'status', 'checked_in']]],
    ['not_checked_in', [['eq', 'event_id', EVENT_ID], ['eq', 'status', 'registered'], ['is', 'absent_at', null]]],
    ['absent', [['eq', 'event_id', EVENT_ID], ['eq', 'status', 'registered'], ['not', 'absent_at', 'is', null]]],
    ['cancelled', [['eq', 'event_id', EVENT_ID], ['eq', 'status', 'cancelled']]],
    ['', [['eq', 'event_id', EVENT_ID]]],
  ]) {
    last = null
    await store.attendance(EVENT_ID, { status, page: 1, limit: 50 })
    assert.deepEqual(last.calls, expected, status)
  }
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

test('events migration keeps the workspace private and the current schema is application-based', async () => {
  const sql = (await read('supabase/migrations/20261022120000_admin_club_events.sql')).toLowerCase()
  assert.match(sql, /create table if not exists public\.club_events/)
  assert.match(sql, /alter table public\.club_events enable row level security/)
  assert.match(sql, /event_type in \('workshop','competition','conference','open_day','hackathon','meeting','training','other'\)/)
  assert.match(sql, /unique \(event_id, staff_profile_id\)/)
  assert.match(sql, /revoke all on table[\s\S]+from anon, authenticated/)
  assert.match(sql, /grant execute on function public\.admin_create_club_event[\s\S]+to service_role/)
  const directory = (await read('supabase/migrations/20261031120000_workshop_application_invitations.sql')).toLowerCase()
  for (const column of ['invited_count', 'registered_count', 'present_count', 'not_checked_in_count', 'absent_count', 'attendance_count']) {
    assert.match(directory, new RegExp(`${column},`))
  }
  assert.match(directory, /registration\.status = 'checked_in'\) as present_count/)
  assert.doesNotMatch(directory, /organizer_count|scanner_enabled_count|expected_count|excused_count|club_event_attendance attendance/)
})

test('Events UI is routed, searchable and isolated from the public archive', async () => {
  const [app, ui, data, page, hook, store, publicPage, archive] = await Promise.all([
    read('src/admin/AdminApp.jsx'), read('src/admin/AdminUI.jsx'), read('src/admin/adminData.js'),
    read('src/admin/EventsPages.jsx'), read('src/admin/useAdminEvents.js'), read('api/_lib/admin-events-store.js'),
    read('src/pages/events/EventsPage.jsx'), read('src/data/eventArchive.js'),
  ])
  assert.match(app, /path="events" element=\{<EventsListPage/)
  assert.match(app, /path="events\/:eventId" element=\{<EventDetailPage/)
  assert.match(data, /path: '\/admin\/events'.+label: 'Events'.+icon: 'events'/)
  assert.match(ui, /events: CalendarDays/)
  assert.match(page, /'Overview', 'Participants', 'Attendance', 'Scanner'/)
  assert.doesNotMatch(page, /'Invitations'|'Organizers'/)
  assert.match(page, /Generate invitations for all Member registrations/)
  assert.match(page, /University speciality/)
  assert.match(page, /Workshop scanner/)
  assert.match(page, /No attendance recorded yet/)
  assert.doesNotMatch(page, /Invite all active members|Enable scanner access|organizer/i)
  assert.match(hook, /\/api\/admin\/events/)
  assert.match(hook, /\/participants\?/)
  assert.match(hook, /\/scanner`/)
  assert.match(hook, /scannerAccess = useCallback/)
  assert.match(store, /from\('membership_applications'\)/)
  assert.match(store, /from\('club_event_registrations'\)/)
  assert.match(store, /'join_type', 'member'/)
  assert.doesNotMatch(store, /from\('club_members'\)|admin_people_directory/)
  assert.doesNotMatch(`${page}\n${hook}`, /localStorage|sessionStorage|from '.\/adminData'|from "\.\/adminData"/)
  assert.doesNotMatch(`${publicPage}\n${archive}`, /useAdminEvents|\/api\/admin\/events|club_events/)
})

test('public Events archive has practical category, search and display controls', async () => {
  const [archive, card, year, styles] = await Promise.all([
    read('src/pages/events/EventArchive.jsx'),
    read('src/pages/events/EventCard.jsx'),
    read('src/pages/events/EventYearSection.jsx'),
    read('src/pages/events/events.css'),
  ])
  assert.match(archive, /const \[category, setCategory\] = useState\('all'\)/)
  assert.match(archive, /const \[view, setView\] = useState\('grid'\)/)
  assert.match(archive, /Filter by category/)
  assert.match(archive, /aria-label="Grid view"/)
  assert.match(archive, /aria-label="List view"/)
  assert.match(archive, /Clear filters/)
  assert.match(year, /events-year-grid is-\$\{view\}/)
  assert.match(card, /View event/)
  assert.match(card, /Archive entry/)
  assert.match(styles, /\.events-archive\.is-list-view/)
  assert.match(styles, /@media \(max-width: 420px\)/)
  assert.doesNotMatch(archive, /localStorage|sessionStorage/)
})

test('dashboard Events workspace presents a structured operational view', async () => {
  const [page, styles] = await Promise.all([
    read('src/admin/EventsPages.jsx'),
    read('src/admin/admin.css'),
  ])
  assert.match(page, /Calendar & operations/)
  assert.match(page, /adm-events-filter-rail/)
  assert.match(page, /adm-event-participation__track/)
  assert.match(page, /EventCommandBar/)
  assert.match(page, /Event at a glance/)
  assert.match(page, /adm-event-overview-grid/)
  assert.match(styles, /\.adm-event-command/)
  assert.match(styles, /\.adm-events-filter-rail/)
  assert.match(styles, /@container events \(max-width: 720px\)/)
})
