// AIVEX official document — DOCX rendering from the Word template.
//
// The template is public/word-form/aivex-participation-template-01.docx: a
// real Word document (not a hand-built one), fixed once in this phase so
// every {{placeholder}} is a single, unsplit run (see git history — three
// placeholders, edition_name/event_start_date/event_end_date, used to be
// hardcoded text; a fourth run split "10" as "1"+"0" across two runs, a
// classic Word artifact). Because the template is now clean, rendering is a
// deliberately small, dependency-light job: a literal `{{key}}` -> string
// substitution across every XML part of the .docx zip, nothing more.
//
// A generic template-engine library (docxtemplater and friends) is NOT used
// here on purpose:
//   - it would still have to scan every run for split tags, which the fixed
//     template no longer has — extra power for a problem that stopped
//     existing;
//   - the well-known free package for that (docxtemplater) is AGPL-3.0,
//     which is a real licensing question for a live service and not one to
//     answer implicitly by adding a dependency.
// jszip (MIT) is the only new dependency: it is just a zip reader/writer,
// the same role PizZip plays for docxtemplater, with no templating opinions
// attached.
//
// No filesystem write here: only the in-memory transform. Storage and the
// database are the caller's job (api/_lib/aivex-document-generation.js).

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'

// Static, literal path: Vercel's build-time file tracer (@vercel/nft) only
// bundles files it can see referenced this way. vercel.json also lists it
// under functions.*.includeFiles as a second, explicit guarantee.
const TEMPLATE_PATH = fileURLToPath(new URL('../../public/word-form/aivex-participation-template-01.docx', import.meta.url))

// Bumped whenever the template file itself changes shape (placeholders
// added/removed, layout redone) — stored per generated document so an old
// DOCX/PDF pair can always be traced back to the template that produced it.
export const AIVEX_TEMPLATE_VERSION = 'aivex-participation-template-01'

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
export const PDF_MIME = 'application/pdf'

let cachedTemplate = null

// Cached per warm serverless instance: the template is a static file, never
// changes between requests, no reason to re-read and re-stat it every time.
export async function loadRegistrationTemplate() {
  if (!cachedTemplate) cachedTemplate = await readFile(TEMPLATE_PATH)
  return cachedTemplate
}

// Test-only: forces the next loadRegistrationTemplate() to re-read the file.
export function resetTemplateCache() {
  cachedTemplate = null
}

const PLACEHOLDER_RE = /\{\{([a-zA-Z0-9_]+)\}\}/g
const XML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }
const escapeXml = (value) => String(value).replace(/[&<>"']/g, (char) => XML_ESCAPES[char])

// Every XML part is a plausible home for a placeholder (document.xml today;
// headers/footers/footnotes if the template ever grows one). Binary parts
// (media/*, and the exact `[Content_Types].xml` name check keeps this from
// ever touching that specific manifest) are left alone.
const isTemplatableXmlPart = (path) => path.endsWith('.xml') && !path.startsWith('word/media/')

// Replaces every {{key}} found in `data` and returns the filled document as
// a Buffer. Throws if the template still contains a {{...}} token after
// substitution (an unmapped placeholder must fail loudly, never print
// literally as "{{something}}" on the official document) or if `data` has
// keys the template never uses (a silent typo in the mapping is worse than
// a startup-time error here).
export async function renderRegistrationDocx(templateBuffer, data) {
  const zip = await JSZip.loadAsync(templateBuffer)
  const seen = new Set()
  const stillBraced = new Set()

  await Promise.all(Object.keys(zip.files).map(async (path) => {
    const entry = zip.files[path]
    if (entry.dir || !isTemplatableXmlPart(path)) return
    const xml = await entry.async('string')
    if (!xml.includes('{{')) return
    const filled = xml.replace(PLACEHOLDER_RE, (match, key) => {
      if (!(key in data)) {
        stillBraced.add(key) // unknown to the mapping: left as is, reported below
        return match
      }
      seen.add(key)
      return escapeXml(data[key])
    })
    zip.file(path, filled)
  }))

  // A template token with no matching data (a typo, or a placeholder the
  // mapping doesn't cover yet) must fail loudly, never print literally as
  // "{{something}}" on the official document.
  if (stillBraced.size) throw new Error(`Unresolved template placeholder(s): ${[...stillBraced].join(', ')}`)

  const unusedData = Object.keys(data).filter((key) => !seen.has(key))
  if (unusedData.length) throw new Error(`Data provided for placeholder(s) the template does not use: ${unusedData.join(', ')}`)

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } })
}

// --- PDF ---------------------------------------------------------------
//
// Deliberately NOT implemented as a real conversion. A DOCX -> PDF pass
// that keeps this template's layout (RTL Arabic, a bilingual mixed-script
// table, an embedded signature/stamp block) needs a real Word rendering
// engine: LibreOffice/soffice, or an external conversion API. Neither is
// available here:
//   - LibreOffice is not installed in this dev environment and is not a
//     realistic addition to a standard Vercel Node serverless function
//     (no container/custom runtime in this project, and shipping+invoking
//     a headless office suite from a stock Node function is not something
//     that deploys reliably on the current Vercel plan/tooling);
//   - an external HTTP conversion API would work, but is a new paid/
//     credentialed third-party dependency this phase has no authorization
//     to add.
// Rather than fake success (a byte-identical copy relabelled .pdf, or a
// blank PDF), this returns a clear "not available" result. The caller
// records that honestly (aivex_generated_documents.pdf row -> failed,
// error_code 'pdf_conversion_not_configured') instead of lying about it.
// The DOCX alone is the actual signable artifact for this template (its
// last line is the signature/stamp block), so this does not block the
// registration's document workflow — see aivex-document-generation.js.
//
// To wire in a real converter later: implement this function to return
// { available: true, buffer }, and nothing else in the pipeline changes.
export async function convertDocxToPdf() {
  return { available: false, reason: 'pdf_conversion_not_configured' }
}
