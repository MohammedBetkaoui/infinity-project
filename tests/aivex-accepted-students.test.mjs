import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import test from 'node:test'
import {
  buildAcceptedAivexStudentsCsv, createAdminAivexService,
} from '../api/_lib/admin-aivex.js'
import { parseAcceptedAivexStudentOptions } from '../api/_lib/admin-aivex-validation.js'
import { createAdminAivexHandler } from '../api/admin-auth.js'
import { AIVEX_ARABIC_COPY } from '../src/admin/AivexI18n.js'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const ADMIN = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', role: 'administrator' }
const REFERENCE = 'AIVEX2-7K9M2P4R'

const acceptedRow = {
  reference: REFERENCE,
  team_name: 'Nova Circuit',
  institution_name: 'University of Bordj Bou Arreridj',
  wilaya_code: '34',
  wilaya_name: 'Bordj Bou Arreridj',
  submitted_at: '2026-10-25T10:00:00.000Z',
  position: 1,
  full_name: 'Amel Benali',
  phone: '0550000001',
  gender: 'female',
  bac_year: 2024,
  rfid_number: '12345678',
}

class AcceptedStudentStore {
  constructor() {
    this.listInput = null
    this.exportInput = null
  }

  async acceptedStudentsPage(options) {
    this.listInput = options
    return {
      rows: [acceptedRow],
      total: 1,
      summary: { total: 6, female: 4, male: 2, unknown: 0, teams: 2 },
      facets: {
        wilayas: ['34 · Bordj Bou Arreridj'],
        institutions: ['University of Bordj Bou Arreridj'],
        bacYears: [2024, 2023],
      },
    }
  }

  async exportAcceptedStudents(options, adminUserId) {
    this.exportInput = { options, adminUserId }
    return { rows: [acceptedRow], truncated: false }
  }
}

function request(method, url) {
  const req = Readable.from([])
  req.method = method
  req.url = url
  req.headers = {}
  return req
}

function response() {
  return {
    statusCode: 0,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value },
    end(value) {
      if (String(this.headers['content-type'] || '').startsWith('text/csv')) this.body = String(value || '')
      else this.body = value ? JSON.parse(value) : null
    },
  }
}

test('accepted-student filters are bounded and use the Edition 2 BAC contract', () => {
  const parsed = parseAcceptedAivexStudentOptions(new URLSearchParams(
    'page=2&limit=20&edition=2&q=Amel&gender=female&wilaya=34&institution=University&bacYear=2024&sort=bac_desc',
  ))
  assert.equal(parsed.ok, true)
  assert.deepEqual(parsed.value, {
    q: 'Amel', gender: 'female', wilaya: '34', institution: 'University', bacYear: 2024,
    edition: 2, sort: 'bac_desc', page: 2, limit: 20,
  })
  assert.equal(parseAcceptedAivexStudentOptions(new URLSearchParams('gender=unknown')).ok, false)
  assert.equal(parseAcceptedAivexStudentOptions(new URLSearchParams('bacYear=2018')).ok, false)
  assert.equal(parseAcceptedAivexStudentOptions(new URLSearchParams('bacYear=2027')).ok, false)
  assert.equal(parseAcceptedAivexStudentOptions(new URLSearchParams('sort=private_path_desc')).ok, false)
  assert.equal(parseAcceptedAivexStudentOptions(new URLSearchParams('limit=500')).ok, false)
  assert.equal(parseAcceptedAivexStudentOptions(new URLSearchParams('gender=male&gender=female')).ok, false)
})

test('accepted-student service returns aggregate totals, safe rows and filtered administrator exports', async () => {
  const store = new AcceptedStudentStore()
  const service = createAdminAivexService({ store })
  const options = parseAcceptedAivexStudentOptions(new URLSearchParams('gender=female&bacYear=2024')).value
  const list = await service.acceptedStudents(options, { ...ADMIN, role: 'reviewer' })

  assert.equal(list.data[0].id, `${REFERENCE}-1`)
  assert.equal(list.data[0].gender, 'female')
  assert.deepEqual(list.summary, { total: 6, female: 4, male: 2, unknown: 0, teams: 2 })
  assert.equal(list.pagination.total, 1)
  assert.equal(list.canExport, false)
  assert.equal(store.listInput.gender, 'female')
  assert.doesNotMatch(JSON.stringify(list), /registration_id|student_card_path|storage/i)

  const denied = await service.exportAcceptedStudents(options, { ...ADMIN, role: 'reviewer' })
  assert.equal(denied.status, 403)
  assert.equal(store.exportInput, null)

  const exported = await service.exportAcceptedStudents(options, ADMIN)
  assert.equal(exported.ok, true)
  assert.equal(store.exportInput.options.gender, 'female')
  assert.equal(store.exportInput.options.bacYear, 2024)
  assert.equal(store.exportInput.adminUserId, ADMIN.id)
  assert.match(exported.csv, /^\uFEFF"Student name","Gender","Phone"/)
  assert.match(exported.csv, /"Female"/)
  assert.doesNotMatch(exported.csv, /registration_id|student_card_path|storage/i)

  const protectedCsv = buildAcceptedAivexStudentsCsv([{ ...acceptedRow, full_name: '=HYPERLINK("https://invalid")' }])
  assert.match(protectedCsv, /"'=HYPERLINK\(""https:\/\/invalid""\)"/)
})

