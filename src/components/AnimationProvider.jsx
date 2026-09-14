import { MotionConfig } from 'framer-motion'
import useLenis from '../hooks/useLenis'
import useMotionPreference from '../hooks/useMotionPreference'
import { AnimationContext } from '../lib/AnimationContext'
import CustomCursor from './CustomCursor'
import './animation.css'

export default function AnimationProvider({ children }) {
  const lenis = useLenis()
  const reduced = useMotionPreference()
  return (
    <AnimationContext value={lenis}>
      <MotionConfig reducedMotion={reduced ? 'always' : 'never'}>
        {children}
        <CustomCursor />
      </MotionConfig>
    </AnimationContext>
  )
}
