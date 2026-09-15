import { lazy, Suspense, useRef } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
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
    </AnimationProvider>
  )
}
