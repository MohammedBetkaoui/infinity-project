import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Pause, Play } from 'lucide-react'
import useAivexScene from './useAivexScene'

function Orbit({ front = false }) {
  return (
    <div className={`ax-orbit-plane ${front ? 'ax-orbit-front' : 'ax-orbit-back'}`}>
      <svg viewBox="0 0 500 500" fill="none" className="ax-orbit-track">
        <circle cx="250" cy="250" r="244" />
        <path className="ax-orbit-arc" pathLength="1" d="M250 6A244 244 0 0 1 494 250" />
      </svg>
      <div className={`ax-orbit-turn ax-orbit-turn-${front ? 'front' : 'back'}`}>
        <i className="ax-satellite" /><i className="ax-satellite ax-satellite-small" />
      </div>
    </div>
  )
}

export default function AivexScene() {
  const sceneRef = useRef(null)
  const [paused, setPaused] = useState(false)
  const { enabled, depthStyle, pointerEvents } = useAivexScene(sceneRef, paused)

  return (
    <figure className="ax-hero-art ax-scene" ref={sceneRef} data-scene-enabled={enabled} data-scene-paused={paused}>
      <div className="ax-scene-register ax-intro-detail"><span>From an idea to the machine</span><span className="ax-scene-edition">2<sup>nd</sup> edition</span></div>
      <div className="ax-scene-viewport" {...pointerEvents}>
        <div className="ax-scene-perspective">
          <div className="ax-scene-scroll">
            <motion.div className="ax-scene-pointer" style={depthStyle}>
              <div className="ax-scene-aura" aria-hidden="true" />
              <div className="ax-scene-reveal">
                <div className="ax-scene-wafer" aria-hidden="true"><i /><i /><i /></div>
                <div className="ax-scene-orbits" aria-hidden="true"><Orbit /><Orbit front /></div>
                <div className="ax-scene-image">
                  <img className="ax-art-reveal" src="/assets/aivex-brain-chip.jpg" width="1122" height="1402"
                    alt="A red brain suspended above a processor, connected by glowing amber filaments." fetchPriority="high" />
                </div>
                <div className="ax-scene-annotation" aria-hidden="true"><i /><span>Intelligence<br /><strong>in action.</strong></span></div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
      <div className="ax-scene-footer ax-intro-detail">
        <figcaption>{enabled ? 'A new perspective. The same ambition.' : 'Intelligence takes shape.'}</figcaption>
        {enabled && <button className="ax-scene-pause" onClick={() => setPaused(!paused)} aria-pressed={paused}
          aria-label={paused ? 'Resume the 3D animation' : 'Pause the 3D animation'}>
          {paused ? <Play size={12} aria-hidden="true" /> : <Pause size={12} aria-hidden="true" />}<span>{paused ? 'Resume' : 'Pause'}</span>
        </button>}
      </div>
    </figure>
  )
}
