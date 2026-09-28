import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import {
  UNIVERSITY_FACULTIES, describeAcademicDepartment, getDepartmentLabel, getFacultyLabel,
  isValidDepartmentForFaculty, isValidFaculty,
} from '../shared/membership/university-structure.js'
import {
  buildSummary, facultyOptions, getDepartmentOptions, initialValues, serialize, steps, validators,
} from '../src/pages/join/joinModel.js'
import { callJoin, insertRequests, validBody, withJoinServices } from './support/join-harness.mjs'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const MIGRATION = 'supabase/migrations/20261008120000_membership_faculty_department.sql'
const FACULTY_VALUES = ['fmi', 'fst', 'fsnv', 'fsecg', 'fll', 'fdsp', 'fshs']

test('the academic structure is exactly Faculty -> Department, with unique slugs', () => {
  assert.deepEqual(UNIVERSITY_FACULTIES.map((faculty) => faculty.value), FACULTY_VALUES)
  assert.deepEqual(
    UNIVERSITY_FACULTIES.find((faculty) => faculty.value === 'fmi').departments.map(({ value, label }) => [value, label]),
    [['computer-science', 'Computer Science'], ['mathematics', 'Mathematics']],
  )
  const departments = UNIVERSITY_FACULTIES.flatMap((faculty) => faculty.departments)
  assert.equal(new Set(departments.map((department) => department.value)).size, departments.length)
  assert.equal(new Set(departments.map((department) => department.label)).size, departments.length)
  // Two levels only: a department carries no further level (no speciality).
  for (const department of departments) assert.deepEqual(Object.keys(department), ['value', 'label'])
  for (const department of departments) assert.match(department.value, /^[a-z]+(-[a-z]+)*$/)
})

test('shared validation accepts a department only inside its own faculty', () => {
  assert.equal(isValidDepartmentForFaculty('fmi', 'computer-science'), true) // CASE 1
  assert.equal(isValidDepartmentForFaculty('fmi', 'mathematics'), true) // CASE 2
  assert.equal(isValidDepartmentForFaculty('fmi', 'civil-engineering'), false) // CASE 3
  assert.equal(isValidDepartmentForFaculty('fst', 'civil-engineering'), true) // CASE 4
  assert.equal(isValidFaculty(''), false) // CASE 5
  assert.equal(isValidDepartmentForFaculty('', ''), false) // CASE 5
  assert.equal(isValidFaculty('unknown'), false) // CASE 7
  assert.equal(isValidDepartmentForFaculty('unknown', 'mathematics'), false) // CASE 7
  assert.equal(isValidDepartmentForFaculty('fst', 'mathematics'), false)
  assert.equal(isValidDepartmentForFaculty('fmi', 'Computer Science'), false, 'labels are not accepted as values')
  for (const crafted of ['__proto__', 'constructor', 'toString', 'FMI', ' fmi']) assert.equal(isValidFaculty(crafted), false, crafted)
  assert.equal(isValidDepartmentForFaculty('fmi', 'constructor'), false)
  assert.equal(isValidFaculty(['fmi']), false)
  assert.equal(isValidDepartmentForFaculty('fmi', { value: 'mathematics' }), false)

  assert.equal(getFacultyLabel('fmi'), 'Faculty of Mathematics and Computer Science')
  assert.equal(getDepartmentLabel('fmi', 'computer-science'), 'Computer Science')
  assert.equal(getDepartmentLabel('fst', 'computer-science'), '')
  assert.equal(getFacultyLabel(null), '')
  // Legacy rows have no faculty and keep the free text that was typed.
  assert.equal(describeAcademicDepartment(null, '  Génie civil '), 'Génie civil')
  assert.equal(describeAcademicDepartment('fsnv', 'nutrition'), 'Nutrition Sciences')
})

test('the Join form asks for a faculty, then a department of that faculty', () => {
  assert.equal(initialValues.faculty, '')
  assert.equal(initialValues.department, '')
  assert.equal(initialValues.staffDepartment, '', 'the staff department stays a separate answer')
  assert.deepEqual(steps[0].fields, ['fullName', 'email', 'phone', 'studyYear', 'faculty', 'department'])

  const check = (faculty, department) => [validators.faculty(faculty), validators.department(department, { faculty })]
  assert.deepEqual(check('fmi', 'computer-science'), ['', '']) // CASE 1
  assert.deepEqual(check('fmi', 'mathematics'), ['', '']) // CASE 2
  assert.deepEqual(check('fmi', 'civil-engineering'), ['', 'Select a valid department.']) // CASE 3
  assert.deepEqual(check('fst', 'civil-engineering'), ['', '']) // CASE 4
  assert.deepEqual(check('', ''), ['Your faculty is required.', 'Select your faculty first.']) // CASE 5
  assert.deepEqual(check('fmi', ''), ['', 'Your department is required.'])
  assert.deepEqual(check('unknown', 'mathematics'), ['Select a valid faculty.', 'Select a valid department.'])
})

