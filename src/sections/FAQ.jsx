import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import useMotionPreference from '../hooks/useMotionPreference'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { Plus } from 'lucide-react'
import SectionHeading from '../components/SectionHeading'
import { faqs } from '../data/siteData'
import { SPRINGS } from '../lib/motion'

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState(0)
  const reduced = useMotionPreference()

  return (
    <section id="faq" className="section-space border-t border-olive/15">
      <div className="page-container grid gap-10 lg:grid-cols-[.8fr_1.2fr] lg:gap-20">
        <div className="lg:sticky lg:top-32 lg:h-fit">
          <SectionHeading
            title="Before you join."
            description="Answers to the questions students ask us most about life at the club."
          />
          <p className="mt-7 hidden max-w-[28ch] border-l border-olive pl-5 text-sm leading-6 text-sage lg:block">Something else on your mind? Send us a message on Instagram.</p>
        </div>

        <div className="border-t border-sage/20">
          {faqs.map((faq, index) => {
            const isOpen = openIndex === index
            return (
              <div key={faq.question} className="border-b border-sage/20">
                <button
                  id={`faq-question-${index}`}
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? -1 : index)}
                  className="group flex w-full items-center justify-between gap-6 py-6 text-left sm:py-7"
                  aria-expanded={isOpen}
                  aria-controls={`faq-panel-${index}`}
                >
                  <span className={`font-display text-xl font-semibold transition-colors sm:text-2xl ${isOpen ? 'text-sand' : 'text-cream group-hover:text-sage'}`}>{faq.question}</span>
                  <motion.span
                    animate={{ rotate: reduced ? 0 : isOpen ? 45 : 0 }}
                    transition={SPRINGS.control}
                    className={`grid size-9 shrink-0 place-items-center border transition-colors ${isOpen ? 'border-sand bg-sand text-ink' : 'border-sage/20 text-text-muted'}`}
                  >
                    <Plus className="size-4" style={reduced && isOpen ? { transform: 'rotate(45deg)' } : undefined} />
                  </motion.span>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      id={`faq-panel-${index}`}
                      role="region"
                      aria-labelledby={`faq-question-${index}`}
                      initial={reduced ? false : { height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
                      transition={reduced ? { duration: 0 } : { height: SPRINGS.accordion, opacity: { duration: 0.2 } }}
                      onAnimationComplete={() => ScrollTrigger.refresh()}
                      className="overflow-hidden"
                    >
                      <p className="max-w-[65ch] pb-7 pr-12 text-sm leading-7 text-text-muted sm:text-base">{faq.answer}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
