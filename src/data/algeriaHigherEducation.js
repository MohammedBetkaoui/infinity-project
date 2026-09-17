// Dataset based on the official MESRS university network.
// Keep the "Other institution" fallback because institutional names/statuses
// may change after future restructurings.
//
// Wilaya codes and institution ids are stable identifiers: store them, not
// the labels. Wilayas without an independent public institution in the
// current network keep an empty list and rely on the fallback.

const university = (id, name) => ({ id, name, type: 'university' })
const centre = (id, name) => ({ id, name, type: 'university-centre' })

export const OTHER_INSTITUTION_ID = 'other'
export const OTHER_INSTITUTION = { id: OTHER_INSTITUTION_ID, name: 'Other / Institution not listed', type: 'other' }

export const algerianWilayas = [
  { code: '01', name: 'Adrar', institutions: [university('univ-adrar', 'Université Ahmed Draya d’Adrar')] },
  { code: '02', name: 'Chlef', institutions: [university('univ-chlef', 'Université Hassiba Benbouali de Chlef')] },
  { code: '03', name: 'Laghouat', institutions: [
    university('univ-laghouat', 'Université Amar Telidji de Laghouat'),
    centre('cu-aflou', 'Centre Universitaire d’Aflou'),
  ] },
  { code: '04', name: 'Oum El Bouaghi', institutions: [university('univ-oum-el-bouaghi', 'Université Larbi Ben M’Hidi d’Oum El Bouaghi')] },
  { code: '05', name: 'Batna', institutions: [
    university('univ-batna-1', 'Université Batna 1 — Hadj Lakhdar'),
    university('univ-batna-2', 'Université Batna 2 — Mostefa Ben Boulaïd'),
    centre('cu-barika', 'Centre Universitaire de Barika — Si El Haouès'),
  ] },
  { code: '06', name: 'Béjaïa', institutions: [university('univ-bejaia', 'Université Abderrahmane Mira de Béjaïa')] },
  { code: '07', name: 'Biskra', institutions: [university('univ-biskra', 'Université Mohamed Khider de Biskra')] },
  { code: '08', name: 'Béchar', institutions: [university('univ-bechar', 'Université Tahri Mohamed de Béchar')] },
  { code: '09', name: 'Blida', institutions: [
    university('univ-blida-1', 'Université Blida 1 — Saad Dahlab'),
    university('univ-blida-2', 'Université Blida 2 — Lounici Ali'),
  ] },
  { code: '10', name: 'Bouira', institutions: [university('univ-bouira', 'Université Akli Mohand Oulhadj de Bouira')] },
  { code: '11', name: 'Tamanrasset', institutions: [university('univ-tamanrasset', 'Université de Tamanrasset')] },
  { code: '12', name: 'Tébessa', institutions: [university('univ-tebessa', 'Université Larbi Tébessi de Tébessa')] },
  { code: '13', name: 'Tlemcen', institutions: [
    university('univ-tlemcen', 'Université Abou Bekr Belkaid de Tlemcen'),
    centre('cu-maghnia', 'Centre Universitaire de Maghnia'),
  ] },
  { code: '14', name: 'Tiaret', institutions: [university('univ-tiaret', 'Université Ibn Khaldoun de Tiaret')] },
  { code: '15', name: 'Tizi Ouzou', institutions: [university('univ-tizi-ouzou', 'Université Mouloud Mammeri de Tizi Ouzou')] },
  { code: '16', name: 'Alger', institutions: [
    university('univ-alger-1', 'Université d’Alger 1 — Benyoucef Benkhedda'),
    university('univ-alger-2', 'Université d’Alger 2 — Abou El Kacem Saâdallah'),
    university('univ-alger-3', 'Université d’Alger 3 — Ibrahim Sultan Cheibout'),
    university('usthb', 'Université des Sciences et de la Technologie Houari Boumediene — USTHB'),
    university('univ-sciences-sante-alger', 'Université des Sciences de la Santé'),
  ] },
  { code: '17', name: 'Djelfa', institutions: [university('univ-djelfa', 'Université Ziane Achour de Djelfa')] },
  { code: '18', name: 'Jijel', institutions: [university('univ-jijel', 'Université Mohammed Seddik Ben Yahia de Jijel')] },
  { code: '19', name: 'Sétif', institutions: [
    university('univ-setif-1', 'Université Sétif 1 — Ferhat Abbas'),
    university('univ-setif-2', 'Université Sétif 2 — Mohamed Lamine Debaghine'),
  ] },
  { code: '20', name: 'Saïda', institutions: [university('univ-saida', 'Université Dr Moulay Tahar de Saïda')] },
  { code: '21', name: 'Skikda', institutions: [university('univ-skikda', 'Université 20 Août 1955 de Skikda')] },
  { code: '22', name: 'Sidi Bel Abbès', institutions: [university('univ-sidi-bel-abbes', 'Université Djillali Liabes de Sidi Bel Abbès')] },
  { code: '23', name: 'Annaba', institutions: [university('univ-annaba', 'Université Badji Mokhtar d’Annaba')] },
  { code: '24', name: 'Guelma', institutions: [university('univ-guelma', 'Université 8 Mai 1945 de Guelma')] },
  { code: '25', name: 'Constantine', institutions: [
    university('univ-constantine-1', 'Université Constantine 1 — Frères Mentouri'),
    university('univ-constantine-2', 'Université Constantine 2 — Abdelhamid Mehri'),
    university('univ-constantine-3', 'Université Constantine 3 — Salah Boubnider'),
    university('univ-emir-abdelkader', 'Université des Sciences Islamiques Emir Abdelkader'),
  ] },
  { code: '26', name: 'Médéa', institutions: [university('univ-medea', 'Université Yahia Farès de Médéa')] },
  { code: '27', name: 'Mostaganem', institutions: [university('univ-mostaganem', 'Université Abdelhamid Ibn Badis de Mostaganem')] },
  { code: '28', name: 'M’Sila', institutions: [university('univ-msila', 'Université Mohamed Boudiaf de M’Sila')] },
  { code: '29', name: 'Mascara', institutions: [university('univ-mascara', 'Université Mustapha Stambouli de Mascara')] },
  { code: '30', name: 'Ouargla', institutions: [university('univ-ouargla', 'Université Kasdi Merbah de Ouargla')] },
  { code: '31', name: 'Oran', institutions: [
    university('univ-oran-1', 'Université d’Oran 1 — Ahmed Ben Bella'),
    university('univ-oran-2', 'Université d’Oran 2 — Mohamed Ben Ahmed'),
    university('usto', 'Université des Sciences et de la Technologie d’Oran — Mohamed Boudiaf / USTO'),
  ] },
  { code: '32', name: 'El Bayadh', institutions: [centre('cu-el-bayadh', 'Centre Universitaire Nour Bachir d’El Bayadh')] },
  { code: '33', name: 'Illizi', institutions: [centre('cu-illizi', 'Centre Universitaire Cheikh Amoud Ben Mokhtar d’Illizi')] },
  { code: '34', name: 'Bordj Bou Arréridj', institutions: [university('univ-bba', 'Université Mohamed El Bachir El Ibrahimi de Bordj Bou Arréridj')] },
  { code: '35', name: 'Boumerdès', institutions: [university('univ-boumerdes', 'Université M’Hamed Bougara de Boumerdès')] },
  { code: '36', name: 'El Tarf', institutions: [university('univ-el-tarf', 'Université Chadli Bendjedid d’El Tarf')] },
  { code: '37', name: 'Tindouf', institutions: [university('univ-tindouf', 'Université Ali Kafi de Tindouf')] },
  { code: '38', name: 'Tissemsilt', institutions: [university('univ-tissemsilt', 'Université de Tissemsilt')] },
  { code: '39', name: 'El Oued', institutions: [university('univ-el-oued', 'Université Hamma Lakhdar d’El Oued')] },
  { code: '40', name: 'Khenchela', institutions: [university('univ-khenchela', 'Université Abbas Laghrour de Khenchela')] },
  { code: '41', name: 'Souk Ahras', institutions: [university('univ-souk-ahras', 'Université Mohamed Chérif Messaadia de Souk Ahras')] },
  { code: '42', name: 'Tipaza', institutions: [university('univ-tipaza', 'Université Morsli Abdallah de Tipaza')] },
  { code: '43', name: 'Mila', institutions: [university('univ-mila', 'Université Abdelhafid Boussouf de Mila')] },
  { code: '44', name: 'Aïn Defla', institutions: [university('univ-khemis-miliana', 'Université Djilali Bounaama de Khemis Miliana')] },
  { code: '45', name: 'Naâma', institutions: [university('univ-naama', 'Université Ahmed Salhi de Naâma')] },
  { code: '46', name: 'Aïn Témouchent', institutions: [university('univ-ain-temouchent', 'Université Belhadj Bouchaib d’Aïn Témouchent')] },
  { code: '47', name: 'Ghardaïa', institutions: [university('univ-ghardaia', 'Université de Ghardaïa')] },
  { code: '48', name: 'Relizane', institutions: [university('univ-relizane', 'Université Ahmed Zabana de Relizane')] },
  { code: '49', name: 'Timimoun', institutions: [] },
  { code: '50', name: 'Bordj Badji Mokhtar', institutions: [] },
  { code: '51', name: 'Ouled Djellal', institutions: [] },
  { code: '52', name: 'Béni Abbès', institutions: [] },
  { code: '53', name: 'In Salah', institutions: [] },
  { code: '54', name: 'In Guezzam', institutions: [] },
  { code: '55', name: 'Touggourt', institutions: [] },
  { code: '56', name: 'Djanet', institutions: [] },
  { code: '57', name: 'El M’Ghair', institutions: [] },
  { code: '58', name: 'El Meniaa', institutions: [] },
]

const byCode = new Map(algerianWilayas.map((wilaya) => [wilaya.code, wilaya]))

export const findWilaya = (code) => byCode.get(code) || null

// Listed institutions for the wilaya, always followed by the fallback.
export const getInstitutionsByWilaya = (code) => {
  const wilaya = findWilaya(code)
  return wilaya ? [...wilaya.institutions, OTHER_INSTITUTION] : []
}

export const findInstitution = (wilayaCode, institutionId) => (
  getInstitutionsByWilaya(wilayaCode).find((institution) => institution.id === institutionId) || null
)
