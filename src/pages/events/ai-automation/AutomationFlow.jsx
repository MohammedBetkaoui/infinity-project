import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { BrainCircuit, Check, MessageSquareText, Zap } from 'lucide-react'
import InfinityClubMark from '../../../components/InfinityClubMark'

const nodes = [
  { key: 'input', type: 'Trigger', title: 'INPUT', label: 'A place to begin', copy: 'A question, a document, a signal.', Icon: MessageSquareText, rank: 'A' },
  { key: 'intelligence', type: 'AI step', title: 'INTELLIGENCE', label: 'Context makes the connection', copy: 'Retrieval, instructions and a model turn information into something to work with.', Icon: BrainCircuit, rank: 'K' },
  { key: 'action', type: 'Output', title: 'ACTION', label: 'The next useful step', copy: 'An answer, a decision, a task.', Icon: Zap, rank: 'Q' },
]

// Wires follow the real node boxes, horizontally on wide screens and
// vertically once the board stacks.
function measureWires(board) {
  const canvas = board.querySelector('.ai-flow-canvas')
  const cards = [...board.querySelectorAll('.ai-flow-node')]
  if (!canvas || cards.length < 2) return null
  const origin = canvas.getBoundingClientRect()
  const boxes = cards.map((card) => {
    const box = card.getBoundingClientRect()
    return { left: box.left - origin.left, top: box.top - origin.top, right: box.right - origin.left, bottom: box.bottom - origin.top, cx: box.left - origin.left + box.width / 2, cy: box.top - origin.top + box.height / 2 }
  })
  const row = boxes[1].left > boxes[0].right - 4
  const wires = boxes.slice(0, -1).map((from, index) => {
    const to = boxes[index + 1]
    if (row) {
      const bend = (to.left - from.right) * .55
      return `M${from.right} ${from.cy} C${from.right + bend} ${from.cy} ${to.left - bend} ${to.cy} ${to.left} ${to.cy}`
    }
    const bend = (to.top - from.bottom) * .6
    return `M${from.cx} ${from.bottom} C${from.cx} ${from.bottom + bend} ${to.cx} ${to.top - bend} ${to.cx} ${to.top}`
  })
  return { width: Math.round(origin.width), height: Math.round(origin.height), wires, row }
}

