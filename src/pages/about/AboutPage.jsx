import { useEffect, useRef } from 'react'
import AboutClosing from './AboutClosing'
import AboutFields from './AboutFields'
import AboutHero from './AboutHero'
import AboutProcess from './AboutProcess'
import AboutStory from './AboutStory'
import useAboutPageMotion from './useAboutPageMotion'
import './about.css'

export default function AboutPage() {
  const pageRef = useRef(null)
  useAboutPageMotion(pageRef)

  useEffect(() => {
    const previousTitle = document.title
    document.title = 'About | Infinity Club'
    return () => { document.title = previousTitle }
  }, [])

  return (
    <div id="about-page" ref={pageRef} className="about-page">
      <AboutHero />
      <AboutStory />
      <AboutProcess />
      <AboutFields />
      <AboutClosing />
    </div>
  )
}
