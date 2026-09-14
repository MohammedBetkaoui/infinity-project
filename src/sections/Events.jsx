import { useLayoutEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { Link } from 'react-router-dom'
import { events } from '../data/siteData'
import './home-events.css'

gsap.registerPlugin(ScrollTrigger)

export default function Events() {
  const sectionRef = useRef(null)
  const featured = events.find((event) => event.featured && event.href && event.preview)

  useLayoutEffect(() => {
    const media = gsap.matchMedia()
    if (!featured) return undefined

    media.add('(min-width: 768px) and (prefers-reduced-motion: no-preference)', () => {
      const preview = sectionRef.current.querySelector('.home-event-preview')

      // The preview settles onto the page as it enters the reading area; no pinned scroll.
      gsap.fromTo(preview, { rotationX: 3.6, y: 14, scale: .975 }, {
        rotationX: 0, y: 0, scale: 1, ease: 'none',
        scrollTrigger: {
          trigger: preview, start: 'top 92%', end: 'top 45%', scrub: true,
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
          <Link to={featured.href} className="home-event-feature-link" aria-labelledby="home-featured-event-action">
            <div className="home-event-visual">
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
            </div>

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
