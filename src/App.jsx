import { Route, Routes } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import CustomCursor from './components/CustomCursor'
import Navbar from './components/Navbar'
import ScrollExperience from './components/ScrollExperience'
import About from './sections/About'
import Community from './sections/Community'
import Contact from './sections/Contact'
import Events from './sections/Events'
import FAQ from './sections/FAQ'
import Footer from './sections/Footer'
import Hero from './sections/Hero'
import Poles from './sections/Poles'

function HomePage() {
  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen overflow-clip bg-background text-text-primary">
        <ScrollExperience />
        <CustomCursor />
        <Navbar />
        <main>
          <Hero />
          <About />
          <Poles />
          <Community />
          <Events />
          <FAQ />
          <Contact />
        </main>
        <Footer />
      </div>
    </MotionConfig>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="*" element={<HomePage />} />
    </Routes>
  )
}
