const steps = [
  { id: 'learn', title: 'Learn.', label: 'Understand the input', copy: 'Start with a question. Find the context it needs. Make the problem clear before making the process complex.', symbol: '?' },
  { id: 'build', title: 'Build.', label: 'Connect the steps', copy: 'Give each step a purpose. Link information, instructions and tools into a process you can understand.', symbol: '→' },
  { id: 'automate', title: 'Automate.', label: 'Keep the human in the loop', copy: 'Choose what can repeat. Check the output. Refine the process as the questions change.', symbol: '∞' },
]

export default function WorkshopJourney() {
  return <section className="ai-journey ai-section" aria-labelledby="ai-journey-title">
    <div className="ai-shell ai-journey-layout">
      <header className="ai-journey-intro"><p className="ai-mono">03 / A way of thinking</p><h2 id="ai-journey-title" data-ai-heading>Learn.<br />Build.<br /><em>Automate.</em></h2><p>A conceptual path to carry forward.<br />An invitation to keep experimenting.</p><nav aria-label="Explore the learning journey">{steps.map((step, i) => <a key={step.id} href={`#ai-step-${step.id}`}><span className="ai-mono">0{i + 1}</span>{step.title}<span aria-hidden="true">↗</span></a>)}</nav><p className="ai-journey-disclaimer ai-mono">An exploration of automation principles,<br />not a record of the workshop programme.</p></header>
      <div className="ai-journey-path"><span className="ai-journey-track" aria-hidden="true"><i /></span><ol className="ai-journey-steps">{steps.map((step, i) => <li key={step.id} id={`ai-step-${step.id}`} className="ai-journey-step"><span className="ai-journey-dot" aria-hidden="true" /><div className="ai-journey-card"><div className="ai-journey-card-top ai-mono"><span>0{i + 1} / {step.label}</span><span aria-hidden="true">◇</span></div><div className="ai-journey-symbol" aria-hidden="true">{step.symbol}</div><h3>{step.title}</h3><p>{step.copy}</p><div className="ai-journey-card-rule" aria-hidden="true" /></div></li>)}</ol></div>
    </div>
  </section>
}
