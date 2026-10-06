import { useCallback, useLayoutEffect, useSyncExternalStore } from 'react'
import { flushSync } from 'react-dom'

// Light, dark or the operating system's choice, kept on this browser only
// like the accent. Authenticated server preferences are deliberately
// untouched; the colours themselves live in admin.css.
export const ADMIN_THEMES = Object.freeze([
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
  { key: 'system', label: 'System' },
])
const STORAGE_KEY = 'infinity-admin-theme-v1'
const DEFAULT_THEME = 'system'
const DARK_QUERY = '(prefers-color-scheme: dark)'
const listeners = new Set()
// Last choice made in this tab, so the theme still applies when storage is blocked.
let tabTheme = null
const isTheme = (value) => ADMIN_THEMES.some((theme) => theme.key === value)
const darkQuery = () => (typeof window.matchMedia === 'function' ? window.matchMedia(DARK_QUERY) : null)

function readPreference() {
  if (tabTheme) return tabTheme
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    return isTheme(value) ? value : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

// A single string, so React compares snapshots by value. Read during render,
// the theme is on the first committed markup: nothing paints in the wrong one.
function readSnapshot() {
  const preference = readPreference()
  const theme = preference === 'system' ? (darkQuery()?.matches ? 'dark' : 'light') : preference
  return `${preference} ${theme}`
}

function subscribe(listener) {
  listeners.add(listener)
  const query = darkQuery()
  const onStorage = (event) => {
    if (event.key !== STORAGE_KEY) return
    tabTheme = null
    listener()
  }
  window.addEventListener('storage', onStorage)
  query?.addEventListener('change', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
    query?.removeEventListener('change', listener)
  }
}

export function useAdminTheme() {
  const [preference, theme] = useSyncExternalStore(subscribe, readSnapshot, () => `${DEFAULT_THEME} light`).split(' ')
  const setPreference = useCallback((value) => {
    if (!isTheme(value)) return
    tabTheme = value
    try { window.localStorage.setItem(STORAGE_KEY, value) } catch { /* Kept for this tab only. */ }
    listeners.forEach((listener) => listener())
  }, [])
  return { preference, theme, setPreference }
}

// A short cross-fade between themes where the browser supports view
// transitions, an instant switch when reduced motion is in effect.
export function useThemeSwitch(reducedMotion) {
  const { preference, theme, setPreference } = useAdminTheme()
  const choose = useCallback((value) => {
    if (reducedMotion || typeof document.startViewTransition !== 'function') {
      setPreference(value)
      return
    }
    document.startViewTransition(() => flushSync(() => setPreference(value)))
  }, [reducedMotion, setPreference])
  return { preference, theme, choose }
}

// Mobile browsers tint their toolbar with <meta name="theme-color">: match the
// administration surface while it is on screen, give the site's value back after.
export function useThemeColor(ref, token, key) {
  useLayoutEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]')
    const node = ref.current
    if (!meta || !node) return undefined
    const previous = meta.getAttribute('content')
    const value = getComputedStyle(node).getPropertyValue(token).trim()
    if (value) meta.setAttribute('content', value)
    return () => {
      if (previous !== null) meta.setAttribute('content', previous)
    }
  }, [key, ref, token])
}
