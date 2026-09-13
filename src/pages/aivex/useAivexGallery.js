import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useInView } from 'framer-motion'
import useMotionPreference from '../../hooks/useMotionPreference'
import { firstEditionPhotos, galleryIndex, GALLERY_INTERVAL_MS } from './aivexGalleryData'
import { prepareGalleryPhoto } from './aivexGalleryImages'

const subscribeVisibility = (notify) => {
  document.addEventListener('visibilitychange', notify)
  return () => document.removeEventListener('visibilitychange', notify)
}
const isPageVisible = () => document.visibilityState === 'visible'

export default function useAivexGallery(rootRef, ready) {
  const requestRef = useRef(0)
  const requestedIndexRef = useRef(0)
  const cacheRef = useRef(new Map())
  const [slide, setSlide] = useState({ index: 0, direction: 1 })
  const [autoplay, setAutoplay] = useState(true)
  const [hovered, setHovered] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const reduced = useMotionPreference()
  const visible = useInView(rootRef, { amount: 0.3 })
  const pageVisible = useSyncExternalStore(subscribeVisibility, isPageVisible, () => true)
  const playing = ready && autoplay && visible && pageVisible && !hovered && !reduced && !loading

  const showPhoto = async (index, direction = 1) => {
    const next = galleryIndex(index)
    const request = ++requestRef.current
    requestedIndexRef.current = next
    setAutoplay(false)
    setError('')
    if (next === slide.index) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      // Decode before swapping: the outgoing photograph stays visible on slower connections.
      await prepareGalleryPhoto(firstEditionPhotos[next], cacheRef.current)
      if (request !== requestRef.current) return
      setSlide({ index: next, direction })
      setLoading(false)
    } catch {
      if (request !== requestRef.current) return
      setError('This photograph could not be loaded. Please try another.')
      setLoading(false)
      setAutoplay(false)
    }
  }

  const step = (direction) => showPhoto(requestedIndexRef.current + direction, direction)

  useEffect(() => {
    if (!playing) return
    let cancelled = false
    const timer = window.setTimeout(async () => {
      const next = galleryIndex(slide.index + 1)
      try {
        await prepareGalleryPhoto(firstEditionPhotos[next], cacheRef.current)
        if (cancelled) return
        requestedIndexRef.current = next
        setSlide({ index: next, direction: 1 })
      } catch {
        if (cancelled) return
        setError('This photograph could not be loaded. Please try another.')
        setAutoplay(false)
      }
    }, GALLERY_INTERVAL_MS)
    return () => {
      // A paused or offscreen album must not advance when a slow image finally arrives.
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [playing, slide.index])

  useEffect(() => {
    if (!visible) return
    // Only warm the current frame and its two previews, not the entire album at page load.
    for (const offset of [0, 1, 2]) {
      prepareGalleryPhoto(firstEditionPhotos[galleryIndex(slide.index + offset)], cacheRef.current).catch(() => {})
    }
  }, [visible, slide.index])

  useEffect(() => () => { requestRef.current += 1 }, [])

  return {
    slide, reduced, playing, autoplay, loading, error, step, showPhoto,
    pause: () => setAutoplay(false),
    togglePlayback: () => setAutoplay((value) => !value),
    onPointerEnter: (event) => { if (event.pointerType === 'mouse') setHovered(true) },
    onPointerLeave: () => setHovered(false),
    onFocusCapture: (event) => {
      if (!event.target.closest('[data-gallery-playback]')) setAutoplay(false)
    },
    onImageError: () => {
      setError('This photograph could not be loaded. Please try another.')
      setAutoplay(false)
    },
  }
}
