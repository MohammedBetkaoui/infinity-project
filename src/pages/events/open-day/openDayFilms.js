// Original local recordings, inspected frame by frame. Durations measured
// from the files; these are clip lengths, not event programme timestamps.
export const openDayFilms = [
  {
    id: 'stand-visitors',
    src: '/open-day/video_2026-10-06_14-13-06 (3).mp4',
    poster: '/open-day/posters/stand-visitors.webp',
    width: 720, height: 1280, duration: 4.737,
    label: 'Around the stand',
    title: 'A place to stop.',
    description: 'Visitors gather around the club stand, looking at the devices and displays on the table.',
    note: 'The stand becomes a meeting point. People stop, look closer and talk across the table.',
  },
  {
    id: 'spin-table',
    src: '/open-day/video_2026-10-06_14-13-06 (2).mp4',
    poster: '/open-day/posters/spin-table.webp',
    width: 720, height: 1280, duration: 3.933,
    label: 'The spin experience',
    title: 'A wheel. A challenge.',
    description: 'A physical game wheel stands beside laptops displaying the Open Day spin game.',
    note: 'The wheel, the laptops and the game: an invitation to take part in the Open Day stand.',
  },
  {
    id: 'club-screen',
    src: '/open-day/video_2026-10-06_14-13-06 (4).mp4',
    poster: '/open-day/posters/club-screen.webp',
    width: 720, height: 1280, duration: 2.452,
    label: 'Infinity on screen',
    title: 'Ideas on the table.',
    description: 'The Infinity Club website is displayed on a laptop, with puzzle cubes beside it on the stand.',
    note: 'Infinity on a screen, puzzle cubes beside it. A close view of the things students could discover at the stand.',
  },
]

// The club's own edited film: landscape, original sound, played on request.
// Scene times sit just after the measured cuts so a seek lands inside the shot.
export const clubFilm = {
  id: 'club-film',
  src: '/open-day/open-day-pres.mp4',
  poster: '/open-day/posters/club-film.webp',
  width: 1280, height: 720, duration: 33.7,
  title: 'Welcome to Infinity',
  description: 'Infinity Club film from Open Day: a full faculty hall, a welcome to camera, certificates and awards on display, conversations with students, chess games, a quiz on a laptop beside the Infinity logo, and the club sign-off.',
  scenes: [
    { time: 0, title: 'Welcome', note: 'A full hall and a welcome to camera.' },
    { time: 4.2, title: 'Recognition', note: 'Certificates and awards on display.' },
    { time: 7.5, title: 'Conversations', note: 'Talking with students across the hall.' },
    { time: 14, title: 'Your move', note: 'Chessboards and players thinking it through.' },
    { time: 18.8, title: 'On screen', note: 'A quiz question beside the Infinity logo.' },
    { time: 30.2, title: 'Sign-off', note: 'The whole hall, then the club’s sign-off.' },
  ],
}

export const filmTime = (seconds) => {
  const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
}
