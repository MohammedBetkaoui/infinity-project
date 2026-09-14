import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { animate, useInView, useMotionValue, useMotionValueEvent } from 'framer-motion'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useAnimationContext } from '../../lib/AnimationContext'
import useMotionPreference from '../../hooks/useMotionPreference'
import { firstEditionPhotos, GALLERY_INTERVAL_MS } from './aivexGalleryData'
import { prepareGalleryPhoto } from './aivexGalleryImages'
import { clamp, GALLERY_EASE, galleryPosition, galleryScrollTarget } from './gallery/galleryTimeline'

const subscribeVisibility = (notify) => {
  document.addEventListener('visibilitychange', notify)
  return () => document.removeEventListener('visibilitychange', notify)
}
const isPageVisible = () => document.visibilityState === 'visible'
const subscribeViewport = (notify) => {
  const queries = ['(max-width: 799px)', '(max-height: 559px)'].map((query) => window.matchMedia(query))
  queries.forEach((query) => query.addEventListener('change', notify))
  return () => queries.forEach((query) => query.removeEventListener('change', notify))
}
const viewportMode = () => `${window.innerWidth <= 799 ? 'mobile' : 'desktop'}-${window.innerHeight <= 559 ? 'short' : 'tall'}`

export default function useAivexGallery(trackRef, panelRef, ready) {
  const count = firstEditionPhotos.length
  const reduced = useMotionPreference()
  const lenis = useAnimationContext()
  const viewport = useSyncExternalStore(subscribeViewport, viewportMode, () => 'mobile-short')
  const mobile = viewport.startsWith('mobile')
  const scrollEnabled = !reduced && !mobile && !viewport.endsWith('short')
  const inset = mobile ? 76 : 94
  const position = useMotionValue(0)
  const indexRef = useRef(0)
  const seekRef = useRef(null)
  const requestRef = useRef(0)
  const cacheRef = useRef(new Map())
  const animationRef = useRef(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [loaded, setLoaded] = useState(() => new Set())
  const [fallbackIndex, setFallbackIndex] = useState(0)
  const [autoplay, setAutoplay] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [announcement, setAnnouncement] = useState('')
  const near = useInView(panelRef, { margin: '280px', once: true })
  const visible = useInView(panelRef, { amount: 0.45 })
  const pageVisible = useSyncExternalStore(subscribeVisibility, isPageVisible, () => true)
  const playing = ready && autoplay && visible && pageVisible && !hovered && !reduced && !loading

  useMotionValueEvent(position, 'change', (value) => {
    if (seekRef.current !== null && Math.abs(value - seekRef.current) < 0.025) seekRef.current = null
    const next = clamp(Math.round(value), 0, count - 1)
    if (next === indexRef.current) return
    indexRef.current = next
    setActiveIndex(next)
  })

  useLayoutEffect(() => {
    if (!ready || !scrollEnabled) return
    // The same GSAP clock drives the photograph, rail and progress; Framer only handles manual playback.
    const paint = (self) => position.set(galleryPosition(self.progress, count))
    const trigger = ScrollTrigger.create({
      id: 'aivex-photo-album', trigger: trackRef.current,
      start: `top ${inset}px`, end: 'bottom bottom',
      onUpdate: paint, onRefresh: paint, invalidateOnRefresh: true,
    })
    paint(trigger)
    return () => trigger.kill()
  }, [ready, scrollEnabled, count, position, trackRef, inset])

  useEffect(() => {
    if (!near) return
    let cancelled = false
    const indices = [activeIndex, activeIndex - 1, activeIndex + 1].filter((index) => index >= 0 && index < count)
    indices.forEach((index) => {
      prepareGalleryPhoto(firstEditionPhotos[index], cacheRef.current).then(() => {
        if (cancelled) return
        setLoaded((previous) => previous.has(index) ? previous : new Set([...previous, index]))
        if (index === activeIndex) {
          setFallbackIndex(index)
          setError('')
        }
      }).catch(() => {
        if (!cancelled && index === activeIndex) setError('This photograph is unavailable. You can continue to the next one.')
      })
    })
    return () => { cancelled = true }
  }, [near, activeIndex, count])

  const moveTo = (index) => {
    animationRef.current?.stop()
    if (scrollEnabled) {
      // Seeking moves the real page, not a second slider clock.
      const bounds = trackRef.current.getBoundingClientRect()
      const top = galleryScrollTarget({
        top: bounds.top + window.scrollY, height: bounds.height,
        viewportHeight: window.innerHeight, inset,
      }, index, count)
      if (lenis?.current) lenis.current.scrollTo(top, { duration: .62 })
      else window.scrollTo({ top, behavior: 'smooth' })
    } else if (reduced) {
      position.set(index)
    } else {
      animationRef.current = animate(position, index, { duration: 0.42, ease: GALLERY_EASE })
    }
  }

  const showPhoto = async (index) => {
    const next = clamp(index, 0, count - 1)
    const request = ++requestRef.current
    seekRef.current = next
    setAutoplay(false)
    setLoading(true)
    setError('')
    try {
      await prepareGalleryPhoto(firstEditionPhotos[next], cacheRef.current)
      if (request !== requestRef.current) return
      setLoaded((previous) => new Set([...previous, next]))
      setLoading(false)
      setAnnouncement(`Photograph ${next + 1} of ${count}. ${firstEditionPhotos[next].caption}`)
      moveTo(next)
    } catch {
      if (request !== requestRef.current) return
      setLoading(false)
      seekRef.current = null
      setError('This photograph could not be loaded. Please try another.')
    }
  }

  useEffect(() => {
    if (!playing) return
    let cancelled = false
    const timer = window.setTimeout(async () => {
      const next = Math.min(activeIndex + 1, count - 1)
      if (next === activeIndex) { setAutoplay(false); return }
      try {
        await prepareGalleryPhoto(firstEditionPhotos[next], cacheRef.current)
        if (cancelled) return
        setLoaded((previous) => new Set([...previous, next]))
        if (scrollEnabled) {
          const bounds = trackRef.current.getBoundingClientRect()
          const top = galleryScrollTarget({ top: bounds.top + window.scrollY, height: bounds.height, viewportHeight: window.innerHeight, inset }, next, count)
          if (lenis?.current) lenis.current.scrollTo(top, { duration: .62 })
          else window.scrollTo({ top, behavior: 'smooth' })
        } else {
          animationRef.current?.stop()
          animationRef.current = animate(position, next, { duration: 0.42, ease: GALLERY_EASE })
        }
      } catch {
        if (cancelled) return
        setError('This photograph could not be loaded. Please try another.')
        setAutoplay(false)
      }
    }, GALLERY_INTERVAL_MS)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [playing, activeIndex, count, scrollEnabled, inset, position, trackRef, lenis])

  useEffect(() => {
    const stop = () => {
      // A reader's new gesture also cancels a pending seek on a slow connection.
      requestRef.current += 1
      seekRef.current = null
      animationRef.current?.stop()
      setLoading(false)
      setAutoplay(false)
    }
    const stopWithKey = (event) => {
      if (event.defaultPrevented) return
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', 'Escape'].includes(event.key)) stop()
    }
    window.addEventListener('wheel', stop, { passive: true })
    window.addEventListener('touchmove', stop, { passive: true })
    window.addEventListener('keydown', stopWithKey)
    return () => {
      window.removeEventListener('wheel', stop)
      window.removeEventListener('touchmove', stop)
      window.removeEventListener('keydown', stopWithKey)
    }
  }, [])

  useEffect(() => () => {
    requestRef.current += 1
    animationRef.current?.stop()
  }, [])

  return {
    position, activeIndex, loaded, fallbackIndex, reduced, mobile, scrollEnabled,
    autoplay, playing, loading, error, announcement, showPhoto,
    step: (direction) => showPhoto((seekRef.current ?? indexRef.current) + direction),
    pause: () => setAutoplay(false),
    togglePlayback: () => {
      if (!autoplay && activeIndex === count - 1) moveTo(0)
      setAutoplay((value) => !value)
    },
    onPointerEnter: (event) => { if (event.pointerType === 'mouse') setHovered(true) },
    onPointerLeave: () => setHovered(false),
    onFocusCapture: (event) => {
      if (!event.target.closest('[data-gallery-playback]')) setAutoplay(false)
    },
    onImageError: () => setError('This photograph is unavailable. You can continue to the next one.'),
  }
}
