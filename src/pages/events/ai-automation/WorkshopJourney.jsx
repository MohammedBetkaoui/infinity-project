import InfinityClubMark from '../../../components/InfinityClubMark'

const steps = [
  { id: 'learn', title: 'Learn.', label: 'Understand the input', copy: 'Start with a question. Find the context it needs. Make the problem clear before making the process complex.', symbol: '?', rank: 'A' },
  { id: 'build', title: 'Build.', label: 'Connect the steps', copy: 'Give each step a purpose. Link information, instructions and tools into a process you can understand.', symbol: '→', rank: 'K' },
  { id: 'automate', title: 'Automate.', label: 'Keep the human in the loop', copy: 'Choose what can repeat. Check the output. Refine the process as the questions change.', symbol: '∞', rank: 'Q' },
]

// A deck that stacks as you read: each card sticks, the next one covers it.
export default function WorkshopJourney() {
  return (
    <section className="ai-journey ai-section" aria-labelledby="ai-journey-title">
      <div className="ai-shell ai-journey-layout">
        <header className="ai-journey-intro">
          <p className="ai-mono">05 / A way of thinking</p>
          <h2 id="ai-journey-title" data-ai-heading>Learn.<br />Build.<br /><em>Automate.</em></h2>
          <p>A conceptual path to carry forward.<br />An invitation to keep experimenting.</p>
          <nav aria-label="Explore the learning journey">
            {steps.map((step, index) => <a key={step.id} href={`#ai-step-${step.id}`}><span className="ai-mono">0{index + 1}</span>{step.title}<span aria-hidden="true">↗</span></a>)}
          </nav>
          <p className="ai-journey-disclaimer ai-mono">An exploration of automation principles,<br />not a record of the workshop programme.</p>
        </header>
        <ol className="ai-stack">
          {steps.map((step, index) => (
            <li key={step.id} id={`ai-step-${step.id}`} className="ai-stack-item" style={{ '--i': index }}>
              <article className="ai-stack-card">
                <div className="ai-stack-top ai-mono"><span>0{index + 1} / {step.label}</span><span className="ai-stack-rank" aria-hidden="true">{step.rank}</span></div>
                <div className="ai-stack-emblem" aria-hidden="true"><span className="ai-stack-rays" /><span className="ai-stack-symbol">{step.symbol}</span></div>
                <h3>{step.title}</h3>
                <p>{step.copy}</p>
                <div className="ai-stack-foot ai-mono" aria-hidden="true"><span>{step.rank} / Infinity deck</span><InfinityClubMark title="" /></div>
                <span className="ai-stack-dim" aria-hidden="true" />
              </article>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
