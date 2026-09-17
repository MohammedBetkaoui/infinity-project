// Dataset based on the official MESRS university network.
// Keep the "Other institution" fallback because institutional names/statuses
// may change after future restructurings.
//
// Wilaya codes and institution ids are stable identifiers: store them, not
// the labels. Wilayas without an independent public institution in the
// current network keep an empty list and rely on the fallback.
// `name` is the French official label (sent to the backend).
// `nameAr` is the Arabic display label (form UI only, lang === 'ar').

const university = (id, name, nameAr) => ({ id, name, nameAr: nameAr || name, type: 'university' })
const centre = (id, name, nameAr) => ({ id, name, nameAr: nameAr || name, type: 'university-centre' })

export const OTHER_INSTITUTION_ID = 'other'
export const OTHER_INSTITUTION = {
  id: OTHER_INSTITUTION_ID,
  name: 'Other / Institution not listed',
  nameAr: 'أخرى / مؤسسة غير مدرجة',
  type: 'other',
}

export const algerianWilayas = [
  { code: '01', name: 'Adrar', nameAr: 'أدرار', institutions: [university('univ-adrar', 'Université Ahmed Draya d’Adrar', 'جامعة أحمد دراية – أدرار')] },
  { code: '02', name: 'Chlef', nameAr: 'الشلف', institutions: [university('univ-chlef', 'Université Hassiba Benbouali de Chlef', 'جامعة حسيبة بن بوعلي – الشلف')] },
  { code: '03', name: 'Laghouat', nameAr: 'الأغواط', institutions: [
    university('univ-laghouat', 'Université Amar Telidji de Laghouat', 'جامعة عمار ثليجي – الأغواط'),
    centre('cu-aflou', 'Centre Universitaire d’Aflou', 'المركز الجامعي – آفلو'),
  ] },
  { code: '04', name: 'Oum El Bouaghi', nameAr: 'أم البواقي', institutions: [university('univ-oum-el-bouaghi', 'Université Larbi Ben M’Hidi d’Oum El Bouaghi', 'جامعة العربي بن مهيدي – أم البواقي')] },
  { code: '05', name: 'Batna', nameAr: 'باتنة', institutions: [
    university('univ-batna-1', 'Université Batna 1 — Hadj Lakhdar', 'جامعة باتنة 1 – الحاج لخضر'),
    university('univ-batna-2', 'Université Batna 2 — Mostefa Ben Boulaïd', 'جامعة باتنة 2 – مصطفى بن بولعيد'),
    centre('cu-barika', 'Centre Universitaire de Barika — Si El Haouès', 'المركز الجامعي – بريكة – سي الحواس'),
  ] },
  { code: '06', name: 'Béjaïa', nameAr: 'بجاية', institutions: [university('univ-bejaia', 'Université Abderrahmane Mira de Béjaïa', 'جامعة عبد الرحمان ميرة – بجاية')] },
  { code: '07', name: 'Biskra', nameAr: 'بسكرة', institutions: [university('univ-biskra', 'Université Mohamed Khider de Biskra', 'جامعة محمد خيضر – بسكرة')] },
  { code: '08', name: 'Béchar', nameAr: 'بشار', institutions: [university('univ-bechar', 'Université Tahri Mohamed de Béchar', 'جامعة طاهري محمد – بشار')] },
  { code: '09', name: 'Blida', nameAr: 'البليدة', institutions: [
    university('univ-blida-1', 'Université Blida 1 — Saad Dahlab', 'جامعة البليدة 1 – سعد دحلب'),
    university('univ-blida-2', 'Université Blida 2 — Lounici Ali', 'جامعة البليدة 2 – لونيسي علي'),
  ] },
  { code: '10', name: 'Bouira', nameAr: 'البويرة', institutions: [university('univ-bouira', 'Université Akli Mohand Oulhadj de Bouira', 'جامعة أكلي محند أولحاج – البويرة')] },
  { code: '11', name: 'Tamanrasset', nameAr: 'تمنراست', institutions: [university('univ-tamanrasset', 'Université de Tamanrasset', 'جامعة تمنراست')] },
  { code: '12', name: 'Tébessa', nameAr: 'تبسة', institutions: [university('univ-tebessa', 'Université Larbi Tébessi de Tébessa', 'جامعة العربي التبسي – تبسة')] },
  { code: '13', name: 'Tlemcen', nameAr: 'تلمسان', institutions: [
    university('univ-tlemcen', 'Université Abou Bekr Belkaid de Tlemcen', 'جامعة أبو بكر بلقايد – تلمسان'),
    centre('cu-maghnia', 'Centre Universitaire de Maghnia', 'المركز الجامعي – مغنية'),
  ] },
  { code: '14', name: 'Tiaret', nameAr: 'تيارت', institutions: [university('univ-tiaret', 'Université Ibn Khaldoun de Tiaret', 'جامعة ابن خلدون – تيارت')] },
  { code: '15', name: 'Tizi Ouzou', nameAr: 'تيزي وزو', institutions: [university('univ-tizi-ouzou', 'Université Mouloud Mammeri de Tizi Ouzou', 'جامعة مولود معمري – تيزي وزو')] },
  { code: '16', name: 'Alger', nameAr: 'الجزائر', institutions: [
    university('univ-alger-1', 'Université d’Alger 1 — Benyoucef Benkhedda', 'جامعة الجزائر 1 – بن يوسف بن خدة'),
    university('univ-alger-2', 'Université d’Alger 2 — Abou El Kacem Saâdallah', 'جامعة الجزائر 2 – أبو القاسم سعد الله'),
    university('univ-alger-3', 'Université d’Alger 3 — Ibrahim Sultan Cheibout', 'جامعة الجزائر 3 – إبراهيم سلطان شيبوط'),
    university('usthb', 'Université des Sciences et de la Technologie Houari Boumediene — USTHB', 'جامعة هواري بومدين للعلوم والتكنولوجيا – الجزائر'),
    university('univ-sciences-sante-alger', 'Université des Sciences de la Santé', 'جامعة العلوم الصحية – الجزائر'),
  ] },
  { code: '17', name: 'Djelfa', nameAr: 'الجلفة', institutions: [university('univ-djelfa', 'Université Ziane Achour de Djelfa', 'جامعة زيان عاشور – الجلفة')] },
  { code: '18', name: 'Jijel', nameAr: 'جيجل', institutions: [university('univ-jijel', 'Université Mohammed Seddik Ben Yahia de Jijel', 'جامعة محمد الصديق بن يحيى – جيجل')] },
  { code: '19', name: 'Sétif', nameAr: 'سطيف', institutions: [
    university('univ-setif-1', 'Université Sétif 1 — Ferhat Abbas', 'جامعة سطيف 1 – فرحات عباس'),
    university('univ-setif-2', 'Université Sétif 2 — Mohamed Lamine Debaghine', 'جامعة سطيف 2 – محمد لمين دباغين'),
  ] },
  { code: '20', name: 'Saïda', nameAr: 'سعيدة', institutions: [university('univ-saida', 'Université Dr Moulay Tahar de Saïda', 'جامعة الدكتور مولاي الطاهر – سعيدة')] },
  { code: '21', name: 'Skikda', nameAr: 'سكيكدة', institutions: [university('univ-skikda', 'Université 20 Août 1955 de Skikda', 'جامعة 20 أوت 1955 – سكيكدة')] },
  { code: '22', name: 'Sidi Bel Abbès', nameAr: 'سيدي بلعباس', institutions: [university('univ-sidi-bel-abbes', 'Université Djillali Liabes de Sidi Bel Abbès', 'جامعة جيلالي ليابس – سيدي بلعباس')] },
  { code: '23', name: 'Annaba', nameAr: 'عنابة', institutions: [university('univ-annaba', 'Université Badji Mokhtar d’Annaba', 'جامعة باجي مختار – عنابة')] },
  { code: '24', name: 'Guelma', nameAr: 'قالمة', institutions: [university('univ-guelma', 'Université 8 Mai 1945 de Guelma', 'جامعة 8 ماي 1945 – قالمة')] },
  { code: '25', name: 'Constantine', nameAr: 'قسنطينة', institutions: [
    university('univ-constantine-1', 'Université Constantine 1 — Frères Mentouri', 'جامعة قسنطينة 1 – الإخوة منتوري'),
    university('univ-constantine-2', 'Université Constantine 2 — Abdelhamid Mehri', 'جامعة قسنطينة 2 – عبد الحميد مهري'),
    university('univ-constantine-3', 'Université Constantine 3 — Salah Boubnider', 'جامعة قسنطينة 3 – صالح بوبنيدر'),
    university('univ-emir-abdelkader', 'Université des Sciences Islamiques Emir Abdelkader', 'جامعة الأمير عبد القادر للعلوم الإسلامية – قسنطينة'),
  ] },
  { code: '26', name: 'Médéa', nameAr: 'المدية', institutions: [university('univ-medea', 'Université Yahia Farès de Médéa', 'جامعة يحيى فارس – المدية')] },
  { code: '27', name: 'Mostaganem', nameAr: 'مستغانم', institutions: [university('univ-mostaganem', 'Université Abdelhamid Ibn Badis de Mostaganem', 'جامعة عبد الحميد بن باديس – مستغانم')] },
  { code: '28', name: 'M’Sila', nameAr: 'المسيلة', institutions: [university('univ-msila', 'Université Mohamed Boudiaf de M’Sila', 'جامعة محمد بوضياف – المسيلة')] },
  { code: '29', name: 'Mascara', nameAr: 'معسكر', institutions: [university('univ-mascara', 'Université Mustapha Stambouli de Mascara', 'جامعة مصطفى اسطمبولي – معسكر')] },
  { code: '30', name: 'Ouargla', nameAr: 'ورقلة', institutions: [university('univ-ouargla', 'Université Kasdi Merbah de Ouargla', 'جامعة قاصدي مرباح – ورقلة')] },
  { code: '31', name: 'Oran', nameAr: 'وهران', institutions: [
    university('univ-oran-1', 'Université d’Oran 1 — Ahmed Ben Bella', 'جامعة وهران 1 – أحمد بن بلة'),
    university('univ-oran-2', 'Université d’Oran 2 — Mohamed Ben Ahmed', 'جامعة وهران 2 – محمد بن أحمد'),
    university('usto', 'Université des Sciences et de la Technologie d’Oran — Mohamed Boudiaf / USTO', 'جامعة وهران للعلوم والتكنولوجيا – محمد بوضياف'),
  ] },
  { code: '32', name: 'El Bayadh', nameAr: 'البيض', institutions: [centre('cu-el-bayadh', 'Centre Universitaire Nour Bachir d’El Bayadh', 'المركز الجامعي نور البشير – البيض')] },
  { code: '33', name: 'Illizi', nameAr: 'إليزي', institutions: [centre('cu-illizi', 'Centre Universitaire Cheikh Amoud Ben Mokhtar d’Illizi', 'المركز الجامعي الشيخ عمود بن مختار – إليزي')] },
  { code: '34', name: 'Bordj Bou Arréridj', nameAr: 'برج بوعريريج', institutions: [university('univ-bba', 'Université Mohamed El Bachir El Ibrahimi de Bordj Bou Arréridj', 'جامعة محمد البشير الإبراهيمي – برج بوعريريج')] },
  { code: '35', name: 'Boumerdès', nameAr: 'بومرداس', institutions: [university('univ-boumerdes', 'Université M’Hamed Bougara de Boumerdès', 'جامعة أمحمد بوقرة – بومرداس')] },
  { code: '36', name: 'El Tarf', nameAr: 'الطارف', institutions: [university('univ-el-tarf', 'Université Chadli Bendjedid d’El Tarf', 'جامعة الشاذلي بن جديد – الطارف')] },
  { code: '37', name: 'Tindouf', nameAr: 'تندوف', institutions: [university('univ-tindouf', 'Université Ali Kafi de Tindouf', 'جامعة علي كافي – تندوف')] },
  { code: '38', name: 'Tissemsilt', nameAr: 'تيسمسيلت', institutions: [university('univ-tissemsilt', 'Université de Tissemsilt', 'جامعة تيسمسيلت')] },
  { code: '39', name: 'El Oued', nameAr: 'الوادي', institutions: [university('univ-el-oued', 'Université Hamma Lakhdar d’El Oued', 'جامعة حمه لخضر – الوادي')] },
  { code: '40', name: 'Khenchela', nameAr: 'خنشلة', institutions: [university('univ-khenchela', 'Université Abbas Laghrour de Khenchela', 'جامعة عباس لغرور – خنشلة')] },
  { code: '41', name: 'Souk Ahras', nameAr: 'سوق أهراس', institutions: [university('univ-souk-ahras', 'Université Mohamed Chérif Messaadia de Souk Ahras', 'جامعة محمد الشريف مساعدية – سوق أهراس')] },
  { code: '42', name: 'Tipaza', nameAr: 'تيبازة', institutions: [university('univ-tipaza', 'Université Morsli Abdallah de Tipaza', 'جامعة مرسلي عبد الله – تيبازة')] },
  { code: '43', name: 'Mila', nameAr: 'ميلة', institutions: [university('univ-mila', 'Université Abdelhafid Boussouf de Mila', 'جامعة عبد الحفيظ بوالصوف – ميلة')] },
  { code: '44', name: 'Aïn Defla', nameAr: 'عين الدفلى', institutions: [university('univ-khemis-miliana', 'Université Djilali Bounaama de Khemis Miliana', 'جامعة جيلالي بونعامة – خميس مليانة')] },
  { code: '45', name: 'Naâma', nameAr: 'النعامة', institutions: [university('univ-naama', 'Université Ahmed Salhi de Naâma', 'جامعة أحمد صالحي – النعامة')] },
  { code: '46', name: 'Aïn Témouchent', nameAr: 'عين تموشنت', institutions: [university('univ-ain-temouchent', 'Université Belhadj Bouchaib d’Aïn Témouchent', 'جامعة بلحاج بوشعيب – عين تموشنت')] },
  { code: '47', name: 'Ghardaïa', nameAr: 'غرداية', institutions: [university('univ-ghardaia', 'Université de Ghardaïa', 'جامعة غرداية')] },
  { code: '48', name: 'Relizane', nameAr: 'غليزان', institutions: [university('univ-relizane', 'Université Ahmed Zabana de Relizane', 'جامعة أحمد زبانة – غليزان')] },
  { code: '49', name: 'Timimoun', nameAr: 'تيميمون', institutions: [] },
  { code: '50', name: 'Bordj Badji Mokhtar', nameAr: 'برج باجي مختار', institutions: [] },
  { code: '51', name: 'Ouled Djellal', nameAr: 'أولاد جلال', institutions: [] },
  { code: '52', name: 'Béni Abbès', nameAr: 'بني عباس', institutions: [] },
  { code: '53', name: 'In Salah', nameAr: 'عين صالح', institutions: [] },
  { code: '54', name: 'In Guezzam', nameAr: 'عين قزام', institutions: [] },
  { code: '55', name: 'Touggourt', nameAr: 'تقرت', institutions: [] },
  { code: '56', name: 'Djanet', nameAr: 'جانت', institutions: [] },
  { code: '57', name: 'El M’Ghair', nameAr: 'المغير', institutions: [] },
  { code: '58', name: 'El Meniaa', nameAr: 'المنيعة', institutions: [] },
]

const byCode = new Map(algerianWilayas.map((wilaya) => [wilaya.code, wilaya]))

export const findWilaya = (code) => byCode.get(code) || null

// Display helpers: Arabic UI uses `nameAr`, every other language uses `name`.
// Ids stay stable, so the backend always receives the French official label.
export const isArabicLang = (lang) => lang === 'ar'

export const wilayaDisplayName = (wilaya, lang) => {
  if (!wilaya) return ''
  return isArabicLang(lang) ? (wilaya.nameAr || wilaya.name) : wilaya.name
}

export const institutionDisplayName = (institution, lang) => {
  if (!institution) return ''
  return isArabicLang(lang) ? (institution.nameAr || institution.name) : institution.name
}

// Listed institutions for the wilaya, always followed by the fallback.
export const getInstitutionsByWilaya = (code) => {
  const wilaya = findWilaya(code)
  return wilaya ? [...wilaya.institutions, OTHER_INSTITUTION] : []
}

export const findInstitution = (wilayaCode, institutionId) => (
  getInstitutionsByWilaya(wilayaCode).find((institution) => institution.id === institutionId) || null
)
