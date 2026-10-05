import { useCallback, useSyncExternalStore } from 'react'

// Interface accent, kept on this browser only. Authenticated server
// preferences are deliberately untouched; colours live in admin.css.
export const ADMIN_ACCENTS = Object.freeze([
  { key: 'forest', label: 'Forest', copy: 'Infinity green · default' },
  { key: 'ocean', label: 'Ocean', copy: 'Deep teal blue' },
  { key: 'plum', label: 'Plum', copy: 'Muted violet' },
  { key: 'ember', label: 'Ember', copy: 'Burnt orange' },
])
const STORAGE_KEY = 'infinity-admin-accent-v1'
const DEFAULT_ACCENT = 'forest'
const listeners = new Set()
// Last choice made in this tab, so the accent still applies when storage is blocked.
let tabAccent = null
const isAccent = (value) => ADMIN_ACCENTS.some((accent) => accent.key === value)

function readAccent() {
  if (tabAccent) return tabAccent
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    return isAccent(value) ? value : DEFAULT_ACCENT
  } catch {
    return DEFAULT_ACCENT
  }
}

function subscribe(listener) {
  listeners.add(listener)
  const onStorage = (event) => {
    if (event.key !== STORAGE_KEY) return
    tabAccent = null
    listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

export function useAdminAccent() {
  const accent = useSyncExternalStore(subscribe, readAccent, () => DEFAULT_ACCENT)
  const setAccent = useCallback((value) => {
    if (!isAccent(value)) return
    tabAccent = value
    try { window.localStorage.setItem(STORAGE_KEY, value) } catch { /* Kept for this tab only. */ }
    listeners.forEach((listener) => listener())
  }, [])
  return [accent, setAccent]
}
