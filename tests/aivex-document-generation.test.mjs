// AIVEX official document generation (Phase 4) — template, rendering,
// Storage/DB orchestration and idempotency. No network, no real database:
// the Supabase-shaped store is replaced by an in-memory one implementing
// the same interface as createSupabaseDocumentStore, same approach as
// tests/aivex-contract-v4.test.mjs's createMemoryStore for the registration
// write path. The template itself is the real file on disk.
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { test } from 'node:test'
import JSZip from 'jszip'
import { createDocumentHandler } from '../api/aivex/document.js'
import { createRegisterHandler } from './support/aivex-register-handler.mjs'
import { WORD_VARIABLES_V4, resolveWordDataV4 } from '../shared/aivex/word-mapping-v4.js'
import {
  AIVEX_TEMPLATE_VERSION, DOCX_MIME, loadRegistrationTemplate, renderRegistrationDocx, resetTemplateCache,
} from '../api/_lib/aivex-document-template.js'
import {
  DOCUMENT_STALE_AFTER_MS, formatDocumentDate, generateOfficialDocuments, generatedDocumentPath,
} from '../api/_lib/aivex-document-generation.js'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const NOW = new Date('2026-09-20T10:00:00Z')
const REGISTRATION_ID = '6c1f0e2a-7b3d-4c5e-9f8a-0b1c2d3e4f5a'

const V3_TOKENS = ['registrationNumber', 'studyLevel', 'nationalId', 'leader', 'isLeader', 'member', 'studentCard']

// A complete, realistic set of official rows, as the store would load them.
function sampleRows(overrides = {}) {
  return {
    registration: {
      id: REGISTRATION_ID,
      edition: 2,
      reference: 'AIVEX2-7K3M9QXT',
      team_name: 'Infinity AI',
      wilaya_name: 'Bordj Bou Arréridj',
      institution_name: 'Université Mohamed El Bachir El Ibrahimi',
      activity_official_name: 'Amina Benali',
      activity_official_phone: '0555123456',
      activity_official_email: 'activities@univ-bba.dz',
      delegation_head_name: 'Karim Haddad',
      delegation_head_phone: '0661234567',
      delegation_head_rfid: '00471236',
      driver_name: 'Nabil Saidi',
      driver_phone: '0770112233',
      driver_rfid: 'A1B2C3D4',
      ...overrides.registration,
    },
    students: overrides.students ?? [1, 2, 3].map((position) => ({
      position, full_name: `Student Number ${position}`, phone: `055000000${position}`,
      bac_year: 2020 + position, rfid_number: `TEST-STU-000${position}`,
    })),
    settings: overrides.settings === undefined ? {
      edition_name: 'الطبعة الثانية', event_start_date: '2026-12-10', event_end_date: '2026-12-12',
      submission_deadline: '2026-11-30', submission_email: 'aivex@univ-bba.dz',
    } : overrides.settings,
  }
}

// In-memory stand-in for createSupabaseDocumentStore, same method shapes.
function createMemoryDocumentStore(rows) {
  const registrations = new Map([[REGISTRATION_ID, { document_status: 'not_generated', updated_at: NOW }]])
  const documents = new Map() // key: `${registrationId}:${type}`
  const objects = new Map()
  return {
    registrations, documents, objects,
    // Same rule as the Supabase store's single UPDATE ... WHERE.
    async claimGeneration(registrationId, { staleBefore }) {
      const row = registrations.get(registrationId)
      const claimable = row && (['not_generated', 'generation_failed'].includes(row.document_status)
        || (row.document_status === 'generating' && row.updated_at < staleBefore))
      if (!claimable) return false
      row.document_status = 'generating'
      row.updated_at = NOW
      return true
    },
    async loadRegistrationData(registrationId) {
      if (registrationId !== REGISTRATION_ID) throw new Error('unknown registration')
      return rows
    },
    async uploadDocument(path, buffer, mimeType) { objects.set(path, { buffer, mimeType }) },
    async upsertDocumentRow(row) { documents.set(`${row.registration_id}:${row.document_type}`, { ...row, updated_at: NOW.toISOString() }) },
    async removeDocumentFile(path) { objects.delete(path) },
    async setDocumentStatus(registrationId, status) { registrations.get(registrationId).document_status = status },
  }
}

// =================================================================================
// 1-4. Template correctness (the fixed file on disk)
// =================================================================================

test('1. the official template has exactly the 30 canonical placeholders, no more, no less', async () => {
  const buffer = await loadRegistrationTemplate()
  const zip = await JSZip.loadAsync(buffer)
  const found = new Set()
  for (const path of Object.keys(zip.files)) {
    if (zip.files[path].dir || !path.endsWith('.xml')) continue
    const xml = await zip.files[path].async('string')
    for (const match of xml.matchAll(/\{\{([a-zA-Z0-9_]+)\}\}/g)) found.add(match[1])
  }
  const expected = new Set(WORD_VARIABLES_V4.map((entry) => entry.variable))
  assert.equal(found.size, 30)
  assert.deepEqual([...found].sort(), [...expected].sort())
})

test('2. no split-run placeholder: every {{token}} is a single, literal run in document.xml', async () => {
  const buffer = await loadRegistrationTemplate()
  const zip = await JSZip.loadAsync(buffer)
  const xml = await zip.file('word/document.xml').async('string')
  // If any placeholder were split across <w:r> runs, this count would be
  // lower than the 30 found by scanning the plain (tag-stripped) text.
  const literal = [...xml.matchAll(/\{\{([a-zA-Z0-9_]+)\}\}/g)].length
  const plain = xml.replace(/<[^>]+>/g, '')
  const stripped = [...plain.matchAll(/\{\{([a-zA-Z0-9_]+)\}\}/g)].length
  assert.equal(literal, 30)
  assert.equal(literal, stripped)
})

