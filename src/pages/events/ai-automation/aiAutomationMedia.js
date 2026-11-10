// Visually reviewed, not inferred from filenames. All photographs are the
// supplied Day1 (talks) and Day2 (hands-on lab) series: native 4:5, with the
// club logo and green treatment already embedded. Preserve the entire frame,
// including that signature. Derivatives: scripts/prepare-ai-automation-media.py
const optimized = '/ai-automation/optimized'
const sources = {
  '01': '/ai-automation/Day1-20261110T190451Z-1-001/Day1',
  '02': '/ai-automation/Day2-20261110T190453Z-1-001/Day2',
}

// [id, original file, alt, caption, category]
const day1 = [
  ['in-the-room', '07.png', 'A presenter explaining a projected diagram to seated workshop participants, with raised hands in the foreground.', 'In the room. In the conversation.', 'Session'],
  ['vector-search', '02.png', 'A presenter facing a slide titled Question, vector search, answer, with a connected vector database diagram.', 'A question becomes a connected process.', 'Ideas'],
  ['explaining', '05.png', 'A speaker holding two markers while explaining a projected document-library example.', 'Making room for an explanation.', 'Discussion'],
  ['listening', '06.png', 'Two seated workshop participants listening, with the participant in front in sharp focus.', 'The other half of a conversation.', 'People'],
  ['sharing', '04.png', 'A woman holding a phone and gesturing beside a presenter, a whiteboard and a laptop.', 'A moment to share a thought.', 'Discussion'],
  ['conversation', '01.png', 'Two men standing beside a whiteboard, one gesturing while speaking to the room.', 'Ideas shared face to face.', 'Discussion'],
  ['attention', '03.png', 'A workshop attendee wearing a club lanyard, standing with folded arms and looking toward the session.', 'A pause. A little attention.', 'People'],
  ['together', '09.png', 'Seated participants talking and listening together, with a child in the foreground.', 'The people between the slides.', 'People'],
]

const day2 = [
  ['lab-guidance', '1(1).png', 'A mentor wearing a club lanyard leans over a computer beside a participant studying the screen.', 'A second pair of eyes on the screen.', 'Mentoring'],
  ['lab-room', '5(1).png', 'A classroom with a projected screen, a presenter standing at the front and participants working on laptops.', 'The lab room, mid-session.', 'Session'],
  ['lab-focus', '2(1).png', 'A young man wearing a club lanyard leans over a desk, focused on his work.', 'Head down, in the problem.', 'Lab'],
  ['lab-card', '4(1).png', 'A participant holding a small green card up in front of her face.', 'Every Infiniter holds a card.', 'People'],
  ['lab-side-by-side', '1.png', 'A participant in glasses leans toward a monitor next to a seated participant.', 'Side by side, one screen.', 'Lab'],
  ['lab-laptops', '5.png', 'A participant in a white cap leans over his laptop, with other participants working behind him.', 'Laptops open.', 'Lab'],
  ['lab-smile', '4.png', 'A smiling mentor wearing a club lanyard gestures as a participant laughs behind him.', 'Learning, with a smile.', 'Mentoring'],
  ['lab-testing', '6.png', 'A participant with curly hair and glasses works on a laptop beside someone holding a phone.', 'Try it. Test it. Try again.', 'Lab'],
  ['lab-mentor', '8.png', 'A mentor stands and explains to participants seated at computers in a bright lab.', 'From desk to desk.', 'Mentoring'],
  ['lab-attention', '6(1).png', 'A row of seated participants with laptops looking toward the front of the room.', 'All eyes to the front.', 'People'],
  ['lab-debug', '3.png', 'A participant in a blue track jacket bends over a computer to check something.', 'Checking the next step.', 'Lab'],
  ['lab-row', '3(1).png', 'Two seated participants look ahead while a mentor in a patterned jacket stands behind them.', 'Questions, from every row.', 'People'],
  ['lab-thinking', '7.png', 'A participant in glasses rests his chin on his hand, looking ahead, a laptop in front of him.', 'A thought taking shape.', 'People'],
  ['lab-workstation', '2.png', 'A computer screen showing an application, with a participant at a workstation in the background.', 'The workstation, ready.', 'Lab'],
  ['lab-listening', '9.png', 'A participant in glasses and a padded vest listens from his seat.', 'Listening in.', 'People'],
]

const toPhoto = (day) => ([id, file, alt, caption, category]) => ({
  id, day, original: `${sources[day]}/${file}`, src: `${optimized}/${id}-720.webp`,
  fullSrc: `${optimized}/${id}-1080.webp`, thumb: `${optimized}/${id}-160.webp`,
  srcSet: [360, 720, 1080].map((width) => `${optimized}/${id}-${width}.webp ${width}w`).join(', '),
  width: 1080, height: 1350, orientation: 'portrait', alt, caption, category,
})

export const aiAutomationDay1 = day1.map(toPhoto('01'))
export const aiAutomationDay2 = day2.map(toPhoto('02'))
export const aiAutomationGallery = [...aiAutomationDay1, ...aiAutomationDay2]
export const aiAutomationPhotos = Object.fromEntries(aiAutomationGallery.map((photo) => [photo.id, photo]))

// The frames of the Day 02 spread, in reading order.
export const aiAutomationLabSpread = ['lab-guidance', 'lab-room', 'lab-focus', 'lab-card', 'lab-laptops', 'lab-smile', 'lab-testing', 'lab-mentor'].map((id) => aiAutomationPhotos[id])

// The deck identity of the workshop film: one place to correct a fact.
export const aiAutomationEvent = {
  edition: '2026',
  dates: '08 — 09 NOV 2026',
  venue: 'AI House',
  host: 'Infinity Club',
  tagline: 'No limits for Infiniters',
  days: [
    { id: 'day-01', label: 'Day 01', title: 'The talks', summary: 'Artificial intelligence, from its history to its big themes — then automation: retrieval, documents and connected steps.' },
    { id: 'day-02', label: 'Day 02', title: 'The lab', summary: 'Laptops open, mentors moving from desk to desk, ideas tested at the keyboard.' },
  ],
}

// 11.png is soft; 7.png has a busy, soft composition. Neither is used.
