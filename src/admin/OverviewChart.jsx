import { useMemo, useRef, useState } from 'react'
import AnimatedNumber from './AnimatedNumber'
import { SectionHeading } from './AdminUI'
import { useGrow } from './adminMotion'

const PERIODS = ['30 days', '15 days']
const CHART_SERIES = [
  { key: 'member', label: 'Members' },
  { key: 'staff', label: 'Staff' },
  { key: 'aivex', label: 'AIVEX' },
]

const dateLabel = (value) => {
  const date = new Date(`${value}T12:00:00`)
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' }).format(date)
    : '—'
}

// Radio-group keyboard pattern: arrows move the selection, the thumb follows.
function PeriodSwitch({ value, onChange }) {
  const index = Math.max(0, PERIODS.indexOf(value))
  const move = (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
    event.preventDefault()
    const step = ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1
    const next = PERIODS[(index + step + PERIODS.length) % PERIODS.length]
    onChange(next)
    event.currentTarget.parentElement.querySelector(`[data-period="${next}"]`)?.focus()
  }
  return <div className="adm-segmented" role="radiogroup" aria-label="Chart period" style={{ '--adm-segment': index, '--adm-segments': PERIODS.length }}>
    <span className="adm-segmented__thumb" aria-hidden="true"/>
    {PERIODS.map((period) => <button key={period} type="button" role="radio" data-period={period} aria-checked={value === period} tabIndex={value === period ? 0 : -1} className={value === period ? 'is-active' : ''} onClick={() => onChange(period)} onKeyDown={move}>{period}</button>)}
  </div>
}

export default function OverviewChart({ series = [] }) {
  const [period, setPeriod] = useState('30 days')
  const data = useMemo(() => period === '15 days' ? series.slice(-3) : series, [period, series])
  const [active, setActive] = useState(Math.max(0, data.length - 1))
  const [preview, setPreview] = useState(null)
  const plotRef = useRef(null)
  // Capsules rise from the baseline on first paint and whenever the period changes.
  useGrow(plotRef, '.adm-bar-track i', period)

  const safeActive = Math.min(active, Math.max(0, data.length - 1))
  const current = data[safeActive] || { member: 0, staff: 0, aivex: 0 }
  const total = data.reduce((sum, point) => sum + point.member + point.staff + point.aivex, 0)
  const maximum = Math.max(1, ...data.flatMap((point) => [point.member, point.staff, point.aivex]))
  const midpoint = Math.ceil(maximum / 2)
  const range = data.length ? `${dateLabel(data[0].startDate)} — ${dateLabel(data.at(-1).endDate)}` : 'No submissions yet'
  const changePeriod = (value) => { setPeriod(value); setActive(0); setPreview(null) }

  return <section className="adm-panel adm-chart-panel">
    <SectionHeading
      title="Applications received"
      action={<PeriodSwitch value={period} onChange={changePeriod}/>}
    />
    <div className="adm-chart-summary"><strong><AnimatedNumber value={total}/><span>total submissions</span></strong><p>Live database series<br/><b>{range}</b></p></div>
    <div className="adm-chart-legend">{CHART_SERIES.map(({ key, label }) => <span key={key}><i className={key}/>{label}</span>)}</div>
    <div className="adm-bar-chart">
      <div className="adm-chart-y" aria-hidden="true"><span>{maximum}</span><span>{midpoint}</span><span>0</span></div>
      <div className="adm-chart-bars" ref={plotRef} style={{ gridTemplateColumns: `repeat(${Math.max(1, data.length)}, minmax(0, 1fr))` }} onPointerLeave={() => setPreview(null)}>
        {data.map((point, index) => {
          const empty = point.member + point.staff + point.aivex === 0
          const peak = Math.max(point.member, point.staff, point.aivex) / maximum
          const edge = index === 0 ? 'is-start' : index === data.length - 1 ? 'is-end' : ''
          return <button
            type="button"
            className={`${safeActive === index ? 'is-active' : ''} ${empty ? 'is-empty' : ''}`}
            key={`${point.startDate}-${point.endDate}`}
            aria-pressed={safeActive === index}
            onClick={() => setActive(index)}
            onPointerEnter={() => setPreview(index)}
            onFocus={() => setPreview(index)}
            onBlur={() => setPreview(null)}
            aria-label={`${dateLabel(point.startDate)} to ${dateLabel(point.endDate)}: ${point.member} Members, ${point.staff} Staff, ${point.aivex} AIVEX`}
          >
            <span className="adm-bar-group" aria-hidden="true" style={{ '--adm-peak': empty ? 1 : peak }}>
              {empty ? <i className="adm-bar-ghost"/> : CHART_SERIES.map(({ key }) => <span className="adm-bar-track" key={key}><i className={key} style={{ height: `${point[key] / maximum * 100}%` }}/></span>)}
              {preview === index && <span className={`adm-chart-tooltip ${edge}`}>
                <b>{dateLabel(point.startDate)} — {dateLabel(point.endDate)}</b>
                {empty ? <small>No submissions in this period</small> : CHART_SERIES.map(({ key, label }) => <span key={key}><i className={key}/><strong>{point[key]}</strong>{label}</span>)}
              </span>}
            </span>
            <small aria-hidden="true">{dateLabel(point.endDate)}</small>
          </button>
        })}
        {!data.length && <p className="adm-chart-empty">No submissions yet</p>}
      </div>
    </div>
    <div className="adm-chart-readout" aria-live="polite"><code>{current.endDate ? dateLabel(current.endDate) : 'No data'}</code><span>Members <b>{current.member}</b></span><span>Staff <b>{current.staff}</b></span><span>AIVEX <b>{current.aivex}</b></span></div>
  </section>
}
