import { motion } from 'framer-motion'

export default function TeamNameSelector({ members, activeIndex, onSelect, carouselId, reduced }) {
  return (
    <div className="team-name-selector" role="group" aria-label="Choose a team portrait">
      {members.map((member, index) => (
        <button key={member.id} type="button" aria-pressed={activeIndex === index} aria-controls={carouselId} onClick={() => onSelect(index)}>
          {activeIndex === index && (
            // One shared marker travels between names, including across rows on a phone.
            <motion.span
              className="team-name-marker"
              layoutId={reduced ? undefined : 'team-name-marker'}
              transition={{ type: 'spring', stiffness: 340, damping: 34 }}
              aria-hidden="true"
            />
          )}
          <span className="team-member-name">{member.name}</span>
          <span className="team-member-role">{member.role}</span>
        </button>
      ))}
    </div>
  )
}