test('3. the template structure (paragraphs, tables, page breaks) is untouched: one page, no orphan blank page', async () => {
  const buffer = await loadRegistrationTemplate()
  const xml = await (await JSZip.loadAsync(buffer)).file('word/document.xml').async('string')
  assert.equal((xml.match(/<w:tbl>/g) || []).length, 2, 'the two tables (students, delegation) are still there')
  assert.equal((xml.match(/<w:sectPr/g) || []).length, 1, 'a single section: one continuous page flow')
  assert.doesNotMatch(xml, /<w:br w:type="page"/, 'no forced page break was introduced')
  assert.doesNotMatch(xml, /w:pageBreakBefore/, 'no forced page break was introduced')
  // Static text, like the placeholders used to be, can be split across Word
  // runs — check the visible (tag-stripped) text, not the raw XML.
  assert.match(xml.replace(/<[^>]+>/g, ''), /ختم وامضاء مدير الجامعة/, 'the signature/stamp line is still present, in the same document flow')
  // Layout fixes made in this phase (see the test name / git history):
  // no floating table (the students table used to wrap "تأطير الوفد" beside it)...
  assert.doesNotMatch(xml, /<w:tblpPr/, 'no floating table')
  // ...and the BAC year cells at the same 14 pt as the rest of their row.
  for (const position of [1, 2, 3]) {
    const at = xml.indexOf(`{{student_${position}_bac_year}}`)
    const run = xml.slice(Math.max(xml.lastIndexOf('<w:r>', at), xml.lastIndexOf('<w:r ', at)), at)
    assert.match(run, /<w:sz w:val="28"\/>/, `student ${position} BAC year font size`)
  }
})

test('4. no V3 placeholder and no studentCard placeholder anywhere in the template', async () => {
  const buffer = await loadRegistrationTemplate()
  const zip = await JSZip.loadAsync(buffer)
  for (const path of Object.keys(zip.files)) {
    if (zip.files[path].dir || !path.endsWith('.xml')) continue
    const xml = await zip.files[path].async('string')
    for (const token of V3_TOKENS) assert.doesNotMatch(xml, new RegExp(`\\{\\{[^}]*${token}[^}]*\\}\\}`, 'i'), `${path} has a {{...${token}...}} placeholder`)
  }
})

// =================================================================================
// 5-8. Rendering
// =================================================================================

test('5. rendering fills every placeholder with the real value, escapes XML-sensitive characters, leaves none unresolved', async () => {
  const { registration, students, settings } = sampleRows({ registration: { team_name: 'Infinity AI & <Sons> "Team"' } })
  const data = resolveWordDataV4({ settings, registration, students })
  const template = await loadRegistrationTemplate()
  const rendered = await renderRegistrationDocx(template, data)

  const zip = await JSZip.loadAsync(rendered)
  const xml = await zip.file('word/document.xml').async('string')
  assert.doesNotMatch(xml, /\{\{/, 'no placeholder left in the rendered document')
  for (const value of ['AIVEX2-7K3M9QXT', 'Bordj Bou Arréridj', 'Amina Benali', 'Karim Haddad', '00471236', 'Student Number 2', '2022', 'TEST-STU-0003']) {
    assert.match(xml, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `missing ${value}`)
  }
  assert.match(xml, /Infinity AI &amp; &lt;Sons&gt; &quot;Team&quot;/, 'special characters are XML-escaped, not left raw')
})

test('6. rendering never introduces a studentCard reference or file path', async () => {
  const { registration, students, settings } = sampleRows()
  const data = resolveWordDataV4({ settings, registration, students })
  assert.equal('studentCard' in data, false)
  const rendered = await renderRegistrationDocx(await loadRegistrationTemplate(), data)
  const xml = await (await JSZip.loadAsync(rendered)).file('word/document.xml').async('string')
  assert.doesNotMatch(xml, /studentCard|student_card|student-\d\.(jpg|png|webp)/i)
})

test('7. an unmapped template token, or unused data, fails loudly instead of printing "{{...}}" or being silently dropped', async () => {
  const { registration, students, settings } = sampleRows()
  const data = resolveWordDataV4({ settings, registration, students })
  // Data the template has no slot for (a mapping typo): refused.
  await assert.rejects(renderRegistrationDocx(await loadRegistrationTemplate(), { ...data, unexpected_field: 'x' }), /Data provided for placeholder\(s\) the template does not use: unexpected_field/)

  // A template slot with no data: refused, never printed as "{{edition_name}}".
  const { edition_name: _dropped, ...missingOne } = data
  await assert.rejects(renderRegistrationDocx(await loadRegistrationTemplate(), missingOne), /Unresolved template placeholder\(s\): edition_name/)
})

test('8. the rendered file is a valid, minimally-different DOCX (same parts, only document.xml changed)', async () => {
  const template = await loadRegistrationTemplate()
  const { registration, students, settings } = sampleRows()
  const rendered = await renderRegistrationDocx(template, resolveWordDataV4({ settings, registration, students }))
  const [a, b] = await Promise.all([JSZip.loadAsync(template), JSZip.loadAsync(rendered)])
  const namesA = Object.keys(a.files).filter((n) => !a.files[n].dir).sort()
  const namesB = Object.keys(b.files).filter((n) => !b.files[n].dir).sort()
  assert.deepEqual(namesA, namesB)
  for (const name of namesA) {
    const same = Buffer.compare(await a.files[name].async('nodebuffer'), await b.files[name].async('nodebuffer')) === 0
    assert.equal(same, name !== 'word/document.xml', `${name} changed unexpectedly: ${same}`)
  }
})

// =================================================================================
// 9-14. Orchestration: status workflow, idempotency, failure handling
// =================================================================================

test('8b. the official design is kept exactly: the rendered document is the template with only the {{tokens}} replaced', async () => {
  const template = await loadRegistrationTemplate()
  const { registration, students, settings } = sampleRows()
  const data = resolveWordDataV4({ settings, registration, students })
  const [source, rendered] = await Promise.all([JSZip.loadAsync(template), JSZip.loadAsync(await renderRegistrationDocx(template, data))])
  // Rebuild every part by substituting the tokens in the template ourselves:
  // any other difference (a run, a style, a table, the header text boxes,
  // the signature/stamp block, a margin) would make this comparison fail.
  const escape = (value) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
  for (const path of Object.keys(source.files).filter((name) => name.endsWith('.xml'))) {
    const expected = (await source.files[path].async('string')).replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_, key) => escape(data[key]))
    assert.equal(await rendered.files[path].async('string'), expected, `${path} differs beyond the placeholder values`)
  }
})

test('8c. the final document holds official V4 data only: no V3 field, no student card, no internal path', async () => {
  const { registration, students, settings } = sampleRows()
  const rendered = await renderRegistrationDocx(await loadRegistrationTemplate(), resolveWordDataV4({ settings, registration, students }))
  const zip = await JSZip.loadAsync(rendered)
  for (const path of Object.keys(zip.files).filter((name) => name.endsWith('.xml'))) {
    const xml = await zip.files[path].async('string')
    assert.doesNotMatch(xml, /\{\{|\}\}/, `${path}: placeholder left`)
    assert.doesNotMatch(xml, /studentCard|student_card|nationalId|national_id|registrationNumber|registration_number|studyLevel|study_level|aivex-student-cards/i, path)
  }
})

