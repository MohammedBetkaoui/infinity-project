import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  STUDENT_GENDERS, buildRegistrationPayloadV4, createRegistrationStateV4, validateRegistrationV4,
} from '../shared/aivex/contract-v4.js'
import { toStudentRows } from '../api/_lib/aivex-registration-v4.js'
import { getGenderLabel, getGenderOptions, getRegistrationStrings } from '../src/pages/aivex/register/registrationI18n.js'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

const validPayload = () => ({
  submissionId: '3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b',
  edition: 2,
  formVersion: 4,
  team: {
    name: 'Infinity AI',
    wilaya: { code: '34', name: 'Bordj Bou Arréridj' },
    institution: { id: 'univ-bba', name: 'Université Mohamed El Bachir El Ibrahimi', custom: false },
  },
  activityOfficial: { role: 'activities_officer', fullName: 'Amina Benali', email: 'activities@example.dz', phone: '0555123456' },
  delegationHead: { fullName: 'Karim Haddad', phone: '0661234567', rfid: '00471236', idCard: 'delegationHeadIdCard' },
  driver: { fullName: 'Nabil Saidi', phone: '0770123456', rfid: 'A1B2C3D4', idCard: 'driverIdCard' },
  students: [1, 2, 3].map((position) => ({
    position,
    fullName: ['Sara Meziane', 'Yacine Amrane', 'Lina Khelifi'][position - 1],
    phone: `055000000${position}`,
    gender: position === 2 ? 'male' : 'female',
    bacYear: 2021 + position,
    rfid: `0000000${position}`,
    studentCard: `studentCard_${position}`,
  })),
  consent: true,
})

test('student gender is a closed, required server-side registration value and is stored canonically', () => {
  assert.deepEqual([...STUDENT_GENDERS], ['male', 'female'])
  const valid = validateRegistrationV4(validPayload())
  assert.equal(valid.ok, true)
  assert.deepEqual(valid.value.students.map((student) => student.gender), ['female', 'male', 'female'])

  for (const value of ['', 'woman', 'Male', null, undefined, 1]) {
    const payload = validPayload()
    payload.students[1].gender = value
    const result = validateRegistrationV4(payload)
    assert.equal(result.ok, false, JSON.stringify(value))
    assert.equal(result.field, 'students[1].gender')
  }

  const rows = toStudentRows('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', valid.value, [1, 2, 3].map((position) => ({
    position, path: `private/student-${position}.jpg`, mime: 'image/jpeg', size: 100,
  })))
  assert.deepEqual(rows.map((row) => row.gender), ['female', 'male', 'female'])
})

test('registration state, payload and EN/FR/AR UI all carry the student gender field', async () => {
  const state = createRegistrationStateV4({ submissionId: validPayload().submissionId })
  assert(state.students.every((student) => student.gender === ''))
  Object.assign(state.team, { name: 'Infinity AI', wilaya: '34', institution: 'univ-bba' })
  state.students.forEach((student, index) => Object.assign(student, {
    fullName: validPayload().students[index].fullName,
    phone: validPayload().students[index].phone,
    gender: validPayload().students[index].gender,
    bacYear: String(validPayload().students[index].bacYear),
    rfid: validPayload().students[index].rfid,
  }))
  assert.deepEqual(buildRegistrationPayloadV4(state).students.map((student) => student.gender), ['female', 'male', 'female'])

  for (const language of ['en', 'fr', 'ar']) {
    const strings = getRegistrationStrings(language)
    assert(strings.genderLabel)
    assert(strings.selectGender)
    assert(strings.genderMale)
    assert(strings.genderFemale)
    assert(strings.errGenderRequired)
    assert.deepEqual(getGenderOptions(strings).map((option) => option.value), ['', 'male', 'female'])
    assert.equal(getGenderLabel('female', strings), strings.genderFemale)
  }

  const studentsStep = await read('src/pages/aivex/register/StudentsStep.jsx')
  const reviewStep = await read('src/pages/aivex/register/ReviewStep.jsx')
  const layout = await read('src/pages/aivex/register/RegistrationLayout.jsx')
  assert.match(studentsStep, /field\('gender'\)/)
  assert.match(studentsStep, /getGenderOptions/)
  assert.match(reviewStep, /getGenderLabel\(student\.gender, t\)/)
  assert.match(layout, /dir=\{strings\.dir \|\| 'ltr'\}/)
})

test('forward migration keeps historical gender unknown and secures gender filtering plus bounded exports', async () => {
  const migration = await read('supabase/migrations/20261013120000_aivex_student_gender_and_filtered_export.sql')
  assert.match(migration, /add column if not exists gender text/i)
  assert.match(migration, /gender is null or gender in \('male', 'female'\)/i)
  assert.doesNotMatch(migration, /update\s+public\.aivex_students\s+set\s+gender/i)
  assert.match(migration, /matching_student\.gender = p_gender/i)
  assert.match(migration, /administrator_role not in \('super_admin', 'administrator'\)/i)
  assert.match(migration, /limit 15001/i)
  assert.match(migration, /revoke all on function public\.admin_export_aivex_cases[\s\S]*from public, anon, authenticated/i)
  assert.match(migration, /grant execute on function public\.admin_export_aivex_cases[\s\S]*to service_role/i)
})

test('admin dashboard sends gender and every active list filter to the protected CSV export', async () => {
  const hook = await read('src/admin/useAdminAivex.js')
  const page = await read('src/admin/AivexPages.jsx')
  const handler = await read('api/admin-auth.js')
  const store = await read('api/_lib/admin-aivex-store.js')
  assert.match(hook, /gender: GENDER_KEYS\[filters\.gender\] \|\| filters\.gender/)
  assert.match(hook, /\/api\/admin\/aivex\/export\?\$\{query\}/)
  assert.match(page, /key: 'gender'.*Student gender.*\['Male', 'Female'\]/)
  assert.match(page, /exportCsv\(\{ search: deferredSearch, filters, sort \}\)/)
  assert.match(handler, /exportPath && req\.method === 'GET'/)
  const mappings = {
    p_query: 'safeSearch(options.q)', p_registration_status: 'options.registration',
    p_document_status: 'options.document', p_wilaya: 'options.wilaya',
    p_institution: 'options.institution', p_complete: 'options.complete',
    p_signed: 'options.signed', p_gender: 'options.gender', p_date_from: 'options.dateFrom',
    p_date_to: 'options.dateTo', p_sort: 'options.sort',
  }
  for (const [parameter, expression] of Object.entries(mappings)) {
    assert(store.includes(`${parameter}: ${expression}`), parameter)
  }
})
