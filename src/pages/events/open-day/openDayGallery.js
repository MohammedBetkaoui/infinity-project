// Measured and visually reviewed from public/open-day. The 10 October set is
// a coherent vertical series with the Infinity mark and mint field treatment;
// the awards still is the one complementary frame supplied with it.
export const openDayGallery = [
  {
    id: 'hall',
    src: '/open-day/photo_1_2026-10-10_15-09-43.jpg',
    width: 1024, height: 1280, orientation: 'portrait', featured: true,
    alt: 'Students gathered around the Infinity Club challenge table during Open Day.',
    caption: 'A first stop at the Infinity table.',
  },
  {
    id: 'gathering',
    src: '/open-day/photo_2_2026-10-10_15-09-43.jpg',
    width: 1024, height: 1280, orientation: 'portrait',
    alt: 'Students talking with Infinity Club members beside the faculty hall windows.',
    caption: 'Questions shared across the stand.',
  },
  {
    id: 'conversation',
    src: '/open-day/photo_3_2026-10-10_15-09-43.jpg',
    width: 1024, height: 1280, orientation: 'portrait',
    alt: 'A visitor exploring the Infinity Club membership page on a laptop.',
    caption: 'From curiosity to a first step.',
  },
  {
    id: 'chess',
    src: '/open-day/photo_4_2026-10-10_15-09-43.jpg',
    width: 1024, height: 1280, orientation: 'portrait',
    alt: 'A group of students concentrating around a chessboard at Open Day.',
    caption: 'One board. Many possible moves.',
  },
  {
    id: 'spin',
    src: '/open-day/photo_5_2026-10-10_15-09-43.jpg',
    width: 1024, height: 1280, orientation: 'portrait', kind: 'activity',
    alt: 'The handmade Infinity challenge wheel displayed between laptops and game stickers.',
    caption: 'Spin the wheel. Take the challenge.',
  },
  {
    id: 'game-table',
    src: '/open-day/photo_6_2026-10-10_15-09-43.jpg',
    width: 1024, height: 1280, orientation: 'portrait',
    alt: 'Students gathered around a table playing several small strategy games.',
    caption: 'A table made for joining in.',
  },
  {
    id: 'frame',
    src: '/open-day/photo_7_2026-10-10_15-09-43.jpg',
    width: 1024, height: 1280, orientation: 'portrait',
    alt: 'A student smiling through the green Infinity Club Open Day photo frame.',
    caption: 'Inside the Infinity frame.',
  },
  {
    id: 'chess-duel',
    src: '/open-day/photo_8_2026-10-10_15-09-43.jpg',
    width: 1024, height: 1280, orientation: 'portrait',
    alt: 'Students thinking over two chess games at a table in the faculty hall.',
    caption: 'Quiet focus in a busy hall.',
  },
  {
    id: 'spin-lab',
    src: '/open-day/photo_9_2026-10-10_15-09-43.jpg',
    width: 1024, height: 1280, orientation: 'portrait',
    alt: 'The Infinity challenge wheel and its digital game shown together on two laptops.',
    caption: 'The physical wheel meets its digital twin.',
  },
  {
    id: 'awards',
    src: '/open-day/photo_1_2026-10-06_14-58-06.jpg',
    width: 960, height: 1280, orientation: 'portrait',
    alt: 'Infinity Club certificates, awards and a second-place trophy arranged on a table.',
    caption: 'The work behind the club, on the table.',
  },
]

export const openDayPhotos = Object.fromEntries(openDayGallery.map((photo) => [photo.id, photo]))