test('8d. exactly students 1, 2 and 3: a missing, extra or duplicated position fails the docx, never a partial document', async () => {
  const three = sampleRows().students
  for (const [label, students] of [
    ['two students', three.slice(0, 2)],
    ['four students', [...three, { ...three[0], position: 4 }]],
    ['position 3 duplicated', [three[0], three[1], { ...three[1], position: 2 }]],
  ]) {
    const store = createMemoryDocumentStore(sampleRows({ students }))
    const logged = console.error
    console.error = () => {}
    let result
    try {
      result = await generateOfficialDocuments({ store, registrationId: REGISTRATION_ID, now: NOW })
    } finally {
      console.error = logged
    }
    assert.equal(result.docx, false, label)
    assert.equal(store.registrations.get(REGISTRATION_ID).document_status, 'generation_failed', label)
    assert.equal(store.objects.size, 0, `${label}: no file uploaded`)
  }
})

test('9. a full, valid generation moves generating -> awaiting_signature (Word document ready), docx only', async () => {
  const store = createMemoryDocumentStore(sampleRows())
  const result = await generateOfficialDocuments({ store, registrationId: REGISTRATION_ID, now: NOW })
  assert.deepEqual(result, { attempted: true, docx: true, at: NOW.toISOString() })
  assert.equal(store.registrations.get(REGISTRATION_ID).document_status, 'awaiting_signature')

  const docx = store.documents.get(`${REGISTRATION_ID}:docx`)
  assert.equal(docx.generation_status, 'generated')
  assert.equal(docx.mime_type, DOCX_MIME)
  assert.equal(docx.template_version, AIVEX_TEMPLATE_VERSION)
  assert.equal(docx.error_code, null)
  assert.ok(docx.file_size_bytes > 0)
  assert.equal(store.objects.get(docx.file_path).buffer.length, docx.file_size_bytes)

  // DOCX is the only automatic document: no pdf row, no pdf file.
  assert.deepEqual([...store.documents.keys()], [`${REGISTRATION_ID}:docx`])
  assert.deepEqual([...store.objects.keys()], [docx.file_path])
})

test('10. document paths are edition-{edition}/{registrationId}/{reference}.{ext}', () => {
  assert.equal(generatedDocumentPath(REGISTRATION_ID, 2, 'AIVEX2-7K3M9QXT', 'docx'), `edition-2/${REGISTRATION_ID}/AIVEX2-7K3M9QXT.docx`)
  assert.throws(() => generatedDocumentPath(REGISTRATION_ID, 2, 'AIVEX2-7K3M9QXT', 'pdf'), 'the pipeline never writes a pdf')
  assert.throws(() => generatedDocumentPath(REGISTRATION_ID, 0, 'AIVEX2-7K3M9QXT', 'docx'))
  assert.throws(() => generatedDocumentPath(REGISTRATION_ID, 2, 'AIVEX2-7K3M9QXT', 'txt'))
})

test('11. template_version is recorded on the generated-document row', async () => {
  const store = createMemoryDocumentStore(sampleRows())
  await generateOfficialDocuments({ store, registrationId: REGISTRATION_ID, now: NOW })
  assert.equal(store.documents.get(`${REGISTRATION_ID}:docx`).template_version, AIVEX_TEMPLATE_VERSION)
})

test('12. a render failure marks document_status = generation_failed and leaves the registration data untouched', async () => {
  const store = createMemoryDocumentStore(sampleRows())
  const originalLoad = store.loadRegistrationData.bind(store)
  // Missing settings entirely still renders fine (blanks); force a real
  // failure instead — bad edition breaks generatedDocumentPath().
  store.loadRegistrationData = async (id) => {
    const rows = await originalLoad(id)
    return { ...rows, registration: { ...rows.registration, edition: 0 } }
  }
  const logged = console.error
  console.error = () => {}
  let result
  try {
    result = await generateOfficialDocuments({ store, registrationId: REGISTRATION_ID, now: NOW })
  } finally {
    console.error = logged
  }
  assert.equal(result.docx, false)
  assert.equal(store.registrations.get(REGISTRATION_ID).document_status, 'generation_failed')
  // The registration's own fields (team_name, students, etc.) are never
  // touched by this pipeline — only document_status is written.
  const rows = await originalLoad(REGISTRATION_ID)
  assert.equal(rows.registration.team_name, 'Infinity AI')
  assert.equal(rows.students.length, 3)
})

test('13. idempotency: an already-settled registration is never regenerated; a failed one is retried', async () => {
  const store = createMemoryDocumentStore(sampleRows())
  await generateOfficialDocuments({ store, registrationId: REGISTRATION_ID, now: NOW })
  assert.equal(store.registrations.get(REGISTRATION_ID).document_status, 'awaiting_signature')

  let loads = 0
  const originalLoad = store.loadRegistrationData.bind(store)
  store.loadRegistrationData = async (...args) => { loads += 1; return originalLoad(...args) }

  const again = await generateOfficialDocuments({ store, registrationId: REGISTRATION_ID, now: NOW })
  assert.deepEqual(again, { attempted: false, reason: 'already_settled_or_in_progress' })
  assert.equal(loads, 0, 'no data was even fetched: the claim was refused up front')

  // Two concurrent callers on a fresh, not-yet-generated registration: only one wins.
  const fresh = createMemoryDocumentStore(sampleRows())
  const staleBefore = new Date(NOW.getTime() - DOCUMENT_STALE_AFTER_MS)
  const [a, b] = await Promise.all([fresh.claimGeneration(REGISTRATION_ID, { staleBefore }), fresh.claimGeneration(REGISTRATION_ID, { staleBefore })])
  assert.equal([a, b].filter(Boolean).length, 1)

  // A registration stuck at generation_failed IS retried on the next call.
  store.registrations.get(REGISTRATION_ID).document_status = 'generation_failed'
  const retried = await generateOfficialDocuments({ store, registrationId: REGISTRATION_ID, now: NOW })
  assert.equal(retried.attempted, true)
  assert.equal(retried.docx, true)
  assert.equal(store.registrations.get(REGISTRATION_ID).document_status, 'awaiting_signature')
})

