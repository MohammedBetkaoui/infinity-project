// AIVEX — the validation rules of the second edition (node --test, no network,
// no database).
//
//   PHONE          exactly 10 digits, 05 / 06 / 07 (separators typed are dropped first)
//   STUDENT RFID   exactly 8 digits, as text          (delegation RFID: NOT this rule)
//   BAC YEAR       2019 to 2026, fixed for the edition (never derived from the clock)
//   PERSON NAME    Unicode letters and spaces, 3 to 120 characters
//
// The rules live ONCE, in shared/aivex/contract-v4.js. These tests therefore
//   1. call the shared functions directly with the matrix of the brief;
//   2. prove the form (registrationModel.js) and the API (validateRegistrationV4)
//      always give the same answer — on the matrix and on a seeded fuzz corpus;
//   3. send crafted requests straight to the real handler, bypassing the form,
//      and prove nothing is opened, stored, generated or issued before the
//      validation has passed;
//   4. check statically that no rule was copied into React or into the API.

import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { test } from 'node:test'
import * as contract from '../shared/aivex/contract-v4.js'
import {
  BAC_YEAR_RANGE, LIMITS, PHONE_PATTERN, STUDENT_RFID_PATTERN, bacYearChoices, buildRegistrationPayloadV4, createRegistrationStateV4,
  isValidBacYear, isValidDelegationRfid, isValidEmail, isValidPersonName, isValidPhone, isValidPhoneInput, isValidStudentRfid,
  normalizeBacYear, normalizeEmail, normalizePersonName, normalizePhone, normalizeRfid, normalizeText, personNameIssue,
  validateRegistrationV4,
} from '../shared/aivex/contract-v4.js'
import { algerianWilayas } from '../src/data/algeriaHigherEducation.js'
import { createRegisterHandler } from './support/aivex-register-handler.mjs'
import { registerV4 } from '../api/_lib/aivex-registration-v4.js'
import { officialIssues, personIssues, studentIssues, teamIssues } from '../src/pages/aivex/register/registrationModel.js'
import { getBacYearOptions, getRegistrationStrings, registrationStrings } from '../src/pages/aivex/register/registrationI18n.js'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

const NOW = new Date('2026-09-23T10:00:00Z')
const SUBMISSION_ID = '3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b'

// ---------------------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------------------

const validPayload = () => ({
  submissionId: SUBMISSION_ID,
  edition: 2,
  formVersion: 4,
  team: {
    name: 'Null Pointers',
    wilaya: { code: '34', name: 'Bordj Bou Arréridj' },
    institution: { id: 'univ-bba', name: 'Université Mohamed El Bachir El Ibrahimi', custom: false },
  },
  activityOfficial: { role: 'activities_officer', fullName: 'Amina Benali', email: 'activities@univ-bba.dz', phone: '0555123456' },
  delegationHead: { fullName: 'Karim Haddad', phone: '0661234567', rfid: '00471236', idCard: 'delegationHeadIdCard' },
  driver: { fullName: 'Nabil Saidi', phone: '0770123456', rfid: 'A1B2C3D4', idCard: 'driverIdCard' },
  students: [
    { position: 1, fullName: 'Betkaoui Mohammed', phone: '0550000001', bacYear: 2022, rfid: '00123456', studentCard: 'studentCard_1' },
    { position: 2, fullName: 'عبد الرحمان', phone: '0550000002', bacYear: 2023, rfid: '12345678', studentCard: 'studentCard_2' },
    { position: 3, fullName: 'محمد أمين', phone: '0550000003', bacYear: 2024, rfid: '98765432', studentCard: 'studentCard_3' },
  ],
  consent: true,
})

const change = (mutate) => {
  const payload = validPayload()
  mutate(payload)
  return validateRegistrationV4(payload)
}
const accepts = (result, label) => assert.equal(result.ok, true, `${label}: ${result.message}`)
const refuses = (result, field, label = field) => {
  assert.equal(result.ok, false, `${label}: expected a refusal`)
  assert.equal(result.status, 400, label)
  assert.equal(result.field, field, label)
  assert.equal(typeof result.message, 'string', label)
}

// Every place a phone / a person name is typed, with the payload path the API reports.
const PHONE_FIELDS = [
  ['activityOfficial.phone', (p, v) => { p.activityOfficial.phone = v }],
  ['delegationHead.phone', (p, v) => { p.delegationHead.phone = v }],
  ['driver.phone', (p, v) => { p.driver.phone = v }],
  ['students[0].phone', (p, v) => { p.students[0].phone = v }],
  ['students[1].phone', (p, v) => { p.students[1].phone = v }],
  ['students[2].phone', (p, v) => { p.students[2].phone = v }],
]
const NAME_FIELDS = [
  ['activityOfficial.fullName', (p, v) => { p.activityOfficial.fullName = v }],
  ['delegationHead.fullName', (p, v) => { p.delegationHead.fullName = v }],
  ['driver.fullName', (p, v) => { p.driver.fullName = v }],
  ['students[0].fullName', (p, v) => { p.students[0].fullName = v }],
  ['students[1].fullName', (p, v) => { p.students[1].fullName = v }],
  ['students[2].fullName', (p, v) => { p.students[2].fullName = v }],
]
const STUDENT_RFID_FIELDS = [0, 1, 2].map((index) => [`students[${index}].rfid`, (p, v) => { p.students[index].rfid = v }])
const STUDENT_BAC_FIELDS = [0, 1, 2].map((index) => [`students[${index}].bacYear`, (p, v) => { p.students[index].bacYear = v }])

// ---------------------------------------------------------------------------------------
// 1. PHONE — exactly 10 digits, starting with 05, 06 or 07
// ---------------------------------------------------------------------------------------

const PHONES_ACCEPTED = [
  '0555123456', '0661234567', '0770123456', '0500000000', '0699999999', '0712345678',
  // Harmless separators are dropped BEFORE validating: the canonical value is what is checked.
  '0555 12 34 56', '0555-12-34-56', '0555.12.34.56', ' 0555123456 ', '05 55 12 34 56', '0555 - 12 - 34 - 56', '0555\u00a012\u00a034\u00a056',
]
const PHONES_REFUSED = [
  '055512345', '05551234567', '0455123456', '0855123456', '0355123456', '0055123456', '1234567890', '05551234AB', '05551234A6',
  // No international notation, ever — and it is never rewritten into a local number.
  '+213555123456', '+213 555 12 34 56', '00213555123456', '213555123456', '555123456', '+0555123456',
  // Anything that is not a plain separator makes the number invalid.
  '(0555)123456', '(0555) 12 34 56', '0555/12/34/56', '0555_123456', '0555,123456', '0555;123456',
  // Only the ASCII digits 0-9 count (Arabic-Indic and full-width digits do not).
  '٠٥٥٥١٢٣٤٥٦٧', '０５５５１２３４５６',
  '', ' ', '   ', '0555 123 456 789', '05551234567890', `0555${' '.repeat(40)}123456`, '0555\n123456\n0',
]
const PHONES_NOT_TEXT = [555123456, 5551234567, 123456789, null, undefined, true, ['0555123456'], { phone: '0555123456' }]

test('PHONE: the shared rule accepts exactly a 10-digit 05/06/07 number, separators typed or not', () => {
  for (const value of PHONES_ACCEPTED) assert.equal(isValidPhoneInput(value), true, JSON.stringify(value))
  for (const value of [...PHONES_REFUSED, ...PHONES_NOT_TEXT]) assert.equal(isValidPhoneInput(value), false, JSON.stringify(value))
  assert.equal(String(PHONE_PATTERN), '/^0[567][0-9]{8}$/')
})

test('PHONE: normalisation drops spaces, hyphens and dots only, and never turns +213 into a local number', () => {
  for (const [typed, canonical] of [['0555 12 34 56', '0555123456'], ['0555-12-34-56', '0555123456'], ['0555.12.34.56', '0555123456'], ['  0661 23 45 67  ', '0661234567']]) {
    assert.equal(normalizePhone(typed), canonical)
    assert.equal(isValidPhone(normalizePhone(typed)), true)
  }
  assert.equal(normalizePhone('+213 555 12 34 56'), '+213555123456', 'kept as it is...')
  assert.equal(isValidPhone('+213555123456'), false, '...and therefore refused')
  assert.notEqual(normalizePhone('+213555123456'), '0555123456')
  assert.equal(normalizePhone('(0555) 12 34 56'), '(0555)123456', 'parentheses are not separators')
  assert.equal(normalizePhone(555123456), '', 'a Number is never a phone')
  // isValidPhone judges a CANONICAL value only: it does not normalise for you.
  assert.equal(isValidPhone('0555 12 34 56'), false)
  assert.equal(isValidPhone(null), false)
})

test('PHONE: the API applies the rule to all six phone fields, and stores the canonical ten digits', () => {
  for (const [field, set] of PHONE_FIELDS) {
    for (const value of [...PHONES_REFUSED, ...PHONES_NOT_TEXT]) refuses(change((p) => set(p, value)), field, `${field} = ${JSON.stringify(value)}`)
    for (const value of PHONES_ACCEPTED) accepts(change((p) => set(p, value)), `${field} = ${JSON.stringify(value)}`)
  }
  const result = change((p) => {
    p.activityOfficial.phone = '0555 12 34 56'
    p.delegationHead.phone = '0661-23-45-67'
    p.driver.phone = '0770.12.34.56'
    p.students[0].phone = ' 0550000001 '
  })
  accepts(result, 'separators')
  assert.deepEqual(
    [result.value.activityOfficial.phone, result.value.delegationHead.phone, result.value.driver.phone, result.value.students[0].phone],
    ['0555123456', '0661234567', '0770123456', '0550000001'],
  )
  assert.match(change((p) => { p.driver.phone = '+213770123456' }).message, /exactly 10 digits and start with 05, 06 or 07/)
})

test('PHONE: duplicates are allowed — no uniqueness rule was specified, so none was invented', () => {
  accepts(change((p) => { p.driver.phone = p.delegationHead.phone }), 'driver shares the head of delegation\'s number')
  accepts(change((p) => { p.students[1].phone = p.students[0].phone }), 'two students share a number')
  accepts(change((p) => { p.students[2].phone = p.activityOfficial.phone }), 'a student shares the official\'s number')
})

