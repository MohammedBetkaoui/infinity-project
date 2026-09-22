const DEFAULT_TIMEOUT_MS = 2 * 60 * 1000

export class CandidateUploadError extends Error {
  constructor(message, status, httpStatus = 0) {
    super(message || status || 'upload_failed')
    this.name = 'CandidateUploadError'
    this.status = status || 'upload_failed'
    this.httpStatus = httpStatus
  }
}

const safeMessage = (payload) => {
  const message = typeof payload?.message === 'string' ? payload.message.trim() : ''
  if (!message || /(supabase|service[_-]role|secret|api[_-]?key|postgres|storage path|stack trace)/i.test(message)) return ''
  return message.slice(0, 300)
}

export async function postCandidateJson(endpoint, body, timeoutMs = 20000) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || payload?.success === false) {
      throw new CandidateUploadError(safeMessage(payload), payload?.status || 'request_failed', response.status)
    }
    return payload
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    if (error instanceof CandidateUploadError) throw error
    throw new CandidateUploadError('', 'network')
  } finally {
    window.clearTimeout(timeout)
  }
}

// Mirrors Supabase Storage's official uploadToSignedUrl request shape while
// retaining XMLHttpRequest's byte-progress events. The signed URL is a
// short-lived capability for one server-derived staging object only.
export function uploadToSignedStorage({ signedUrl, file, onProgress, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  return new Promise((resolve, reject) => {
    const body = new FormData()
    body.append('cacheControl', '3600')
    // Do not transmit a candidate's local filename to Storage; object naming
    // comes exclusively from the signed URL and server-side manifest.
    body.append('', file, 'object')
    const request = new XMLHttpRequest()
    request.open('PUT', signedUrl)
    request.responseType = 'json'
    request.timeout = timeoutMs
    request.setRequestHeader('x-upsert', 'false')
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded, event.total)
    }
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) resolve()
      else reject(new CandidateUploadError('', request.status === 409 ? 'object_exists' : 'storage_upload_failed', request.status))
    }
    const fail = () => reject(new CandidateUploadError('', 'network'))
    request.onerror = fail
    request.ontimeout = fail
    request.send(body)
  })
}

export async function uploadCapabilitySet(capabilities, files, onProgress) {
  const byField = new Map(files.map((entry) => [entry.field, entry.file]))
  const total = files.reduce((sum, entry) => sum + entry.file.size, 0)
  let completed = 0
  for (const capability of capabilities) {
    const file = byField.get(capability.field)
    if (!file) throw new CandidateUploadError('', 'missing_file')
    if (!capability.alreadyUploaded) {
      await uploadToSignedStorage({
        signedUrl: capability.signedUrl,
        file,
        onProgress: (loaded) => onProgress?.(Math.min(99, Math.round(((completed + loaded) / total) * 100))),
      })
    }
    completed += file.size
    onProgress?.(Math.min(99, Math.round((completed / total) * 100)))
  }
}
