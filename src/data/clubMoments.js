export const CLUB_MOMENTS_INTERVAL_MS = 6200

// Each set balances people, hands-on work and the life around an event.
export const clubMomentSets = [
  {
    id: 'working-together',
    label: 'Working together',
    photos: [
      { file: 'photo4.jpg', alt: 'Three AIVEX participants working together around a laptop.', position: '50% 50%' },
      { file: 'photo2.jpg', alt: 'A participant writing code, with laptops and handwritten notes on the table.', position: '50% 36%' },
      { file: 'photo7.png', alt: 'Participants exchanging ideas around a computer during the first AIVEX edition.', position: '50% 40%' },
    ],
  },
  {
    id: 'around-campus',
    label: 'Conversations on campus',
    photos: [
      { file: 'photo6.jpg', alt: 'AIVEX participants walking together across the university campus with green event bags.', position: '50% 50%' },
      { file: 'photo3.png', alt: 'A speaker at a lectern beside the Algerian flag and an AIVEX banner.', position: '50% 35%' },
      { file: 'photo9.png', alt: 'Students and guests gathering around a laptop to discuss a project.', position: '50% 48%' },
    ],
  },
  {
    id: 'shared-memories',
    label: 'Shared memories',
    photos: [
      { file: 'photo_7_2026-09-13_17-19-59.jpg', alt: 'An AIVEX team presenting its certificate together on stage.', position: '50% 50%' },
      { file: 'photo5.png', alt: 'Participants and guests looking closely at a project on a laptop.', position: '50% 44%' },
      { file: 'photo8.jpg', alt: 'A group of participants arriving at a university building during AIVEX.', position: '50% 48%' },
    ],
  },
].map((set) => ({
  ...set,
  photos: set.photos.map((photo) => ({ ...photo, src: `/assets/aivex/${photo.file}`, width: 1024, height: 1280 })),
}))
