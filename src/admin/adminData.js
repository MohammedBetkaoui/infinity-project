export const applications = [
  { id: 'APP-260921-041', name: 'Lina Bensaid', initials: 'LB', email: 'lina.bensaid@etu.example.dz', phone: '+213 555 01 24 18', type: 'Member', level: 'M1', speciality: 'Computer Science', track: 'AI Engineering', availability: 'A few hours each week', experience: 'Building projects', date: '21 Sep 2026', status: 'New', source: 'Infinity website', form: 'JOIN-3.2', note: 'Interested in practical ML workshops and peer mentoring.' },
  { id: 'APP-260921-038', name: 'Amine Rahmani', initials: 'AR', email: 'amine.rahmani@etu.example.dz', phone: '+213 555 03 76 42', type: 'Staff', level: 'E3', speciality: 'Automation', track: 'Dev / Tech', availability: 'Mostly around events and projects', experience: 'Already learning', date: '21 Sep 2026', status: 'New', source: 'QR — Integration day', form: 'JOIN-3.2', note: 'Has helped organise a university hackathon.' },
  { id: 'APP-260920-034', name: 'Yasmine Khelifi', initials: 'YK', email: 'yasmine.khelifi@etu.example.dz', phone: 'Not provided', type: 'Member', level: 'L2', speciality: 'Mathematics', track: 'Web & App Development', availability: 'Variable during the semester', experience: 'Starting out', date: '20 Sep 2026', status: 'In review', source: 'Infinity website', form: 'JOIN-3.2', note: '' },
  { id: 'APP-260919-029', name: 'Nassim Boudiaf', initials: 'NB', email: 'nassim.boudiaf@etu.example.dz', phone: '+213 555 08 19 67', type: 'Staff', level: 'M2', speciality: 'Information Systems', track: 'Management / Logistics', availability: 'A few hours each week', experience: 'Building projects', date: '19 Sep 2026', status: 'Interview', source: 'Member referral', form: 'JOIN-3.1', note: 'Interview proposed for Wednesday afternoon.' },
  { id: 'APP-260918-024', name: 'Meriem Saadi', initials: 'MS', email: 'meriem.saadi@etu.example.dz', phone: '+213 555 11 92 20', type: 'Staff', level: 'L3', speciality: 'Visual Communication', track: 'Design / Content Creation', availability: 'Mostly around events and projects', experience: 'Building projects', date: '18 Sep 2026', status: 'Accepted', source: 'Instagram profile', form: 'JOIN-3.1', note: 'Strong motion design portfolio.' },
  { id: 'APP-260917-019', name: 'Sofiane Tiar', initials: 'ST', email: 'sofiane.tiar@etu.example.dz', phone: '+213 555 06 15 90', type: 'Member', level: 'E2', speciality: 'Electronics', track: 'AI & Automation', availability: 'A few hours each week', experience: 'Already learning', date: '17 Sep 2026', status: 'Declined', source: 'Infinity website', form: 'JOIN-3.1', note: '' },
  { id: 'APP-260912-008', name: 'Ines Madani', initials: 'IM', email: 'ines.madani@etu.example.dz', phone: 'Not provided', type: 'Member', level: 'L1', speciality: 'Computer Science', track: 'Needs help choosing', availability: 'Variable during the semester', experience: 'Starting out', date: '12 Sep 2026', status: 'Archived', source: 'Open day QR', form: 'JOIN-3.0', note: 'Archived after two unanswered follow-ups.' },
]

export const members = [
  { id: 'MEM-0318', name: 'Selma Djeradi', initials: 'SD', level: 'M1', speciality: 'Artificial Intelligence', pole: 'AI Engineering', joined: '12 Sep 2025', status: 'Active', last: 'Today, 10:42', cohort: '2025/26' },
  { id: 'MEM-0304', name: 'Mehdi Allal', initials: 'MA', level: 'L3', speciality: 'Computer Science', pole: 'Web & App Development', joined: '04 Sep 2025', status: 'Active', last: 'Yesterday', cohort: '2025/26' },
  { id: 'MEM-0277', name: 'Aya Benali', initials: 'AB', level: 'E2', speciality: 'Automation', pole: 'AI & Automation', joined: '18 Feb 2025', status: 'On pause', last: '12 days ago', cohort: '2024/25' },
  { id: 'MEM-0241', name: 'Riad Hamdi', initials: 'RH', level: 'M2', speciality: 'Networks', pole: 'Mobile Development', joined: '22 Oct 2024', status: 'Inactive', last: '2 months ago', cohort: '2024/25' },
  { id: 'MEM-0198', name: 'Nour El Houda Ziani', initials: 'NZ', level: 'E5', speciality: 'Software Engineering', pole: 'Web & App Development', joined: '06 Nov 2023', status: 'Alumni', last: '18 Jun 2026', cohort: '2023/24' },
]

