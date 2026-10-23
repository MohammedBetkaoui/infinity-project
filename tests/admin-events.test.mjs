import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { readFile } from 'node:fs/promises'
import { createAdminEventsHandler } from '../api/admin-auth.js'
import { canAccessEvents, canManageEvents } from '../api/_lib/admin-events-permissions.js'
import { createAdminEventsService } from '../api/_lib/admin-events.js'
import {
  parseEventListOptions, parseEventMemberOptions, parseEventStaffOptions,
  validateEventCreateBody, validateEventInviteBody, validateEventOrganizersBody,
  validateEventScannerBody, validateEventUpdateBody,
} from '../api/_lib/admin-events-validation.js'
import { buildEventPayload, validateEventForm } from '../src/admin/adminEventsModel.js'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const ADMIN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const EVENT_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const MEMBER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const STAFF_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const NOW = '2026-10-21T10:00:00.000Z'
const eventRow = (changes = {}) => ({
  id: EVENT_ID, event_type: 'workshop', title: 'Introduction to Machine Learning', description: 'A practical introduction.',
  starts_at: '2026-10-28T08:00:00.000Z', ends_at: '2026-10-28T11:00:00.000Z', location: 'FMI · Room 03',
  speaker_name: 'Dr Ahmed', visibility: 'internal', status: 'planned', invited_count: 0, registered_count: 0,
  expected_count: 0, present_count: 0, absent_count: 0, excused_count: 0, attendance_count: 0,
  organizer_count: 0, scanner_enabled_count: 0, created_at: NOW, updated_at: NOW, ...changes,
})
const workshop = (changes = {}) => ({
  eventType: 'workshop', title: 'Introduction to Machine Learning', startsAt: '2026-10-28T08:00:00.000Z',
  endsAt: '2026-10-28T11:00:00.000Z', speakerName: 'Dr Ahmed', location: 'FMI · Room 03', status: 'planned', ...changes,
})
const user = { id: ADMIN_ID, role: 'super_admin', username: 'root' }

class MemoryEventsStore {
  constructor() { this.row = eventRow(); this.calls = [] }
  async list() { return { rows: [this.row], count: 1 } }
  async summaryCounts() { return { upcoming: 1, ongoing: 0, completed: 0, total: 1 } }
  async find(id) { return id === EVENT_ID ? this.row : null }
  async audit() { return [] }
  async memberPoles() { return [{ pole: 'AI Engineering', count: 1 }] }
  async eligibleMembers() { return { rows: [{ id: MEMBER_ID, full_name: 'Amel Benali', study_year: 'L3', primary_pole: 'AI Engineering', invitation: [] }], count: 1 } }
  async invitationStates() { return [] }
  async organizers() { return [] }
  async eligibleStaff() { return { rows: [{ profile_id: STAFF_ID, member_id: MEMBER_ID, full_name: 'Anis Kerroum', internal_role: 'Technical lead', structure: 'dev-tech', status: 'active' }], count: 1 } }
  async attendance() { return { rows: [], count: 0 } }
  async createEvent(input) { this.calls.push(['create', input]); return EVENT_ID }
  async updateEvent(input) { this.calls.push(['update', input]); return NOW }
  async inviteMembers(input) { this.calls.push(['invite', input]); return { requested: 1, added: 1 } }
  async assignOrganizers(input) { this.calls.push(['organizers', input]); return { requested: 1, added: 1 } }
  async removeOrganizer(input) { this.calls.push(['remove', input]); return true }
  async setScannerAccess(input) { this.calls.push(['scanner', input]); return input.enabled }
}

function request(method, path, body, headers = {}) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))])
  req.method = method
  req.url = `/api/admin-auth?__admin_path=${encodeURIComponent(path)}`
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
  assert.equal(validateEventUpdateBody({ ...workshop(), expectedUpdatedAt: NOW }).ok, true)
  assert.equal(validateEventUpdateBody({ ...workshop(), speakerName: '', expectedUpdatedAt: NOW }).ok, false)
  assert.deepEqual(validateEventForm({ title: 'ML', date: '2026-02-30', start: '09:00', end: '', speaker: 'Dr Ahmed', location: 'FMI', description: '' }).date, 'Choose the event date.')
  assert.equal(buildEventPayload({ title: ' ML Workshop ', date: '2026-10-28', start: '09:00', end: '12:00', speaker: ' Dr Ahmed ', location: ' FMI ', description: '' }).startsAt, '2026-10-28T08:00:00.000Z')
})

test('event filters and relationship mutations are bounded and UUID-only', () => {
  assert.equal(parseEventListOptions(new URLSearchParams('page=1&limit=12&type=workshop&status=upcoming&sort=starts_asc')).ok, true)
  assert.equal(parseEventMemberOptions(new URLSearchParams('pole=AI%20Engineering&sort=name_asc')).ok, true)
  assert.equal(parseEventStaffOptions(new URLSearchParams('department=dev-tech&sort=department_asc')).ok, true)
  assert.equal(parseEventStaffOptions(new URLSearchParams('department=finance')).ok, false)
  assert.equal(validateEventInviteBody({ memberIds: [MEMBER_ID] }).ok, true)
  assert.equal(validateEventInviteBody({ memberIds: [MEMBER_ID, MEMBER_ID] }).ok, false)
  assert.equal(validateEventInviteBody({ scope: 'primary_pole', pole: 'AI Engineering' }).ok, true)
  assert.equal(validateEventOrganizersBody({ staffProfileIds: [STAFF_ID] }).ok, true)
  assert.equal(validateEventScannerBody({ staffProfileId: STAFF_ID, enabled: true }).ok, true)
  assert.equal(validateEventScannerBody({ staffProfileId: MEMBER_ID, enabled: 'yes' }).ok, false)
})

