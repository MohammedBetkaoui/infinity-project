import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { communityInstagram } from './communityData'

export default function CommunityInvitation() {
  return (
    <section className="community-invitation" aria-labelledby="community-invitation-title">
      <div className="page-container">
        <div className="community-invitation-layout">
          <h2 id="community-invitation-title">The next person<br />could be you.</h2>
          <div className="community-invitation-copy">
            <p>You do not need a perfect portfolio to start a conversation. Follow the club for workshops and recruitment announcements, or tell us what you would like to learn.</p>
            <div className="community-invitation-actions"><a className="community-join-link" href={communityInstagram} target="_blank" rel="noreferrer">Say hello on Instagram <ArrowUpRight size={17} /></a><Link className="community-editorial-link" to="/events">See what is coming up</Link></div>
            <p className="community-membership-note">Membership applications open during recruitment campaigns. The club shares the details on Instagram.</p>
          </div>
        </div>
        <div className="community-invitation-signoff"><span>No Limits For Infiniters</span><span>Bordj Bou Arreridj, Algeria</span></div>
      </div>
    </section>
  )
}
