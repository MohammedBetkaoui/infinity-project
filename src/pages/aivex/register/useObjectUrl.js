import { useEffect } from 'react'

// One object URL per File, shared by every preview of it (member card, review)
// and revoked shortly after the last one unmounts. The delay survives
// StrictMode's mount/unmount/mount without flashing a revoked image.
const cache = new Map()

const entryFor = (file) => {
  let entry = cache.get(file)
  if (!entry) {
    entry = { url: URL.createObjectURL(file), users: 0, timer: 0 }
    cache.set(file, entry)
  }
  return entry
}

export default function useObjectUrl(file) {
  const url = file ? entryFor(file).url : null

  useEffect(() => {
    if (!file) return undefined
    const entry = entryFor(file)
    entry.users += 1
    window.clearTimeout(entry.timer)
    return () => {
      entry.users -= 1
      if (entry.users > 0) return
      entry.timer = window.setTimeout(() => {
        if (entry.users > 0) return
        URL.revokeObjectURL(entry.url)
        cache.delete(file)
      }, 1500)
    }
  }, [file])

  return url
}