test('13b. a claim stuck at "generating" (the attempt died) is left alone while recent, and reclaimed once stale', async () => {
  const store = createMemoryDocumentStore(sampleRows())
  const row = store.registrations.get(REGISTRATION_ID)
  row.document_status = 'generating'
  row.updated_at = NOW // claimed "just now" by another, still-running attempt

  const busy = await generateOfficialDocuments({ store, registrationId: REGISTRATION_ID, now: new Date(NOW.getTime() + 30_000) })
  assert.deepEqual(busy, { attempted: false, reason: 'already_settled_or_in_progress' })
  assert.equal(row.document_status, 'generating')

  const later = new Date(NOW.getTime() + DOCUMENT_STALE_AFTER_MS + 1)
  const recovered = await generateOfficialDocuments({ store, registrationId: REGISTRATION_ID, now: later })
  assert.equal(recovered.attempted, true)
  assert.equal(recovered.docx, true)
  assert.equal(row.document_status, 'awaiting_signature')
})

test('13c. dates: a timestamptz deadline prints as its calendar date in Algeria, never as a machine timestamp', async () => {
  // aivex_settings.submission_deadline is timestamptz: Supabase returns an ISO instant.
  assert.equal(formatDocumentDate('2026-11-30T23:30:00+00:00'), '2026-12-01') // 00:30 on Dec 1 in Algiers (UTC+1)
  assert.equal(formatDocumentDate('2026-11-30T12:00:00+00:00'), '2026-11-30')
  assert.equal(formatDocumentDate('2026-12-10'), '2026-12-10') // `date` columns pass through
  assert.equal(formatDocumentDate(''), '')
  assert.equal(formatDocumentDate('not a date'), 'not a date')

  const store = createMemoryDocumentStore(sampleRows({
    settings: { edition_name: 'الطبعة الثانية', event_start_date: '2026-12-10', event_end_date: '2026-12-12',
      submission_deadline: '2026-11-30T23:30:00+00:00', submission_email: 'aivex@univ-bba.dz' },
  }))
  await generateOfficialDocuments({ store, registrationId: REGISTRATION_ID, now: NOW })
  const docx = store.documents.get(`${REGISTRATION_ID}:docx`)
  const text = (await (await JSZip.loadAsync(store.objects.get(docx.file_path).buffer)).file('word/document.xml').async('string')).replace(/<[^>]+>/g, '')
  assert.ok(text.includes('2026-12-01'))
  assert.doesNotMatch(text, /T\d{2}:\d{2}|\+00:00/)
})

test('14. no PDF is ever produced or attempted: DOCX is the only automatic document, even when it fails', async () => {
  const sources = ['api/_lib/aivex-document-generation.js', 'api/_lib/aivex-document-store.js', 'api/_lib/aivex-document-template.js',
    'api/aivex/register.js', 'api/aivex/document.js', 'scripts/aivex-retry-documents.mjs', 'package.json', 'vercel.json']
  for (const file of sources) {
    const source = await read(file)
    assert.doesNotMatch(source, /convertDocxToPdf|generatePdf|pdf_conversion|PDF_MIME|application\/pdf|cloudconvert|convertapi|graph\.microsoft|microsoft graph|libreoffice|soffice/i, file)
  }

  const store = createMemoryDocumentStore(sampleRows())
  store.uploadDocument = async () => { throw new Error('storage down') } // docx upload fails
  const logged = console.error
  console.error = () => {}
  try {
    const result = await generateOfficialDocuments({ store, registrationId: REGISTRATION_ID, now: NOW })
    assert.deepEqual(result, { attempted: true, docx: false, at: NOW.toISOString() })
  } finally {
    console.error = logged
  }
  assert.deepEqual([...store.documents.keys()], [`${REGISTRATION_ID}:docx`], 'no pdf row, not even a failed one')
  assert.equal(store.documents.get(`${REGISTRATION_ID}:docx`).error_code, 'upload_failed')
  assert.equal(store.registrations.get(REGISTRATION_ID).document_status, 'generation_failed')
})

// =================================================================================
// Storage privacy, DB migration, and pipeline-wide guarantees
// =================================================================================

test('storage: private bucket only, never a public URL, generated documents never exposed to the browser', async () => {
  const files = [
    'api/_lib/aivex-document-generation.js', 'api/_lib/aivex-document-store.js', 'api/_lib/aivex-document-template.js', 'api/aivex/register.js',
    'api/aivex/document.js', 'src/lib/applicationSubmission.js', 'src/pages/aivex/register/RegistrationSuccess.jsx',
  ]
  for (const file of files) {
    const source = await read(file)
    assert.doesNotMatch(source, /getPublicUrl|createSignedUrl/, file)
  }
  for (const dir of await readdir(new URL('../src/', import.meta.url), { recursive: true })) {
    if (!dir.endsWith('.js') && !dir.endsWith('.jsx')) continue
    const source = await read(`src/${dir}`)
    assert.doesNotMatch(source, /aivex-generated-forms|aivex_generated_documents/i, `src/${dir}`)
  }
})

test('migration: additive, private bucket, correct constraints', async () => {
  const sql = (await read('supabase/migrations/20260920120000_aivex_v4_generated_documents.sql'))
    .split('\n').filter((line) => !line.trim().startsWith('--')).join('\n').toLowerCase()
  for (const destructive of [/drop\s+table/, /drop\s+column/, /\btruncate\b/, /delete\s+from/, /drop\s+schema/, /drop\s+function/]) {
    assert.doesNotMatch(sql, destructive)
  }
  assert.doesNotMatch(sql, /public\s*=\s*true/)
  assert.match(sql, /on conflict \(id\) do update set public = false/)
  assert.match(sql, /create table if not exists public\.aivex_generated_documents/)
  assert.match(sql, /check \(document_type in \('docx', 'pdf'\)\)/)
  assert.match(sql, /check \(generation_status in \('generating', 'generated', 'failed'\)\)/)
  assert.match(sql, /unique\s*\(registration_id, document_type\)/)
  assert.match(sql, /references public\.aivex_registrations \(id\) on delete cascade/)
  assert.match(sql, /enable row level security/)
})

test('the document generator never uses the legacy V3 vocabulary or logs sensitive data', async () => {
  const files = ['api/_lib/aivex-document-generation.js', 'api/_lib/aivex-document-store.js', 'api/_lib/aivex-document-template.js', 'api/aivex/document.js']
  for (const file of files) {
    const source = await read(file)
    assert.doesNotMatch(source, /\b(nationalId|registrationNumber|studyLevel|isLeader)\b/, file)
    for (const [, args] of source.matchAll(/console\.(?:error|log|warn)\(([^)]*)\)/g)) {
      const logged = args.replace(/'[^']*'/g, "''")
      assert.doesNotMatch(logged, /path|payload|body|registration\b|email|rfid|phone|message/i, `${file} logs ${args}`)
    }
  }
})

