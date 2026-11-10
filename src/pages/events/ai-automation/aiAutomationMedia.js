// Visually reviewed, not inferred from filenames. All photographs are the
// supplied Day1 series: native 4:5, with the club logo and green treatment
// already embedded. Preserve the entire frame, including that signature.
const source = '/ai-automation/Day1-20261110T190451Z-1-001/Day1'
const optimized = '/ai-automation/optimized'

const photographs = [
  ['in-the-room', '07.png', 'A presenter explaining a projected diagram to seated workshop participants, with raised hands in the foreground.', 'In the room. In the conversation.', 'Session'],
  ['vector-search', '02.png', 'A presenter facing a slide titled Question, vector search, answer, with a connected vector database diagram.', 'A question becomes a connected process.', 'Ideas'],
  ['explaining', '05.png', 'A speaker holding two markers while explaining a projected document-library example.', 'Making room for an explanation.', 'Discussion'],
  ['listening', '06.png', 'Two seated workshop participants listening, with the participant in front in sharp focus.', 'The other half of a conversation.', 'People'],
  ['sharing', '04.png', 'A woman holding a phone and gesturing beside a presenter, a whiteboard and a laptop.', 'A moment to share a thought.', 'Discussion'],
  ['conversation', '01.png', 'Two men standing beside a whiteboard, one gesturing while speaking to the room.', 'Ideas shared face to face.', 'Discussion'],
  ['attention', '03.png', 'A workshop attendee wearing a club lanyard, standing with folded arms and looking toward the session.', 'A pause. A little attention.', 'People'],
  ['together', '09.png', 'Seated participants talking and listening together, with a child in the foreground.', 'The people between the slides.', 'People'],
]

export const aiAutomationGallery = photographs.map(([id, file, alt, caption, category]) => ({
  id, original: `${source}/${file}`, src: `${optimized}/${id}-720.webp`,
  fullSrc: `${optimized}/${id}-1080.webp`, thumb: `${optimized}/${id}-160.webp`,
  srcSet: [360, 720, 1080].map((width) => `${optimized}/${id}-${width}.webp ${width}w`).join(', '),
  width: 1080, height: 1350, orientation: 'portrait', alt, caption, category,
}))

export const aiAutomationPhotos = Object.fromEntries(aiAutomationGallery.map((photo) => [photo.id, photo]))

// No official workshop film or confirmed date was found. Folder export
// timestamps are not event dates. 11.png is soft; 7.png has a busy, soft
// composition. Neither is used. Day2 is outside the requested source set.