export default function AutomationFlow() {
  const boardRef = useRef(null)
  const [layout, setLayout] = useState(null)

  useEffect(() => {
    const board = boardRef.current
    if (!board) return undefined
    let frame = 0
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setLayout(measureWires(board)))
    })
    observer.observe(board)
    return () => { observer.disconnect(); cancelAnimationFrame(frame) }
  }, [])

  // One execution, replayed while the board is on screen: a packet travels
  // each wire, the node it reaches runs, then the run is marked complete.
  useEffect(() => {
    const board = boardRef.current
    if (!board || !layout) return undefined
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const cards = [...board.querySelectorAll('.ai-flow-node')]
    const status = board.querySelector('.ai-flow-status')
    const setState = (element, value) => { element.dataset.state = value }
    if (reduced) {
      cards.forEach((card) => setState(card, 'done'))
      setState(status, 'done')
      board.querySelectorAll('.ai-wire-lit, .ai-wire-halo').forEach((wire) => { wire.style.strokeDashoffset = '0' })
      return undefined
    }
    const context = gsap.context(() => {
      const run = gsap.timeline({ repeat: -1, repeatDelay: 1.4, paused: true })
      run.call(() => { cards.forEach((card) => setState(card, 'idle')); setState(status, 'running') })
        .set('.ai-wire-lit, .ai-wire-halo', { strokeDashoffset: 1, opacity: 1 })
        .set('.ai-wire-packet, .ai-wire-glow', { opacity: 0 })
      cards.forEach((card, index) => {
        run.call(() => setState(card, 'running'))
          .to({}, { duration: .75 })
          .call(() => setState(card, 'done'))
        const wire = board.querySelectorAll('.ai-wire-track')[index]
        if (!wire) return
        const lit = [board.querySelectorAll('.ai-wire-halo')[index], board.querySelectorAll('.ai-wire-lit')[index]]
        const packet = board.querySelectorAll('.ai-wire-packet')[index]
        const glow = board.querySelectorAll('.ai-wire-glow')[index]
        const length = wire.getTotalLength()
        const travel = { t: 0 }
        run.set([packet, glow], { opacity: 1 })
          .to(travel, {
            t: 1, duration: 1.05, ease: 'power1.inOut',
            onUpdate: () => {
              const point = wire.getPointAtLength(travel.t * length)
              packet.setAttribute('cx', point.x)
              packet.setAttribute('cy', point.y)
              glow.setAttribute('cx', point.x)
              glow.setAttribute('cy', point.y)
            },
            onStart: () => { travel.t = 0 },
          })
          .to(lit, { strokeDashoffset: 0, duration: 1.05, ease: 'power1.inOut' }, '<')
          .set([packet, glow], { opacity: 0 })
      })
      run.call(() => setState(status, 'done'))
        .to({}, { duration: 2.2 })
        .to('.ai-wire-lit, .ai-wire-halo', { opacity: .25, duration: .5 })
      const observer = new IntersectionObserver(([entry]) => (entry.isIntersecting ? run.play() : run.pause()), { threshold: .35 })
      observer.observe(board)
      return () => observer.disconnect()
    }, board)
    return () => context.revert()
  }, [layout])

  return (
    <div className="ai-flow" ref={boardRef}>
      <div className="ai-flow-toolbar ai-mono">
        <span className="ai-flow-file"><i aria-hidden="true" /><i aria-hidden="true" /><i aria-hidden="true" /> workflow / from-a-prompt-to-a-process</span>
        <span className="ai-flow-status" data-state="idle" aria-hidden="true"><span className="is-running">Executing…</span><span className="is-done"><Check size={12} /> Workflow executed</span></span>
      </div>
      <div className="ai-flow-canvas">
        {layout && (
          <svg className="ai-flow-wires" viewBox={`0 0 ${layout.width} ${layout.height}`} width={layout.width} height={layout.height} aria-hidden="true">
            <defs>
              {/* The packet glows through a gradient, not a blur filter. */}
              <radialGradient id="ai-packet-glow"><stop offset="0" stopColor="#f0fff5" stopOpacity=".85" /><stop offset=".35" stopColor="#8af0b2" stopOpacity=".45" /><stop offset="1" stopColor="#8af0b2" stopOpacity="0" /></radialGradient>
            </defs>
            {layout.wires.map((d) => (
              <g key={d}>
                <path className="ai-wire-track" d={d} />
                <path className="ai-wire-halo" d={d} pathLength="1" />
                <path className="ai-wire-lit" d={d} pathLength="1" />
                <circle className="ai-wire-glow" r="15" cx="-20" cy="-20" fill="url(#ai-packet-glow)" />
                <circle className="ai-wire-packet" r="5" cx="-20" cy="-20" />
              </g>
            ))}
          </svg>
        )}
        <ol className="ai-flow-nodes">
          {nodes.map(({ key, type, title, label, copy, Icon, rank }, index) => (
            <li key={key} className="ai-flow-node" data-state="idle">
              <span className="ai-port ai-port--in" aria-hidden="true" />
              <div className="ai-flow-node-top ai-mono">
                <span className="ai-flow-icon"><Icon size={18} strokeWidth={1.5} aria-hidden="true" /></span>
                <span>0{index + 1} / {type}</span>
                <span className="ai-flow-check" aria-hidden="true"><Check size={12} strokeWidth={2.5} /></span>
              </div>
              <h3>{title}</h3>
              <p className="ai-flow-node-label">{label}</p>
              <p>{copy}</p>
              <span className="ai-flow-rank" aria-hidden="true"><b>{rank}</b><InfinityClubMark title="" /></span>
              <span className="ai-port ai-port--out" aria-hidden="true" />
            </li>
          ))}
        </ol>
      </div>
      <div className="ai-flow-foot ai-mono"><span>One connection changes what comes next.</span><span>Conceptual workflow / not a session syllabus</span></div>
    </div>
  )
}
