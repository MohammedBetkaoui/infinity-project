import useScrollAnimations from '../../hooks/useScrollAnimations'

// Same scrubbed, reversible choreography as the rest of the site: headings
// rise, copy illuminates, and each year's cards fade in as that year arrives.
export default function useEventsPageMotion(pageRef) {
  useScrollAnimations(pageRef, ({ revealText, revealSection, revealAllText }) => {
    const page = pageRef.current
    page.querySelectorAll('.events-archive-intro h2, .events-year-title, .events-cta h2')
      .forEach((title) => revealText(title))
    page.querySelectorAll('.events-archive-intro p, .events-cta p')
      .forEach((copy) => revealText(copy, { type: 'lines' }))
    page.querySelectorAll('.events-year').forEach((year) => {
      revealSection(year.querySelectorAll('.event-card'), {
        mode: 'fade',
        trigger: year.querySelector('.events-year-grid'),
        stagger: .08,
      })
    })
    revealAllText()
  })
}
