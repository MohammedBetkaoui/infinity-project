import { useRef } from 'react'
import { MotionConfig } from 'framer-motion'
import useMotionPreference from '../../hooks/useMotionPreference'
import AivexHeader from './AivexHeader'
import AivexHero from './AivexHero'
import AivexApproach from './AivexApproach'
import AivexChallenge from './AivexChallenge'
import AivexPreparation from './AivexPreparation'
import AivexDetails from './AivexDetails'
import AivexOrganisation from './AivexOrganisation'
import AivexFAQ from './AivexFAQ'
import AivexFooter from './AivexFooter'
import useAivexExperience from './useAivexExperience'
import useAivexReady from './useAivexReady'
import './aivex.css'
import './aivex-content.css'

export default function AivexPage({ ready, onReady }) {
  const pageRef = useRef(null)
  const reduced = useMotionPreference()
  useAivexExperience(pageRef, ready)
  useAivexReady(pageRef, onReady)

  return (
    <MotionConfig reducedMotion={reduced ? 'always' : 'never'}>
      <div className="aivex-page" ref={pageRef}>
        <a className="ax-skip" href="#ax-main">Skip to content</a>
        <AivexHeader />
        <main id="ax-main" tabIndex={-1}>
          <AivexHero />
          <AivexApproach />
          <AivexChallenge />
          <AivexPreparation />
          <AivexDetails />
          <AivexOrganisation />
          <AivexFAQ />
        </main>
        <AivexFooter />
      </div>
    </MotionConfig>
  )
}
