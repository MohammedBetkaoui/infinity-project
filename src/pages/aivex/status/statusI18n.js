// Translations for the AIVEX candidate status page (Magic Link, Phase 5A).
// Same shape/convention as ../register/registrationI18n.js: one flat object
// per language, a lookup by code, RTL handled through `dir`.
import { REGISTER_LANGS, REGISTER_LANG_STORAGE_KEY } from '../register/registrationI18n.js'

export { REGISTER_LANGS, REGISTER_LANG_STORAGE_KEY }

const en = {
  dir: 'ltr',
  pageTitle: 'My AIVEX file',
  languageLabel: 'Page language',
  backToEvent: 'Back to event page',

  loadingTitle: 'Opening your file…',
  loadingText: 'Please wait a moment.',

  invalidTitle: 'This link is not valid.',
  invalidText: 'This access link could not be recognised. Please use the exact link you received after registering, or contact the organisers with your reference.',

  expiredTitle: 'This link has expired.',
  expiredText: 'Access links are valid for a limited time. Please contact the organisers with your reference to get a new one.',

  revokedTitle: 'This link is no longer active.',
  revokedText: 'A newer access link has since been issued for this registration. Please use the most recent link you received, or contact the organisers.',

  notFoundTitle: 'Registration not found.',
  notFoundText: 'We could not find the registration associated with this link. Please contact the organisers with your reference.',

  serverErrorTitle: 'Something went wrong.',
  serverErrorText: 'We could not open your file right now. Please try again in a moment.',

  validKicker: 'AIVEX file',
  validTitle: 'Your registration',
  fieldReference: 'Reference',
  fieldTeam: 'Team',
  fieldInstitution: 'Institution',
  fieldWilaya: 'Wilaya',
  fieldStudents: 'Students',
  studentsValue: ({ count }) => `${count} students`,
  fieldRegistrationStatus: 'Application status',
  fieldDocumentStatus: 'Official document',

  registrationStatus: {
    submitted: 'Submitted',
    under_review: 'Under review',
    approved: 'Approved',
    rejected: 'Rejected',
    cancelled: 'Cancelled',
  },
  documentStatus: {
    not_generated: 'Not generated yet',
    generating: 'Being generated',
    awaiting_signature: 'Ready — awaiting your signature',
    signed_document_uploaded: 'Signed document received',
    under_review: 'Under review',
    changes_required: 'Changes required',
    validated: 'Validated',
    generation_failed: 'Generation issue — please retry the download',
    expired: 'Expired',
  },

  documentReadyNote: 'Your official Word document is ready. After downloading, please convert or print it, then have it signed and stamped by your institution as instructed by the organisers.',
  documentPendingNote: 'The official document is being prepared. Please check back in a moment.',
  downloadButton: '📄 Download the official form',
  downloading: 'Preparing the download…',
  downloadError: 'The download failed. Please try again in a moment; if it keeps failing, contact the organisers with your reference.',

  sizeUnit: 'MB',
  uploadSectionTitle: 'Submit the signed document',
  uploadInstructions: 'Once printed, signed and stamped by your institution, scan or photograph the document and submit it here.',
  uploadSupportedFormats: 'Accepted formats: PDF, JPG, JPEG, PNG',
  uploadMaxSize: 'Maximum size: 10 MB',
  uploadChooseFile: 'Choose a file',
  uploadReplaceFile: 'Choose a different file',
  uploadSubmit: 'Submit the signed document',
  uploadSubmitting: 'Sending…',
  uploadFileIssues: {
    type: 'Unsupported format. Please use a PDF, JPG or PNG file.',
    size: 'This file is larger than the 10 MB limit.',
    empty: 'This file is empty.',
    missing: 'Please choose a file.',
  },
  uploadErrors: {
    document_not_ready: 'The official document is not ready yet, so a signed copy cannot be submitted at this time.',
    invalid: 'This link is not valid. Please reopen the page from your original Magic Link.',
    expired: 'This link has expired. Please contact the organisers with your reference.',
    revoked: 'This link is no longer active. Please use the most recent link you received.',
    network: 'We could not reach the server. Please check your connection and try again.',
    error: 'The upload failed. Please try again in a moment; if it keeps failing, contact the organisers with your reference.',
  },
  uploadSuccessTitle: 'Your signed document has been received.',
  uploadReceivedTitle: 'Signed document received',
  uploadReceivedVersion: ({ version }) => `Version ${version}`,
  uploadReceivedNote: 'This confirms receipt only — the organisers have not yet reviewed it.',
}

