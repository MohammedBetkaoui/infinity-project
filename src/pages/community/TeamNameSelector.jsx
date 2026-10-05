import { motion } from 'framer-motion'

export default function TeamNameSelector({ members, activeIndex, onSelect, carouselId, reduced }) {
  return (
    <div className="team-name-selector" role="group" aria-label="Choose a team portrait">
      {members.map((member, index) => (
        <button key={member.id} type="button" aria-label={`Select ${member.name}, ${member.role}`} aria-pressed={activeIndex === index} aria-controls={carouselId} onClick={() => onSelect(index)}>
          {activeIndex === index && (
            // One shared marker travels between names, including across rows on a phone.
            <motion.span
              className="team-name-marker"
              layoutId={reduced ? undefined : 'team-name-marker'}
              transition={{ type: 'spring', stiffness: 340, damping: 34 }}
              aria-hidden="true"
            />
          )}
          <span className="team-member-thumbnail" aria-hidden="true"><img src={member.src} alt="" width="44" height="55" loading="lazy" decoding="async" draggable="false" /></span>
          <span className="team-member-details"><span className="team-member-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><span className="team-member-name">{member.name}</span></span>
        </button>
      ))}
    </div>
  )
}
