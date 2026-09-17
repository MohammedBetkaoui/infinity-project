import { motion } from 'framer-motion'

// A numbered identity record: students and delegation members share it.
export default function RecordCard({ id, index, role, name, placeholder, remaining, order = 0, reduced, children }) {
  const titleId = `${id}-title`
  const complete = remaining === 0
  return (
    <motion.article
      id={id}
      className="axr-record"
      tabIndex={-1}
      aria-labelledby={titleId}
      data-complete={complete ? '' : undefined}
      initial={reduced ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: .32, delay: reduced ? 0 : order * .05, ease: [0.16, 1, 0.3, 1] }}
    >
      <header className="axr-record-head">
        <div className="axr-record-title">
          <span className="axr-record-index"><b>{index}</b> / {role}</span>
          <h3 id={titleId} data-empty={name ? undefined : ''}>{name || placeholder}</h3>
        </div>
        <span className="axr-record-state" data-complete={complete ? '' : undefined}>
          {complete ? 'Complete ✓' : `${remaining} ${remaining === 1 ? 'field' : 'fields'} remaining`}
        </span>
      </header>
      <div className="axr-record-body">{children}</div>
    </motion.article>
  )
}
