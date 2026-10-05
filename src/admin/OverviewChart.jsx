import { useMemo, useState } from 'react'
import { SectionHeading } from './AdminUI'

const dateLabel = (value) => {
  const date = new Date(`${value}T12:00:00`)
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' }).format(date)
    : '—'
}

export default function OverviewChart({ series = [] }) {
  const [period, setPeriod] = useState('30 days')
  const data = useMemo(() => period === '15 days' ? series.slice(-3) : series, [period, series])
  const [active, setActive] = useState(Math.max(0, data.length - 1))

  const safeActive = Math.min(active, Math.max(0, data.length - 1))
  const current = data[safeActive] || { member: 0, staff: 0, aivex: 0 }
  const total = data.reduce((sum, point) => sum + point.member + point.staff + point.aivex, 0)
  const maximum = Math.max(1, ...data.flatMap((point) => [point.member, point.staff, point.aivex]))
  const midpoint = Math.ceil(maximum / 2)
  const range = data.length ? `${dateLabel(data[0].startDate)} — ${dateLabel(data.at(-1).endDate)}` : 'No submissions yet'

  return <section className="adm-panel adm-chart-panel">
    <SectionHeading
      title="Applications received"
      action={<label className="adm-chart-period"><span className="sr-only">Chart period</span><select value={period} onChange={(event) => { setPeriod(event.target.value); setActive(0) }}><option>30 days</option><option>15 days</option></select></label>}
    />
    <div className="adm-chart-summary"><strong>{total}<span>total submissions</span></strong><p>Live database series<br/><b>{range}</b></p></div>
    <div className="adm-chart-legend"><span><i className="member"/>Members</span><span><i className="staff"/>Staff</span><span><i className="aivex"/>AIVEX</span></div>
    <div className="adm-bar-chart">
      <div className="adm-chart-y"><span>{maximum}</span><span>{midpoint}</span><span>0</span></div>
      <div className="adm-chart-bars" style={{ gridTemplateColumns: `repeat(${Math.max(1, data.length)}, 1fr)` }}>
        {data.map((point, index) => <button className={safeActive === index ? 'is-active' : ''} key={`${point.startDate}-${point.endDate}`} onClick={() => setActive(index)} aria-label={`${dateLabel(point.startDate)} to ${dateLabel(point.endDate)}: ${point.member} Members, ${point.staff} Staff, ${point.aivex} AIVEX`}>
          <span className="adm-bar-group">{['member', 'staff', 'aivex'].map((key) => <i className={key} key={key} style={{ height: `${point[key] / maximum * 100}%` }}/>)}</span>
          <small>{dateLabel(point.endDate)}</small>
        </button>)}
      </div>
    </div>
    <div className="adm-chart-readout" aria-live="polite"><code>{current.endDate ? dateLabel(current.endDate).toUpperCase() : 'NO DATA'}</code><span>Members <b>{current.member}</b></span><span>Staff <b>{current.staff}</b></span><span>AIVEX <b>{current.aivex}</b></span></div>
  </section>
}
