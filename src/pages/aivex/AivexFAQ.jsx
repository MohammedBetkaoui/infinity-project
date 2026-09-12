import { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowUpRight, Plus } from 'lucide-react'
import useMotionPreference from '../../hooks/useMotionPreference'
import { aivexFaqs, INSTAGRAM_URL } from './aivexData'

export default function AivexFAQ() {
  const [open, setOpen] = useState('format')
  const reduced = useMotionPreference()

  return (
    <section className="ax-faq" id="questions" aria-labelledby="ax-faq-title" tabIndex={-1}>
      <div className="ax-container ax-faq-layout">
        <div className="ax-faq-intro"><h2 id="ax-faq-title">Avant de<br />te lancer.</h2><p>Les réponses utiles, et ce qui reste à préciser. Pour le reste, on préfère en parler directement.</p><a href={INSTAGRAM_URL} target="_blank" rel="noreferrer" className="ax-text-link">Poser ma question <ArrowUpRight size={15} aria-hidden="true" /></a></div>
        <div className="ax-faq-list">
          {aivexFaqs.map(item => {
            const expanded = open === item.id
            return <article className={`ax-faq-item${expanded ? ' is-open' : ''}`} key={item.id}>
              <h3><button id={`ax-question-${item.id}`} type="button" aria-expanded={expanded} aria-controls={`ax-answer-${item.id}`} onClick={() => setOpen(expanded ? null : item.id)}>
                <span>{item.question}</span><motion.span className="ax-faq-icon" aria-hidden="true" animate={{ rotate: expanded ? 45 : 0 }} transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 280, damping: 20 }}><Plus size={18} /></motion.span>
              </button></h3>
              <div id={`ax-answer-${item.id}`} role="region" aria-labelledby={`ax-question-${item.id}`} hidden={!expanded}>
                {expanded && <motion.p initial={{ opacity: reduced ? 1 : 0 }} animate={{ opacity: 1 }} transition={{ duration: .18 }}>{item.answer}</motion.p>}
              </div>
            </article>
          })}
        </div>
      </div>
    </section>
  )
}
