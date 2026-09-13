// Names and roles are taken from the supplied portrait artwork, not inferred biographies.
export const communityPortraits = [
  { id: 'djaber', name: 'Djaber', role: 'Vice President', file: 'photo_1_2026-09-13_23-30-36.jpg' },
  { id: 'tarek', name: 'Tarek', role: 'Art Director', file: 'photo_2_2026-09-13_23-30-36.jpg' },
  { id: 'nada', name: 'K. Nada', role: 'Multimedia Manager', file: 'photo_3_2026-09-13_23-30-36.jpg' },
  { id: 'green-skhara', name: 'Green Skhara', role: 'President', file: 'image.png' },
  { id: 'houssem', name: 'Houssem', role: 'Graphic Designer', file: 'photo_4_2026-09-13_23-30-36.jpg' },
  { id: 'oumaima', name: 'Oumaima', role: 'Multimedia Co-lead', file: 'photo_5_2026-09-13_23-30-36.jpg' },
  { id: 'massin', name: 'Massin', role: 'Video Editor', file: 'photo_6_2026-09-13_23-30-36.jpg' },
  { id: 'nour', name: 'Nour', role: 'Multimedia Lead', file: 'photo_7_2026-09-13_23-30-36.jpg' },
].map((portrait) => ({
  ...portrait,
  src: `/assets/communty/${portrait.file}`,
  alt: `Infinity Club's framed team portrait of ${portrait.name}, ${portrait.role}.`,
  width: 1024,
  height: 1280,
}))

export const communityInstagram = 'https://www.instagram.com/club_.infinity/'