test('template caching: loadRegistrationTemplate reads the file once per warm instance', async () => {
  resetTemplateCache()
  const a = await loadRegistrationTemplate()
  const b = await loadRegistrationTemplate()
  assert.equal(a, b) // same Buffer instance: the second call did not re-read the file
  resetTemplateCache()
})

// =================================================================================
// End to end: real multipart request -> real handler -> registerV4 ->
// generateOfficialDocuments, one in-memory store behind both interfaces.
// =================================================================================

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')
const E2E_SUBMISSION_ID = '4062ee55-ed56-46b8-bfd1-aa1c9096485a'
const E2E_SETTINGS = {
  edition_name: 'الطبعة الثانية', event_start_date: '2026-12-10', event_end_date: '2026-12-12',
  submission_deadline: '2026-11-30', submission_email: 'aivex@univ-bba.dz',
}

const syntheticPayload = () => ({
  submissionId: E2E_SUBMISSION_ID,
  edition: 2,
  formVersion: 4,
  team: { name: 'PHASE4 TEST', wilaya: { code: '34', name: 'x' }, institution: { id: 'univ-bba', name: 'x', custom: false } },
  activityOfficial: { role: 'activities_officer', fullName: 'Phase Four Test Official', email: 'phase4-test@example.invalid', phone: '0555000000' },
  delegationHead: { fullName: 'Phase Four Test Head', phone: '0555000001', rfid: 'TEST-HEAD-0001', idCard: 'delegationHeadIdCard' },
  driver: { fullName: 'Phase Four Test Driver', phone: '0555000002', rfid: 'TEST-DRIVER-0001', idCard: 'driverIdCard' },
  students: [1, 2, 3].map((position) => ({
    position, fullName: `Phase Four Test Student ${['One', 'Two', 'Three'][position - 1]}`, phone: `055500000${position + 2}`,
    bacYear: 2021, rfid: `9000000${position}`, studentCard: `studentCard_${position}`,
  })),
  consent: true,
})

function createSharedMemoryStores({ settings }) {
  const db = { registrations: [], students: [], cards: new Map(), identityCards: new Map(), documents: new Map(), files: new Map() }
  let nextId = 0
  const find = (id) => db.registrations.find((entry) => entry.id === id)
  const registrationStore = {
    async findBySubmissionId(submissionId) {
      const row = db.registrations.find((entry) => entry.submission_id === submissionId)
      if (!row) return null
      return {
        id: row.id, reference: row.reference, fingerprint: row.submission_fingerprint, createdAt: row.created_at,
        studentCount: db.students.filter((entry) => entry.registration_id === row.id).length,
        identityCardPaths: [row.delegation_head_id_card_path, row.driver_id_card_path].filter(Boolean),
      }
    },
    async insertRegistration(row) {
      if (db.registrations.some((entry) => entry.submission_id === row.submission_id || entry.reference === row.reference)) {
        return { ok: false, duplicate: true, code: '23505' }
      }
      // The API generates the registration id (the identity card paths name it).
      const id = row.id || `00000000-0000-4000-8000-${String(++nextId).padStart(12, '0')}`
      db.registrations.push({ ...row, id, created_at: row.submitted_at })
      return { ok: true, id, reference: row.reference }
    },
    async uploadCard(path, buffer, mime) { db.cards.set(path, { size: buffer.length, mime }) },
    async uploadIdentityCard(path, buffer, mime) { db.identityCards.set(path, { size: buffer.length, mime }) },
    async insertStudents(rows) { db.students.push(...rows) },
    async removeCards(paths) { paths.forEach((path) => db.cards.delete(path)) },
    async removeIdentityCards(paths) { paths.forEach((path) => db.identityCards.delete(path)) },
    async deleteRegistration(id) {
      db.registrations.splice(db.registrations.findIndex((entry) => entry.id === id), 1)
      db.students = db.students.filter((entry) => entry.registration_id !== id)
    },
  }
  const documentStore = {
    async claimGeneration(registrationId, { staleBefore }) {
      const row = find(registrationId)
      const claimable = row && (['not_generated', 'generation_failed'].includes(row.document_status)
        || (row.document_status === 'generating' && new Date(row.updated_at) < staleBefore))
      if (!claimable) return false
      row.document_status = 'generating'
      row.updated_at = NOW.toISOString()
      return true
    },
    async loadRegistrationData(registrationId) {
      return {
        registration: find(registrationId),
        students: db.students.filter((entry) => entry.registration_id === registrationId).sort((a, b) => a.position - b.position),
        settings,
      }
    },
    async uploadDocument(path, buffer, mimeType) { db.files.set(path, { buffer, mimeType }) },
    async upsertDocumentRow(row) { db.documents.set(`${row.registration_id}:${row.document_type}`, row) },
    async removeDocumentFile(path) { db.files.delete(path) },
    async setDocumentStatus(registrationId, status) { find(registrationId).document_status = status },
    async findRegistrationForDownload({ reference, submissionId }) {
      const row = db.registrations.find((entry) => entry.submission_id === submissionId && entry.reference === reference)
      return row ? { id: row.id, edition: row.edition, reference: row.reference } : null
    },
    async loadDocumentRow(registrationId, documentType) { return db.documents.get(`${registrationId}:${documentType}`) || null },
    async downloadDocument(path) {
      if (!db.files.has(path)) throw Object.assign(new Error('missing'), { stage: 'download', code: 404 })
      return db.files.get(path).buffer
    },
  }
  return { db, registrationStore, documentStore }
}

let e2eIp = 0
async function postRegistration(handler, payload) {
  const form = new FormData()
  form.append('payload', JSON.stringify(payload))
  for (const position of [1, 2, 3]) form.append(`studentCard_${position}`, new Blob([PNG], { type: 'image/png' }), `studentCard_${position}.png`)
  for (const field of ['delegationHeadIdCard', 'driverIdCard']) form.append(field, new Blob([PNG], { type: 'image/png' }), `${field}.png`)
  const response = new Response(form)
  const req = Readable.from([Buffer.from(await response.arrayBuffer())])
  e2eIp += 1
  Object.assign(req, {
    method: 'POST',
    headers: { 'content-type': response.headers.get('content-type'), 'x-forwarded-for': `198.51.100.${e2eIp}` },
    socket: {},
  })
  return new Promise((resolve) => {
    const res = {
      headers: {},
      setHeader(name, value) { this.headers[name] = value },
      end(body) { resolve({ status: this.statusCode, body: JSON.parse(body) }) },
    }
    handler(req, res)
  })
}