const fr = {
  dir: 'ltr',
  pageTitle: 'Mon dossier AIVEX',
  languageLabel: 'Langue de la page',
  backToEvent: 'Retour à la page de l’événement',

  loadingTitle: 'Ouverture de votre dossier…',
  loadingText: 'Veuillez patienter un instant.',

  invalidTitle: 'Ce lien n’est pas valide.',
  invalidText: 'Ce lien d’accès n’a pas été reconnu. Merci d’utiliser exactement le lien reçu après votre inscription, ou de contacter les organisateurs avec votre référence.',

  expiredTitle: 'Ce lien a expiré.',
  expiredText: 'Les liens d’accès sont valables pour une durée limitée. Merci de contacter les organisateurs avec votre référence pour en obtenir un nouveau.',

  revokedTitle: 'Ce lien n’est plus actif.',
  revokedText: 'Un lien d’accès plus récent a depuis été émis pour cette inscription. Merci d’utiliser le dernier lien reçu, ou de contacter les organisateurs.',

  notFoundTitle: 'Inscription introuvable.',
  notFoundText: 'Nous n’avons pas retrouvé l’inscription associée à ce lien. Merci de contacter les organisateurs avec votre référence.',

  serverErrorTitle: 'Une erreur est survenue.',
  serverErrorText: 'Nous n’avons pas pu ouvrir votre dossier pour le moment. Merci de réessayer dans un instant.',

  validKicker: 'Dossier AIVEX',
  validTitle: 'Votre inscription',
  fieldReference: 'Référence',
  fieldTeam: 'Équipe',
  fieldInstitution: 'Établissement',
  fieldWilaya: 'Wilaya',
  fieldStudents: 'Étudiants',
  studentsValue: ({ count }) => `${count} étudiants`,
  fieldRegistrationStatus: 'Statut de l’inscription',
  fieldDocumentStatus: 'Document officiel',

  registrationStatus: {
    submitted: 'Soumise',
    under_review: 'En cours d’examen',
    approved: 'Approuvée',
    rejected: 'Refusée',
    cancelled: 'Annulée',
  },
  documentStatus: {
    not_generated: 'Pas encore généré',
    generating: 'Génération en cours',
    awaiting_signature: 'Prêt — en attente de signature',
    signed_document_uploaded: 'Document signé reçu',
    under_review: 'En cours d’examen',
    changes_required: 'Corrections nécessaires',
    validated: 'Validé',
    generation_failed: 'Problème de génération — réessayez le téléchargement',
    expired: 'Expiré',
  },

  documentReadyNote: 'Votre fiche officielle a été générée au format Word. Après téléchargement, veuillez convertir ou imprimer le document, puis le faire signer et cacheter par votre établissement conformément aux instructions de l’organisation.',
  documentPendingNote: 'Le document officiel est en cours de préparation. Merci de revenir dans un instant.',
  downloadButton: '📄 Télécharger la fiche officielle',
  downloading: 'Préparation du téléchargement…',
  downloadError: 'Le téléchargement a échoué. Réessayez dans un instant ; si le problème persiste, contactez les organisateurs avec votre référence.',

  sizeUnit: 'Mo',
  uploadSectionTitle: 'Déposer le document signé',
  uploadInstructions: 'Une fois imprimé, signé et cacheté par votre établissement, scannez ou photographiez le document et déposez-le ici.',
  uploadSupportedFormats: 'Formats acceptés : PDF, JPG, JPEG, PNG',
  uploadMaxSize: 'Taille maximale : 10 Mo',
  uploadChooseFile: 'Choisir un fichier',
  uploadReplaceFile: 'Choisir un autre fichier',
  uploadSubmit: 'Envoyer le document signé',
  uploadSubmitting: 'Envoi en cours…',
  uploadFileIssues: {
    type: 'Format non pris en charge. Utilisez un fichier PDF, JPG ou PNG.',
    size: 'Ce fichier dépasse la limite de 10 Mo.',
    empty: 'Ce fichier est vide.',
    missing: 'Veuillez choisir un fichier.',
  },
  uploadErrors: {
    document_not_ready: 'Le document officiel n’est pas encore prêt : impossible de déposer une version signée pour le moment.',
    invalid: 'Ce lien n’est pas valide. Merci de rouvrir la page depuis votre lien d’accès d’origine.',
    expired: 'Ce lien a expiré. Merci de contacter les organisateurs avec votre référence.',
    revoked: 'Ce lien n’est plus actif. Merci d’utiliser le dernier lien reçu.',
    network: 'Nous n’avons pas pu joindre le serveur. Vérifiez votre connexion et réessayez.',
    error: 'L’envoi a échoué. Réessayez dans un instant ; si le problème persiste, contactez les organisateurs avec votre référence.',
  },
  uploadSuccessTitle: 'Votre document signé a bien été reçu.',
  uploadReceivedTitle: 'Document signé reçu',
  uploadReceivedVersion: ({ version }) => `Version ${version}`,
  uploadReceivedNote: 'Ceci confirme uniquement la réception : les organisateurs ne l’ont pas encore examiné.',
}

