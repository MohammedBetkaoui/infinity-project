import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { test } from 'node:test'
import { createAdminOverviewHandler } from '../api/admin-auth.js'
import { createAdminOverviewService } from '../api/_lib/admin-overview.js'
import { createAdminOverviewStore } from '../api/_lib/admin-overview-store.js'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const SUPER_ADMIN = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'super_admin' }

const dashboard = {
  generatedAt: '2026-09-28T12:00:00.000Z',
  edition: 2,
  stats: { newApplications: 3, pendingApplications: 7, activeMembers: 12, activeStaff: 4, aivexTeams: 8, filesToVerify: 2, connectedDepartments: 3 },
  priorities: { newApplications: 3, interviewsToSchedule: 1, signedDocuments: 2, correctionsDue: 1, generationIssues: 0 },
  community: { members: 12, staff: 4, pending: 7, studyLevels: { licence: 6, master: 3, engineer: 3, other: 0 } },
  departments: [{ key: 'dev-tech', active: 2, waiting: 1 }],
  aivexPipeline: { registered: 8, formReady: 7, signedDocument: 5, organizerReview: 3, validated: 2 },
  series: [{ startDate: '2026-09-24', endDate: '2026-09-28', member: 2, staff: 1, aivex: 3 }],
  activity: [{ action: 'verify_document', subject: 'Nova · AIVEX2-7K9M2P4R', actor: 'Admin', objectType: 'aivex_document', sensitivity: 'confidential', createdAt: '2026-09-28T11:00:00.000Z' }],
}

function request(method = 'GET') {
  const req = Readable.from([])
  req.method = method
  req.url = '/api/admin-auth?__admin_path=overview'
  req.headers = {}
  return req
}

function response() {
  return {
    statusCode: 0,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value },
    end(value) { this.body = value ? JSON.parse(value) : null },
  }
}

test('overview store loads every dashboard aggregate through one RPC', async () => {
  const calls = []
  const store = createAdminOverviewStore({
    async rpc(name, parameters) {
      calls.push([name, parameters])
      return { data: dashboard, error: null }
    },
  })
  assert.equal((await store.dashboard(2)).stats.aivexTeams, 8)
  assert.deepEqual(calls, [['admin_get_overview_dashboard', { p_aivex_edition: 2 }]])
})

test('overview service returns only bounded aggregate data', async () => {
  const service = createAdminOverviewService({
    store: { async dashboard() { return { ...dashboard, databaseId: 'private', storagePath: 'private/file.jpg', series: [...dashboard.series, ...Array(10).fill(dashboard.series[0])] } } },
  })
  const result = await service.dashboard(2)
  assert.equal(result.stats.activeMembers, 12)
  assert.equal(result.series.length, 6)
  assert.equal(result.databaseId, undefined)
  assert.equal(result.storagePath, undefined)
  assert.equal(JSON.stringify(result).includes('private/file.jpg'), false)
})

test('overview API is authenticated, super-admin-only and read-only', async () => {
  for (const [session, status] of [[null, 401], [{ user: { ...SUPER_ADMIN, role: 'administrator' } }, 403]]) {
    let serviceCreated = false
    const handler = createAdminOverviewHandler({
      enabled: () => true,
      requireSession: async () => session,
      createService: () => { serviceCreated = true; return { dashboard: async () => dashboard } },
    })
    const res = response()
    await handler(request(), res)
    assert.equal(res.statusCode, status)
    assert.equal(serviceCreated, false)
  }

  const handler = createAdminOverviewHandler({
    enabled: () => true,
    requireSession: async () => ({ user: SUPER_ADMIN }),
    createService: () => ({ dashboard: async () => dashboard }),
  })
  const live = response()
  await handler(request(), live)
  assert.equal(live.statusCode, 200)
  assert.equal(live.body.dashboard.stats.newApplications, 3)

  const mutation = response()
  await handler(request('POST'), mutation)
  assert.equal(mutation.statusCode, 405)
  assert.equal(mutation.headers.allow, 'GET')
})

test('overview migration is one bounded service-role-only aggregate read', async () => {
  const migration = (await read('supabase/migrations/20261010120000_admin_overview_live_data.sql')).toLowerCase()
  assert.match(migration, /create or replace function public\.admin_get_overview_dashboard/)
  assert.match(migration, /set statement_timeout = '5s'/)
  assert.match(migration, /from public\.membership_applications/)
  assert.match(migration, /from public\.club_members/)
  assert.match(migration, /from public\.club_staff_profiles/)
  assert.match(migration, /from public\.aivex_registrations/)
  assert.match(migration, /from public\.admin_audit_events/)
  assert.match(migration, /order by audit\.created_at desc\s+limit 8/)
  assert.doesNotMatch(migration, /admin_aivex_case_overview/)
  assert.match(migration, /revoke all on function public\.admin_get_overview_dashboard\(smallint\)[\s\S]+from public, anon, authenticated/)
  assert.match(migration, /grant execute on function public\.admin_get_overview_dashboard\(smallint\)[\s\S]+to service_role/)
  for (const privateField of ['password_hash', 'token_hash', 'file_path', 'student_card_path']) {
    assert.doesNotMatch(migration, new RegExp(`'${privateField}'`))
  }
})

test('overview React page and visible navigation use live data without demonstration state', async () => {
  const [page, chart, hook, router, adminUi] = await Promise.all([
    read('src/admin/AdminPages.jsx'),
    read('src/admin/OverviewChart.jsx'),
    read('src/admin/useAdminOverview.js'),
    read('api/admin-auth.js'),
    read('src/admin/AdminUI.jsx'),
  ])
  assert.match(hook, /request\('\/api\/admin\/overview'/)
  assert.match(page, /useAdminOverview\(\)/)
  assert.match(page, /LIVE DATABASE/)
  assert.match(chart, /series = \[\]/)
  assert.match(router, /path === 'overview'/)
  assert.doesNotMatch(`${page}\n${chart}\n${hook}\n${adminUi}`, /createDemoState|useAdmin\(|localStorage|sessionStorage|DEMO ENVIRONMENT|Historical demo series|const SERIES/)
})
