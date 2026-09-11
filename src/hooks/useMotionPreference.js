import { useSyncExternalStore } from 'react'
import { shouldReduceMotion } from '../lib/motion'

const subscribe = (notify) => {
  const media = window.matchMedia('(prefers-reduced-motion: reduce)')
  media.addEventListener('change', notify)
  return () => media.removeEventListener('change', notify)
}

export default function useMotionPreference() {
  return useSyncExternalStore(subscribe, shouldReduceMotion, () => true)
}
