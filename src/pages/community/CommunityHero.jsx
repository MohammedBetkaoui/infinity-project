import { ArrowDown, UsersRound } from 'lucide-react'
import { useRef } from 'react'
import '../../components/page-hero.css'
import usePageHeroMotion from '../../hooks/usePageHeroMotion'
import { poles } from '../../data/siteData'
import { communityPortraits } from './communityData'

const featuredMember = communityPortraits.find((member) => member.role === 'President') || communityPortraits[0]

export default function CommunityHero() {
  const heroRef = useRef(null)
  usePageHeroMotion(heroRef)

  return (
    <section ref={heroRef} className="page-hero community-page-hero" aria-labelledby="community-page-title">
      <div className="page-container">
        <div className="page-hero-rail">
          <span>Infinity Club / Our community</span>
          <span>Different talents · One shared direction</span>
        </div>

        <div className="page-hero-layout community-hero-layout">
          <div className="community-hero-copy">
            <p className="community-hero-kicker">The people make the place</p>
            <h1 id="community-page-title" aria-label="Community.">
              <span className="page-hero-title-mask" aria-hidden="true">
                Community<span className="page-hero-title-stop">.</span>
              </span>
            </h1>
            <div className="community-hero-intro">
              <p className="page-hero-lead">It starts with the people.</p>
              <div>
                <p className="page-hero-summary">Different interests, shared afternoons and things we could not have built alone. This is the community behind Infinity Club.</p>
                <a className="page-hero-jump" href="#meet-infiniters">
                  Meet the Infiniters <ArrowDown size={14} strokeWidth={1.8} aria-hidden="true" />
                </a>
              </div>
            </div>
          </div>

          <article className="community-hero-profile" aria-label={`Featured team portrait: ${featuredMember.name}, ${featuredMember.role}`} data-animated-text="">
            <div className="community-hero-profile-head">
              <span><i /> Community profile</span><span>01 / {String(communityPortraits.length).padStart(2, '0')}</span>
            </div>
            <div className="community-hero-profile-image">
              <img src={featuredMember.src} width={featuredMember.width} height={featuredMember.height} alt="" fetchPriority="high" />
              <span className="community-hero-profile-shade" aria-hidden="true" />
              <span className="community-hero-profile-badge"><UsersRound size={14} aria-hidden="true" /> Student-led</span>
            </div>
            <div className="community-hero-profile-foot">
              <div><strong>{featuredMember.name}</strong><span>{featuredMember.role}</span></div>
              <span>Infinity Club · BBA</span>
            </div>
          </article>
        </div>

        <dl className="community-hero-metrics" aria-label="Community overview" data-animated-text="">
          <div><dt>{String(communityPortraits.length).padStart(2, '0')}</dt><dd>Team portraits</dd></div>
          <div><dt>{String(poles.length).padStart(2, '0')}</dt><dd>Fields connected</dd></div>
          <div><dt>01</dt><dd>Shared community</dd></div>
          <div className="community-hero-note"><dt>Learn. Contribute. Belong.</dt><dd>The Infinity community rhythm</dd></div>
        </dl>

        <div className="page-hero-rule" aria-hidden="true"><i /></div>
      </div>
    </section>
  )
}
