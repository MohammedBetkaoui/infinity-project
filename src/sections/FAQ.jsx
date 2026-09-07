import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Plus } from 'lucide-react'
import SectionHeading from '../components/SectionHeading'
import { faqs } from '../data/siteData'
import { SPRINGS } from '../lib/motion'

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState(0)

  return (
    <section id="faq" className="relative scroll-mt-20 border-t border-olive/15 py-20 sm:py-24 lg:py-28">
      <div className="mx-auto grid max-w-[1440px] gap-12 px-5 sm:px-8 lg:grid-cols-[.72fr_1.28fr] lg:gap-20 lg:px-12 xl:px-16">
        <div className="lg:sticky lg:top-32 lg:h-fit">
          <SectionHeading
            title="Avant de nous rejoindre."
            description="Les réponses aux questions que les étudiants nous posent le plus souvent sur la vie du club."
          />
          <p className="mt-7 hidden max-w-[28ch] border-l border-olive pl-5 text-sm leading-6 text-sage lg:block">Une autre question ? Écris-nous directement sur Instagram.</p>
        </div>

        <div className="border-t border-sage/20">
          {faqs.map((faq, index) => {
            const isOpen = openIndex === index
            return (
              <div key={faq.question} className="border-b border-sage/20">
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? -1 : index)}
                  className="group flex w-full items-center justify-between gap-6 py-6 text-left sm:py-7"
                  aria-expanded={isOpen}
                  aria-controls={`faq-panel-${index}`}
                >
                  <span className={`font-display text-xl font-semibold transition-colors sm:text-2xl ${isOpen ? 'text-sand' : 'text-cream group-hover:text-sage'}`}>{faq.question}</span>
                  <motion.span
                    animate={{ rotate: isOpen ? 45 : 0 }}
                    transition={SPRINGS.control}
                    className={`grid size-9 shrink-0 place-items-center border transition-colors ${isOpen ? 'border-sand bg-sand text-ink' : 'border-sage/20 text-text-muted'}`}
                  >
                    <Plus className="size-4" />
                  </motion.span>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      id={`faq-panel-${index}`}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ height: SPRINGS.accordion, opacity: { duration: 0.2 } }}
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
