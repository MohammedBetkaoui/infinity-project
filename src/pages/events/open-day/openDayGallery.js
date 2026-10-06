// Measured and visually reviewed from public/open-day. Originals stay untouched.
// The file timestamps are export dates; the event itself was 05 October 2026.
export const openDayGallery = [
  {
    id: 'hall',
    src: '/open-day/photo_1_2026-10-06_14-13-06.jpg',
    width: 960, height: 1280, orientation: 'portrait', featured: true,
    alt: 'Overhead view of students gathering around activity tables and chessboards in the faculty hall.',
    caption: 'The faculty hall, in motion.',
  },
  {
    id: 'gathering',
    src: '/open-day/photo_7_2026-10-06_14-13-06.jpg',
    width: 960, height: 1280, orientation: 'portrait',
    alt: 'Students gathered around tables beside the tall windows of the faculty hall.',
    caption: 'A place to stop and discover.',
  },
  {
    id: 'conversation',
    src: '/open-day/photo_8_2026-10-06_14-13-06.jpg',
    width: 960, height: 1280, orientation: 'portrait',
    alt: 'A student wearing a staff badge speaking with visitors across a table with a laptop.',
    caption: 'Across a table, a conversation.',
  },
  {
    id: 'chess',
    src: '/open-day/photo_4_2026-10-06_14-13-06.jpg',
    width: 960, height: 1280, orientation: 'portrait',
    alt: 'Students studying two chessboards on a wooden table, with other visitors standing behind them.',
    caption: 'Thinking through the next move.',
  },
  {
    id: 'chess-table',
    src: '/open-day/photo_6_2026-10-06_14-13-06.jpg',
    width: 960, height: 1280, orientation: 'portrait',
    alt: 'Students playing and watching a chess game at a table in the faculty hall.',
    caption: 'Around the chess table.',
  },
  {
    id: 'spin',
    src: '/open-day/photo_10_2026-10-06_14-13-06.jpg',
    width: 1254, height: 1254, orientation: 'square', kind: 'artwork',
    alt: 'Infinity spin-game artwork with four segments: emoji words, logo guessing, two truths and one lie, and answering questions.',
    caption: 'From the day: the spin-game artwork.',
  },
  {
    id: 'clue-board',
    src: '/open-day/photo_5_2026-10-06_14-13-06.jpg',
    width: 960, height: 1280, orientation: 'portrait',
    alt: 'Students examining The Last Equation clue board, covered with printed documents, pictures and red string.',
    caption: 'The Last Equation: following the clues.',
  },
  {
    id: 'clues',
    src: '/open-day/photo_9_2026-10-06_14-13-06.jpg',
    width: 960, height: 1280, orientation: 'portrait',
    alt: 'A close view of the clue board and printed character sheets on the table as students examine them.',
    caption: 'A closer look at the clue board.',
  },
  {
    id: 'frame-pair-one',
    src: '/open-day/photo_2_2026-10-06_14-13-06.jpg',
    width: 960, height: 1280, orientation: 'portrait',
    alt: 'Two students posing together behind a green Infinity Club photo frame.',
    caption: 'Two students. One Infinity frame.',
  },
  {
    id: 'frame-pair-two',
    src: '/open-day/photo_3_2026-10-06_14-13-06.jpg',
    width: 960, height: 1280, orientation: 'portrait',
    alt: 'Two students smiling behind a green Infinity Club photo frame, one making a peace sign.',
    caption: 'A little of the day to take with you.',
  },
]

export const openDayPhotos = Object.fromEntries(openDayGallery.map((photo) => [photo.id, photo]))