test('Events permissions fail closed outside the full super-admin workspace', () => {
  assert.equal(canAccessEvents('super_admin'), true)
  assert.equal(canAccessEvents('administrator'), false)
  assert.equal(canAccessEvents('reviewer'), false)
  assert.equal(canManageEvents('super_admin', 'create_event'), true)
  assert.equal(canManageEvents('administrator', 'create_event'), false)
  assert.equal(canManageEvents('super_admin', 'delete_event'), false)
})

test('event service uses the authenticated actor and authoritative aggregate read model', async () => {
  const store = new MemoryEventsStore()
  const service = createAdminEventsService({ store, now: () => new Date(NOW) })
  const created = await service.create(workshop(), user)
  assert.equal(created.ok, true)
  assert.equal(created.event.title, 'Introduction to Machine Learning')
  assert.equal(store.calls[0][1].adminUserId, ADMIN_ID)
  const list = await service.list({ page: 1, limit: 12, sort: 'starts_desc' })
  assert.equal(list.data[0].statistics, undefined)
  assert.equal(list.summary.find((item) => item.key === 'upcoming').value, 1)
  const members = await service.members(EVENT_ID, { page: 1, limit: 25, q: '', pole: '', sort: 'name_asc' })
  assert.equal(members.data[0].name, 'Amel Benali')
  const staff = await service.staff(EVENT_ID, { page: 1, limit: 25, q: '', department: '', sort: 'name_asc' })
  assert.equal(staff.data[0].name, 'Anis Kerroum')
  assert.equal(staff.data[0].department, 'Dev / Tech')
})

test('attendance rate excludes explicitly excused records and includes expected, present and absent records', async () => {
  const store = new MemoryEventsStore()
  store.row = eventRow({ expected_count: 2, present_count: 1, absent_count: 1, excused_count: 1, attendance_count: 5 })
  const detail = await createAdminEventsService({ store }).detail(EVENT_ID, user)
  assert.equal(detail.statistics.attendanceRate, 25)
  assert.equal(detail.statistics.expectedAttendance, 2)
  assert.equal(detail.statistics.absentCount, 1)
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
  const service = createAdminEventsService({ store: new MemoryEventsStore(), now: () => new Date(NOW) })
  const handler = createAdminEventsHandler({ enabled: () => true, requireSession: async () => ({ user }), trustedOrigin: () => false, createService: () => service })
  for (const [method, path, body] of [['POST', 'events', workshop()], ['PATCH', `events/${EVENT_ID}`, { ...workshop(), expectedUpdatedAt: NOW }]]) {
    const res = response()
    await handler(request(method, path, body, { 'content-type': 'application/json' }), res)
    assert.equal(res.statusCode, 403, method)
  }
})

test('super administrator can create a workshop through the existing gateway handler', async () => {
  const store = new MemoryEventsStore()
  const handler = createAdminEventsHandler({
    enabled: () => true, requireSession: async () => ({ user }), trustedOrigin: () => true,
    createService: () => createAdminEventsService({ store, now: () => new Date(NOW) }),
  })
  const res = response()
  await handler(request('POST', 'events', workshop(), { 'content-type': 'application/json' }), res)
  assert.equal(res.statusCode, 201)
  assert.equal(res.body.event.id, EVENT_ID)
  assert.equal(store.calls[0][1].adminUserId, ADMIN_ID)
  const statistics = response()
  await handler(request('GET', `events/${EVENT_ID}/statistics`), statistics)
  assert.equal(statistics.statusCode, 200)
  assert.equal(statistics.body.statistics.totalInvited, 0)
})

test('events migration is generic, private, transactional and cross-event safe', async () => {
  const sql = (await read('supabase/migrations/20261022120000_admin_club_events.sql')).toLowerCase()
  for (const table of ['club_events', 'club_event_invitations', 'club_event_organizers', 'club_event_scanner_access', 'club_event_attendance']) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`))
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`))
  }
  assert.match(sql, /event_type in \('workshop','competition','conference','open_day','hackathon','meeting','training','other'\)/)
  assert.match(sql, /unique \(event_id, member_id\)/)
  assert.match(sql, /unique \(event_id, staff_profile_id\)/)
  assert.match(sql, /foreign key \(event_organizer_id, event_id\)[\s\S]+references public\.club_event_organizers \(id, event_id\)/)
  assert.match(sql, /foreign key \(checked_in_by_scanner_access_id, event_id\)[\s\S]+references public\.club_event_scanner_access \(id, event_id\)/)
  assert.match(sql, /on conflict \(event_id, member_id\) do nothing/)
  assert.match(sql, /where member\.status = 'active'/)
  assert.match(sql, /staff\.status = 'active'/)
  assert.match(sql, /set scanner_enabled = p_enabled[\s\S]+where event_id = p_event_id and staff_profile_id = p_staff_profile_id/)
  assert.match(sql, /scanner_access_prepared/)
  assert.match(sql, /token_hash text not null/)
  assert.doesNotMatch(sql, /raw_token|scanner_url|insert into public\.club_event_scanner_access/)
  assert.match(sql, /revoke all on table[\s\S]+from anon, authenticated/)
  assert.match(sql, /grant execute on function public\.admin_create_club_event[\s\S]+to service_role/)
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
  for (const tab of ['Overview', 'Invitations', 'Organizers', 'Attendance']) assert.match(page, new RegExp(tab))
  assert.match(page, /Invite all active members/)
  assert.match(page, /Enable scanner access/)
  assert.match(page, /No attendance recorded yet/)
  assert.match(hook, /\/api\/admin\/events/)
  assert.match(store, /from\('club_members'\)/)
  assert.match(store, /from\('admin_people_directory'\)/)
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
