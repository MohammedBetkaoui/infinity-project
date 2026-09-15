import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import useHomeScrollMotion from './hooks/useHomeScrollMotion'
import AnimationProvider from './components/AnimationProvider'
import Navbar from './components/Navbar'
import ScrollExperience from './components/ScrollExperience'
import RouteScrollReset from './components/RouteScrollReset'
import Contact from './sections/Contact'
import Events from './sections/Events'
import ClubLife from './sections/ClubLife'
import FAQ from './sections/FAQ'
import Footer from './sections/Footer'
import Hero from './sections/Hero'
import Poles from './sections/Poles'
import AivexRoute from './pages/aivex/AivexRoute'
import AboutPage from './pages/about/AboutPage'
import EventsPage from './pages/events/EventsPage'

const CommunityPage = lazy(() => import('./pages/community/CommunityPage'))
const ContactPage = lazy(() => import('./pages/contact/ContactPage'))
const JoinPage = lazy(() => import('./pages/join/JoinPage'))
const AivexRegisterPage = lazy(() => import('./pages/aivex/register/AivexRegisterPage'))

function SitePage({ children, mainRef }) {
  return (
      <div className="min-h-screen overflow-clip bg-background text-text-primary">
        <ScrollExperience />
        <Navbar />
        <main ref={mainRef}>{children}</main>
        <Footer />
      </div>
  )
}

function HomePage() {
  const mainRef = useRef(null)
  useHomeScrollMotion(mainRef)
  return (
    <SitePage mainRef={mainRef}>
      <Hero />
      <Poles />
      <Events />
      <ClubLife />
      <FAQ />
      <Contact />
    </SitePage>
  )
}

function HomeRoute() {
  return <HomePage />
}

// TEMPORARY diagnostic overlay for the iPhone hero report (?debug=1).
// Shows viewport, zoom, UA and hero geometry on-device. Remove after diagnosis.
function DebugOverlay() {
  const { search } = useLocation()
  const [facts, setFacts] = useState(null)
  useEffect(() => {
    if (!new URLSearchParams(search).has('debug')) return
    const collect = () => {
      const layout = document.querySelector('.page-hero-layout')
      setFacts({
        iw: window.innerWidth, ih: window.innerHeight,
        scale: window.visualViewport ? Number(window.visualViewport.scale.toFixed(2)) : 'n/a',
        dpr: window.devicePixelRatio,
        ua: navigator.userAgent.match(/OS [\d_]+/)?.[0] || navigator.userAgent.slice(-24),
        mq767: matchMedia('(max-width: 767px)').matches,
        scrollW: document.documentElement.scrollWidth,
        grid: layout ? getComputedStyle(layout).gridTemplateColumns : 'n/a',
      })
    }
    collect()
    window.addEventListener('resize', collect)
    window.visualViewport?.addEventListener('resize', collect)
    const timer = window.setInterval(collect, 1000)
    return () => {
      window.removeEventListener('resize', collect)
      window.visualViewport?.removeEventListener('resize', collect)
      window.clearInterval(timer)
    }
  }, [search])
  if (!new URLSearchParams(search).has('debug') || !facts) return null
  return (
    <div style={{ position: 'fixed', zIndex: 9999, left: 8, right: 8, bottom: 8, background: '#000', color: '#0f0', font: '11px/1.5 monospace', padding: 10, borderRadius: 8, opacity: .92, pointerEvents: 'none', whiteSpace: 'pre-wrap' }}>
      {JSON.stringify(facts, null, 1)}
    </div>
  )
}

export default function App() {
  return (
    <AnimationProvider>
      <RouteScrollReset />
      <Routes>
        <Route path="/aivex/register" element={<Suspense fallback={null}><AivexRegisterPage /></Suspense>} />
        <Route path="/aivex" element={<AivexRoute />} />
        <Route path="/join" element={<SitePage><Suspense fallback={<p className="page-container py-40" role="status">Opening the application...</p>}><JoinPage /></Suspense></SitePage>} />
        <Route path="/about" element={<SitePage><AboutPage /></SitePage>} />
        <Route path="/events" element={<SitePage><EventsPage /></SitePage>} />
        <Route path="/community" element={<SitePage><Suspense fallback={<p className="page-container py-40" role="status">Opening the community...</p>}><CommunityPage /></Suspense></SitePage>} />
        <Route path="/contact" element={<SitePage><Suspense fallback={<p className="page-container py-40" role="status">Opening contact...</p>}><ContactPage /></Suspense></SitePage>} />
      <Route path="/" element={<HomeRoute />} />
      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <DebugOverlay />
    </AnimationProvider>
  )
}