// ---------------------------------------------------------------------------------------
// 2. STUDENT RFID — exactly 8 digits; the delegation's RFID is a different rule
// ---------------------------------------------------------------------------------------

const STUDENT_RFID_ACCEPTED = ['12345678', '00123456', '00000001', '98765432', '00000000', '99999999']
const STUDENT_RFID_REFUSED = ['1234567', '123456789', '1234ABCD', '1234 5678', '1234567A', 'AB123456', '0123456', '012345678', '1234-5678', '12345678a',
  '１２３４５６７８', '١٢٣٤٥٦٧٨', '1234567٠', '', '   ', '12345678\n9', '00123456\u0000']

test('STUDENT RFID: exactly eight ASCII digits, as text, leading zeros kept', () => {
  for (const value of STUDENT_RFID_ACCEPTED) assert.equal(isValidStudentRfid(value), true, value)
  for (const value of STUDENT_RFID_REFUSED) assert.equal(isValidStudentRfid(normalizeRfid(value)), false, JSON.stringify(value))
  // The rule is on a string: a number is not an RFID, whatever its digits.
  for (const value of [12345678, 1234567, null, undefined, ['12345678']]) assert.equal(isValidStudentRfid(value), false)
  assert.equal(String(STUDENT_RFID_PATTERN), '/^[0-9]{8}$/')
  // Trimmed, and nothing else: an inner space is not removed.
  assert.equal(normalizeRfid(' 00123456 '), '00123456')
  assert.equal(normalizeRfid('1234 5678'), '1234 5678')
  assert.equal(typeof normalizeRfid('00123456'), 'string')
})

test('STUDENT RFID: the API applies it to each student, refuses anything but text, and keeps the leading zeros', () => {
  for (const [field, set] of STUDENT_RFID_FIELDS) {
    for (const value of STUDENT_RFID_REFUSED) refuses(change((p) => set(p, value)), field, `${field} = ${JSON.stringify(value)}`)
    for (const value of STUDENT_RFID_ACCEPTED) {
      // One RFID per student: the other two hold values that cannot collide with the tested one.
      const result = change((p) => { p.students.forEach((student, index) => { student.rfid = `4444444${index}` }); set(p, value) })
      accepts(result, `${field} = ${value}`)
    }
  }
  // An identifier is text: a JSON number has already lost its leading zeros.
  const number = change((p) => { p.students[0].rfid = 123456 })
  refuses(number, 'students[0].rfid')
  assert.match(number.message, /text/)
  refuses(change((p) => { delete p.students[1].rfid }), 'students[1].rfid')
  refuses(change((p) => { p.students[2].rfid = null }), 'students[2].rfid')
  assert.match(change((p) => { p.students[0].rfid = '1234567' }).message, /student RFID must contain exactly 8 digits/)

  const kept = change((p) => { p.students[0].rfid = ' 00000001 ' })
  assert.equal(kept.value.students[0].rfid, '00000001')
  assert.equal(typeof kept.value.students[0].rfid, 'string')
  assert.notEqual(kept.value.students[0].rfid, '1')
})

test('STUDENT RFID: unique inside a registration, in the form and in the API', () => {
  refuses(change((p) => { p.students[1].rfid = '12345678'; p.students[0].rfid = '12345678' }), 'students[1].rfid')
  refuses(change((p) => { p.students[2].rfid = p.students[0].rfid }), 'students[2].rfid')
  accepts(change((p) => { p.students[0].rfid = '12345678'; p.students[1].rfid = '12345679'; p.students[2].rfid = '12345680' }), 'three different RFIDs')
  // Compared after trimming, like everything else.
  refuses(change((p) => { p.students[1].rfid = ` ${p.students[0].rfid} ` }), 'students[1].rfid')

  const students = [1, 2, 3].map((position) => ({
    id: `student-${position}`, position, fullName: 'Betkaoui Mohammed', phone: '0550000001', bacYear: '2022', rfid: `1234567${position}`, studentCard: { type: 'image/png', size: 10 },
  }))
  assert.deepEqual(studentIssues(students[1], students), {})
  const clash = students.map((student) => ({ ...student, rfid: ' 12345678 ' }))
  assert.equal(studentIssues(clash[1], clash).rfid, 'Each student needs their own RFID.')
})

test('DELEGATION RFID: NOT the student rule — the head of delegation and the driver keep the technical bound', () => {
  // Valid for a delegation member, invalid for a student.
  for (const value of ['A1B2C3D4', 'TEST-HEAD-0001', '00471236', '1', '123', '1234567', '123456789', '1234 5678', 'x'.repeat(64)]) {
    assert.equal(isValidDelegationRfid(value), true, `delegation: ${value}`)
    if (value !== '00471236') assert.equal(isValidStudentRfid(value), false, `student: ${value}`)
  }
  for (const value of ['', 'x'.repeat(65), 'AB\u0000CD', 'AB\tCD', 'AB\nCD']) assert.equal(isValidDelegationRfid(value), false, JSON.stringify(value))
  for (const subject of ['delegationHead', 'driver']) {
    for (const value of ['A1B2C3D4', 'TEST-0001', '1234567', 'x'.repeat(64)]) accepts(change((p) => { p[subject].rfid = value }), `${subject}.rfid = ${value}`)
    for (const value of ['', '   ', 'x'.repeat(65), 'AB\u0000CD', 71236]) refuses(change((p) => { p[subject].rfid = value }), `${subject}.rfid`, `${subject}.rfid = ${JSON.stringify(value)}`)
  }
  // No generic "isValidRfid" is left to be applied to the wrong kind of person.
  assert.equal('isValidRfid' in contract, false)
  assert.equal('rfid' in LIMITS, false)
  assert.deepEqual([...LIMITS.delegationRfid], [1, 64])
  // The form uses the delegation rule for them: a 7-character RFID passes there, and fails for a student.
  assert.equal('rfid' in personIssues({ fullName: 'Karim Haddad', phone: '0661234567', rfid: '1234567' }), false)
  assert.equal('rfid' in studentIssues({ id: 's', fullName: 'Karim Haddad', phone: '0661234567', bacYear: '2022', rfid: '1234567', studentCard: { type: 'image/png', size: 1 } }, []), true)
})

// ---------------------------------------------------------------------------------------
// 3. BAC YEAR — 2019 to 2026, fixed for the edition
// ---------------------------------------------------------------------------------------

test('BAC YEAR: 2019 to 2026 inclusive, an integer, whatever the date', () => {
  assert.deepEqual({ ...BAC_YEAR_RANGE }, { min: 2019, max: 2026 })
  for (const year of [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]) assert.equal(isValidBacYear(year), true, String(year))
  for (const year of [2018, 2027, 2028, 1990, 1989, 2100, 0, -2023, 2023.5, NaN, Infinity, '2023', 'BAC 2023', null, undefined, [], {}]) {
    assert.equal(isValidBacYear(year), false, String(year))
  }
  // A string from the form is normalised to the integer first — and only a four-digit one.
  assert.equal(normalizeBacYear('2023'), 2023)
  assert.equal(normalizeBacYear(' 2023 '), 2023)
  for (const bad of ['BAC 2023', '2023/2024', '023', '20230', '2023.5', '', null, undefined, 2023.5]) assert.equal(normalizeBacYear(bad), null, String(bad))
  // The clock is not an input: an extra "now" changes nothing, and the source never reads one for this rule.
  assert.equal(isValidBacYear(2027, new Date('2040-01-01')), false)
  assert.equal(isValidBacYear(2019, new Date('2019-01-01')), true)
})

test('BAC YEAR: the select offers exactly 2019 to 2026 (most recent first) and nothing else', () => {
  assert.deepEqual(bacYearChoices(), [2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019])
  const options = getBacYearOptions(getRegistrationStrings('en'), bacYearChoices())
  assert.deepEqual(options.map(({ value }) => value), ['', '2026', '2025', '2024', '2023', '2022', '2021', '2020', '2019'])
  // Every offered year is one the API accepts, and every year the API accepts is offered.
  for (const { value } of options.slice(1)) assert.equal(isValidBacYear(Number(value)), true)
  assert.deepEqual(new Set(bacYearChoices()), new Set([...Array(BAC_YEAR_RANGE.max - BAC_YEAR_RANGE.min + 1)].map((_, i) => BAC_YEAR_RANGE.min + i)))
})

test('BAC YEAR: the API refuses any other year, sent by hand', () => {
  for (const [field, set] of STUDENT_BAC_FIELDS) {
    for (const value of [2018, 2027, 2028, 1990, 1989, 2100, 2023.5, '2023', 'BAC 2023', '2023/2024', -1, 0, null, [], {}, true]) {
      refuses(change((p) => set(p, value)), field, `${field} = ${JSON.stringify(value)}`)
    }
    for (const value of [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]) accepts(change((p) => set(p, value)), `${field} = ${value}`)
  }
  refuses(change((p) => { delete p.students[0].bacYear }), 'students[0].bacYear')
  refuses(change((p) => { p.students[1].bacYear = '' }), 'students[1].bacYear')
  assert.match(change((p) => { p.students[2].bacYear = 2027 }).message, /BAC year must be between 2019 and 2026/)
  assert.match(change((p) => { delete p.students[2].bacYear }).message, /required/)
})

test('BAC YEAR: a draft saved before this rule, holding another year, is not restored into the select', async () => {
  const hook = await read('src/pages/aivex/register/useCompetitionRegistration.js')
  assert.match(hook, /const offeredYears = bacYearChoices\(\)\.map\(String\)/)
  assert.match(hook, /bacYear: offeredYears\.includes\(typed\.bacYear\) \? typed\.bacYear : ''/)
})

// ---------------------------------------------------------------------------------------
// 4. PERSON NAMES — Unicode letters and spaces, 3 to 120 characters
// ---------------------------------------------------------------------------------------

