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
            <p>You do not need a perfect portfolio to start a conversation. Tell us what you would like to learn and where you hope to contribute.</p>
            <div className="community-invitation-actions"><Link className="community-join-link" to="/join">Apply to join Infinity</Link><a className="community-editorial-link" href={communityInstagram} target="_blank" rel="noreferrer">Follow announcements <ArrowUpRight size={15} /></a></div>
            <p className="community-membership-note">Applications are reviewed during recruitment campaigns. Submitting the form is the first step, not an automatic confirmation.</p>
          </div>
        </div>
        <div className="community-invitation-signoff"><span>No Limits For Infiniters</span><span>Bordj Bou Arreridj, Algeria</span></div>
      </div>
    </section>
  )
}
