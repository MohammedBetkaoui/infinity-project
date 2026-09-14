export const SCROLL_MOTION = {
  textStagger: .08,
  lineStagger: .05,
  textDuration: .72,
  revealDuration: .62,
  pinScrub: 1,
  start: 'top 93%',
  end: 'top 58%',
  ease: 'power3.out',
  // Editorial text system: every heading crosses the viewport in two acts —
  // masked rise on entry, masked dissolve on exit — so scrolling back
  // replays the scene in reverse. Body copy illuminates word by word,
  // then drifts out as a block. Ranges span most of the viewport so the
  // motion is unmistakably scroll-driven, never a one-shot fade.
  displayStart: 'top 90%',
  displayEnd: 'bottom 32%',
  displayScrub: 0.55,
  displayEnterStagger: 0.09,
  displayExitStagger: 0.055,
  displayTilt: 5,
  readingStart: 'top 88%',
  readingEnd: 'bottom 42%',
  readingScrub: 0.5,
  readingWordStagger: 0.08,
  readingDim: 0.14,
  introEase: 'expo.out',
}
