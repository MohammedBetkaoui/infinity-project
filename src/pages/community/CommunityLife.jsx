import { Link } from 'react-router-dom'
import InfinityMark from '../../components/InfinityMark'

const contributions = [
  { title: 'Build it together.', text: 'Bring a coding question, try an AI workflow or turn a sketch into a mobile prototype. There is more than one way to contribute to a project.' },
  { title: 'Make it understood.', text: 'Design an identity, edit a video or help someone explain their idea. Technical work needs people who can make it clear, useful and memorable.' },
  { title: 'Make it happen.', text: 'Help prepare a workshop, welcome the next participants or share what you have learned. The work around an event matters as much as the moment on stage.' },
]

export default function CommunityLife() {
  return (
    <section className="community-life" aria-labelledby="community-life-title">
      <div className="page-container community-life-layout">
        <div className="community-life-intro">
          <h2 id="community-life-title">You do not need<br />to know it all.</h2>
          <p>A first project. A different perspective. The patience to help someone get unstuck. A student community grows through things like these.</p>
          <Link className="community-editorial-link" to="/#poles">Find a field to explore</Link>
          <div className="community-life-signature"><InfinityMark /><span>Different talents.<br />The same team.</span></div>
        </div>
        <div className="community-contributions">
          {contributions.map((item) => <article key={item.title}><h3>{item.title}</h3><p>{item.text}</p></article>)}
        </div>
      </div>
      <div className="page-container community-life-note"><span>Rooted in the MI Faculty.</span><p>Open to the curiosity, creativity and commitment students bring to it.</p></div>
    </section>
  )
}
