import { useState } from 'react'
import { SectionHeading } from './AdminUI'

const SERIES = [
  { label: '23 Aug', member: 8, staff: 3, aivex: 2 },
  { label: '29 Aug', member: 12, staff: 5, aivex: 4 },
  { label: '04 Sep', member: 16, staff: 6, aivex: 7 },
  { label: '10 Sep', member: 13, staff: 8, aivex: 10 },
  { label: '16 Sep', member: 21, staff: 9, aivex: 12 },
  { label: '21 Sep', member: 26, staff: 13, aivex: 17 },
]

export default function OverviewChart() {
  const [period, setPeriod] = useState('30 days')
  const [active, setActive] = useState(SERIES.length - 1)
  const data = period === '15 days' ? SERIES.slice(3) : SERIES
  const current = data[Math.min(active, data.length - 1)]
  const total = data.reduce((sum, point) => sum + point.member + point.staff + point.aivex, 0)
  return (
    <section className="adm-panel adm-chart-panel">
      <SectionHeading
        index="02"
        title="Applications received"
        action={<label className="adm-chart-period"><span className="sr-only">Chart period</span><select value={period} onChange={(event) => { setPeriod(event.target.value); setActive(0) }}><option>30 days</option><option>15 days</option></select></label>}
      />
      <div className="adm-chart-summary"><strong>{total}<span>total submissions</span></strong><p>Historical demo series<br/><b>23 Aug — 21 Sep</b></p></div>
      <div className="adm-chart-legend"><span><i className="member"/>Members</span><span><i className="staff"/>Staff</span><span><i className="aivex"/>AIVEX</span></div>
      <div className="adm-bar-chart">
        <div className="adm-chart-y"><span>30</span><span>20</span><span>10</span><span>0</span></div>
        <div className="adm-chart-bars">
          {data.map((point, index) => <button className={active === index ? 'is-active' : ''} key={point.label} onClick={() => setActive(index)} aria-label={`${point.label}: ${point.member} Members, ${point.staff} Staff, ${point.aivex} AIVEX`}>
            <span className="adm-bar-group">{['member', 'staff', 'aivex'].map((key) => <i className={key} key={key} style={{ height: `${point[key] / 30 * 100}%` }}/>)}</span>
            <small>{point.label}</small>
          </button>)}
        </div>
      </div>
      <div className="adm-chart-readout" aria-live="polite"><code>{current.label.toUpperCase()}</code><span>Members <b>{current.member}</b></span><span>Staff <b>{current.staff}</b></span><span>AIVEX <b>{current.aivex}</b></span></div>
    </section>
  )
}
