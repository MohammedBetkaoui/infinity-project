import { Link } from 'react-router-dom'
import ClubPhotoMosaic from '../components/ClubPhotoMosaic'
import './club-life.css'

export default function ClubLife() {
  return (
    <section id="club-life" className="club-life-section section-space" aria-labelledby="club-life-title">
      <div className="page-container club-life-layout">
        <ClubPhotoMosaic />
        <div className="club-life-copy">
          <h2 id="club-life-title">More than projects.<span>People you grow with.</span></h2>
          <p>A shared laptop. A question that starts a conversation. Someone taking the time to help. At Infinity, these small moments are part of learning and building together.</p>
          <ul className="club-life-values">
            <li><strong>Learn by making.</strong><span>Explore code, design and new ideas through hands-on projects.</span></li>
            <li><strong>Find your people.</strong><span>Meet students who share your curiosity and bring a different perspective.</span></li>
            <li><strong>Go further together.</strong><span>Share what you know, ask for help and make the next idea happen.</span></li>
          </ul>
          <Link to="/community" className="club-life-link">Meet the Infiniters</Link>
        </div>
      </div>
    </section>
  )
}