const NAMES_ACCEPTED = [
  'Mohammed', 'Mohammed Amine', 'Betkaoui Mohammed', 'عبد الرحمان', 'محمد أمين', 'Ali', 'علي', 'Ait Ahmed', 'José Núñez', 'Ünal Çelik', 'Zoë',
  // Arabic with its vowel signs, and a name typed with an extra tatweel.
  'مُحَمَّد', 'أَمِين', 'محـمد',
  // Other scripts are letters too.
  'Иван Петров', '王小明',
  'élie Dupont', // a decomposed é: normalised, then valid
]
const NAMES_REFUSED = [
  'Mohammed123', 'Mohammed@', 'Mohammed_Amine', 'Mohammed.Amine', 'Mohammed/Amine', '123456', 'محمد123', 'عبد-الرحمان',
  'Mohammed\\Amine', 'Mohammed*', 'Mohammed#1', 'Mohammed,Amine', "O'Brien", 'Ait M’Hamed', 'Jean-Pierre', 'Mohammed (Amine)', 'Amine:', 'A+B',
  'Mo😀', '😀😀😀', 'محمد٣', 'Ali²', 'Ⅳ Ali', 'a1b', '12', '_', '@@@', 'َََ', 'َAli',
]

test('NAME: letters and spaces only — Unicode-aware, no digit, punctuation, symbol or emoji', () => {
  for (const value of NAMES_ACCEPTED) assert.equal(personNameIssue(value), '', JSON.stringify(value))
  for (const value of NAMES_REFUSED) assert.notEqual(personNameIssue(value), '', JSON.stringify(value))
  for (const value of ['Mohammed123', 'Mohammed@', 'Mohammed_Amine', 'Mohammed.Amine', 'Mohammed/Amine', '123456', 'محمد123', 'عبد-الرحمان', 'Ab123']) {
    assert.equal(personNameIssue(value), 'chars', value)
  }
  assert.equal(isValidPersonName('Mohammed Amine'), true)
  assert.equal(isValidPersonName('Mohammed123'), false)
})

test('NAME: the length rule (3 to 120) is kept, and the characters are judged first', () => {
  assert.deepEqual([...LIMITS.fullName], [3, 120])
  assert.equal(personNameIssue('Ab'), 'short')
  assert.equal(personNameIssue('عب'), 'short')
  assert.equal(personNameIssue('A'), 'short')
  assert.equal(personNameIssue('Ab123'), 'chars', 'long enough, but not a name')
  assert.equal(personNameIssue('12'), 'chars', 'too short AND not a name: the characters are reported')
  assert.equal(personNameIssue('Ali'), '')
  assert.equal(personNameIssue('علي'), '')
  assert.equal(personNameIssue('A'.repeat(120)), '')
  assert.equal(personNameIssue('ع'.repeat(120)), '')
  assert.equal(personNameIssue('A'.repeat(121)), 'long')
  assert.equal(personNameIssue(`${'Ab '.repeat(39)}Ab`), '', '119 characters of words and spaces')
  assert.equal(personNameIssue(`${'Ab '.repeat(40)}Cd`), 'long', '122 characters of words and spaces')
  assert.equal(personNameIssue('A'.repeat(60) + ' ' + 'B'.repeat(59)), '', 'exactly 120 characters, one space included')
  assert.equal(personNameIssue('A'.repeat(60) + ' ' + 'B'.repeat(60)), 'long', '121 characters')
  for (const empty of ['', '   ', '\t\n', null, undefined, 123, [], {}, '\u200f']) assert.equal(personNameIssue(empty), 'required', JSON.stringify(empty))
  // Never quadratic on hostile input.
  const started = Date.now()
  assert.equal(personNameIssue(`${'a'.repeat(60000)}!`), 'chars')
  assert.equal(personNameIssue('a '.repeat(30000)), 'long')
  assert.ok(Date.now() - started < 1500, 'the name check is linear')
})

test('NAME: the API applies it to all six name fields', () => {
  for (const [field, set] of NAME_FIELDS) {
    for (const value of [...NAMES_REFUSED, 'Ab', 'A'.repeat(121), '', '   ', 123, null, undefined, [], {}]) {
      refuses(change((p) => set(p, value)), field, `${field} = ${JSON.stringify(value)}`)
    }
    for (const value of NAMES_ACCEPTED) accepts(change((p) => set(p, value)), `${field} = ${JSON.stringify(value)}`)
  }
  assert.match(change((p) => { p.driver.fullName = 'Nabil123' }).message, /name must contain letters and spaces only/)
  assert.match(change((p) => { p.driver.fullName = 'Na' }).message, /3 to 120 characters/)
})

test('NAME: normalised before validating — NFC, control characters, spacing — and the spelling is never touched', () => {
  assert.equal(normalizePersonName('  Mohammed    Amine  '), 'Mohammed Amine', 'trimmed and collapsed: no space is kept at either end')
  assert.equal(normalizePersonName('Mohammed\t\nAmine'), 'Mohammed Amine')
  assert.equal(normalizePersonName('Mohammed\u00a0\u3000Amine'), 'Mohammed Amine', 'exotic spaces become one space')
  assert.equal(normalizePersonName('Mohammed\u0000Amine'), 'Mohammed Amine', 'a control character becomes a space, it never reaches the database')
  assert.equal(normalizePersonName('é'), 'é', 'NFC')
  // Invisible directional marks from pasted Arabic text are dropped: they change no letter.
  assert.equal(normalizePersonName('محمد\u200f أمين\u200e'), 'محمد أمين')
  assert.equal(normalizePersonName('\u202bعبد\u202c الرحمان'), 'عبد الرحمان')
  assert.equal(personNameIssue('محمد\u200f أمين'), '', 'so a pasted name does not fail for a reason nobody can see')
  // Spelling and case: exactly as typed. No transliteration, no upper/lower-casing.
  for (const name of ['Mohammed', 'MOHAMMED', 'mohammed', 'MoHaMmEd', 'عبد الرحمان', 'Ünal', 'ÉLIE']) assert.equal(normalizePersonName(name), name)
  assert.equal(normalizePersonName(123), '')
  assert.equal(normalizePersonName(null), '')

  const stored = change((p) => {
    p.activityOfficial.fullName = '  Amina    Benali  '
    p.delegationHead.fullName = 'Karim\u00a0Haddad'
    p.driver.fullName = 'NABIL saidi'
    p.students[1].fullName = 'عبد   الرحمان'
  })
  accepts(stored, 'names to normalise')
  assert.equal(stored.value.activityOfficial.fullName, 'Amina Benali')
  assert.equal(stored.value.delegationHead.fullName, 'Karim Haddad')
  assert.equal(stored.value.driver.fullName, 'NABIL saidi')
  assert.equal(stored.value.students[1].fullName, 'عبد الرحمان')
})

// ---------------------------------------------------------------------------------------
// 5. Team name, e-mail, institution, role, students, consent, submission id
// ---------------------------------------------------------------------------------------

test('TEAM NAME: a separate rule — digits, punctuation and technical terms stay allowed', () => {
  for (const name of ['Null Pointers', '404 Not Found', 'AI Warriors', 'Team_42', 'C++ Crew!', 'Ab', 'فريق 42', 'The-Team #1']) {
    accepts(change((p) => { p.team.name = name }), name)
    assert.deepEqual(teamIssues({ name, wilaya: '34', institution: 'univ-bba', customInstitution: '' }), {}, name)
  }
  // Still required and bounded, and still normalised (not the person-name rule).
  refuses(change((p) => { p.team.name = 'A' }), 'team.name')
  refuses(change((p) => { p.team.name = '  ' }), 'team.name')
  refuses(change((p) => { p.team.name = 'A'.repeat(121) }), 'team.name')
  refuses(change((p) => { p.team.name = 4242 }), 'team.name')
  accepts(change((p) => { p.team.name = 'A'.repeat(120) }), '120')
  assert.equal(change((p) => { p.team.name = '  Null   Pointers  ' }).value.team.name, 'Null Pointers')
  assert.equal(personNameIssue('404 Not Found'), 'chars', 'so it is NOT what a team name is checked with')
  assert.equal(normalizeText('  a\u0000b  '), 'a b')
})

test('EMAIL: unchanged — syntax, length, lowercase — with no domain restriction and no control character', () => {
  for (const email of ['activities@univ-bba.dz', 'someone@gmail.com', 'a.b+tag@sub.example.org', 'x@y.dz', 'Amina@Univ-BBA.DZ']) {
    accepts(change((p) => { p.activityOfficial.email = email }), email)
  }
  assert.equal(change((p) => { p.activityOfficial.email = '  Amina@Univ-BBA.DZ ' }).value.activityOfficial.email, 'amina@univ-bba.dz')
  assert.equal(normalizeEmail(' A@B.CO '), 'a@b.co')
  for (const email of ['', 'not-an-email', 'a@b', '@b.com', 'a@@b.com', 'a b@c.com', 'a@b.com extra', 'a\u0000@b.com', 'a@b.c\u0000om', 'a@b\u200f.com', 'a\n@b.com', 42, null]) {
    refuses(change((p) => { p.activityOfficial.email = email }), 'activityOfficial.email', JSON.stringify(email))
  }
  const local = 'a'.repeat(254 - '@example.com'.length)
  accepts(change((p) => { p.activityOfficial.email = `${local}@example.com` }), '254 characters')
  refuses(change((p) => { p.activityOfficial.email = `a${local}@example.com` }), 'activityOfficial.email', '255 characters')
  assert.equal(isValidEmail('a@b.co'), true)
  assert.equal(isValidEmail('a\u0000@b.co'), false)
})

