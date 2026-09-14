import AnimatedText from './AnimatedText'

export default function SectionHeading({ title, description, align = 'left', tone = 'dark', className = '' }) {
  const centered = align === 'center'
  const light = tone === 'light'

  return (
    <div className={`${centered ? 'mx-auto max-w-3xl text-center' : 'max-w-3xl'} ${className}`}>
      <AnimatedText tag="h2" className={`text-balance font-display text-section font-semibold ${light ? 'text-ink' : 'text-cream'}`}>
        {title}
      </AnimatedText>
      {description && (
        <p className={`mt-6 max-w-[65ch] text-lead ${light ? 'text-ink/70' : 'text-text-muted'} ${centered ? 'mx-auto' : ''}`}>
          {description}
        </p>
      )}
    </div>
  )
}
