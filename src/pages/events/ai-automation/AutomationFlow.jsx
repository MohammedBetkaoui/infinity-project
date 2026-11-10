import { ArrowDownRight, ArrowUpRight, Workflow } from 'lucide-react'

const nodes = [
  { title: 'INPUT', label: 'A place to begin', copy: 'A question, a document, a signal.', Icon: ArrowDownRight },
  { title: 'INTELLIGENCE', label: 'Context makes the connection', copy: 'Information becomes something to work with.', Icon: Workflow },
  { title: 'ACTION', label: 'The next useful step', copy: 'An answer, a decision, a task.', Icon: ArrowUpRight },
]

export default function AutomationFlow() {
  return <div className="ai-flow">
    <p className="ai-mono ai-flow-label">An automation, in principle</p>
    <ol className="ai-flow-nodes">
      {nodes.map(({ title, label, copy, Icon }, index) => <li key={title} className="ai-flow-node">
        <div className="ai-flow-node-top"><span className="ai-mono">0{index + 1}</span><Icon size={26} strokeWidth={1} aria-hidden="true" /></div>
        <h3>{title}</h3><p className="ai-flow-node-label">{label}</p><p>{copy}</p>
        {index < nodes.length - 1 && <svg className="ai-flow-connection" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true"><path className="ai-flow-track" d="M0 12 H100" /><path className="ai-flow-draw" pathLength="1" d="M0 12 H100" /><circle className="ai-flow-signal" cx="0" cy="12" r="3" /></svg>}
      </li>)}
    </ol>
    <div className="ai-flow-foot ai-mono"><span>One connection changes what comes next.</span><span>Conceptual workflow / not a session syllabus</span></div>
  </div>
}