test('department options follow the selected faculty and a faculty change clears the department', async () => {
  assert.deepEqual(facultyOptions[0], { value: '', label: 'Select your faculty' })
  assert.deepEqual(facultyOptions.slice(1).map((option) => option.value), FACULTY_VALUES)
  assert.deepEqual(getDepartmentOptions(''), [{ value: '', label: 'Select your faculty first' }])
  assert.deepEqual(getDepartmentOptions('fmi'), [
    { value: '', label: 'Select your department' },
    { value: 'computer-science', label: 'Computer Science' },
    { value: 'mathematics', label: 'Mathematics' },
  ])
  assert.equal(getDepartmentOptions('fst').some((option) => option.value === 'computer-science'), false)

  // CASE 6: fmi/computer-science, then the faculty becomes fst. The page clears
  // the department; even a stale one would no longer validate.
  const page = await read('src/pages/join/JoinPage.jsx')
  assert.match(page, /const changeFaculty = \(name, value\) => \{\s*form\.setField\(name, value\)\s*form\.setField\('department', ''\)\s*\}/)
  assert.match(page, /name="faculty"[^>]*options=\{facultyOptions\}[\s\S]*?onChange=\{changeFaculty\}/)
  assert.match(page, /name="department" label="Department" as="select" options=\{departmentOptions\}[\s\S]*?disabled=\{!form\.values\.faculty\}/)
  assert.match(page, /const departmentOptions = getDepartmentOptions\(form\.values\.faculty\)/)
  assert.equal(validators.department('computer-science', { faculty: 'fst' }), 'Select a valid department.')

  // No free text and no third level; the Member / Staff switch is untouched.
  assert.doesNotMatch(page, /Department or speciality|name="speciality"/)
  assert.match(page, /if \(value === 'member'\) form\.setField\('staffDepartment', ''\)/)
  assert.match(page, /if \(value === 'staff'\) form\.setField\('memberInterest', ''\)/)

  // Drafts saved by the free-text form are neither restored nor kept.
  assert.match(page, /STORAGE_KEY = 'infinity-membership-draft-v4'/)
  assert.match(page, /OUTDATED_STORAGE_KEYS = \['infinity-membership-draft-v1', 'infinity-membership-draft-v2', 'infinity-membership-draft-v3'\]/)
  assert.match(page, /const FORM_VERSION = 4/)

  const field = await read('src/components/forms/ApplicationField.jsx')
  assert.match(field, /disabled = false,/)
  assert.match(field, /maxLength,\s*disabled,/)
  assert.match(field, /data-disabled=\{disabled \? '' : undefined\}/)
  assert.match(await read('src/pages/join/join.css'), /\.join-page \.af-field :is\(input, select, textarea\):disabled \{[^}]*cursor: not-allowed/)
})

test('the summary shows readable labels while the payload keeps the slugs', () => {
  const values = {
    ...initialValues, fullName: 'Test Applicant', email: 'applicant@example.invalid', studyYear: 'L2',
    faculty: 'fmi', department: 'computer-science', joinType: 'member', experience: 'starting',
    memberInterest: 'AI Engineering', availability: 'weekly', consent: true,
  }
  const summary = buildSummary(values)
  assert.match(summary, /^Faculty: Faculty of Mathematics and Computer Science$/m)
  assert.match(summary, /^Department: Computer Science$/m)
  assert.doesNotMatch(summary, /Faculty: fmi|Department: computer-science|speciality/i)

  const payload = serialize(values)
  assert.equal(payload.faculty, 'fmi')
  assert.equal(payload.department, 'computer-science')
  assert.equal(payload.staffDepartment, null)
})