test('WILAYA / INSTITUTION: consistency is decided by the dataset, never by what the browser sent', () => {
  const [first, second] = algerianWilayas
  const foreign = second.institutions[0]
  assert.notEqual(first.code, second.code)
  const setTeam = (wilayaCode, institution) => change((p) => { p.team.wilaya = { code: wilayaCode, name: 'x' }; p.team.institution = institution })

  accepts(setTeam(first.code, { id: first.institutions[0].id, name: 'whatever', custom: false }), 'a listed institution of the chosen wilaya')
  // An institution of ANOTHER wilaya, and arbitrary ids.
  refuses(setTeam(first.code, { id: foreign.id, name: foreign.name, custom: false }), 'team.institution.id', 'foreign institution')
  for (const id of ['made-up', '__proto__', 'constructor', 'toString', 'hasOwnProperty', '', ' univ-bba ', 'UNIV-BBA', 'univ-bba\u0000', 42, null, undefined]) {
    refuses(setTeam('34', { id, name: 'x', custom: false }), 'team.institution.id', JSON.stringify(id))
  }
  // "other" is a custom institution, and only that.
  refuses(setTeam('34', { id: 'other', name: 'Some School', custom: false }), 'team.institution.id', 'other but not custom')
  refuses(setTeam('34', { id: 'univ-bba', name: 'Some School', custom: true }), 'team.institution.id', 'custom with a listed id')
  refuses(setTeam('34', { id: 'other', name: '', custom: true }), 'team.institution.name', 'custom without a name')
  refuses(setTeam('34', { id: 'other', name: 'AB', custom: true }), 'team.institution.name', 'custom, too short')
  refuses(setTeam('34', { id: 'other', name: 'A'.repeat(181), custom: true }), 'team.institution.name', 'custom, too long')
  for (const custom of ['true', 1, undefined, null]) refuses(setTeam('34', { id: 'other', name: 'Some School', custom }), 'team.institution.custom', String(custom))
  const custom = setTeam('34', { id: 'other', name: '  École   Supérieure X ', custom: true })
  accepts(custom, 'a real custom institution')
  assert.deepEqual(custom.value.team.institution, { id: 'other', name: 'École Supérieure X', custom: true })
  // The official record is resolved here, from the dataset: a forged label is replaced.
  const listed = setTeam('34', { id: 'univ-bba', name: 'Forged Name', custom: false })
  assert.equal(listed.value.team.institution.name, 'Université Mohamed El Bachir El Ibrahimi de Bordj Bou Arréridj')
  assert.equal(listed.value.team.wilaya.name, 'Bordj Bou Arréridj')
  // Wilaya codes: exactly the two-digit code, nothing around it.
  for (const code of ['99', '00', '59', '1', '034', ' 34 ', '34\u0000', '34 ', 34, null, undefined, '', 'aa']) {
    refuses(setTeam(code, { id: 'univ-bba', name: 'x', custom: false }), 'team.wilaya.code', JSON.stringify(code))
  }
  refuses(change((p) => { p.team.institution.extra = 1 }), 'team.institution.extra')
  refuses(change((p) => { p.team.wilaya.extra = 1 }), 'team.wilaya.extra')
  refuses(change((p) => { p.team.wilaya = null }), 'team.wilaya')
  refuses(change((p) => { p.team.institution = 'univ-bba' }), 'team.institution')
})

test('ROLE: only the two internal values, exactly — never a label, never padded', () => {
  for (const role of ['sub_director_activities', 'activities_officer']) accepts(change((p) => { p.activityOfficial.role = role }), role)
  for (const role of ['Activities Officer', 'Sub-director of Activities', 'مسؤول النشاطات', 'president', '', ' activities_officer', 'activities_officer ', 'ACTIVITIES_OFFICER', 'activities_officer\u0000', null, undefined, 1, ['activities_officer']]) {
    refuses(change((p) => { p.activityOfficial.role = role }), 'activityOfficial.role', JSON.stringify(role))
  }
})

test('STUDENTS: exactly three, in positions 1, 2 and 3, as integers', () => {
  refuses(change((p) => { p.students = [] }), 'students')
  refuses(change((p) => { p.students = p.students.slice(0, 1) }), 'students')
  refuses(change((p) => { p.students = p.students.slice(0, 2) }), 'students')
  refuses(change((p) => { p.students.push({ ...p.students[0], position: 4, studentCard: 'studentCard_4', rfid: '11111111' }) }), 'students')
  for (const bad of [null, undefined, {}, 'students', 3, { 0: {}, 1: {}, 2: {}, length: 3 }]) refuses(change((p) => { p.students = bad }), 'students', JSON.stringify(bad))
  for (const [index, position] of [[0, 0], [0, 4], [0, '1'], [0, '01'], [0, null], [0, undefined], [0, 1.5], [0, 2], [1, 1], [2, 2], [2, '3'], [1, [2]]]) {
    refuses(change((p) => { p.students[index].position = position }), `students[${index}].position`, `students[${index}].position = ${JSON.stringify(position)}`)
  }
  refuses(change((p) => { p.students[1].position = 1 }), 'students[1].position', 'a duplicated position')
  refuses(change((p) => { p.students[0].studentCard = 'studentCard_2' }), 'students[0].studentCard')
  refuses(change((p) => { p.students[1].extra = true }), 'students[1].extra')
  refuses(change((p) => { p.students[2] = null }), 'students[2]')
  const ok = change(() => {})
  assert.deepEqual(ok.value.students.map((student) => student.position), [1, 2, 3])
  assert.ok(ok.value.students.every((student) => Number.isInteger(student.position)))
})

test('CONSENT and SUBMISSION ID: strict, never coerced', () => {
  for (const consent of [false, null, undefined, 'true', 'TRUE', 1, 'on', 'yes', [true], {}, 0]) refuses(change((p) => { p.consent = consent }), 'consent', JSON.stringify(consent))
  accepts(change((p) => { p.consent = true }), 'consent true')

  const v1 = 'c232ab00-9414-11ec-b3c8-9f6bdeced846'
  for (const id of [v1, 'abc', '', undefined, null, 42, 'not-a-uuid-at-all', '3f2b8c1e9a4d4e6f8b2a1c3d5e7f9a0b', '3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0', `${SUBMISSION_ID} `, '3f2b8c1e-9a4d-5e6f-8b2a-1c3d5e7f9a0b', '3f2b8c1e-9a4d-4e6f-cb2a-1c3d5e7f9a0b', ['x']]) {
    refuses(change((p) => { p.submissionId = id }), 'submissionId', JSON.stringify(id))
  }
  refuses(change((p) => { delete p.submissionId }), 'submissionId', 'missing')
  assert.equal(change((p) => { p.submissionId = SUBMISSION_ID.toUpperCase() }).value.submissionId, SUBMISSION_ID)
  // The reference belongs to the server.
  refuses(change((p) => { p.reference = 'AIVEX2-CHOSEN00' }), 'reference')
})

test('CONTRACT SHAPE: closed objects, no legacy v3 field, no server-owned field, no prototype tricks', () => {
  refuses(change((p) => { p.extra = 1 }), 'extra')
  refuses(change((p) => { p.activityOfficial.nationalId = '123456789' }), 'activityOfficial.nationalId')
  refuses(change((p) => { p.delegationHead.nationalId = '123456789' }), 'delegationHead.nationalId')
  refuses(change((p) => { p.students[0].registrationNumber = '202133046094' }), 'students[0].registrationNumber')
  for (const key of ['id', 'status', 'registrationStatus', 'documentStatus', 'submittedAt', 'source', 'createdAt']) {
    const result = change((p) => { p[key] = 'x' })
    refuses(result, key)
    assert.match(result.message, /assigned by the server/)
  }
  for (const [edition, formVersion] of [[1, 4], [3, 4], ['2', 4], [2, 3], [2, '4'], [2, 5], [undefined, 4]]) {
    const result = change((p) => { p.edition = edition; p.formVersion = formVersion })
    assert.equal(result.ok, false, `${edition}/${formVersion}`)
  }
  // __proto__ arrives as a real own key when the payload comes from JSON.parse.
  const crafted = JSON.parse(`{"__proto__": {"polluted": true}, ${JSON.stringify(validPayload()).slice(1)}`)
  assert.deepEqual(Object.keys(crafted).slice(0, 1), ['__proto__'])
  assert.equal(validateRegistrationV4(crafted).ok, false)
  assert.equal(Object.prototype.polluted, undefined)
  for (const notAnObject of [null, undefined, 'x', 42, [], true]) assert.equal(validateRegistrationV4(notAnObject).ok, false)
})

test('CONTROL CHARACTERS: a text field never keeps one, and a token or number field refuses one', () => {
  const walk = (value, visit) => {
    if (typeof value === 'string') visit(value)
    else if (Array.isArray(value)) value.forEach((item) => walk(item, visit))
    else if (value && typeof value === 'object') Object.values(value).forEach((item) => walk(item, visit))
  }
  const dirty = change((p) => {
    p.team.name = 'Null\u0000Pointers\u0007'
    p.team.institution = { id: 'other', name: 'Some\u0000 School', custom: true }
    p.activityOfficial.fullName = 'Amina\u0000Benali\u001f'
    p.delegationHead.fullName = 'Karim\u200fHaddad\u0085'
    p.students[0].fullName = 'Betkaoui\tMohammed'
  })
  accepts(dirty, 'control characters in free text are turned into spaces')
  walk(dirty.value, (text) => assert.doesNotMatch(text, /[\p{Cc}\p{Cf}]/u, JSON.stringify(text)))
  assert.equal(dirty.value.team.name, 'Null Pointers')
  // A phone, an RFID, an e-mail, a role, an id or a code with one is simply invalid (never silently repaired).
  refuses(change((p) => { p.driver.phone = '0770\u0000123456' }), 'driver.phone')
  refuses(change((p) => { p.students[0].rfid = '0012\u00003456' }), 'students[0].rfid')
  refuses(change((p) => { p.delegationHead.rfid = 'A1\u0000B2' }), 'delegationHead.rfid')
  refuses(change((p) => { p.activityOfficial.email = 'a\u0000@b.com' }), 'activityOfficial.email')
  refuses(change((p) => { p.team.wilaya.code = '3\u00004' }), 'team.wilaya.code')
  // Whatever it is, the accepted payload is all clean text.
  walk(change(() => {}).value, (text) => assert.doesNotMatch(text, /[\p{Cc}\p{Cf}]/u))
})

test('TYPES: a wrong type anywhere is a clean refusal, never an exception', () => {
  const paths = [
    (p, v) => { p.team.name = v }, (p, v) => { p.team.wilaya.code = v }, (p, v) => { p.team.institution.id = v },
    (p, v) => { p.activityOfficial.role = v }, (p, v) => { p.activityOfficial.fullName = v }, (p, v) => { p.activityOfficial.email = v },
    (p, v) => { p.activityOfficial.phone = v }, (p, v) => { p.delegationHead.fullName = v }, (p, v) => { p.delegationHead.phone = v },
    (p, v) => { p.delegationHead.rfid = v }, (p, v) => { p.driver.rfid = v }, (p, v) => { p.students[0].fullName = v },
    (p, v) => { p.students[1].phone = v }, (p, v) => { p.students[2].rfid = v }, (p, v) => { p.students[0].bacYear = v },
  ]
  for (const set of paths) {
    for (const value of [1, 0, -1, 1.5, NaN, true, false, [], ['x'], {}, { a: 1 }, null, undefined, () => 1, Symbol.iterator, 10n]) {
      let result
      assert.doesNotThrow(() => { result = change((p) => set(p, value)) }, String(typeof value))
      assert.equal(result.ok, false)
      assert.equal(result.status, 400)
    }
  }
})

