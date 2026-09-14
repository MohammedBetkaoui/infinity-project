import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useInView } from 'framer-motion'
import useMotionPreference from './useMotionPreference'
import { clubMomentSets, CLUB_MOMENTS_INTERVAL_MS } from '../data/clubMoments'

const subscribeVisibility = (notify) => {
  document.addEventListener('visibilitychange', notify)
  return () => document.removeEventListener('visibilitychange', notify)
}
const isPageVisible = () => document.visibilityState === 'visible'

function prepareSet(index, cache) {
  return Promise.all(clubMomentSets[index].photos.map((photo) => {
    if (!cache.has(photo.src)) {
      const image = new Image()
      image.decoding = 'async'
      image.src = photo.src
      cache.set(photo.src, image.decode().catch((error) => {
        cache.delete(photo.src)
        throw error
      }))
    }
    return cache.get(photo.src)
  }))
}

async function findReadySet(start, count, cache) {
  for (let offset = 0; offset < count; offset += 1) {
    const index = (start + offset) % clubMomentSets.length
    try {
      await prepareSet(index, cache)
      return index
    } catch {
      // Keep a complete trio on screen if an individual source is unavailable.
    }
  }
  return null
}

export default function useClubMoments(galleryRef) {
  const cache = useRef(new Map())
  const reduced = useMotionPreference()
  const near = useInView(galleryRef, { margin: '240px', once: true })
  const visible = useInView(galleryRef, { amount: .25 })
  const pageVisible = useSyncExternalStore(subscribeVisibility, isPageVisible, () => true)
  const [activeIndex, setActiveIndex] = useState(0)
  const [ready, setReady] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [failed, setFailed] = useState(false)
  const playing = ready && visible && pageVisible && !hovered && !focused && !reduced && !failed

  useEffect(() => {
    if (!near) return undefined
    let cancelled = false

    findReadySet(0, clubMomentSets.length, cache.current).then((index) => {
      if (cancelled) return
      if (index === null) { setFailed(true); return }
      setActiveIndex(index)
      setReady(true)
    })

    return () => { cancelled = true }
  }, [near])

  useEffect(() => {
    if (!ready || reduced) return
    prepareSet((activeIndex + 1) % clubMomentSets.length, cache.current).catch(() => {})
  }, [ready, activeIndex, reduced])

  useEffect(() => {
    if (!playing) return undefined
    let cancelled = false
    const timer = window.setTimeout(async () => {
      const next = await findReadySet(activeIndex + 1, clubMomentSets.length - 1, cache.current)
      if (cancelled) return
      if (next === null) { setFailed(true); return }
      setActiveIndex(next)
    }, CLUB_MOMENTS_INTERVAL_MS)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [playing, activeIndex])

  return {
    activeIndex, reduced, ready, failed, playing,
    onPointerEnter: (event) => { if (event.pointerType === 'mouse') setHovered(true) },
    onPointerLeave: () => setHovered(false),
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
  }
}
