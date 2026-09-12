import './aivex-wordmark.css'

export default function AivexWordmark({ large = false, ...props }) {
  return (
    <span className={`ax-wordmark${large ? ' ax-wordmark-large' : ''}`} aria-label="AIVEX" role="img" {...props}>
      {'AIVEX'.split('').map((letter, index) => (
        <span className={`ax-letter-tile ax-letter-${index}`} key={letter} aria-hidden="true">
          <span className="ax-wordmark-letter">{letter}</span>
        </span>
      ))}
    </span>
  )
}