test('accepted-student API requires a session and protects CSV export by administrator role', async () => {
  const store = new AcceptedStudentStore()
  const service = createAdminAivexService({ store })
  const listUrl = '/api/admin-auth?__admin_path=aivex/students&edition=2&gender=female&sort=name_asc'
  const exportUrl = '/api/admin-auth?__admin_path=aivex/students/export&edition=2&gender=female&sort=name_asc'
  const common = { createService: () => service, enabled: () => true, env: {} }

  const unauthenticated = createAdminAivexHandler({ ...common, requireSession: async () => null })
  const unauthenticatedResponse = response()
  await unauthenticated(request('GET', listUrl), unauthenticatedResponse)
  assert.equal(unauthenticatedResponse.statusCode, 401)

  const reviewer = createAdminAivexHandler({
    ...common, requireSession: async () => ({ user: { ...ADMIN, role: 'reviewer' } }),
  })
  const reviewerListResponse = response()
  await reviewer(request('GET', listUrl), reviewerListResponse)
  assert.equal(reviewerListResponse.statusCode, 200)
  assert.equal(reviewerListResponse.body.summary.total, 6)
  assert.equal(reviewerListResponse.body.canExport, false)
  assert.match(reviewerListResponse.headers['cache-control'], /no-store/)

  const reviewerExportResponse = response()
  await reviewer(request('GET', exportUrl), reviewerExportResponse)
  assert.equal(reviewerExportResponse.statusCode, 403)

  const administrator = createAdminAivexHandler({
    ...common, requireSession: async () => ({ user: ADMIN }),
  })
  const exportResponse = response()
  await administrator(request('GET', exportUrl), exportResponse)
  assert.equal(exportResponse.statusCode, 200)
  assert.match(exportResponse.headers['content-type'], /^text\/csv/)
  assert.match(exportResponse.headers['cache-control'], /no-store/)
  assert.match(exportResponse.headers['content-disposition'], /aivex-edition-02-accepted-students\.csv/)

  const invalidResponse = response()
  await administrator(request('GET', `${listUrl}&bacYear=1900`), invalidResponse)
  assert.equal(invalidResponse.statusCode, 400)
})

test('forward migration derives the directory only from final accepted teams and locks both RPCs to the server', async () => {
  const migration = (await read('supabase/migrations/20261014120000_aivex_accepted_students_workspace.sql')).toLowerCase()
  assert.match(migration, /registration\.registration_status = 'approved'/)
  assert.match(migration, /registration\.document_status = 'validated'/)
  assert.match(migration, /'total'.*select count\(\*\) from accepted_students/s)
  assert.match(migration, /'female'.*gender = 'female'/s)
  assert.match(migration, /'male'.*gender = 'male'/s)
  assert.match(migration, /p_gender is null or accepted\.gender = p_gender/)
  assert.match(migration, /p_bac_year is null or accepted\.bac_year = p_bac_year/)
  assert.match(migration, /administrator_role not in \('super_admin', 'administrator'\)/)
  assert.match(migration, /limit 15001/)
  assert.match(migration, /revoke all on function public\.admin_list_accepted_aivex_students[\s\S]*from public, anon, authenticated/)
  assert.match(migration, /grant execute on function public\.admin_list_accepted_aivex_students[\s\S]*to service_role/)
  assert.match(migration, /revoke all on function public\.admin_export_accepted_aivex_students[\s\S]*from public, anon, authenticated/)
  assert.match(migration, /grant execute on function public\.admin_export_accepted_aivex_students[\s\S]*to service_role/)
  assert.doesNotMatch(migration, /student_card_path|signed_form|magic_link|delete from/)
})

test('AIVEX dashboard exposes an RTL-aware accepted-student sub-page with global counters and filtered export', async () => {
  const [page, hook, handler] = await Promise.all([
    read('src/admin/AivexPages.jsx'),
    read('src/admin/useAdminAivex.js'),
    read('api/admin-auth.js'),
  ])
  assert.match(page, /workspace === 'students'/)
  assert.match(page, /AcceptedStudentsWorkspace/)
  assert.match(page, /key: 'total', label: 'Accepted students'/)
  assert.match(page, /key: 'female', label: 'Women'/)
  assert.match(page, /key: 'male', label: 'Men'/)
  assert.match(page, /students\.summary\[key\]/)
  assert.match(page, /Export filtered students/)
  assert.match(page, /dir=\{dir\}/)
  assert.match(hook, /\/api\/admin\/aivex\/students\?\$\{query\}/)
  assert.match(hook, /\/api\/admin\/aivex\/students\/export\?\$\{query\}/)
  assert.match(hook, /gender: GENDER_KEYS\[filters\.gender\] \|\| filters\.gender/)
  assert.match(hook, /bacYear: filters\.bacYear/)
  assert.match(handler, /acceptedStudentsExportPath && req\.method === 'GET'/)
  assert.match(handler, /acceptedStudentsPath && req\.method === 'GET'/)
  for (const key of ['Accepted students', 'Women', 'Men', 'Export filtered students', 'No accepted students match this view']) {
    assert.ok(AIVEX_ARABIC_COPY[key], `missing Arabic accepted-student translation: ${key}`)
  }
})