const ar = {
  dir: 'rtl',
  pageTitle: 'ملفي في AIVEX',
  languageLabel: 'لغة الصفحة',
  backToEvent: 'العودة إلى صفحة الفعالية',

  loadingTitle: 'جارٍ فتح ملفكم…',
  loadingText: 'يرجى الانتظار للحظات.',

  invalidTitle: 'هذا الرابط غير صالح.',
  invalidText: 'تعذّر التعرف على رابط الوصول هذا. يرجى استخدام الرابط الذي تلقيتموه بالضبط بعد التسجيل، أو الاتصال بالمنظمين مع ذكر المرجع.',

  expiredTitle: 'انتهت صلاحية هذا الرابط.',
  expiredText: 'روابط الوصول صالحة لمدة محدودة. يرجى الاتصال بالمنظمين مع ذكر المرجع للحصول على رابط جديد.',

  revokedTitle: 'هذا الرابط لم يعد نشطاً.',
  revokedText: 'تم إصدار رابط وصول أحدث لهذا التسجيل. يرجى استخدام آخر رابط تلقيتموه، أو الاتصال بالمنظمين.',

  notFoundTitle: 'التسجيل غير موجود.',
  notFoundText: 'تعذّر العثور على التسجيل المرتبط بهذا الرابط. يرجى الاتصال بالمنظمين مع ذكر المرجع.',

  serverErrorTitle: 'حدث خطأ ما.',
  serverErrorText: 'تعذّر فتح ملفكم حالياً. يرجى إعادة المحاولة بعد لحظات.',

  validKicker: 'ملف AIVEX',
  validTitle: 'تسجيلكم',
  fieldReference: 'المرجع',
  fieldTeam: 'الفريق',
  fieldInstitution: 'المؤسسة',
  fieldWilaya: 'الولاية',
  fieldStudents: 'الطلبة',
  studentsValue: ({ count }) => `${count} طلبة`,
  fieldRegistrationStatus: 'حالة التسجيل',
  fieldDocumentStatus: 'الوثيقة الرسمية',

  registrationStatus: {
    submitted: 'مُرسَل',
    under_review: 'قيد المراجعة',
    approved: 'مقبول',
    rejected: 'مرفوض',
    cancelled: 'ملغى',
  },
  documentStatus: {
    not_generated: 'لم يُنشأ بعد',
    generating: 'جارٍ الإنشاء',
    awaiting_signature: 'جاهز — بانتظار التوقيع',
    signed_document_uploaded: 'تم استلام الوثيقة الموقّعة',
    under_review: 'قيد المراجعة',
    changes_required: 'تصحيحات مطلوبة',
    validated: 'مصادَق عليه',
    generation_failed: 'مشكل في الإنشاء — أعيدوا محاولة التحميل',
    expired: 'منتهي الصلاحية',
  },

  documentReadyNote: 'تم إنشاء استمارتكم الرسمية بصيغة Word. بعد التحميل، يرجى تحويل الوثيقة أو طباعتها، ثم توقيعها وختمها من طرف مؤسستكم وفقاً لتعليمات المنظمين.',
  documentPendingNote: 'الوثيقة الرسمية قيد التحضير. يرجى العودة بعد لحظات.',
  downloadButton: '📄 تحميل الاستمارة الرسمية',
  downloading: 'جارٍ تحضير التحميل…',
  downloadError: 'تعذّر التحميل. حاولوا مجدداً بعد لحظات؛ وإذا استمر المشكل، اتصلوا بالمنظمين مع ذكر المرجع.',

  sizeUnit: 'ميغابايت',
  uploadSectionTitle: 'إيداع الوثيقة الموقّعة',
  uploadInstructions: 'بعد طباعتها وتوقيعها وختمها من طرف مؤسستكم، امسحوها ضوئياً أو صوّروها ثم أودعوها هنا.',
  uploadSupportedFormats: 'الصيغ المقبولة: PDF، JPG، JPEG، PNG',
  uploadMaxSize: 'الحجم الأقصى: 10 ميغابايت',
  uploadChooseFile: 'اختيار ملف',
  uploadReplaceFile: 'اختيار ملف آخر',
  uploadSubmit: 'إرسال الوثيقة الموقّعة',
  uploadSubmitting: 'جارٍ الإرسال…',
  uploadFileIssues: {
    type: 'صيغة غير مدعومة. استخدموا ملف PDF أو JPG أو PNG.',
    size: 'حجم هذا الملف يتجاوز الحد الأقصى البالغ 10 ميغابايت.',
    empty: 'هذا الملف فارغ.',
    missing: 'يرجى اختيار ملف.',
  },
  uploadErrors: {
    document_not_ready: 'الوثيقة الرسمية غير جاهزة بعد: لا يمكن إيداع نسخة موقّعة حالياً.',
    invalid: 'هذا الرابط غير صالح. يرجى إعادة فتح الصفحة من رابط الوصول الأصلي.',
    expired: 'انتهت صلاحية هذا الرابط. يرجى الاتصال بالمنظمين مع ذكر المرجع.',
    revoked: 'هذا الرابط لم يعد نشطاً. يرجى استخدام آخر رابط تلقيتموه.',
    network: 'تعذّر الوصول إلى الخادم. تحققوا من اتصالكم وحاولوا مجدداً.',
    error: 'تعذّر الإرسال. حاولوا مجدداً بعد لحظات؛ وإذا استمر المشكل، اتصلوا بالمنظمين مع ذكر المرجع.',
  },
  uploadSuccessTitle: 'تم استلام وثيقتكم الموقّعة بنجاح.',
  uploadReceivedTitle: 'الوثيقة الموقّعة مستلَمة',
  uploadReceivedVersion: ({ version }) => `النسخة ${version}`,
  uploadReceivedNote: 'هذا يؤكد الاستلام فقط: لم يقم المنظمون بمراجعتها بعد.',
}

export const statusStrings = { en, fr, ar }

export function getStatusStrings(lang) {
  return statusStrings[lang] || en
}