// ---------------------------------------------------------------------------------------
// 6. The form and the API always agree (matrix + seeded fuzz)
// ---------------------------------------------------------------------------------------

const random = (seed) => {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
}
const pick = (next, list) => list[Math.floor(next() * list.length)]
const chars = (next, alphabet, count) => Array.from({ length: count }, () => pick(next, alphabet)).join('')

const fuzzPhones = (next) => Array.from({ length: 700 }, (_, index) => {
  const digits = [...'0123456789']
  switch (index % 4) {
    case 0: return `0${pick(next, [...'4567890'])}${chars(next, digits, pick(next, [6, 7, 8, 8, 8, 9]))}`
    case 1: {
      const base = `0${pick(next, [...'567'])}${chars(next, digits, 8)}`
      // Half of these use only harmless separators (valid once dropped), half any of them.
      const separators = next() < 0.5 ? ['', '', ' ', '-', '.', '\u00a0', '\t'] : ['', '', '', ' ', '-', '.', '/', '(', ')', '_', '\u00a0', '\t']
      return [...base].map((digit) => digit + pick(next, separators)).join('')
    }
    case 2: return `${pick(next, ['+213', '00213', '213', '+', ''])}${pick(next, ['5', '6', '7', '05', '06', '07'])}${chars(next, digits, pick(next, [7, 8, 9]))}`
    default: return chars(next, [...digits, ' ', '-', '.', '+', 'A', '٥', '\u0000'], Math.floor(next() * 14))
  }
})
const fuzzNames = (next) => {
  const alphabet = ['a', 'B', 'z', 'é', 'ü', 'ع', 'م', 'د', 'ـ', 'َ', ' ', ' ', ' ', '  ', '1', '٣', '-', '_', '.', '@', "'", '\u200f', '\u0000', '\t', '😀', '中', 'ß']
  return Array.from({ length: 700 }, (_, index) => (index % 25 === 0 ? chars(next, ['a', 'ع', ' '], 100 + Math.floor(next() * 40)) : chars(next, alphabet, Math.floor(next() * 12))))
}
const fuzzStudentRfids = (next) => Array.from({ length: 700 }, (_, index) => {
  if (index % 3 === 0) return chars(next, [...'0123456789'], pick(next, [6, 7, 8, 8, 8, 9, 10]))
  return chars(next, [...'0123456789', ' ', 'A', 'b', '-', '٣'], Math.floor(next() * 11))
})

const formStudents = () => [1, 2, 3].map((position) => ({
  id: `student-${position}`, position, fullName: 'Betkaoui Mohammed', phone: '0550000001', bacYear: '2022', rfid: `1234567${position}`, studentCard: { type: 'image/png', size: 10 },
}))

test('AGREEMENT: on hundreds of generated values, the form and the API accept and refuse exactly the same', () => {
  const next = random(20260923)
  let accepted = 0
  let refused = 0
  const tally = (ok) => { if (ok) accepted += 1; else refused += 1 }
  const official = { role: 'activities_officer', fullName: 'Amina Benali', email: 'a@univ-bba.dz', phone: '0555123456' }
  const person = { fullName: 'Karim Haddad', phone: '0661234567', rfid: '00471236' }

  for (const value of [...PHONES_ACCEPTED, ...PHONES_REFUSED, ...fuzzPhones(next)]) {
    const api = change((p) => { p.activityOfficial.phone = value }).ok
    tally(api)
    assert.equal(!officialIssues({ ...official, phone: value }).phone, api, `official phone ${JSON.stringify(value)}`)
    assert.equal(!personIssues({ ...person, phone: value }).phone, change((p) => { p.driver.phone = value }).ok, `driver phone ${JSON.stringify(value)}`)
    assert.equal(!studentIssues({ ...formStudents()[0], phone: value }, formStudents()).phone, change((p) => { p.students[0].phone = value }).ok, `student phone ${JSON.stringify(value)}`)
  }
  assert.ok(accepted > 150 && refused > 150, `phones: both outcomes exercised (${accepted}/${refused})`)

  accepted = 0
  refused = 0
  for (const value of [...NAMES_ACCEPTED, ...NAMES_REFUSED, ...fuzzNames(next)]) {
    const api = change((p) => { p.activityOfficial.fullName = value }).ok
    tally(api)
    assert.equal(!officialIssues({ ...official, fullName: value }).fullName, api, `official name ${JSON.stringify(value)}`)
    assert.equal(!personIssues({ ...person, fullName: value }).fullName, change((p) => { p.delegationHead.fullName = value }).ok, `head name ${JSON.stringify(value)}`)
    assert.equal(!studentIssues({ ...formStudents()[0], fullName: value }, formStudents()).fullName, change((p) => { p.students[2].fullName = value }).ok, `student name ${JSON.stringify(value)}`)
  }
  assert.ok(accepted > 60 && refused > 300, `names: both outcomes exercised (${accepted}/${refused})`)

  accepted = 0
  refused = 0
  for (const value of [...STUDENT_RFID_ACCEPTED, ...STUDENT_RFID_REFUSED, ...fuzzStudentRfids(next)]) {
    // The other two students hold RFIDs that cannot collide with the value under test (uniqueness is its own rule).
    const api = change((p) => { p.students[0].rfid = value; p.students[1].rfid = '44444441'; p.students[2].rfid = '44444442' }).ok
    tally(api)
    assert.equal(!studentIssues({ ...formStudents()[0], rfid: value }, [formStudents()[0]]).rfid, api, `student rfid ${JSON.stringify(value)}`)
  }
  assert.ok(accepted > 50 && refused > 300, `student RFIDs: both outcomes exercised (${accepted}/${refused})`)

  // The delegation RFID has its own rule — the form and the API agree on that one too.
  for (const value of ['A1B2C3D4', '1234567', '', '   ', 'x'.repeat(65), 'AB\u0000CD', ...fuzzStudentRfids(next).slice(0, 200)]) {
    assert.equal(!personIssues({ ...person, rfid: value }).rfid, change((p) => { p.delegationHead.rfid = value }).ok, `delegation rfid ${JSON.stringify(value)}`)
  }

  for (let year = -5; year <= 3000; year += 1) {
    const student = { ...formStudents()[0], bacYear: String(year) }
    // The payload builder sends the integer the form's text stands for.
    const api = change((p) => { p.students[0].bacYear = normalizeBacYear(String(year)) ?? String(year) }).ok
    assert.equal(!studentIssues(student, formStudents()).bacYear, api, `bac ${year}`)
    assert.equal(api, year >= 2019 && year <= 2026, `bac ${year}`)
  }
  for (const value of ['', ' ', 'BAC 2023', '2023/2024', '202', '20230', '2023.0', '٢٠٢٣']) {
    assert.equal(!studentIssues({ ...formStudents()[0], bacYear: value }, formStudents()).bacYear, false, JSON.stringify(value))
  }

  for (const email of ['a@b.co', 'a@b', '', ' ', 'A@B.CO', 'a\u0000@b.co', 'x'.repeat(250) + '@b.co', 'a b@c.d']) {
    assert.equal(!officialIssues({ ...official, email }).email, change((p) => { p.activityOfficial.email = email }).ok, `email ${JSON.stringify(email)}`)
  }
})

test('AGREEMENT: the form sends the canonical value the API stores', () => {
  const state = createRegistrationStateV4({ submissionId: SUBMISSION_ID })
  Object.assign(state.team, { name: '  Null   Pointers ', wilaya: '34', institution: 'univ-bba' })
  Object.assign(state.activityOfficial, { role: 'activities_officer', fullName: '  Amina   Benali ', email: ' Amina@Univ-BBA.dz ', phone: '0555 12 34 56' })
  Object.assign(state.delegationHead, { fullName: 'Karim\u00a0Haddad', phone: '0661-23-45-67', rfid: ' 00471236 ' })
  Object.assign(state.driver, { fullName: 'Nabil Saidi', phone: '0770.12.34.56', rfid: 'A1B2C3D4' })
  state.students.forEach((student, index) => Object.assign(student, {
    fullName: ['Betkaoui  Mohammed', 'عبد   الرحمان', 'محمد أمين'][index], phone: `0550 00 00 0${index + 1}`, bacYear: '2022', rfid: ` 0000000${index + 1} `,
  }))
  state.consent = true

  const payload = buildRegistrationPayloadV4(state)
  assert.deepEqual(
    [payload.activityOfficial.phone, payload.delegationHead.phone, payload.driver.phone, payload.students[0].phone],
    ['0555123456', '0661234567', '0770123456', '0550000001'],
  )
  assert.deepEqual([payload.activityOfficial.fullName, payload.delegationHead.fullName, payload.students[0].fullName, payload.students[1].fullName],
    ['Amina Benali', 'Karim Haddad', 'Betkaoui Mohammed', 'عبد الرحمان'])
  assert.deepEqual(payload.students.map((student) => student.rfid), ['00000001', '00000002', '00000003'])
  assert.ok(payload.students.every((student) => typeof student.rfid === 'string' && Number.isInteger(student.bacYear)))
  const validated = validateRegistrationV4(payload)
  accepts(validated, 'the built payload')
  // Validating what the form built changes nothing: it was already canonical.
  assert.deepEqual(validated.value.students, payload.students)
  assert.equal(validated.value.team.name, 'Null Pointers')
})

// ---------------------------------------------------------------------------------------
// 7. Straight to the API: a client that bypasses the form
// ---------------------------------------------------------------------------------------

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64')
const imageParts = () => [
  ...[1, 2, 3].map((n) => ({ field: `studentCard_${n}`, buffer: PNG, type: 'image/png', filename: `studentCard_${n}.png` })),
  { field: 'delegationHeadIdCard', buffer: PNG, type: 'image/png', filename: 'delegationHeadIdCard.png' },
  { field: 'driverIdCard', buffer: JPEG, type: 'image/jpeg', filename: 'driverIdCard.jpg' },
]

