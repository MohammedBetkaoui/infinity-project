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
  scenes: [
    { time: 0, title: 'The stand', note: 'Infinity on screen, ready to be explored.' },
    { time: 6, title: 'Ideas on display', note: 'The club banner and a canvas waiting for new marks.' },
    { time: 13.5, title: 'What we built', note: 'Awards, certificates and the work behind them.' },
    { time: 26.5, title: 'Follow the clues', note: 'The Last Equation turns the table into a story.' },
  ],
}

export const filmTime = (seconds) => {
  const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
}