const e2eHandler = (stores) => {
  delete process.env.VERCEL
  return createRegisterHandler({
    createStore: () => stores.registrationStore, createDocumentStore: () => stores.documentStore, now: () => NOW,
  })
}

test('e2e: a synthetic registration keeps the unchanged 201 contract and produces the official DOCX', async () => {
  const stores = createSharedMemoryStores({ settings: E2E_SETTINGS })
  const { db } = stores
  const { status, body } = await postRegistration(e2eHandler(stores), syntheticPayload())
  assert.equal(status, 201)
  assert.deepEqual(Object.keys(body).sort(), ['reference', 'success'], 'response contract unchanged: no id, no path, no document detail')

  const [registration] = db.registrations
  assert.equal(registration.registration_status, 'submitted')
  assert.equal(registration.document_status, 'awaiting_signature')
  assert.equal(db.students.length, 3)
  assert.equal(db.cards.size, 3, 'the three student cards stay where they are')
  assert.equal(db.identityCards.size, 2, 'the two identity cards are stored, and only stored: they never enter the document')

  const docx = db.documents.get(`${registration.id}:docx`)
  assert.equal(docx.file_path, `edition-2/${registration.id}/${body.reference}.docx`)
  const xml = await (await JSZip.loadAsync(db.files.get(docx.file_path).buffer)).file('word/document.xml').async('string')
  const text = xml.replace(/<[^>]+>/g, '')
  assert.doesNotMatch(xml, /\{\{/)
  for (const value of [body.reference, 'PHASE4 TEST', 'Bordj Bou Arréridj', 'Phase Four Test Official', 'Phase Four Test Head', 'TEST-HEAD-0001', 'Phase Four Test Driver',
    'TEST-DRIVER-0001', 'Phase Four Test Student One', 'Phase Four Test Student Three', '90000002', '2021', 'phase4-test@example.invalid',
    '2026-12-10', '2026-12-12', '2026-11-30', 'aivex@univ-bba.dz', 'الطبعة الثانية',
    // Official label, re-derived server-side from the dataset (the payload said "x").
    'Université Mohamed El Bachir El Ibrahimi de Bordj Bou Arréridj']) {
    assert.ok(text.includes(value), `the document shows ${value}`)
  }
  assert.doesNotMatch(text, /student-\d\.png|studentCard/)

  assert.deepEqual([...db.documents.keys()], [`${registration.id}:docx`], 'no pdf record is created')
})

test('e2e: replaying the same submissionId neither re-registers nor regenerates', async () => {
  const stores = createSharedMemoryStores({ settings: E2E_SETTINGS })
  const { db } = stores
  const handler = e2eHandler(stores)
  const first = await postRegistration(handler, syntheticPayload())
  const [path] = db.files.keys()
  const firstDocx = db.files.get(path).buffer

  const replay = await postRegistration(handler, syntheticPayload())
  assert.equal(replay.status, 200)
  assert.equal(replay.body.reference, first.body.reference)
  assert.equal(replay.body.alreadyProcessed, true)
  assert.equal(db.registrations.length, 1)
  assert.equal(db.students.length, 3)
  assert.equal(db.files.size, 1, 'still exactly one generated file')
  assert.equal(db.files.get(path).buffer, firstDocx, 'the same DOCX, not a regenerated one')
})

test('e2e: a generation failure keeps the registration and its 201; a replay of the same submissionId retries the documents', async () => {
  const stores = createSharedMemoryStores({ settings: E2E_SETTINGS })
  const { db, documentStore } = stores
  const upload = documentStore.uploadDocument
  documentStore.uploadDocument = async () => { throw Object.assign(new Error('storage down'), { statusCode: 503 }) }
  const handler = e2eHandler(stores)

  const logged = console.error
  console.error = () => {}
  let first
  try {
    first = await postRegistration(handler, syntheticPayload())
  } finally {
    console.error = logged
  }
  assert.equal(first.status, 201, 'the applicant still gets a success: the registration itself is valid')
  assert.equal(db.registrations.length, 1)
  assert.equal(db.students.length, 3)
  assert.equal(db.cards.size, 3)
  const [registration] = db.registrations
  assert.equal(registration.document_status, 'generation_failed')
  assert.deepEqual(
    [db.documents.get(`${registration.id}:docx`).generation_status, db.documents.get(`${registration.id}:docx`).error_code],
    ['failed', 'upload_failed'],
  )

  documentStore.uploadDocument = upload
  const retry = await postRegistration(handler, syntheticPayload())
  assert.equal(retry.status, 200)
  assert.equal(retry.body.reference, first.body.reference)
  assert.equal(registration.document_status, 'awaiting_signature')
  assert.equal(db.documents.get(`${registration.id}:docx`).generation_status, 'generated')
})

test('e2e: with no aivex_settings row yet, the document is still produced (edition fields blank, never "{{...}}")', async () => {
  const stores = createSharedMemoryStores({ settings: null })
  const { db } = stores
  const { status } = await postRegistration(e2eHandler(stores), syntheticPayload())
  assert.equal(status, 201)
  assert.equal(db.registrations[0].document_status, 'awaiting_signature')
  const docx = db.documents.get(`${db.registrations[0].id}:docx`)
  const xml = await (await JSZip.loadAsync(db.files.get(docx.file_path).buffer)).file('word/document.xml').async('string')
  assert.doesNotMatch(xml, /\{\{/)
})

// =================================================================================
// Download of the official Word document (api/aivex/document.js)
// =================================================================================

let downloadIp = 0
function postDownload(handler, body, { raw, method = 'POST', headers = {} } = {}) {
  const req = Readable.from([Buffer.from(raw ?? JSON.stringify(body))])
  downloadIp += 1
  Object.assign(req, {
    method, socket: {},
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `203.0.113.${downloadIp % 250}`, ...headers },
  })
  return new Promise((resolve) => {
    const res = {
      headers: {},
      setHeader(name, value) { this.headers[name.toLowerCase()] = value },
      end(payload) {
        const isJson = String(this.headers['content-type']).startsWith('application/json')
        resolve({ status: this.statusCode, headers: this.headers, body: isJson ? JSON.parse(payload) : payload })
      },
    }
    handler(req, res)
  })
}

const downloadHandler = (stores) => createDocumentHandler({ createDocumentStore: () => stores.documentStore, now: () => NOW })

async function registeredStores() {
  const stores = createSharedMemoryStores({ settings: E2E_SETTINGS })
  const { body } = await postRegistration(e2eHandler(stores), syntheticPayload())
  return { stores, reference: body.reference }
}

test('download: the submitting browser gets the exact stored DOCX as a private, uncached attachment', async () => {
  const { stores, reference } = await registeredStores()
  const [path] = stores.db.files.keys()
  const { status, headers, body } = await postDownload(downloadHandler(stores), { reference, submissionId: E2E_SUBMISSION_ID })
  assert.equal(status, 200)
  assert.equal(headers['content-type'], DOCX_MIME)
  assert.equal(headers['content-disposition'], `attachment; filename="fiche-officielle-${reference}.docx"`)
  assert.equal(headers['cache-control'], 'no-store')
  assert.equal(headers['x-content-type-options'], 'nosniff')
  assert.equal(Buffer.compare(body, stores.db.files.get(path).buffer), 0, 'byte-identical to the stored file')
  const text = (await (await JSZip.loadAsync(body)).file('word/document.xml').async('string')).replace(/<[^>]+>/g, '')
  assert.ok(text.includes(reference))
  assert.equal(stores.db.files.size, 1, 'downloading never regenerates a settled document')
})

test('download: refused without the matching submissionId, with the same 404 for unknown and mismatched pairs', async () => {
  const { stores, reference } = await registeredStores()
  const handler = downloadHandler(stores)
  const mismatched = await postDownload(handler, { reference, submissionId: '9b2f6c1e-3d4a-4b5c-8d6e-7f8091a2b3c4' })
  const unknown = await postDownload(handler, { reference: 'AIVEX2-ZZZZZZZZ', submissionId: E2E_SUBMISSION_ID })
  assert.equal(mismatched.status, 404)
  assert.deepEqual(unknown.body, mismatched.body)
  assert.equal(unknown.status, 404)
  for (const bad of [{ reference }, { submissionId: E2E_SUBMISSION_ID }, { reference: 'x', submissionId: E2E_SUBMISSION_ID },
    { reference, submissionId: 'not-a-uuid' }]) {
    assert.equal((await postDownload(handler, bad)).status, 400)
  }
  assert.equal((await postDownload(handler, null, { raw: '{not json' })).status, 400)
  const oversized = JSON.stringify({ reference, submissionId: E2E_SUBMISSION_ID, pad: 'x'.repeat(4096) })
  assert.equal((await postDownload(handler, null, { raw: oversized })).status, 400)
  const get = await postDownload(handler, null, { raw: '', method: 'GET' })
  assert.equal(get.status, 405)
  assert.equal(get.headers.allow, 'POST')
  for (const response of [mismatched, unknown]) assert.doesNotMatch(JSON.stringify(response.body), /edition-|\.docx|registration_id|00000000-/)
})

test('download: a failed generation is retried on demand (claim-guarded) before answering; still failing -> 409, never a PDF', async () => {
  const stores = createSharedMemoryStores({ settings: E2E_SETTINGS })
  const { db, documentStore } = stores
  const upload = documentStore.uploadDocument
  documentStore.uploadDocument = async () => { throw Object.assign(new Error('storage down'), { statusCode: 503 }) }
  const logged = console.error
  console.error = () => {}
  let reference, stillFailing
  try {
    reference = (await postRegistration(e2eHandler(stores), syntheticPayload())).body.reference
    stillFailing = await postDownload(downloadHandler(stores), { reference, submissionId: E2E_SUBMISSION_ID })
  } finally {
    console.error = logged
  }
  assert.equal(stillFailing.status, 409)
  assert.equal(db.registrations[0].document_status, 'generation_failed')

  documentStore.uploadDocument = upload
  const recovered = await postDownload(downloadHandler(stores), { reference, submissionId: E2E_SUBMISSION_ID })
  assert.equal(recovered.status, 200)
  assert.equal(db.registrations[0].document_status, 'awaiting_signature')
  assert.deepEqual([...db.documents.keys()], [`${db.registrations[0].id}:docx`])
})

test('download: a storage failure answers 500 with no internals, and logs a stage and a code only', async () => {
  const { stores, reference } = await registeredStores()
  stores.documentStore.downloadDocument = async () => { throw Object.assign(new Error(`edition-2/secret/path ${reference}`), { stage: 'download', code: 503 }) }
  const logs = []
  const logged = console.error
  console.error = (...args) => logs.push(args)
  let response
  try {
    response = await postDownload(downloadHandler(stores), { reference, submissionId: E2E_SUBMISSION_ID })
  } finally {
    console.error = logged
  }
  assert.equal(response.status, 500)
  assert.doesNotMatch(JSON.stringify(response.body), /edition-|secret|path/)
  assert.deepEqual(logs, [['[aivex] Document download failed', { stage: 'download', code: 503 }]])
})

test('download: origin-checked and rate-limited like the registration endpoint', async () => {
  const { stores, reference } = await registeredStores()
  process.env.VERCEL = '1'
  try {
    const foreign = await postDownload(downloadHandler(stores), { reference, submissionId: E2E_SUBMISSION_ID },
      { headers: { host: 'www.infinty-bba.com', origin: 'https://evil.example' } })
    assert.equal(foreign.status, 403)
  } finally {
    delete process.env.VERCEL
  }
  const handler = downloadHandler(stores)
  const statuses = []
  for (let i = 0; i < 21; i += 1) {
    statuses.push((await postDownload(handler, { reference, submissionId: E2E_SUBMISSION_ID }, { headers: { 'x-forwarded-for': '192.0.2.77' } })).status)
  }
  assert.ok(statuses.slice(0, 20).every((status) => status === 200))
  assert.equal(statuses[20], 429)
})

test('download: the store reads the private bucket through the server client, by reference AND submissionId', async () => {
  const { createSupabaseDocumentStore } = await import('../api/_lib/aivex-document-store.js')
  const found = recordingSupabase({ data: { id: REGISTRATION_ID, edition: 2, reference: 'AIVEX2-7K3M9QXT' }, error: null })
  await createSupabaseDocumentStore(found.client).findRegistrationForDownload({ reference: 'AIVEX2-7K3M9QXT', submissionId: E2E_SUBMISSION_ID })
  assert.deepEqual(found.calls, [
    ['db', 'from', 'aivex_registrations'],
    ['db', 'select', 'id, edition, reference'],
    ['db', 'eq', 'submission_id', E2E_SUBMISSION_ID],
    ['db', 'eq', 'reference', 'AIVEX2-7K3M9QXT'],
    ['db', 'eq', 'form_version', 4],
    ['db', 'maybeSingle'],
  ])
  const file = recordingSupabase({ data: new Blob([Buffer.from('docx bytes')]), error: null })
  const bytes = await createSupabaseDocumentStore(file.client).downloadDocument('edition-2/x/AIVEX2-7K3M9QXT.docx')
  assert.equal(bytes.toString(), 'docx bytes')
  assert.deepEqual(file.calls, [['storage', 'from', 'aivex-generated-forms'], ['storage', 'download', 'edition-2/x/AIVEX2-7K3M9QXT.docx']])
})

test('download: the frontend posts reference + submissionId (never in a URL) and shows the official French wording', async () => {
  const client = await read('src/lib/applicationSubmission.js')
  assert.match(client, /const AIVEX_DOCUMENT_ENDPOINT = '\/api\/aivex\/document'/)
  assert.match(client, /body: JSON\.stringify\(\{ reference, submissionId \}\)/)
  assert.doesNotMatch(client, /[?&]submissionId=|document\?/)
  const { getRegistrationStrings } = await import('../src/pages/aivex/register/registrationI18n.js')
  const fr = getRegistrationStrings('fr')
  assert.equal(fr.successTitle.replace(/\.$/, ''), 'Inscription enregistrée avec succès')
  assert.equal(fr.successDocumentReady, 'Votre fiche officielle a été générée au format Word.')
  assert.equal(fr.successDownload, '📄 Télécharger la fiche officielle')
  assert.equal(fr.successDownloadHint, 'Après téléchargement, veuillez convertir ou imprimer le document, puis le faire signer et cacheter par votre établissement conformément aux instructions de l’organisation.')
  for (const lang of ['en', 'fr', 'ar']) {
    const strings = getRegistrationStrings(lang)
    for (const key of ['successDocumentReady', 'successDownload', 'successDownloading', 'successDownloadHint', 'successDownloadError']) {
      assert.equal(typeof strings[key], 'string', `${lang}.${key}`)
      assert.doesNotMatch(strings[key], /\bPDF\b/, `${lang}.${key}: the application never produces a PDF`)
    }
  }
})

// =================================================================================
// The real Supabase store, against a recording fake client
// =================================================================================

// Chainable stand-in for supabase-js: records every call, resolves to `result`.
function recordingSupabase(result = { data: [], error: null }) {
  const calls = []
  const chain = (root) => new Proxy(() => {}, {
    get(_, prop) {
      if (prop === 'then') return (resolve) => resolve(result)
      return (...args) => { calls.push([root, prop, ...args]); return chain(root) }
    },
  })
  const client = {
    from: (table) => { calls.push(['db', 'from', table]); return chain('db') },
    storage: { from: (bucket) => { calls.push(['storage', 'from', bucket]); return chain('storage') } },
  }
  return { client, calls }
}

test('supabase store: private bucket, atomic claim filter, one row per (registration, type)', async () => {
  const { createSupabaseDocumentStore } = await import('../api/_lib/aivex-document-store.js')

  const claimed = recordingSupabase({ data: [{ id: REGISTRATION_ID }], error: null })
  const staleBefore = new Date('2026-09-20T09:57:00.000Z')
  assert.equal(await createSupabaseDocumentStore(claimed.client).claimGeneration(REGISTRATION_ID, { staleBefore }), true)
  const freshClaim = [
    ['db', 'from', 'aivex_registrations'],
    ['db', 'update', { document_status: 'generating' }],
    ['db', 'eq', 'id', REGISTRATION_ID],
    ['db', 'in', 'document_status', ['not_generated', 'generation_failed']],
    ['db', 'select', 'id'],
  ]
  assert.deepEqual(claimed.calls, freshClaim, 'first claim won: the stale-claim UPDATE is never sent')

  // Nothing claimable: the second, stale-claim UPDATE is tried (plain filters, no or()).
  const notClaimed = recordingSupabase({ data: [], error: null })
  assert.equal(await createSupabaseDocumentStore(notClaimed.client).claimGeneration(REGISTRATION_ID, { staleBefore }), false)
  assert.deepEqual(notClaimed.calls, [...freshClaim,
    ['db', 'from', 'aivex_registrations'],
    ['db', 'update', { document_status: 'generating' }],
    ['db', 'eq', 'id', REGISTRATION_ID],
    ['db', 'eq', 'document_status', 'generating'],
    ['db', 'lt', 'updated_at', '2026-09-20T09:57:00.000Z'],
    ['db', 'select', 'id'],
  ])
  assert.equal(notClaimed.calls.some(([, method]) => method === 'or'), false)

  const upload = recordingSupabase({ data: {}, error: null })
  await createSupabaseDocumentStore(upload.client).uploadDocument('edition-2/x/AIVEX2-A.docx', Buffer.from('x'), DOCX_MIME)
  assert.deepEqual(upload.calls[0], ['storage', 'from', 'aivex-generated-forms'])
  assert.deepEqual(upload.calls[1].slice(0, 3), ['storage', 'upload', 'edition-2/x/AIVEX2-A.docx'])
  assert.equal(upload.calls[1][4].contentType, DOCX_MIME)

  const upsert = recordingSupabase({ data: null, error: null })
  await createSupabaseDocumentStore(upsert.client).upsertDocumentRow({ registration_id: REGISTRATION_ID, document_type: 'docx' })
  assert.deepEqual(upsert.calls[0], ['db', 'from', 'aivex_generated_documents'])
  assert.deepEqual(upsert.calls[1][3], { onConflict: 'registration_id,document_type' })

  // Only the official columns are read — never the student card fields.
  const load = recordingSupabase({ data: { id: REGISTRATION_ID, edition: 2 }, error: null })
  await createSupabaseDocumentStore(load.client).loadRegistrationData(REGISTRATION_ID)
  const selects = load.calls.filter(([, method]) => method === 'select').map(([, , columns]) => columns).join(' ')
  assert.doesNotMatch(selects, /student_card|national|registration_number|study_level/)
  assert.match(selects, /activity_official_name/)
  assert.match(selects, /rfid_number/)

  const failing = recordingSupabase({ data: null, error: { code: '42501' } })
  await assert.rejects(createSupabaseDocumentStore(failing.client).claimGeneration(REGISTRATION_ID, { staleBefore }), (error) => error.stage === 'claim' && error.code === '42501')
})