let requestCount = 0
const nextIp = () => {
  requestCount += 1
  return `10.${(requestCount >> 16) & 255}.${(requestCount >> 8) & 255}.${requestCount & 255}`
}

async function submit(handler, payload) {
  const form = new FormData()
  form.append('payload', JSON.stringify(payload))
  for (const { field, buffer, type, filename } of imageParts()) form.append(field, new Blob([buffer], { type }), filename)
  const response = new Response(form)
  const req = Readable.from([Buffer.from(await response.arrayBuffer())])
  Object.assign(req, { method: 'POST', headers: { 'content-type': response.headers.get('content-type'), 'x-forwarded-for': nextIp() }, socket: {} })
  return new Promise((resolve) => {
    const res = {
      headers: {},
      setHeader(name, value) { this.headers[name] = value },
      end(body) { resolve({ status: this.statusCode, body: JSON.parse(body) }) },
    }
    handler(req, res)
  })
}

// An in-memory backend that records EVERYTHING it is asked to do.
function createRecordingStore() {
  const registrations = []
  const students = []
  const objects = new Map()
  const calls = []
  const record = (name) => calls.push(name)
  return {
    registrations, students, objects, calls,
    async findBySubmissionId(submissionId) {
      record('find')
      const row = registrations.find((entry) => entry.submission_id === submissionId)
      if (!row) return null
      return {
        id: row.id, reference: row.reference, fingerprint: row.submission_fingerprint, createdAt: row.created_at,
        studentCount: students.filter((entry) => entry.registration_id === row.id).length, identityCardPaths: [],
      }
    },
    async insertRegistration(row) {
      record('insertRegistration')
      if (registrations.some((entry) => entry.submission_id === row.submission_id || entry.reference === row.reference)) return { ok: false, duplicate: true }
      registrations.push({ ...row, created_at: row.submitted_at })
      return { ok: true, id: row.id, reference: row.reference }
    },
    async uploadCard(path, buffer) { record('uploadCard'); objects.set(path, buffer.length) },
    async uploadIdentityCard(path, buffer) { record('uploadIdentityCard'); objects.set(path, buffer.length) },
    async insertStudents(rows) { record('insertStudents'); students.push(...rows) },
    async removeCards() { record('removeCards') },
    async removeIdentityCards() { record('removeIdentityCards') },
    async deleteRegistration() { record('deleteRegistration') },
  }
}

function makeApi() {
  const store = createRecordingStore()
  const opened = { store: 0, documents: 0, magicLink: 0 }
  let references = 0
  delete process.env.VERCEL
  const handler = createRegisterHandler({
    // Each factory counts how many times the handler reached for it: a request that is
    // refused by validation must reach for none of them.
    createStore: () => { opened.store += 1; return store },
    createDocumentStore: () => { opened.documents += 1; return null },
    createMagicLinkStore: () => { opened.magicLink += 1; return null },
    generateReference: () => { references += 1; return `AIVEX2-TEST${String(references).padStart(4, '0')}` },
    now: () => NOW,
  })
  return { store, handler, opened }
}

async function assertBlockedBeforeAnyWrite(mutate, field, label) {
  const { store, handler, opened } = makeApi()
  const payload = validPayload()
  mutate(payload)
  const { status, body } = await submit(handler, payload)
  assert.equal(status, 400, `${label}: ${JSON.stringify(body)}`)
  assert.equal(body.success, false, label)
  assert.equal(body.field, field, label)
  assert.equal(typeof body.message, 'string', label)
  assert.deepEqual(opened, { store: 0, documents: 0, magicLink: 0 }, `${label}: no backend was even opened`)
  assert.deepEqual(store.calls, [], `${label}: no database or storage call`)
  assert.equal(store.registrations.length + store.students.length + store.objects.size, 0, `${label}: no partial data`)
  assert.doesNotMatch(JSON.stringify(body), /supabase|postgres|stack|edition-\d|sb_secret|service_role/i, label)
}

test('BYPASS: a crafted request with an invalid phone is refused (400) before anything is opened, stored, generated or issued', async () => {
  for (const [field, set] of PHONE_FIELDS) {
    for (const value of ['+213555123456', '055512345', '0455123456', '05551234AB', '']) {
      await assertBlockedBeforeAnyWrite((p) => set(p, value), field, `${field} = ${JSON.stringify(value)}`)
    }
  }
})

test('BYPASS: a crafted request with an invalid student RFID is refused before any write', async () => {
  for (const [field, set] of STUDENT_RFID_FIELDS) {
    for (const value of ['1234567', '123456789', '1234567A', '1234 5678', 12345678, '']) {
      await assertBlockedBeforeAnyWrite((p) => set(p, value), field, `${field} = ${JSON.stringify(value)}`)
    }
  }
})

test('BYPASS: a crafted request with an invalid BAC year is refused before any write', async () => {
  for (const [field, set] of STUDENT_BAC_FIELDS) {
    for (const value of [2018, 2027, 1990, 2100, '2023', 2023.5, null]) {
      await assertBlockedBeforeAnyWrite((p) => set(p, value), field, `${field} = ${JSON.stringify(value)}`)
    }
  }
})

test('BYPASS: a crafted request with an invalid name is refused before any write', async () => {
  for (const [field, set] of NAME_FIELDS) {
    for (const value of ['Mohammed123', 'Mohammed_Amine', 'عبد-الرحمان', 'Ab', 'A'.repeat(121), '😀😀😀']) {
      await assertBlockedBeforeAnyWrite((p) => set(p, value), field, `${field} = ${JSON.stringify(value)}`)
    }
  }
})

test('BYPASS: the other tokens and identifiers a client could forge are refused before any write', async () => {
  await assertBlockedBeforeAnyWrite((p) => { p.activityOfficial.role = 'Activities Officer' }, 'activityOfficial.role', 'role label')
  await assertBlockedBeforeAnyWrite((p) => { p.team.institution = { id: 'made-up', name: 'x', custom: false } }, 'team.institution.id', 'made-up institution')
  await assertBlockedBeforeAnyWrite((p) => { p.team.institution = { id: algerianWilayas[1].institutions[0].id, name: 'x', custom: false } }, 'team.institution.id', 'institution of another wilaya')
  await assertBlockedBeforeAnyWrite((p) => { p.team.wilaya.code = '99' }, 'team.wilaya.code', 'wilaya')
  await assertBlockedBeforeAnyWrite((p) => { p.consent = 'true' }, 'consent', 'consent as text')
  await assertBlockedBeforeAnyWrite((p) => { p.submissionId = 'c232ab00-9414-11ec-b3c8-9f6bdeced846' }, 'submissionId', 'uuid v1')
  await assertBlockedBeforeAnyWrite((p) => { delete p.submissionId }, 'submissionId', 'no submission id')
  await assertBlockedBeforeAnyWrite((p) => { p.students.pop() }, 'students', 'two students')
  await assertBlockedBeforeAnyWrite((p) => { p.students[1].position = '2' }, 'students[1].position', 'position as text')
  await assertBlockedBeforeAnyWrite((p) => { p.students[1].rfid = p.students[0].rfid }, 'students[1].rfid', 'duplicated RFID')
  await assertBlockedBeforeAnyWrite((p) => { p.reference = 'AIVEX2-CHOSEN00' }, 'reference', 'client reference')
  await assertBlockedBeforeAnyWrite((p) => { p.driver.nationalId = '123456789' }, 'driver.nationalId', 'legacy field')
  await assertBlockedBeforeAnyWrite((p) => { p.activityOfficial.email = 'a\u0000@b.com' }, 'activityOfficial.email', 'NUL in the e-mail')
})

test('BYPASS (control): the same request, valid, goes through every stage — so the spies above are not vacuous', async () => {
  const { store, handler, opened } = makeApi()
  const { status, body } = await submit(handler, validPayload())
  assert.equal(status, 201)
  assert.match(body.reference, /^AIVEX2-TEST\d{4}$/)
  assert.deepEqual(opened, { store: 1, documents: 1, magicLink: 1 })
  assert.deepEqual(store.calls, ['find', 'insertRegistration', 'uploadCard', 'uploadCard', 'uploadCard', 'uploadIdentityCard', 'uploadIdentityCard', 'insertStudents'])
})

test('STORAGE: the database receives canonical text — ten-digit phones, 8-digit RFIDs with their zeros, integer years', async () => {
  const { store, handler } = makeApi()
  const payload = validPayload()
  payload.activityOfficial.phone = '0555 12 34 56'
  payload.delegationHead.phone = '0661-23-45-67'
  payload.driver.phone = '0770.12.34.56'
  payload.activityOfficial.fullName = '  Amina    Benali '
  payload.students[0].phone = '0550 00 00 01'
  payload.students[0].rfid = ' 00000001 '
  payload.students[1].rfid = '00123456'
  payload.students[2].rfid = '12345678'
  payload.students[2].bacYear = 2026
  const { status } = await submit(handler, payload)
  assert.equal(status, 201)
  const [row] = store.registrations
  assert.deepEqual([row.activity_official_phone, row.delegation_head_phone, row.driver_phone], ['0555123456', '0661234567', '0770123456'])
  assert.equal(row.activity_official_name, 'Amina Benali')
  assert.equal(row.delegation_head_rfid, '00471236')
  assert.equal(row.driver_rfid, 'A1B2C3D4', 'the delegation RFID keeps its own, wider rule')
  assert.deepEqual(store.students.map((student) => student.rfid_number), ['00000001', '00123456', '12345678'])
  assert.ok(store.students.every((student) => typeof student.rfid_number === 'string' && /^[0-9]{8}$/.test(student.rfid_number)))
  assert.ok(store.students.every((student) => typeof student.phone === 'string' && /^0[567][0-9]{8}$/.test(student.phone)))
  assert.deepEqual(store.students.map((student) => student.bac_year), [2022, 2023, 2026])
  assert.ok(store.students.every((student) => Number.isInteger(student.bac_year)))
  assert.equal(store.students[1].full_name, 'عبد الرحمان')
})

