import InfinityMark from '../../components/InfinityMark'

const ribbon = 'M68 190C68 82 181 71 260 190C339 309 452 298 452 190C452 82 339 71 260 190C181 309 68 298 68 190Z'

export default function AboutEmblem() {
  return (
    <figure className="about-emblem">
      <div className="about-emblem-scroll">
        <div className="about-emblem-sheet" aria-hidden="true">
          <div className="about-emblem-register"><span>Infinity Club</span><span>Student-led. BBA.</span></div>
          <svg className="about-emblem-diagram" viewBox="0 0 520 380" fill="none">
            <path className="about-emblem-guide" d={ribbon} />
            <path className="about-hero-route" d={ribbon} />
            <path className="about-emblem-axis" d="M28 190H492M260 26V354" />
            <circle className="about-hero-node" cx="68" cy="190" r="5" />
            <circle className="about-hero-node" cx="452" cy="190" r="5" />
          </svg>
          <div className="about-emblem-symbol"><InfinityMark /></div>
          <div className="about-emblem-bottom"><span>Learn. Make. Share.</span><span>MI Faculty</span></div>
        </div>
      </div>
      <figcaption><span>One symbol. Many ways to belong.</span><span>No limits.</span></figcaption>
    </figure>
  )
}
