import { useLayoutEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { Link } from 'react-router-dom'
import { events } from '../data/siteData'
import ScrollReveal from '../components/ScrollReveal'
import './home-events.css'

gsap.registerPlugin(ScrollTrigger)

export default function Events() {
  const sectionRef = useRef(null)
  const featured = events.find((event) => event.featured && event.href && event.preview)

  useLayoutEffect(() => {
    const media = gsap.matchMedia()
    if (!featured) return undefined

    media.add({
      motion: '(prefers-reduced-motion: no-preference)',
      desktop: '(min-width: 768px)',
    }, ({ conditions }) => {
      if (!conditions.motion) return
      const preview = sectionRef.current.querySelector('.home-event-preview')

      // The preview settles onto the page as it enters the reading area; no pinned scroll.
      gsap.fromTo(preview, {
        rotationX: conditions.desktop ? 5.4 : 0,
        y: conditions.desktop ? 21 : 8,
        scale: conditions.desktop ? .965 : .99,
      }, {
        rotationX: 0, y: 0, scale: 1, ease: 'none',
        scrollTrigger: {
          id: 'home-featured-event',
          trigger: sectionRef.current.querySelector('.home-event-visual'),
          start: 'top 92%', end: 'top 40%', scrub: true,
          invalidateOnRefresh: true,
        },
      })
    }, sectionRef)
    return () => media.revert()
  }, [featured])

  if (!featured) return null

  return (
    <section id="evenements" ref={sectionRef} className="home-featured-events section-space" aria-labelledby="home-events-title">
      <div className="page-container">
        <header className="home-events-heading">
          <h2 id="home-events-title">Featured event.</h2>
          <p>From the MI Faculty to the national stage.<br />An invitation to put your ideas into practice.</p>
        </header>

        <article className="home-event-feature" aria-labelledby="home-featured-event-title">
          <Link to={featured.href} target={featured.newTab ? '_blank' : undefined} rel={featured.newTab ? 'noreferrer' : undefined} className="home-event-feature-link" aria-labelledby="home-featured-event-action">
            <ScrollReveal mode="horizontal" color="#002a1e" className="home-event-visual">
              <figure className="home-event-preview">
                <div className="home-event-image-window">
                  <img src={featured.preview.src} alt={featured.preview.alt}
                    width={featured.preview.width} height={featured.preview.height}
                    loading="lazy" decoding="async" />
                </div>
                <figcaption>
                  <span>Intelligence. In action.</span>
                  <span>{featured.type}</span>
                </figcaption>
              </figure>
            </ScrollReveal>

            <div className="home-event-editorial">
              <p className="home-event-edition"><i aria-hidden="true" />{featured.edition}</p>
              <h3 id="home-featured-event-title">{featured.name}</h3>
              <p className="home-event-summary">{featured.summary}</p>
              <dl className="home-event-host">
                <dt>Organised by</dt>
                <dd>Infinity Club<span>MI Faculty, Bordj Bou Arreridj</span></dd>
              </dl>
              <span id="home-featured-event-action" className="home-event-action">Explore {featured.name}</span>
            </div>
          </Link>
        </article>
      </div>
    </section>
  )
}
