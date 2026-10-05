import { useId, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import useMotionPreference from '../../hooks/useMotionPreference'
import AboutProcessScene from './AboutProcessScene'
import './about-method.css'

const stages = [
  {
    title: 'Question', label: 'Find the starting point', verb: 'Define',
    text: 'Start with something you want to understand, improve or make possible. Discuss it, sketch it, and decide what a useful first answer would look like.',
    output: 'A clear question and a first direction.',
  },
  {
    title: 'Prototype', label: 'Give the idea a first form', verb: 'Make',
    text: 'Build a small version with other students. Put it in front of someone, notice where it falls short, and use that feedback to shape the next attempt.',
    output: 'A version you can test, with notes on what to change.',
  },
  {
    title: 'Shared project', label: 'Make the work useful to others', verb: 'Share',
    text: 'Show what you made and explain how it works. Leave enough documentation for another member to try it, improve it, or take the idea further.',
    output: 'A demonstration, working files and a next step.',
  },
]

export default function AboutProcess() {
  const [activeIndex, setActiveIndex] = useState(0)
  const tabsRef = useRef(null)
  const id = useId()
  const reduced = useMotionPreference()

  const handleTabKey = (event, index) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    let next
    if (event.key === 'ArrowDown') next = (index + 1) % stages.length
    else if (event.key === 'ArrowUp') next = (index - 1 + stages.length) % stages.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = stages.length - 1
    else return
    event.preventDefault()
    setActiveIndex(next)
    tabsRef.current.querySelectorAll('[role="tab"]')[next].focus({ preventScroll: true })
  }

  return (
    <section id="about-method" className="about-process" aria-labelledby="about-process-title" data-motion-trigger="viewport">
      <div className="page-container">
        <p className="about-section-index about-section-index-dark" data-animated-text=""><span>02 / Method</span><span>Thinking, making, sharing.</span></p>
        <header className="about-process-header">
          <div>
            <p className="about-process-overline" data-animated-text="">The work behind the idea</p>
            <h2 id="about-process-title">How an idea<br /><em>gets made.</em></h2>
          </div>
          <p>Ask a clear question. Test a first version. Share the work so the next person can build on it.</p>
        </header>

        <div className="about-process-track">
          <div className="about-method-rail" data-animated-text="">
            <p className="about-method-rail-label">The working process<span>0{activeIndex + 1} / 03</span></p>
            <ol ref={tabsRef} className="about-process-stages" role="tablist" aria-label="Explore our working process" aria-orientation="vertical">
              {stages.map((stage, index) => (
                <li key={stage.title} role="presentation">
                  <button
                    type="button"
                    role="tab"
                    id={`${id}-tab-${index}`}
                    aria-selected={activeIndex === index}
                    aria-controls={`${id}-panel-${index}`}
                    tabIndex={activeIndex === index ? 0 : -1}
                    onClick={() => setActiveIndex(index)}
                    onKeyDown={(event) => handleTabKey(event, index)}
                  >
                    <span className="about-method-step-number" aria-hidden="true">0{index + 1}</span>
                    <span className="about-method-step-copy"><span className="about-method-step-name">{stage.title}</span><span className="about-method-step-label">{stage.label}</span></span>
                    <ArrowRight size={18} strokeWidth={1.4} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ol>
            <p className="about-method-rail-note">Progress is rarely a straight line.<br />Each test can bring you back to a better question.</p>
          </div>

          <div className="about-method-panels" data-animated-text="">
            {stages.map((stage, index) => (
              <motion.div
                key={stage.title}
                className="about-process-detail"
                id={`${id}-panel-${index}`}
                role="tabpanel"
                aria-labelledby={`${id}-tab-${index}`}
                tabIndex={0}
                hidden={activeIndex !== index}
                initial={false}
                animate={activeIndex === index ? { opacity: 1, y: 0 } : { opacity: 0, y: reduced ? 0 : 8 }}
                transition={{ duration: reduced ? 0 : .28, ease: [.2, .7, .2, 1] }}
              >
                <div className="about-method-copy">
                  <p className="about-method-detail-label"><span>0{index + 1} / {stage.verb}</span><span>Infinity method</span></p>
                  <h3>{stage.title}</h3>
                  <p className="about-method-description">{stage.text}</p>
                  <div className="about-method-output"><span>What you leave with</span><p>{stage.output}</p></div>
                </div>
                <AboutProcessScene stage={index} />
              </motion.div>
            ))}
          </div>
        </div>

        <div className="about-method-footer" data-animated-text="">
          <p>One example. The same approach across every discipline.</p>
          <Link to="/events">Explore our events <ArrowUpRight size={17} strokeWidth={1.4} aria-hidden="true" /></Link>
        </div>
      </div>
    </section>
  )
}