export const staff = [
  { id: 'STF-082', name: 'Anis Kerroum', initials: 'AK', department: 'Dev / Tech', requested: 'Dev / Tech', role: 'Technical lead', level: 'M2', availability: 'Weekly', projects: 3, status: 'Active' },
  { id: 'STF-079', name: 'Sarah Bouzid', initials: 'SB', department: 'Design / Content Creation', requested: 'Design / Content Creation', role: 'Art director', level: 'M1', availability: 'Project based', projects: 2, status: 'Active' },
  { id: 'STF-071', name: 'Walid Cherif', initials: 'WC', department: 'Management / Logistics', requested: 'Dev / Tech', role: 'Operations coordinator', level: 'E4', availability: 'Weekly', projects: 4, status: 'Active' },
  { id: 'STF-068', name: 'Imane Touati', initials: 'IT', department: 'Design / Content Creation', requested: 'Design / Content Creation', role: 'Video editor', level: 'L3', availability: 'Events', projects: 1, status: 'On pause' },
  { id: 'STF-061', name: 'Abdelhak Meziane', initials: 'AM', department: 'Dev / Tech', requested: 'Management / Logistics', role: 'Frontend developer', level: 'E3', availability: 'Weekly', projects: 2, status: 'Active' },
]

export const teams = [
  { id: 'nova', ref: 'AIVEX2-7K9M2P4R', name: 'Nova Circuit', institution: 'University of Bordj Bou Arreridj', wilaya: '34 · Bordj Bou Arreridj', manager: 'Dr. Samir Ait Ouali', registration: 'Approved', document: 'Corrections needed', completeness: 86, submitted: '18 Sep 2026', updated: 'Today, 11:06', signed: true, edition: 'Second edition' },
  { id: 'sirius', ref: 'AIVEX2-4H8N6Q1D', name: 'Sirius Lab', institution: 'University of Blida 1', wilaya: '09 · Blida', manager: 'Nadia Zerrouki', registration: 'Under review', document: 'Signed document received', completeness: 100, submitted: '17 Sep 2026', updated: 'Today, 09:48', signed: true, edition: 'Second edition' },
  { id: 'atlas', ref: 'AIVEX2-8C3T5W7L', name: 'Atlas Pulse', institution: 'USTHB', wilaya: '16 · Algiers', manager: 'Pr. Karim Loucif', registration: 'Submitted', document: 'Awaiting signature', completeness: 78, submitted: '16 Sep 2026', updated: 'Yesterday', signed: false, edition: 'Second edition' },
  { id: 'zenith', ref: 'AIVEX2-2R6B9F3X', name: 'Zenith 19', institution: 'University Ferhat Abbas Sétif 1', wilaya: '19 · Sétif', manager: 'Lamia Belkacem', registration: 'Approved', document: 'Validated', completeness: 100, submitted: '14 Sep 2026', updated: '19 Sep 2026', signed: true, edition: 'Second edition' },
  { id: 'orion', ref: 'AIVEX2-5P1J8M4V', name: 'Orion Makers', institution: 'University of Béjaïa', wilaya: '06 · Béjaïa', manager: 'Dr. Yacine Amrane', registration: 'Under review', document: 'Generation issue', completeness: 62, submitted: '13 Sep 2026', updated: '18 Sep 2026', signed: false, edition: 'Second edition' },
  { id: 'cirta', ref: 'AIVEX2-9D4K7S2A', name: 'Cirta Neural', institution: 'University Constantine 2', wilaya: '25 · Constantine', manager: 'Souad Kaci', registration: 'Cancelled', document: 'Expired', completeness: 70, submitted: '11 Sep 2026', updated: '16 Sep 2026', signed: false, edition: 'Second edition' },
]

export const recentActivity = [
  { kind: 'application', title: 'Application accepted', subject: 'Meriem Saadi · Staff', actor: 'Nadia Belkacem', time: '11:32', tone: 'success' },
  { kind: 'document', title: 'Confidential document opened', subject: 'Nova Circuit · Student card 02', actor: 'Karim Amari', time: '11:08', tone: 'sensitive' },
  { kind: 'interview', title: 'Interview scheduled', subject: 'Nassim Boudiaf · 23 Sep at 14:30', actor: 'Nadia Belkacem', time: '10:54', tone: 'info' },
  { kind: 'upload', title: 'Signed document received', subject: 'Sirius Lab · version 2', actor: 'Team tracking link', time: '09:48', tone: 'success' },
  { kind: 'team', title: 'AIVEX file validated', subject: 'Zenith 19 · AIVEX2-2R6B9F3X', actor: 'Yacine Merabet', time: 'Yesterday', tone: 'success' },
  { kind: 'correction', title: 'Correction requested', subject: 'Nova Circuit · 3 items', actor: 'Karim Amari', time: 'Yesterday', tone: 'warning' },
]

export const teamStudents = [
  { position: '01', name: 'Rania Bekkouche', phone: '+213 555 12 40 82', bac: '2022', rfid: '47019283', card: 'Verified', result: 'Identity matched' },
  { position: '02', name: 'Ilyes Mansouri', phone: '+213 555 31 08 64', bac: '2021', rfid: '82170459', card: 'Present', result: 'Review required' },
  { position: '03', name: 'Maya Gharbi', phone: '+213 555 70 26 15', bac: '2023', rfid: '30591842', card: 'Verified', result: 'Identity matched' },
]

export const navItems = [
  { path: '/admin/overview', label: 'Overview', icon: 'overview', index: '01' },
  { path: '/admin/applications', label: 'Applications', icon: 'applications', index: '02', count: 12 },
  { path: '/admin/members', label: 'Members', icon: 'members', index: '03' },
  { path: '/admin/staff', label: 'Staff', icon: 'staff', index: '04' },
  { path: '/admin/aivex', label: 'AIVEX', icon: 'aivex', index: '05', count: 8 },
  { path: '/admin/activity', label: 'Activity log', icon: 'activity', index: '06' },
  { path: '/admin/settings', label: 'Settings', icon: 'settings', index: '07' },
]
