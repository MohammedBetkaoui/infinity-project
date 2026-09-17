export default function StepHeading({ kicker, title, children, aside }) {
  return (
    <div className="af-step-heading axr-step-heading">
      <div>
        <span className="axr-step-kicker">{kicker}</span>
        <h2 id="axr-step-heading" tabIndex={-1}>{title}</h2>
        {children && <p>{children}</p>}
      </div>
      {aside}
    </div>
  )
}
