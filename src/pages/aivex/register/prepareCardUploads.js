// Vercel rejects function request bodies above 4.5 MB, while a single phone
// photo can already weigh that much. Before sending, each card larger than
// its share of the budget is re-encoded as JPEG at a smaller size, which is
// still easily readable for identity checks. Cards already under budget are
// sent untouched. The server validates whatever arrives anyway.

const REQUEST_FILE_BUDGET = 4 * 1000 * 1000
const MAX_FILE_BUDGET = 1200 * 1000
const MAX_EDGE = 1800
const MIN_EDGE = 900

const toBlob = (canvas, quality) => new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))

async function shrink(file, budget) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    let edge = MAX_EDGE
    let quality = .86
    let best = null
    for (let attempt = 0; attempt < 7; attempt += 1) {
      const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(bitmap.width * scale)
      canvas.height = Math.round(bitmap.height * scale)
      const context = canvas.getContext('2d')
      // JPEG has no alpha: paint transparent PNG areas white, not black.
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      const blob = await toBlob(canvas, quality)
      if (blob && (!best || blob.size < best.size)) best = blob
      if (blob && blob.size <= budget) break
      quality = Math.max(.6, quality - .08)
      edge = Math.max(MIN_EDGE, Math.round(edge * .85))
    }
    if (!best || best.size >= file.size) return file
    const name = `${file.name.replace(/\.[^.]+$/, '') || 'student-card'}.jpg`
    return new File([best], name, { type: 'image/jpeg', lastModified: file.lastModified })
  } finally {
    bitmap.close()
  }
}

export default async function prepareCardUploads(files) {
  const budget = Math.min(MAX_FILE_BUDGET, Math.floor(REQUEST_FILE_BUDGET / Math.max(1, files.length)))
  return Promise.all(files.map(async ({ field, file }) => {
    if (file.size <= budget) return { field, file }
    try {
      return { field, file: await shrink(file, budget) }
    } catch {
      // Undecodable in this browser: send as is and let the server decide.
      return { field, file }
    }
  }))
}