test('the Join API refuses a faculty/department pair outside the shared structure before touching Supabase', async () => {
  await withJoinServices({}, async ({ requests }) => {
    for (const [faculty, department, field] of [
      ['unknown', 'mathematics', 'faculty'], // CASE 7
      ['fmi', 'civil-engineering', 'department'], // CASE 3
      ['fst', 'mathematics', 'department'],
      ['', '', 'faculty'], // CASE 5
      ['fmi', 'Computer Science', 'department'],
      ['__proto__', 'mathematics', 'faculty'],
      [['fmi'], 'mathematics', 'faculty'],
    ]) {
      const res = await callJoin({ body: validBody({ answers: { faculty, department } }) })
      assert.equal(res.statusCode, 400, `${faculty} / ${department}`)
      assert.equal(res.body.success, false)
      assert.equal(res.body.field, field, `${faculty} / ${department}`)
    }

    // A tab still showing the free-text field is asked to reload, not stored.
    const stale = await callJoin({ body: validBody({ version: 2, answers: { faculty: undefined, department: 'Computer Science' } }) })
    assert.equal(stale.statusCode, 400)
    assert.equal(stale.body.field, 'version')
    assert.match(stale.body.message, /reload the page/)

    assert.equal(requests.length, 0, 'nothing is sent to Supabase for a refused application')
  })
})

test('a valid application reaches Supabase with both faculty and department slugs', async () => {
  await withJoinServices({}, async ({ requests }) => {
    // CASE 8
    const res = await callJoin({ body: validBody({ answers: { faculty: 'fmi', department: 'computer-science' } }) })
    assert.equal(res.statusCode, 201)
    assert.deepEqual(res.body, { success: true, reference: 'JOIN-26-TEST01' })
    const [insertRequest] = insertRequests(requests)
    const insert = { url: insertRequest.url, body: JSON.parse(insertRequest.body) }
    assert.match(insert.url, /\/rest\/v1\/membership_applications/)
    assert.equal(insert.body.faculty, 'fmi')
    assert.equal(insert.body.department, 'computer-science')
    assert.equal(insert.body.form_version, 4)
    assert.equal(insert.body.staff_department, null)

    // Staff: the university department and the Infinity staff department are
    // two separate columns, never merged.
    const staff = await callJoin({
      body: validBody({ answers: { faculty: 'fst', department: 'civil-engineering', joinType: 'staff', memberInterest: null, staffDepartment: 'dev-tech' } }),
    })
    assert.equal(staff.statusCode, 201)
    const staffInsert = { body: JSON.parse(insertRequests(requests).at(-1).body) }
    assert.equal(staffInsert.body.faculty, 'fst')
    assert.equal(staffInsert.body.department, 'civil-engineering')
    assert.equal(staffInsert.body.staff_department, 'dev-tech')
    assert.equal(staffInsert.body.primary_field, 'Dev / Tech')
  })
})

test('the migration mirrors the shared structure and only expands the schema', async () => {
  const sql = await read(MIGRATION)
  const body = sql.match(/create or replace function public\.membership_department_label[\s\S]+?\$\$([\s\S]+?)\$\$/)[1]
  const sqlFaculties = [...body.matchAll(/when '([a-z]+)' then case p_department([\s\S]+?)\n {4}end/g)].map(([, value, block]) => ({
    value,
    departments: [...block.matchAll(/when '([a-z-]+)' then '([^']+)'/g)].map(([, departmentValue, label]) => ({ value: departmentValue, label })),
  }))
  assert.deepEqual(sqlFaculties, UNIVERSITY_FACULTIES.map(({ value, departments }) => ({
    value,
    departments: departments.map((department) => ({ value: department.value, label: department.label })),
  })))

  const facultyLists = [...sql.matchAll(/faculty in \(([^)]+)\)/g)].map(([, list]) => list.split(',').map((item) => item.trim().replaceAll("'", '')))
  assert.equal(facultyLists.length, 2, 'one faculty CHECK per table')
  for (const list of facultyLists) assert.deepEqual(list, FACULTY_VALUES)

  assert.match(sql, /add column if not exists faculty text;/)
  assert.match(sql, /check \(faculty is null or public\.membership_department_label\(faculty, department\) is not null\)/)
  assert.match(sql, /coalesce\(public\.membership_department_label\(new\.faculty, new\.department\), btrim\(new\.department\)\)/)
  assert.match(sql, /faculty = excluded\.faculty/)
  assert.equal([...sql.matchAll(/greatest\(member\.updated_at, staff\.updated_at\) as updated_at,\s*member\.faculty\s*from|member\.updated_at,\s*member\.faculty\s*from/g)].length, 2)
  assert.match(sql, /revoke all on function public\.membership_department_label\(text, text\) from public, anon, authenticated;/)
  assert.match(sql, /grant execute on function public\.membership_department_label\(text, text\) to service_role;/)

  // Legacy rows are preserved: no drop, no forced NOT NULL, no rewrite.
  assert.doesNotMatch(sql, /drop column|set not null|drop table|delete from|update public\./i)
})
