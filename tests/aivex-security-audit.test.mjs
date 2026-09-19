// AIVEX security regression tests (Phase 4D) — static, repo-wide checks that
// don't fit tests/aivex-contract-v4.test.mjs or tests/aivex-document-
// generation.test.mjs. No network, no database: everything here reads
// tracked source files and asserts a shape, not a live value.
//
// These guard the specific facts the Phase 4D audit found true today:
//   - the frontend never references a Supabase secret name or builds its
//     own Supabase client (only api/_lib and scripts do that, server-side);
//   - Vite's envPrefix can't accidentally start inlining SUPABASE_* into
//     the browser bundle;
//   - env files that must never be committed are actually gitignored, and
//     the tracked example file never carries a real-looking value;
//   - no secret-shaped string (a Supabase JWT or a new-format service key)
//     is sitting in the tracked working tree.
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = new URL('../', import.meta.url)
const rootPath = fileURLToPath(root)
const read = (path) => readFile(new URL(path, root), 'utf8')

// Lists files under `dir` (relative to the project root) whose name ends in
// one of `extensions`, returned as root-relative, forward-slash paths — the
// same shape `read()` and the assertion messages expect, on Windows too.
async function listFiles(dir, extensions) {
  const entries = await readdir(new URL(dir, root), { recursive: true, withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && extensions.some((ext) => entry.name.endsWith(ext)))
    .map((entry) => relative(rootPath, resolve(entry.parentPath, entry.name)).replace(/\\/g, '/'))
}

test('frontend (src/) never references a Supabase secret name or builds its own Supabase client', async () => {
  const files = await listFiles('src/', ['.js', '.jsx'])
  assert.ok(files.length > 50, 'sanity: the frontend tree was actually walked')
  for (const file of files) {
    const source = await read(file)
    assert.doesNotMatch(source, /SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|@supabase\/supabase-js|createClient\(/, file)
    // The submission-message filter legitimately denylists the word
    // "service_role" as text it must never show the visitor — that is the
    // one allowed occurrence, and it's a string literal, not a live value.
    if (/service_role/.test(source)) {
      assert.match(source, /service_role\|/, `${file}: unexpected "service_role" outside the display-message denylist`)
    }
  }
})

test('vite.config: envPrefix cannot inline SUPABASE_* (or any other server secret) into the browser bundle', async () => {
  const config = await read('vite.config.js')
  const match = config.match(/envPrefix\s*:\s*\[([^\]]*)\]/)
  assert.ok(match, 'envPrefix is explicitly configured')
  const prefixes = [...match[1].matchAll(/'([^']*)'/g)].map(([, value]) => value)
  assert.ok(prefixes.length > 0)
  for (const prefix of prefixes) {
    assert.ok(!'SUPABASE_SECRET_KEY'.startsWith(prefix) && !'SUPABASE_URL'.startsWith(prefix), `envPrefix ${JSON.stringify(prefix)} would match a Supabase server variable`)
  }
})

test('env files: server secrets are gitignored, and the tracked example never carries a real-looking value', async () => {
  const gitignore = await read('.gitignore')
  const lines = gitignore.split('\n').map((l) => l.trim())
  for (const pattern of ['.env', '.env.local', '.env.*.local', '.env.development', '.env.production', '.env.test']) {
    assert.ok(lines.includes(pattern), `.gitignore lists ${pattern}`)
  }

  const example = await read('.env.example')
  for (const line of example.split('\n')) {
    const match = line.match(/^(SUPABASE_URL|SUPABASE_SECRET_KEY)\s*=\s*(.*)$/)
    if (match) assert.equal(match[2].trim(), '', `${match[1]} in .env.example must stay empty`)
  }
})

test('no secret-shaped string (Supabase JWT or service key) is committed in the tracked working tree', async () => {
  const files = [
    ...await listFiles('src/', ['.js', '.jsx', '.json', '.css']),
    ...await listFiles('api/', ['.js', '.mjs']),
    ...await listFiles('shared/', ['.js']),
    ...await listFiles('scripts/', ['.mjs']),
    ...await listFiles('supabase/', ['.sql']),
    ...await listFiles('docs/', ['.md']),
    '.env.example', 'package.json', 'vercel.json', 'vite.config.js',
  ]
  const jwtShaped = /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/
  const newFormatKey = /sb_secret_[A-Za-z0-9]{10,}/
  for (const file of files) {
    const source = await read(file).catch(() => '')
    assert.doesNotMatch(source, jwtShaped, file)
    assert.doesNotMatch(source, newFormatKey, file)
  }
})

test('the AIVEX download endpoint is covered by the same no-public-URL / no-PII-logging discipline as the rest of the pipeline', async () => {
  // A companion to the equivalent checks in tests/aivex-contract-v4.test.mjs
  // (register.js + api/_lib/aivex-*) and tests/aivex-document-generation
  // .test.mjs (the storage/PII tests there) — this one just makes the
  // coverage of api/aivex/document.js explicit and independent of either.
  const source = await read('api/aivex/document.js')
  assert.doesNotMatch(source, /getPublicUrl|createSignedUrl/)
  for (const [, args] of source.matchAll(/console\.(?:error|log|warn)\(([^)]*)\)/g)) {
    const logged = args.replace(/'[^']*'/g, "''")
    assert.doesNotMatch(logged, /path|payload|body|registration\b|email|rfid|phone|message/i, `logs ${args}`)
  }
})

test('no scheduled/automatic deletion exists: retention is a manual, organiser-side decision today', async () => {
  const vercelConfig = JSON.parse(await read('vercel.json'))
  assert.equal(vercelConfig.crons, undefined, 'no Vercel Cron job is configured')
  for (const file of ['api/_lib/aivex-document-generation.js', 'api/_lib/aivex-document-store.js', 'api/_lib/aivex-registration-v4.js', 'api/aivex/register.js', 'api/aivex/document.js']) {
    const source = await read(file)
    assert.doesNotMatch(source, /\bpurge\b|\bexpire[sd]?\(|setTimeout\(.*delete|automatic.*delet/i, file)
  }
})
