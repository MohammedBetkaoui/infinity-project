import { Braces, PenTool } from 'lucide-react'

const connections = [
  'M46 38C81 21 122 53 160 38',
  'M200 38C237 23 274 52 314 38',
]

function WorkshopFlow() {
  return (
    <div className="notebook-flow">
      <svg viewBox="0 0 360 76" fill="none" aria-hidden="true">
        {connections.map((path) => (
          <g key={path}>
            <path className="notebook-route-guide" d={path} />
            <path className="notebook-route-ink" d={path} />
          </g>
        ))}
        {[26, 180, 334].map((x) => (
          <g key={x} transform={`translate(${x} 38)`}>
            <circle r="20" fill="#f3eee2" />
            <circle className="notebook-node-wash" r="20" fill="#c4e5d3" />
          </g>
        ))}
        <g className="notebook-flow-icons">
          <path d="M26 28v-5m-11 8-4-3m26 3 4-3M21 38a5 5 0 1 1 10 0c0 3-3 3-3 7h-4c0-4-3-4-3-7Zm3 10h4" />
          <path d="m171 31-7 7 7 7m18-14 7 7-7 7m-6-18-6 22" />
          <path d="m328 35 10-6m-10 12 10 6" />
          <circle cx="324" cy="38" r="5" /><circle cx="342" cy="27" r="4" /><circle cx="342" cy="49" r="4" />
        </g>
      </svg>
      <ol aria-label="From an idea to a shared project">
        <li>Imagine</li><li>Try</li><li>Share</li>
      </ol>
    </div>
  )
}

export default function WorkshopNotebook() {
  return (
    <div className="workshop-notes">
      <div className="notebook-sheet">
        <div className="notebook-header"><span>Inside an Infiniter’s notebook</span><Braces size={20} aria-hidden="true" /></div>
        <p className="notebook-title">
          An idea deserves<br />to become <span>something.
            <svg viewBox="0 0 260 20" aria-hidden="true">
              <path className="notebook-title-ink" d="M3 12Q116 0 253 7" />
              <path className="notebook-title-ink" d="M18 17Q141 9 242 13" />
            </svg>
          </span>
        </p>
        <WorkshopFlow />
        <p className="notebook-note">A little code, a few sketches,<br />a lot of questions.</p>
      </div>
      <div className="workshop-sticky">
        <PenTool size={20} aria-hidden="true" />
        <p>You do not need every answer.<br />
          <strong>We are here to learn.
            <svg viewBox="0 0 210 12" aria-hidden="true"><path className="notebook-sticky-ink" d="M3 8Q105 1 206 6" /></svg>
          </strong>
        </p>
      </div>
      <p className="workshop-caption">Tech is our playground. BBA is our home.</p>
    </div>
  )
}
