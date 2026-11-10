// The extruded chrome lettering of the workshop film ("COMING SOON"). Each
// letter is its own box so the intro can turn it in 3D; the sheen crosses
// the word letter by letter through --i / --n (see .ai-chrome in the CSS).
// Decorative: the readable text lives next to it (sr-only) or in aria-label.
export default function ChromeText({ text, className = '', serif = false }) {
  const letters = [...text]
  return (
    <span className={`ai-chrome${serif ? ' ai-chrome--serif' : ''} ${className}`} style={{ '--n': letters.length }} aria-hidden="true">
      {letters.map((letter, index) => (
        <span key={`${letter}-${index}`} className={letter === ' ' ? 'ai-chrome-space' : 'ai-chrome-letter'} style={{ '--i': index }}>
          {letter === ' ' ? ' ' : letter}
        </span>
      ))}
    </span>
  )
}
