import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import useMotionPreference from './hooks/useMotionPreference'
import CustomCursor from './components/CustomCursor'
import Navbar from './components/Navbar'
import ScrollExperience from './components/ScrollExperience'
import RouteScrollReset from './components/RouteScrollReset'
import InfinityLoader from './components/InfinityLoader'
import Community from './sections/Community'
import Contact from './sections/Contact'
import Events from './sections/Events'
import FAQ from './sections/FAQ'
import Footer from './sections/Footer'
import Hero from './sections/Hero'
import Poles from './sections/Poles'
import AivexRoute from './pages/aivex/AivexRoute'
import AboutPage from './pages/about/AboutPage'
import EventsPage from './pages/events/EventsPage'

const MINIMUM_HOME_LOADING_MS = 2500
const HOME_LOADER_SESSION_KEY = 'infinity-home-loader-seen'

function hasSeenHomeLoader() {
  try {
    return window.sessionStorage.getItem(HOME_LOADER_SESSION_KEY) === 'true'
  } catch {
    return false
  }
}

function rememberHomeLoader() {
  try {
    window.sessionStorage.setItem(HOME_LOADER_SESSION_KEY, 'true')
  } catch {
    // Storage can be unavailable in strict privacy modes; the loader still works normally.
  }
}

function SitePage({ children }) {
  const reduced = useMotionPreference()
  return (
    <MotionConfig reducedMotion={reduced ? 'always' : 'never'}>
      <div className="min-h-screen overflow-clip bg-background text-text-primary">
        <ScrollExperience />
        <CustomCursor />
        <Navbar />
        <main>{children}</main>
        <Footer />
      </div>
    </MotionConfig>
  )
}

function HomePage() {
  return (
    <SitePage>
      <Hero />
      <Poles />
      <Community />
      <Events />
      <FAQ />
      <Contact />
    </SitePage>
  )
}

function HomeRoute() {
  const [phase, setPhase] = useState(() => hasSeenHomeLoader() ? 'complete' : 'loading')

  useEffect(() => {
    if (phase !== 'loading') return undefined

    rememberHomeLoader()
    const timer = window.setTimeout(() => setPhase('leaving'), MINIMUM_HOME_LOADING_MS)
    return () => window.clearTimeout(timer)
  }, [phase])

  const revealed = phase !== 'loading'
  const complete = phase === 'complete'

  return (
    <>
      {!complete && <InfinityLoader leaving={phase === 'leaving'} onComplete={() => setPhase('complete')} />}
      {revealed && (
        <div inert={!complete ? true : undefined} aria-busy={!complete || undefined}>
          <HomePage />
        </div>
      )}
    </>
  )
}

export default function App() {
  return (
    <>
      <RouteScrollReset />
      <Routes>
        <Route path="/aivex" element={<AivexRoute />} />
        <Route path="/about" element={<SitePage><AboutPage /></SitePage>} />
        <Route path="/events" element={<SitePage><EventsPage /></SitePage>} />
        <Route path="/" element={<HomeRoute />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}