test('IDEMPOTENCE: the same submission typed with other separators is the same submission (canonical fingerprint)', async () => {
  const { store, handler } = makeApi()
  const first = await submit(handler, validPayload())
  assert.equal(first.status, 201)
  const retyped = validPayload()
  retyped.activityOfficial.phone = '0555 12 34 56'
  retyped.students[0].phone = '0550-00-00-01'
  retyped.activityOfficial.fullName = '  Amina   Benali  '
  const again = await submit(handler, retyped)
  assert.equal(again.status, 200)
  assert.deepEqual(again.body, { success: true, reference: first.body.reference, alreadyProcessed: true })
  assert.equal(store.registrations.length, 1)
  assert.equal(store.students.length, 3)
  // A real change of answer is still a conflict.
  const changed = validPayload()
  changed.driver.phone = '0770123457'
  assert.equal((await submit(handler, changed)).status, 409)
})

test('registerV4 still needs a validated registration: an unvalidated value is not a way around the rules', async () => {
  // The write path takes what validateRegistrationV4 returned and nothing else; the handler is
  // the only caller, and it validates first (see the BYPASS tests). Here, the shape it consumes.
  const validated = validateRegistrationV4(validPayload())
  assert.equal(validated.ok, true)
  assert.deepEqual(Object.keys(validated.value), ['submissionId', 'edition', 'formVersion', 'team', 'activityOfficial', 'delegationHead', 'driver', 'students', 'consent'])
  assert.equal(typeof registerV4, 'function')
  const handlerSource = await read('api/aivex/register/finalize.js')
  const validateAt = handlerSource.indexOf('validateRegistrationV4(body?.payload)')
  const filesAt = handlerSource.indexOf('verifyRegistrationStaging(')
  const storeAt = handlerSource.indexOf('registerV4({')
  assert.ok(validateAt > 0 && filesAt > validateAt && storeAt > filesAt, 'validation, then the files, then — and only then — the backend')
})

// ---------------------------------------------------------------------------------------
// 8. Messages: FR, EN and AR, dedicated keys
// ---------------------------------------------------------------------------------------

const PROMISED_MESSAGES = {
  fr: {
    errPhoneInvalid: 'Le numéro doit contenir exactement 10 chiffres et commencer par 05, 06 ou 07.',
    errStudentRfidInvalid: 'Le RFID étudiant doit contenir exactement 8 chiffres.',
    errBacYearInvalid: 'L’année du BAC doit être comprise entre 2019 et 2026.',
    errNameInvalid: 'Le nom doit contenir uniquement des lettres et des espaces.',
  },
  en: {
    errPhoneInvalid: 'The phone number must contain exactly 10 digits and start with 05, 06 or 07.',
    errStudentRfidInvalid: 'The student RFID must contain exactly 8 digits.',
    errBacYearInvalid: 'The BAC year must be between 2019 and 2026.',
    errNameInvalid: 'The name must contain letters and spaces only.',
  },
}
const NEW_KEYS = ['errPhoneInvalid', 'errStudentRfidInvalid', 'errBacYearInvalid', 'errNameInvalid', 'studentRfidHint', 'phoneHint', 'phonePlaceholder', 'bacYearHint']

test('MESSAGES: the French and English wording is exactly the one specified', () => {
  for (const [lang, messages] of Object.entries(PROMISED_MESSAGES)) {
    for (const [key, text] of Object.entries(messages)) assert.equal(registrationStrings[lang][key], text, `${lang}.${key}`)
  }
})

test('MESSAGES: Arabic has its own natural sentence for each rule — no Latin words, apart from the RFID acronym', () => {
  const ar = registrationStrings.ar
  for (const key of NEW_KEYS.filter((name) => name !== 'phonePlaceholder')) {
    assert.match(ar[key], /\p{Script=Arabic}/u, `ar.${key} is Arabic`)
    assert.doesNotMatch(ar[key].replace(/RFID/g, ''), /[A-Za-z]/, `ar.${key} is not mixed-language: ${ar[key]}`)
  }
  assert.match(ar.errPhoneInvalid, /10/)
  for (const prefix of ['05', '06', '07']) assert.ok(ar.errPhoneInvalid.includes(prefix), prefix)
  assert.match(ar.errStudentRfidInvalid, /8/)
  assert.match(ar.errStudentRfidInvalid, /RFID/)
  assert.ok(ar.errBacYearInvalid.includes('2019') && ar.errBacYearInvalid.includes('2026'))
})

test('MESSAGES: each rule has its own key in every language — no vague message is reused for it', () => {
  for (const lang of ['en', 'fr', 'ar']) {
    const t = registrationStrings[lang]
    for (const key of NEW_KEYS) assert.equal(typeof t[key], 'string', `${lang}.${key}`)
    assert.notEqual(t.errStudentRfidInvalid, t.errRfidInvalid, `${lang}: the student RFID message is not the delegation one`)
    assert.notEqual(t.errNameInvalid, t.errNameLength, `${lang}: "letters only" is not "3 to 120 characters"`)
    assert.notEqual(t.studentRfidHint, t.rfidHint, `${lang}: the student hint says 8 digits`)
    // The numbers in the words are the contract's numbers: changing the contract forces the wording to be revisited.
    assert.ok(t.errBacYearInvalid.includes(String(BAC_YEAR_RANGE.min)) && t.errBacYearInvalid.includes(String(BAC_YEAR_RANGE.max)), `${lang}.errBacYearInvalid`)
    assert.ok(t.bacYearHint.includes(String(BAC_YEAR_RANGE.min)) && t.bacYearHint.includes(String(BAC_YEAR_RANGE.max)), `${lang}.bacYearHint`)
    assert.match(t.errPhoneInvalid, /10/)
    assert.match(t.studentRfidHint, /8/)
    assert.match(t.errStudentRfidInvalid, /8/)
    for (const prefix of ['05', '06', '07']) assert.ok(t.phoneHint.includes(prefix) && t.errPhoneInvalid.includes(prefix), `${lang}: ${prefix}`)
    // The placeholder shows the national format, never the +213 form the rule refuses.
    assert.doesNotMatch(t.phonePlaceholder, /\+|213/)
    assert.match(t.phonePlaceholder, /^05/)
  }
  // Every language carries every key English has.
  for (const lang of ['fr', 'ar']) {
    const missing = Object.keys(registrationStrings.en).filter((key) => !(key in registrationStrings[lang]))
    assert.deepEqual(missing, [], `${lang} is missing keys`)
  }
})

test('MESSAGES: the form shows the message of the rule that failed, in the language of the form', () => {
  for (const lang of ['fr', 'en', 'ar']) {
    const L = getRegistrationStrings(lang)
    const students = formStudents()
    assert.equal(officialIssues({ role: 'activities_officer', fullName: 'Amina Benali', email: 'a@b.co', phone: '+213555123456' }, L).phone, L.errPhoneInvalid)
    assert.equal(officialIssues({ role: 'activities_officer', fullName: 'Amina Benali', email: 'a@b.co', phone: '' }, L).phone, L.errPhoneRequired)
    assert.equal(officialIssues({ role: 'activities_officer', fullName: 'Amina123', email: 'a@b.co', phone: '0555123456' }, L).fullName, L.errNameInvalid)
    assert.equal(officialIssues({ role: 'activities_officer', fullName: 'Am', email: 'a@b.co', phone: '0555123456' }, L).fullName, L.errNameLength)
    assert.equal(personIssues({ fullName: '', phone: '0555123456', rfid: 'A1' }, L).fullName, L.errNameRequired)
    assert.equal(studentIssues({ ...students[0], rfid: '1234567' }, students, L).rfid, L.errStudentRfidInvalid)
    assert.equal(studentIssues({ ...students[0], rfid: '' }, students, L).rfid, L.errRfidRequired)
    assert.equal(studentIssues({ ...students[0], bacYear: '2027' }, students, L).bacYear, L.errBacYearInvalid)
    assert.equal(studentIssues({ ...students[0], bacYear: '' }, students, L).bacYear, L.errBacYearRequired)
    assert.equal(studentIssues({ ...students[0], fullName: 'Ab' }, students, L).fullName, L.errStudentNameShort)
    assert.equal(studentIssues({ ...students[0], fullName: 'Ab1' }, students, L).fullName, L.errNameInvalid)
    assert.equal(studentIssues({ ...students[0], fullName: '' }, students, L).fullName, L.errStudentNameRequired)
    assert.equal(personIssues({ fullName: 'Karim Haddad', phone: '0661234567', rfid: 'x'.repeat(65) }, L).rfid, L.errRfidInvalid, 'the delegation RFID keeps its own message')
  }
})

// ---------------------------------------------------------------------------------------
// 9. Inputs, and no rule copied outside the contract
// ---------------------------------------------------------------------------------------

