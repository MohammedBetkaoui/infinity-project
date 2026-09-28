// Short-lived, in-memory cache for admin list responses.
//
// It lives only in this tab's JavaScript memory: nothing is written to
// localStorage, sessionStorage or a cookie, and a reload empties it. Entries
// expire after `ttlMs`, the oldest is dropped beyond `maxEntries`, and a
// caller clears it whenever the data may have changed.
export function createListCache({ ttlMs, maxEntries = 20, now = () => Date.now() }) {
  const entries = new Map()

  return {
    get(key) {
      const entry = entries.get(key)
      if (!entry) return null
      if (now() - entry.storedAt >= ttlMs) {
        entries.delete(key)
        return null
      }
      return entry.value
    },

    set(key, value) {
      entries.delete(key)
      entries.set(key, { storedAt: now(), value })
      while (entries.size > maxEntries) entries.delete(entries.keys().next().value)
    },

    clear() {
      entries.clear()
    },

    get size() {
      return entries.size
    },
  }
}
