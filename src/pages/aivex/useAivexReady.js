import { useEffect } from 'react'

export default function useAivexReady(pageRef, onReady) {
  useEffect(() => {
    let disposed = false
    const image = pageRef.current.querySelector('.ax-art-reveal')
    const reveal = () => { if (!disposed) onReady(true) }
    let resolveImage
    const imageReady = new Promise(resolve => { resolveImage = resolve })
    const loaded = () => resolveImage()
    if (!image || image.complete) loaded()
    else {
      image.addEventListener('load', loaded, { once: true })
      image.addEventListener('error', loaded, { once: true })
    }
    // Wait for the real assets, not an artificial progress percentage; a slow font must not block entry.
    const timeout = window.setTimeout(reveal, 1600)
    Promise.all([document.fonts.ready, imageReady]).then(reveal)
    return () => {
      disposed = true
      clearTimeout(timeout)
      image?.removeEventListener('load', loaded)
      image?.removeEventListener('error', loaded)
    }
  }, [pageRef, onReady])
}
