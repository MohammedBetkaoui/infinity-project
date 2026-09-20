// Streaming multipart/form-data parser for api/ handlers (busboy).
//
// The request stream is read directly: never touch req.body on these
// routes, or the Vercel runtime would try to consume the stream itself.
// Every file is buffered in memory, so the limits below are the memory
// budget of one request.

import busboy from 'busboy'

export class MultipartError extends Error {
  // `field` (optional): the multipart part the problem is about, when there is
  // one (an oversized file), so a caller can point the applicant at it.
  constructor(status, message, field) {
    super(message)
    this.status = status
    if (field) this.field = field
  }
}

// Resolves { fields: { name: string }, files: Map<name, { buffer, size, mimeType, filename }> }.
// `filename` is the client-declared name: untrusted, only compared with the
// detected type (form v4), never used as a storage path.
// Rejects with MultipartError (status + public message) on any violation.
export function parseMultipart(req, limits) {
  const {
    maxFileBytes,
    maxFiles,
    maxRequestBytes,
    allowedFields,
    fileFieldPattern,
    maxFieldBytes = 64 * 1024,
    // Both messages default to their original, exact wording so every
    // existing caller is unaffected — only a caller with a different file
    // policy (api/aivex/magic-link/upload.js, whose limit is 10 MB, not 5)
    // needs to override either of these. `fileSizeMessage` may also be a
    // function of the offending part's name, for a request that carries
    // several kinds of file (api/aivex/register.js: student cards and
    // identity cards).
    contentTypeMessage = 'Registrations must be sent as multipart/form-data.',
    fileSizeMessage = 'Each student card must be 5 MB or smaller.',
  } = limits

  return new Promise((resolve, reject) => {
    const contentType = req.headers?.['content-type'] || ''
    if (!/^multipart\/form-data;/i.test(contentType)) {
      reject(new MultipartError(415, contentTypeMessage))
      return
    }

    let parser
    try {
      parser = busboy({
        headers: req.headers,
        limits: {
          fileSize: maxFileBytes,
          files: maxFiles,
          fields: allowedFields.size,
          fieldSize: maxFieldBytes,
          // busboy emits 'partsLimit' when the count REACHES this value, while
          // 'filesLimit' / 'fieldsLimit' only fire once exceeded: +1 keeps an
          // exact, valid request (every field + every file) below it.
          parts: maxFiles + allowedFields.size + 1,
          headerPairs: 64,
        },
      })
    } catch {
      reject(new MultipartError(400, 'Invalid registration data.'))
      return
    }

    const fields = {}
    const files = new Map()
    let received = 0
    let settled = false

    const fail = (status, message, field) => {
      if (settled) return
      settled = true
      req.unpipe(parser)
      // Drain the rest so the client gets the response instead of a reset.
      // Nothing more is buffered: the promise is already rejected and the
      // remaining bytes are discarded, so a rejected upload never costs more
      // memory than the limit that rejected it.
      req.resume()
      reject(new MultipartError(status, message, field))
    }

    req.on('data', (chunk) => {
      received += chunk.length
      if (received > maxRequestBytes) fail(413, 'This registration is too large to send.')
    })
    req.on('error', () => fail(400, 'The upload was interrupted.'))

    parser.on('field', (name, value, info) => {
      if (settled) return
      if (!allowedFields.has(name)) return fail(400, 'Invalid registration data.')
      if (info.valueTruncated) return fail(413, 'This registration is too large to send.')
      if (name in fields) return fail(400, 'Invalid registration data.')
      fields[name] = value
    })

    parser.on('file', (name, stream, info) => {
      if (settled || !fileFieldPattern.test(name) || files.has(name)) {
        stream.resume()
        if (!settled) fail(400, 'Unexpected file in this registration.')
        return
      }
      const chunks = []
      let size = 0
      let truncated = false
      stream.on('data', (chunk) => {
        size += chunk.length
        if (!truncated) chunks.push(chunk)
      })
      // busboy stops at limits.fileSize: the request is refused here, while
      // the file is still arriving, not after it has been read to the end.
      stream.on('limit', () => {
        truncated = true
        fail(413, typeof fileSizeMessage === 'function' ? fileSizeMessage(name) : fileSizeMessage, name)
      })
      stream.on('close', () => {
        if (settled || truncated) return
        files.set(name, { buffer: Buffer.concat(chunks), size, mimeType: info.mimeType, filename: info.filename })
      })
    })

    parser.on('filesLimit', () => fail(413, 'Too many files in this registration.'))
    parser.on('fieldsLimit', () => fail(400, 'Invalid registration data.'))
    parser.on('partsLimit', () => fail(413, 'Too many parts in this registration.'))
    parser.on('error', () => fail(400, 'Invalid registration data.'))
    parser.on('close', () => {
      if (settled) return
      settled = true
      resolve({ fields, files })
    })

    req.pipe(parser)
  })
}