const codeOf = (source) => source
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map((line) => line.replace(/(^|[^:'"`])\/\/.*$/, '$1')).join('\n')

const registerDir = 'src/pages/aivex/register'

test('INPUTS: tel for phones, numeric for student RFID, never type=number, never a filter on paste or keys', async () => {
  const names = (await readdir(new URL(`../${registerDir}/`, import.meta.url))).filter((name) => /\.(js|jsx)$/.test(name))
  for (const name of names) {
    const code = codeOf(await read(`${registerDir}/${name}`))
    assert.doesNotMatch(code, /type=["']number["']|type:\s*["']number["']/, `${name}: leading zeros would be lost`)
    assert.doesNotMatch(code, /onPaste|onKeyDown|onKeyPress|onKeyUp|onBeforeInput|onInput=|\bpattern=/, `${name}: validation is not a keyboard filter`)
    assert.doesNotMatch(code, /maxLength=/, `${name}: a pasted value must fail visibly, not be cut`)
  }
  const students = codeOf(await read(`${registerDir}/StudentsStep.jsx`))
  assert.match(students, /field\('rfid'\)[^>]*inputMode="numeric"/, 'student RFID: numeric keypad')
  assert.match(students, /field\('rfid'\)[\s\S]{0,140}hint=\{t\.studentRfidHint\}/, 'student RFID: the 8-digit hint')
  assert.match(students, /field\('phone'\)[^>]*type="tel" inputMode="tel"/)
  assert.match(students, /field\('bacYear'\)[^>]*as="select" options=\{bacYears\}/, 'BAC year: the existing select')
  assert.match(students, /getBacYearOptions\(t, bacYearChoices\(\)\)/, 'offering the contract\'s years only')

  const delegation = codeOf(await read(`${registerDir}/DelegationStep.jsx`))
  assert.match(delegation, /field\(section, 'phone'\)[^>]*type="tel" inputMode="tel"/)
  assert.doesNotMatch(delegation.slice(delegation.indexOf("field(section, 'rfid')")), /inputMode="numeric"/, 'the delegation RFID is not digits-only')
  assert.match(delegation, /hint=\{t\.rfidHint\}/)

  const institution = codeOf(await read(`${registerDir}/InstitutionStep.jsx`))
  assert.match(institution, /field\('activityOfficial', 'phone'\)[^>]*type="tel" inputMode="tel"/)
  assert.match(institution, /field\('activityOfficial', 'fullName'\)[^>]*autoComplete="name"/, 'the person filling the form may have their name autofilled')
  // Everyone else\'s name is not the browser\'s user\'s name: never autofilled.
  assert.doesNotMatch(delegation + students, /autoComplete="name"/)
  // Phones are not autofilled either: browsers fill +213…, which the rule refuses.
  for (const source of [students, delegation, institution]) assert.doesNotMatch(source, /autoComplete="(tel|tel-national)"/)
})

test('VALIDATION TIMING: errors show on blur, when leaving a step and on submit — not while typing for the first time', async () => {
  const fieldProps = codeOf(await read(`${registerDir}/fieldProps.js`))
  assert.match(fieldProps, /onBlur: \(\) => registration\.touch\(`\$\{section\}\.\$\{field\}`\)/)
  assert.match(fieldProps, /onBlur: \(\) => registration\.touch\(`student\.\$\{student\.id\}\.\$\{field\}`\)/)
  const hook = codeOf(await read(`${registerDir}/useCompetitionRegistration.js`))
  assert.match(hook, /const shows = \(stepIndex, key\) => Boolean\(attempted\[stepIndex\] \|\| touched\[key\]\)/)
  assert.match(hook, /const advance = \(\) => \{[\s\S]*?firstIssue\(step\)[\s\S]*?type: 'attempt'/, 'leaving a step validates it')
  assert.match(hook, /for \(const stepIndex of \[STEP\.institution, STEP\.delegation, STEP\.students\]\)[\s\S]*?firstIssue\(stepIndex\)/, 'submitting validates every step again')
})

test('SINGLE SOURCE: no phone, RFID, name or BAC rule is written anywhere but the shared contract', async () => {
  const files = [
    ...(await readdir(new URL(`../${registerDir}/`, import.meta.url))).filter((name) => /\.(js|jsx)$/.test(name) && name !== 'registrationI18n.js').map((name) => `${registerDir}/${name}`),
    'src/lib/applicationSubmission.js', 'api/aivex/register/init.js', 'api/aivex/register/finalize.js',
    'api/_lib/aivex-validation-v4.js', 'api/_lib/aivex-registration-v4.js', 'api/_lib/multipart.js',
  ]
  const forbidden = [
    [/\[567\]/, 'the phone prefixes'], [/\[0-9\]\{8\}|\\d\{8\}/, 'the student RFID length'], [/\\p\{L\}|\\p\{M\}|\[a-zA-Z/, 'the name letters'],
    [/\b2019\b|\b2026\b/, 'the BAC range'],
    [/new RegExp\(/, 'a rule compiled at runtime'],
  ]
  for (const file of files) {
    const code = codeOf(await read(file))
    for (const [pattern, what] of forbidden) {
      // The only regexp allowed near these files is the file-field pattern of the multipart parser.
      if (pattern.source === 'new RegExp\\(') continue
      assert.doesNotMatch(code, pattern, `${file} re-implements ${what}`)
    }
  }
  // …and the contract does hold every one of them.
  const contractCode = codeOf(await read('shared/aivex/contract-v4.js'))
  for (const needle of ['0[567][0-9]{8}', '[0-9]{8}', '\\p{L}', '2019', '2026']) assert.ok(contractCode.includes(needle), `the contract holds ${needle}`)
  // The form and the API import the decisions from it.
  const model = await read(`${registerDir}/registrationModel.js`)
  for (const name of ['isValidPhoneInput', 'isValidStudentRfid', 'isValidDelegationRfid', 'isValidBacYear', 'personNameIssue', 'bacYearChoices']) {
    assert.match(model, new RegExp(`\\b${name}\\b`), `the form uses the shared ${name}`)
  }
  assert.match(await read('api/aivex/register/init.js'), /validateRegistrationV4\(body\?\.payload\)/)
  assert.match(await read('api/aivex/register/finalize.js'), /validateRegistrationV4\(body\?\.payload\)/)
})

test('SINGLE SOURCE: the contract stays pure — no clock, no React, no network — and the validator takes no date', async () => {
  const code = codeOf(await read('shared/aivex/contract-v4.js'))
  for (const forbidden of [/\bwindow\b/, /\bdocument\b\./, /process\.env/, /from ['"]react['"]/, /@supabase/, /node:/, /new Date\(/, /Date\.now/, /getUTCFullYear|getFullYear/]) {
    assert.doesNotMatch(code, forbidden, String(forbidden))
  }
  assert.equal(validateRegistrationV4.length, 1)
  assert.equal(isValidBacYear.length, 1)
  assert.equal(bacYearChoices.length, 0)
  for (const removed of ['bacYearRange', 'isValidRfid']) assert.equal(removed in contract, false, removed)
  assert.equal('bacYearMin' in LIMITS, false)
  assert.equal('bacYearAhead' in LIMITS, false)
})

// ---------------------------------------------------------------------------------------
// 10. Database: the columns already store these values correctly — no migration needed
// ---------------------------------------------------------------------------------------

test('DATABASE: phones and RFIDs are TEXT, the BAC year an integer, and the stricter values fit the existing constraints', async () => {
  const strip = (sql) => sql.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n')
  const contractSql = strip(await read('supabase/migrations/20260918120000_aivex_v4_contract.sql'))
  const v3Sql = strip(await read('supabase/migrations/20260917200000_aivex_registration_v3_expand.sql'))
  // Types.
  assert.match(contractSql, /phone text not null/, 'aivex_students.phone')
  assert.match(contractSql, /rfid_number text not null/, 'aivex_students.rfid_number')
  assert.match(contractSql, /bac_year smallint not null/, 'aivex_students.bac_year')
  assert.match(contractSql, /add column if not exists delegation_head_rfid text/)
  assert.match(contractSql, /add column if not exists driver_rfid text/)
  for (const column of ['activity_official_phone', 'delegation_head_phone', 'driver_phone']) assert.match(v3Sql, new RegExp(`add column if not exists ${column} text`), column)
  assert.doesNotMatch(contractSql + v3Sql, /(phone|rfid\w*) (integer|int|bigint|numeric|smallint)\b/i, 'never a numeric type: the leading zero would go')

  // The existing CHECKs accept every value the API can now emit (the new rules are a subset).
  const dbPhone = /'(\^\\\+\?\[0-9\]\{9,15\}\$)'/.exec(contractSql)?.[1] ?? /'(\^\\\+\?\[0-9\]\{9,15\}\$)'/.exec(v3Sql)?.[1]
  assert.ok(dbPhone, 'the database phone pattern was found')
  const dbPhoneRe = new RegExp(dbPhone)
  const next = random(7)
  for (let i = 0; i < 2000; i += 1) {
    const phone = `0${pick(next, [...'567'])}${chars(next, [...'0123456789'], 8)}`
    assert.equal(PHONE_PATTERN.test(phone), true)
    assert.equal(dbPhoneRe.test(phone), true, phone)
    const rfid = chars(next, [...'0123456789'], 8)
    assert.equal(STUDENT_RFID_PATTERN.test(rfid), true)
    assert.ok(rfid.length >= 1 && rfid.length <= 64 && rfid === rfid.trim() && !/[\p{Cc}]/u.test(rfid), 'aivex_students_rfid_check')
  }
  assert.match(contractSql, /bac_year between 1990 and 2100/)
  for (const year of bacYearChoices()) assert.ok(year >= 1990 && year <= 2100, String(year))
  // Direct upload adds one ordered, additive migration after identity documents.
  const migrations = (await readdir(new URL('../supabase/migrations/', import.meta.url))).sort()
  assert.equal(migrations.at(-1), '20260924120000_aivex_direct_upload_sessions_and_retention.sql')
})

// ---------------------------------------------------------------------------------------
// 11. Documentation
// ---------------------------------------------------------------------------------------

test('DOCS: docs/aivex-data-contract-v4.md states the final rules, and names only functions that exist', async () => {
  const doc = await read('docs/aivex-data-contract-v4.md')
  const section = doc.slice(doc.indexOf('## 5b.'), doc.indexOf('## 6.'))
  assert.ok(section.length > 3000, 'section 5b exists')
  for (const needle of [String(PHONE_PATTERN).slice(1, -1), String(STUDENT_RFID_PATTERN).slice(1, -1), 'BAC_YEAR_RANGE', '2019', '2026',
    '05 / 06 / 07', 'lettres Unicode', '3–120', 'RFID étudiant ≠ RFID de la délégation', 'Aucune migration', 'Doublons autorisés']) {
    assert.ok(section.includes(needle) || doc.includes(needle), `the documentation says: ${needle}`)
  }
  // Every function / constant the section names is a real export of the shared contract.
  const named = [...section.matchAll(/`((?:normalize|isValid|personName|bacYear|PHONE_|STUDENT_RFID|BAC_YEAR|LIMITS\.)[A-Za-z_.]*)`/g)].map((match) => match[1])
    .filter((name) => !/Hint$/.test(name)) // an i18n key (bacYearHint), not a contract export
  assert.ok(named.length >= 10, `named: ${named.join(', ')}`)
  for (const name of new Set(named)) {
    const root = name.split('.')[0]
    assert.ok(root in contract, `${name} is documented but is not exported by the contract`)
  }
  // The old rules are gone from the rules table.
  assert.doesNotMatch(doc.slice(doc.indexOf('## 5. Validation'), doc.indexOf('## 5b.')), /année courante \+ 1|\^\\+\?\d\{9,15\}\$/)
  // The distinction between the two RFID rules is documented as such.
  assert.match(section, /isValidStudentRfid[\s\S]*isValidDelegationRfid/)
})
