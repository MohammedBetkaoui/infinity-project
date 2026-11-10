// Quality tiers for the AI Automation page: 'high' | 'mid' | 'low'.
//
// The tier is decided once from the device, then it can only go down: a probe
// on the hero canvas measures the first frames and steps a struggling device
// down a level. The result lives in sessionStorage for the rest of the visit.
// It is exposed to CSS as data-perf on .ai-experience and to JS through
// perfTier() / subscribeTier(). QA can force a tier with ?perf=high|mid|low.

export const TIERS = ['low', 'mid', 'high']
const KEY = 'ai-automation:perf-tier'

const listeners = new Set()
let current = null

const safeStorage = {
  get() { try { return window.sessionStorage.getItem(KEY) } catch { return null } },
  set(value) { try { window.sessionStorage.setItem(KEY, value) } catch { /* private mode */ } },
}

const forcedTier = () => {
  const forced = new URLSearchParams(window.location.search).get('perf')
  return TIERS.includes(forced) ? forced : null
}

function detect() {
  if (typeof window === 'undefined') return 'high'
  const nav = window.navigator
  const media = (query) => window.matchMedia(query).matches
  const cores = nav.hardwareConcurrency || 8
  // deviceMemory is Chromium-only: when absent, assume a capable device.
  const memory = nav.deviceMemory || 8
  if (media('(prefers-reduced-motion: reduce)') || nav.connection?.saveData || (cores <= 4 && memory <= 4)) return 'low'
  if (cores <= 6 || memory <= 4 || (media('(pointer: coarse)') && window.innerWidth < 900)) return 'mid'
  return 'high'
}

// A tier forced by ?perf= is a QA choice: the probe never overrides it.
export const isForced = () => typeof window !== 'undefined' && forcedTier() !== null

export function perfTier() {
  if (current) return current
  if (typeof window !== 'undefined' && forcedTier()) { current = forcedTier(); return current }
  const detected = detect()
  const stored = safeStorage.get()
  // A stored tier is a probe verdict: it can lower the detected one, never raise it.
  current = TIERS.includes(stored) && TIERS.indexOf(stored) < TIERS.indexOf(detected) ? stored : detected
  return current
}

// One step down, never up. Returns the new tier.
export function lowerTier() {
  const now = perfTier()
  const next = TIERS[Math.max(0, TIERS.indexOf(now) - 1)]
  if (next === now) return now
  current = next
  safeStorage.set(next)
  listeners.forEach((listener) => listener(next))
  return next
}

export function subscribeTier(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// Rate of the canvas probe, shared by the hero engine: at most one verdict per visit.
let probed = false
export function probeOnce() {
  if (probed) return false
  probed = true
  return true
}
