import { lazy, Suspense, useEffect, useState } from 'react'
import AivexLoader from '../../components/AivexLoader'

const AivexPage = lazy(() => import('./AivexPage'))
const MINIMUM_LOADING_MS = 2500

export default function AivexRoute() {
  const [assetsReady, setAssetsReady] = useState(false)
  const [minimumElapsed, setMinimumElapsed] = useState(false)
  const [entered, setEntered] = useState(false)
  const ready = assetsReady && minimumElapsed

  useEffect(() => {
    if (entered) return
    window.dispatchEvent(new CustomEvent('infinity:scroll-lock', { detail: { locked: true } }))
    return () => window.dispatchEvent(new CustomEvent('infinity:scroll-lock', { detail: { locked: false } }))
  }, [entered])

  useEffect(() => {
    const timer = window.setTimeout(() => setMinimumElapsed(true), MINIMUM_LOADING_MS)
    return () => window.clearTimeout(timer)
  }, [])
  return (
    <>
      {!entered && <AivexLoader ready={ready} onComplete={setEntered} />}
      <div inert={!entered ? true : undefined} aria-busy={!entered || undefined}>
        <Suspense fallback={null}>
          <AivexPage ready={ready} onReady={setAssetsReady} />
        </Suspense>
      </div>
    </>
  )
}
