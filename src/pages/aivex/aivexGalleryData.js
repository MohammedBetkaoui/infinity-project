export const GALLERY_INTERVAL_MS = 5800

export const firstEditionPhotos = [
  {
    src: '/assets/aivex/photo4.jpg',
    width: 1024,
    height: 1280,
    caption: 'Working it out together.',
    alt: 'Three participants discussing their work around a laptop at the first AIVEX edition.',
  },
  {
    src: '/assets/aivex/photo2.jpg',
    width: 1024,
    height: 1280,
    caption: 'Ideas, in code.',
    alt: 'Hands typing code on a laptop, with another computer and handwritten notes on the table.',
  },
  {
    src: '/assets/aivex/photo7.png',
    width: 1024,
    height: 1280,
    caption: 'Explaining the next step.',
    alt: 'Four people exchanging ideas around an open laptop at AIVEX.',
  },
  {
    src: '/assets/aivex/photo9.png',
    width: 1024,
    height: 1280,
    caption: 'A project, a conversation.',
    alt: 'A group of participants gathered around a computer to discuss a project.',
  },
  {
    src: '/assets/aivex/photo5.png',
    width: 1024,
    height: 1280,
    caption: 'A closer look at the work.',
    alt: 'Participants looking at a project together, some seated at laptops and others standing nearby.',
  },
  {
    src: '/assets/aivex/photo1.png',
    width: 1024,
    height: 1280,
    caption: 'At the microphone.',
    alt: 'A speaker addressing the first AIVEX edition from a wooden lectern.',
  },
  {
    src: '/assets/aivex/photo3.png',
    width: 1024,
    height: 1280,
    caption: 'Sharing the room.',
    alt: 'A speaker at a lectern beside an AIVEX banner and the Algerian flag, seen from the audience.',
  },
  {
    src: '/assets/aivex/photo6.jpg',
    width: 1024,
    height: 1280,
    caption: 'Between sessions.',
    alt: 'Participants walking through the university campus carrying green bags.',
  },
  {
    src: '/assets/aivex/photo8.jpg',
    width: 1024,
    height: 1280,
    caption: 'Arriving on campus.',
    alt: 'A group walking towards a university building with blue windows and trees outside.',
  },
  {
    src: '/assets/aivex/photo_6_2026-09-13_17-19-59.jpg',
    width: 1024,
    height: 1280,
    caption: 'Closing the first chapter.',
    alt: 'Organisers and guests standing together during the certificate presentation at the first AIVEX edition.',
  },
  {
    src: '/assets/aivex/photo_7_2026-09-13_17-19-59.jpg',
    width: 1024,
    height: 1280,
    caption: 'A team and its certificate.',
    alt: 'A group of participants presenting their certificate together on the AIVEX stage.',
  },
  {
    src: '/assets/aivex/photo_8_2026-09-13_17-19-59.jpg',
    width: 1024,
    height: 1280,
    caption: 'The work, recognised.',
    alt: 'Participants posing with a certificate during the first AIVEX edition closing ceremony.',
  },
  {
    src: '/assets/aivex/photo_9_2026-09-13_17-19-59.jpg',
    width: 1024,
    height: 1280,
    caption: 'One team, one milestone.',
    alt: 'Four participants standing together with a certificate on the AIVEX stage.',
  },
  {
    src: '/assets/aivex/photo_10_2026-09-13_17-19-59.jpg',
    width: 1024,
    height: 1280,
    caption: 'A moment to remember.',
    alt: 'A participant team holding its certificate together at the AIVEX closing ceremony.',
  },
  {
    src: '/assets/aivex/photo_11_2026-09-13_17-19-59.jpg',
    width: 1024,
    height: 1280,
    caption: 'The room celebrates the work.',
    alt: 'Certificate recipients and guests assembled on stage at the close of the first AIVEX edition.',
  },
]

export function galleryIndex(index) {
  return ((index % firstEditionPhotos.length) + firstEditionPhotos.length) % firstEditionPhotos.length
}
