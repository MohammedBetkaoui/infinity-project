import { applications, members, staff, teams, recentActivity, teamStudents } from './adminData'

export const DEPARTMENTS = ['Dev / Tech', 'Design / Content Creation', 'Management / Logistics']
export const POLES = ['Web & App Development', 'Mobile Development', 'AI Engineering', 'AI & Automation', 'Graphic Design', 'Video Editing', 'Needs help choosing']
export const LEVELS = ['L1', 'L2', 'L3', 'M1', 'M2', 'E1', 'E2', 'E3', 'E4', 'E5', 'Other']
export const AVAILABILITY = ['A few hours each week', 'Mostly around events and projects', 'Variable during the semester']
export const EXPERIENCE = ['Starting out', 'Already learning', 'Building projects']
export const APPLICATION_STATUSES = ['New', 'In review', 'Interview', 'Accepted', 'Declined', 'Archived']
export const REGISTRATION_STATUSES = ['Submitted', 'Under review', 'Approved', 'Rejected', 'Cancelled']
export const DOCUMENT_STATUSES = ['Not generated', 'Generating', 'Awaiting signature', 'Signed document received', 'Under review', 'Corrections needed', 'Validated', 'Generation issue', 'Expired']
// Exact administrative terminology, with English labels in the interface.
export const STATUS_TRANSLATIONS = { Submitted: 'Soumise', 'Under review': 'En cours d’examen', Approved: 'Approuvée', Rejected: 'Refusée', Cancelled: 'Annulée', 'Not generated': 'Non généré', Generating: 'Génération en cours', 'Awaiting signature': 'En attente de signature', 'Signed document received': 'Document signé reçu', 'Corrections needed': 'Corrections nécessaires', Validated: 'Validé', 'Generation issue': 'Problème de génération', Expired: 'Expiré' }
export const CHECKLIST = ['Team information complete', 'Activities manager verified', 'Delegation leader verified', 'Driver verified', 'Exactly three students present', 'Three student cards present', 'Two identity documents present', 'Official form generated', 'Signed and stamped document received', 'Signed document verified']
export const dateLabel = (date) => new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
export const timeLabel = (date) => new Date(date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
export const initialsOf = (name) => name.split(' ').filter(Boolean).map((part) => part[0]).slice(0, 2).join('').toUpperCase()
export const demoNow = '2026-09-21T11:42:00'

export function createDemoState() {
  const extraNames = ['Walid Touati', 'Lamia Azzouz', 'Yacine Saidi', 'Rym Meziane', 'Adel Bouali', 'Sabrina Hamdi', 'Anis Kaci', 'Nour Amrane', 'Malek Ferhat', 'Ines Taleb', 'Samy Belhadj', 'Aya Khelil', 'Karim Ziani', 'Dina Cherif', 'Lyes Abadi', 'Rania Bahi', 'Farid Madani']
  const applicantRecords = [...applications, ...extraNames.map((name, index) => ({ ...applications[index % applications.length], id: `APP-2609-${100 + index}`, name, initials: initialsOf(name), email: `${name.toLowerCase().replaceAll(' ', '.')}@example.dz`, type: index % 3 === 0 ? 'Staff' : 'Member', track: index % 3 === 0 ? DEPARTMENTS[index % 3] : POLES[index % POLES.length], status: index < 10 ? 'New' : index < 13 ? 'In review' : 'Interview', level: LEVELS[index % LEVELS.length], date: dateLabel(`2026-09-${String(21 - index % 15).padStart(2, '0')}`) }))]
  const memberRecords = [...members, ...extraNames.slice(0, 9).map((name, index) => ({ ...members[index % members.length], id: `MEM-${400 + index}`, name, initials: initialsOf(name), pole: index === 2 ? 'Unassigned' : POLES[index % POLES.length], status: index === 5 ? 'Inactive' : 'Active', joined: '10 Sep 2026', cohort: '2026/27' }))].map((item) => ({ ...item, email: `${item.name.split(' ')[0].toLowerCase()}@example.dz`, phone: '+213 555 00 00 00', note: '', skills: 'Collaborative projects, peer learning', events: ['Introduction to Python', 'Infinity integration day'], documents: [] }))
  const staffRecords = [...staff, ...extraNames.slice(10, 15).map((name, index) => ({ ...staff[index % staff.length], id: `STF-${100 + index}`, name, initials: initialsOf(name) }))].map((item) => ({ ...item, email: `${item.name.split(' ')[0].toLowerCase()}@example.dz`, phone: '+213 555 00 00 00', note: '', assignedProjects: ['AIVEX operations', 'Autumn workshops'].slice(0, Math.min(item.projects, 2)) }))
  const teamRecords = [...teams, ...[
    ['nexus', 'Nexus Lab', 'University of Oran 1', '31 · Oran', 'Not generated'],
    ['dune', 'Dune Robotics', 'University of Ouargla', '30 · Ouargla', 'Generating'],
    ['aurora', 'Aurora Code', 'University of Tlemcen', '13 · Tlemcen', 'Under review'],
    ['pixel', 'Pixel Foundry', 'University of Batna 2', '05 · Batna', 'Validated'],
    ['sahara', 'Sahara Logic', 'University of Ghardaïa', '47 · Ghardaïa', 'Awaiting signature'],
    ['numidia', 'Numidia AI', 'University of Annaba', '23 · Annaba', 'Expired'],
  ].map(([id, name, institution, wilaya, document], index) => ({ ...teams[index % teams.length], id, name, institution, wilaya, ref: `AIVEX2-${['3N8A2W6Q', '6D1U9E4B', '1C7F3G8H', '8X2Y5Z9K', '4A6B1C8D', '2E7F9G3H'][index]}`, document, registration: index === 5 ? 'Rejected' : index === 3 ? 'Approved' : 'Submitted', signed: ['Under review', 'Validated'].includes(document) }))].map((team, index) => {
    const validated = team.document === 'Validated'
    const generated = !['Not generated', 'Generating', 'Generation issue'].includes(team.document)
    const checklist = CHECKLIST.map((_, i) => validated || (i < 7 && !(index === 4 && i === 6)) || (i === 7 && generated) || (i === 8 && team.signed))
    const docs = [
      { id: 'official', category: 'official', name: `${team.name.toLowerCase().replaceAll(' ', '-')}-official.docx`, person: team.name, kind: 'Official participation form', type: 'DOCX', size: '86 KB', status: generated ? 'Generated' : team.document, created: '2026-09-18T14:32:00', template: 'AIVEX-2.4', revision: 1 },
      ...teamStudents.map((student, i) => ({ id: `student-${i}`, category: 'student', name: `student-card-0${i + 1}.jpg`, person: student.name, kind: 'Student card', type: 'JPG', size: `${240 + i * 122} KB`, status: validated || i !== 1 ? 'Verified' : 'Present', created: '2026-09-18T14:25:00' })),
      { id: 'leader', category: 'identity', name: 'delegation-leader-id.png', person: 'Mounir Saidi', kind: 'Delegation leader · National identity card', type: 'PNG', size: '820 KB', status: 'Verified', created: '2026-09-18T14:26:00' },
      { id: 'driver', category: 'identity', name: 'driver-id.jpg', person: 'Hakim Larbi', kind: 'Driver · National identity card', type: 'JPG', size: '560 KB', status: index === 4 ? 'Absent' : 'Verified', created: '2026-09-18T14:27:00' },
    ]
    if (team.signed) docs.push({ id: 'signed-1', category: 'signed', name: 'participation-signed-v1.pdf', person: team.name, kind: 'Signed participation form', type: 'PDF', size: '1.2 MB', status: validated ? 'Verified' : index === 0 ? 'Invalid' : 'Present', created: '2026-09-20T09:45:00', version: 1, active: index !== 1 })
    if (index === 1) docs.push({ id: 'signed-2', category: 'signed', name: 'participation-signed-v2.pdf', person: team.name, kind: 'Signed participation form', type: 'PDF', size: '1.4 MB', status: 'Present', created: '2026-09-21T09:48:00', version: 2, active: true })
    return { ...team, students: teamStudents.map((s, i) => ({ ...s, rfid: String(47019283 + index * 34671 + i * 27043), bac: String(2021 + (index + i) % 5) })), managerRole: index % 2 ? 'Activities manager' : 'Deputy director of activities', managerEmail: `activities.${team.id}@example.dz`, managerPhone: '+213 555 04 20 18', leader: 'Mounir Saidi', driver: 'Hakim Larbi', leaderRfid: '58260134', driverRfid: '94620571', institutionType: 'Official institution', formVersion: 'AIVEX-4.0', docs, checklist, note: '', completeness: Math.round(checklist.filter(Boolean).length / CHECKLIST.length * 100), history: [
      { title: 'Registration created', actor: 'Team submission', at: '2026-09-18T14:25:00', kind: 'Registration' },
      ...(generated ? [{ title: 'Official DOCX generated · revision 1', actor: 'Document service (demo)', at: '2026-09-18T14:32:00', kind: 'Document' }] : []),
      { title: 'Private tracking link created', actor: 'Administration', at: '2026-09-18T14:33:00', kind: 'Access' },
      ...(team.signed ? [{ title: 'Official form downloaded', actor: team.manager, at: '2026-09-19T11:20:00', kind: 'Document' }, { title: 'Signed document deposited · v1', actor: team.manager, at: '2026-09-20T09:45:00', kind: 'Upload' }] : []),
    ] }
  })
  return { version: 3, applications: applicantRecords, members: memberRecords, staff: staffRecords, teams: teamRecords, activities: recentActivity.map((a, i) => ({ ...a, id: `ACT-${i}`, at: `2026-09-21T${a.time.includes(':') ? a.time : '09:12'}:00`, sensitivity: a.tone === 'sensitive' ? 'Confidential' : 'Standard', objectType: a.kind === 'application' || a.kind === 'interview' ? 'Application' : 'AIVEX', action: a.title, entity: a.subject })), settings: { name: 'Nadia Belkacem', role: 'Lead administrator', campaign: 'Autumn · 2026/27', notificationEmail: false, reviewAlerts: true, viewerTimeout: 120, density: 'Comfortable' } }
}

export function filterRecords(records, query, filters) {
  return records.filter((record) => (!query.trim() || JSON.stringify(record).toLowerCase().includes(query.trim().toLowerCase())) && Object.entries(filters).every(([key, value]) => !value || String(record[key]) === value))
}
