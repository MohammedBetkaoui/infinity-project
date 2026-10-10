// The club's new vertical Open Day edit. It keeps its original sound and only
// starts after a visitor explicitly presses play.
export const clubFilm = {
  id: 'club-film',
  src: '/open-day/video_2026-10-10_15-09-43.mp4',
  poster: '/open-day/posters/club-film.png',
  width: 464,
  height: 832,
  duration: 31.417,
  title: 'Open Day, in motion',
  description: 'A vertical Infinity Club film from Open Day: the digital stand, games and challenges, the club awards, conversations with students and The Last Equation clue board.',
  // Each chapter starts on a hard cut measured in the file, so the player's
  // chapter cut lands on the edit. Each thumb is a frame decoded from inside
  // its own scene (96 x 172 WebP).
  scenes: [
    { time: 0, title: 'The stand', note: 'Infinity on screen, ready to be explored.', thumb: '/open-day/posters/scene-01.webp' },
    { time: 5.03, title: 'Ideas on display', note: 'The club banner and a canvas waiting for new marks.', thumb: '/open-day/posters/scene-02.webp' },
    { time: 12.63, title: 'What we built', note: 'Awards, certificates and the work behind them.', thumb: '/open-day/posters/scene-03.webp' },
    { time: 26.93, title: 'Follow the clues', note: 'The Last Equation turns the table into a story.', thumb: '/open-day/posters/scene-04.webp' },
  ],
}

// The 35 mm strip behind the screen: twelve frames decoded at these times,
// stacked in one WebP with `gap` pixels of film base under each frame, so two
// copies tile seamlessly and the strip runs exactly one loop per screening.
export const filmStrip = {
  src: '/open-day/posters/film-strip.webp',
  frames: 12,
  frameWidth: 96,
  frameHeight: 172,
  gap: 8,
  times: [1.309, 3.927, 6.545, 9.163, 11.781, 14.399, 17.017, 19.635, 22.253, 24.872, 27.49, 30.108],
}

// Where each scene starts and ends, as fractions of the runtime. The player's
// segmented timeline and the chapter list both fill from these spans.
export const sceneSpans = clubFilm.scenes.map((scene, index) => {
  const end = clubFilm.scenes[index + 1]?.time ?? clubFilm.duration
  return { start: scene.time / clubFilm.duration, end: end / clubFilm.duration }
})

export const sceneAt = (seconds) => Math.max(0, clubFilm.scenes.findLastIndex((scene) => seconds >= scene.time - 0.02))

export const filmTime = (seconds) => {
  const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
}
