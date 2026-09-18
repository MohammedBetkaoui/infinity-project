# AIVEX — Data Contract V4

> **Statut : Phase 1 (fondation) — 2026-09-18.**
> Le contrat V4 est défini, codé et testé, **frontend compris, derrière un feature flag de build**
> (`VITE_AIVEX_FORM_VERSION`, défaut `3`). La production reste en **V3 (legacy)** :
> sans le flag, le formulaire `/aivex/register` est identique à l'actuel.
> Côté API, une requête V4 est **entièrement validée puis refusée en 503, sans aucune écriture** : l'écriture V4 est la Phase 2.
> La migration SQL V4 est **préparée mais non exécutée**.

| Élément | Fichier |
|---|---|
| Contrat canonique (constantes, enums, normalisation, validateur, builders frontend, chemin Storage, réponses) | [`shared/aivex/contract-v4.js`](../shared/aivex/contract-v4.js) |
| Validation serveur des cartes (signature binaire, MIME, extension, taille) | [`api/_lib/aivex-validation-v4.js`](../api/_lib/aivex-validation-v4.js) |
| Dispatch par version (V3 écrit, V4 valide puis 503) | [`api/aivex/register.js`](../api/aivex/register.js) |
| Feature flag du formulaire | [`src/pages/aivex/register/formVersion.js`](../src/pages/aivex/register/formVersion.js) |
| Modèles frontend V3 + V4 | [`src/pages/aivex/register/registrationModel.js`](../src/pages/aivex/register/registrationModel.js) |
| Envoi V4 (sans référence client) | [`src/lib/applicationSubmission.js`](../src/lib/applicationSubmission.js) — `submitAivexRegistrationV4` |
| Mapping Word (données officielles uniquement) | [`shared/aivex/word-mapping-v4.js`](../shared/aivex/word-mapping-v4.js) |
| Migration SQL préparatoire | [`supabase/migrations/20260918120000_aivex_v4_contract.sql`](../supabase/migrations/20260918120000_aivex_v4_contract.sql) |
| Tests du contrat | [`tests/aivex-contract-v4.test.mjs`](../tests/aivex-contract-v4.test.mjs) — `npm run test:contract` |

---

## 1. Objectif

Verrouiller le modèle de données du nouveau processus administratif AIVEX entre :

```
Frontend React ⇄ POST /api/aivex/register ⇄ Supabase PostgreSQL
                                          ⇄ Supabase Storage (privé)
                                          → futur document Word/PDF officiel
```

Le contrat fixe : la structure du payload, les règles métier et de validation, la normalisation, le transport des fichiers, les statuts, l'idempotence et le mapping vers le futur document officiel. La génération Word/PDF, le Magic Link, l'upload du document signé, le workflow admin et les e-mails **ne font pas partie de cette phase**.

Une inscription V4 contient :

| Bloc | Contenu |
|---|---|
| A. Établissement | Wilaya, université / établissement, nom de l'équipe |
| B. Responsable des activités | Fonction, nom et prénom, téléphone, e-mail |
| C. Président de la délégation | Nom et prénom, téléphone, RFID |
| D. Chauffeur | Nom et prénom, téléphone, RFID |
| E. Étudiants | **Exactement 3** : nom et prénom, téléphone, année du BAC, RFID, photo de la carte étudiant |

Deux classes de données :

| Classe | Usage | Exemples |
|---|---|---|
| **OFFICIAL DATA** | PostgreSQL, Word, PDF, affichage admin, référence | `team`, `wilaya`, `institution`, `activityOfficial`, `delegationHead`, `driver`, `student.fullName/phone/bacYear/rfid` |
| **INTERNAL VERIFICATION DATA** | Validation admin, contrôle d'identité, audit | `student.studentCard` (photo de la carte) |

## 2. Version

| Constante | Valeur | Rôle |
|---|---|---|
| `AIVEX_FORM` | `'aivex'` | Identifiant du formulaire |
| `AIVEX_FORM_VERSION` | `4` | Version canonique |
| `AIVEX_LEGACY_FORM_VERSION` | `3` | Version en production (legacy) |
| `AIVEX_EDITION` | `2` | Édition par défaut **côté serveur** |
| `AIVEX_STUDENT_COUNT` | `3` | Nombre exact d'étudiants |

- `validateRegistrationV4()` n'accepte que `version === 4` (nombre, pas `"4"`).
- `validateRegistrationV3()` (ex-`validateRegistration`, renommé sans changement de logique) n'accepte que `version === 3`.
- **Aucune conversion silencieuse** : un payload V3 envoyé au validateur V4 est refusé (`field: "version"`), et inversement. Le handler aiguille sur `version` : `4` → chemin V4 (validation puis 503 en Phase 1), tout le reste → chemin V3 inchangé. Testé (tests 1a, 1b et « API: v4 is fully validated… »).

## 3. Architecture

```
┌──────────────── Navigateur ────────────────┐
│ createRegistrationStateV4()                │  submissionId = crypto.randomUUID()
│ buildRegistrationPayloadV4(state)  ──┐     │  (conservé pendant toutes les tentatives)
│ buildStudentCardPartsV4(state)     ──┤     │
└──────────────────────────────────────┼─────┘
                multipart/form-data    │  payload = JSON V4
                                       │  studentCard_1 / _2 / _3 = fichiers
┌──────────────── API (Vercel) ────────▼─────┐
│ origine + rate limit                       │
│ parseMultipart (busboy, limites mémoire)   │
│ honeypot                                   │
│ validateRegistrationV4()   (pur)           │
│ validateStudentCardsV4()   (octets réels)  │
│ Phase 1 : s'arrête ici → 503, rien écrit   │
│ ── Phase 2 ──────────────────────────────  │
│ idempotence (submission_id)                │
│ INSERT aivex_registrations (reference,     │
│        edition, statuts = serveur)         │
│ UPLOAD Storage privé (chemins déterministes)│
│ INSERT aivex_students (3 lignes, 1 requête)│
│ cleanup compensatoire en cas d'échec       │
└──────────────┬──────────────────┬──────────┘
               │                  │
   PostgreSQL (RLS, service role) Storage privé aivex-student-cards
               │
   (Phase 3) resolveWordDataV4() → template Word → PDF
```

Le module `shared/aivex/contract-v4.js` est **pur** (aucune I/O) : il s'exécute tel quel dans Vite, dans une Vercel Function et sous `node --test`. Il importe le dataset `src/data/algeriaHigherEducation.js`, déjà partagé par le frontend et l'API V3.

## 4. Payload complet

Envoyé dans la partie multipart `payload` (JSON) :

```json
{
  "form": "aivex",
  "version": 4,
  "submissionId": "3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b",
  "submittedAt": "2026-09-18T10:00:00.000Z",
  "source": "https://infinity-project-zeta.vercel.app/aivex/register",
  "answers": {
    "team": {
      "name": "Infinity AI",
      "wilaya": { "code": "34", "name": "Bordj Bou Arréridj" },
      "institution": { "id": "univ-bba", "name": "Université Mohamed El Bachir El Ibrahimi de Bordj Bou Arréridj", "custom": false }
    },
    "activityOfficial": { "role": "activities_officer", "fullName": "…", "email": "…", "phone": "…" },
    "delegationHead": { "fullName": "…", "phone": "…", "rfid": "…" },
    "driver": { "fullName": "…", "phone": "…", "rfid": "…" },
    "students": [
      { "position": 1, "fullName": "…", "phone": "…", "bacYear": 2023, "rfid": "…", "studentCard": "studentCard_1" },
      { "position": 2, "fullName": "…", "phone": "…", "bacYear": 2022, "rfid": "…", "studentCard": "studentCard_2" },
      { "position": 3, "fullName": "…", "phone": "…", "bacYear": 2024, "rfid": "…", "studentCard": "studentCard_3" }
    ],
    "consent": true
  }
}
```

- `studentCard` **n'est pas l'image** : c'est le nom de la partie multipart qui la transporte.
- `submittedAt` est informatif ; le serveur horodate lui-même `submitted_at`.
- `source` est optionnel (tronqué à 500 caractères).
- **Objets fermés** : toute clé hors contrat est refusée avec son chemin (`answers.delegationHead.nationalId`, `answers.students[0].studyLevel`…). Rien n'est ignoré silencieusement.
- **Champs serveur interdits** : `id`, `reference`, `edition`, `formVersion`, `status`, `registrationStatus`, `documentStatus`, `currentFormRevision`, `templateVersion`, `createdAt`, `updatedAt` → 400 « assigned by the server ».
- Seule tolérance : la clé honeypot `website` (enveloppe ou `answers`) ; remplie, le handler répond un faux succès avant validation.

## 5. Contrat frontend

### 5.1 Feature flag

| `VITE_AIVEX_FORM_VERSION` (au build) | Formulaire servi | Envoi |
|---|---|---|
| absent ou `3` (**production**) | V3 inchangé : identité nationale, matricule, niveau d'études | `submitApplication` → payload v3 |
| `4` | V4 : RFID, année du BAC, `submissionId` | `submitAivexRegistrationV4` → payload v4 |

Le flag est lu **statiquement** dans [`formVersion.js`](../src/pages/aivex/register/formVersion.js) (Vite n'embarque que cette variable). Il ne doit passer à `4` en production qu'après le déploiement de l'écriture V4 (Phase 2) : d'ici là, l'API répond 503 à toute inscription V4.

### 5.2 Modèle V4

État (`createRegistrationStateV4()` dans le contrat ; même forme dans le hook, qui y ajoute l'état d'UI) :

```js
{
  submissionId,                       // UUID v4, créé une fois par tentative
  team: { name, wilaya, institution, customInstitution },
  activityOfficial: { role, fullName, email, phone },
  delegationHead: { fullName, phone, rfid },
  driver: { fullName, phone, rfid },
  students: [                         // toujours 3 objets fixes
    { id: 'student-1', position: 1, fullName: '', phone: '', bacYear: '', rfid: '', studentCard: null },
    { id: 'student-2', position: 2, … },
    { id: 'student-3', position: 3, … },
  ],
  consent,
}
```

- `team.wilaya` = code (`'34'`), `team.institution` = id du dataset ; `customInstitution` porte le nom saisi quand `institution === 'other'` (converti en `{ id: 'other', name, custom: true }` dans le payload).
- **Pas d'ajout / suppression d'étudiant** : « Student 01 / 02 / 03 » sont affichés directement ; tous les champs sont obligatoires (nom complet, téléphone, année du BAC, RFID, carte étudiant).
- **Année du BAC** : `<select>` dynamique de l'année courante à 1990 (`bacYearChoices()`), valeur chaîne dans l'état, **entier** dans le payload.
- **RFID** : champ texte libre (aucun format imposé), conservé tel quel à l'exception du trim ; les 3 RFID étudiants doivent différer (contrôle client identique au serveur).
- Chef de délégation et chauffeur : `rfid` remplace `nationalId`.
- `buildSubmissionV4(state)` → `{ payload, files }` ; `payload` = `buildRegistrationPayloadV4` du contrat (sans `reference`).
- Parties fichier : `studentCard_1..3`, nom **dérivé** après compression (`studentCard_2.jpg`…) — le nom d'origine (souvent `IMG_…` ou le nom de l'étudiant) ne quitte jamais l'appareil. La compression existante (`prepareCardUploads.js`) reste active (limite Vercel 4,5 Mo, §19).
- Résultat : la référence affichée vient **uniquement** du serveur (pas de repli `makeReference` en V4) ; un rejeu 200 `alreadyProcessed` compte comme un succès.

### 5.3 Brouillon (`sessionStorage`)

| | V3 | V4 |
|---|---|---|
| Clé | `aivex-registration-draft-v3` | `aivex-registration-draft-v4` |
| Contenu | étape, équipe, contact, délégation, textes étudiants | idem + `submissionId` |
| Fichiers | jamais persistés | jamais persistés |

- Toutes les autres clés (`v1`, `v2`, et `v3` quand V4 est actif) sont supprimées au chargement : un brouillon V3 n'est **jamais** relu dans le formulaire V4.
- Après rechargement, chaque carte précédemment jointe est signalée comme perdue (`droppedCard` : « … n'a pas été conservé, joignez-le à nouveau ») et le formulaire revient à l'étape Étudiants.
- Le `submissionId` du brouillon est conservé : un rechargement après une réponse perdue renvoie la **même** tentative (§14).

## 6. Contrat backend

### 6.1 Transport

`multipart/form-data` :

| Partie | Contenu | Obligatoire |
|---|---|---|
| `payload` | `JSON.stringify(payload V4)` (≤ 64 Kio) | oui |
| `studentCard_1` | fichier de l'étudiant position 1 | oui |
| `studentCard_2` | fichier de l'étudiant position 2 | oui |
| `studentCard_3` | fichier de l'étudiant position 3 | oui |

Toute autre partie → 400. `parseMultipart` expose désormais aussi `filename` (nom déclaré, non fiable, uniquement comparé au type détecté).

### 6.2 État actuel du handler (Phase 1)

`api/aivex/register.js` aiguille sur `body.version`, sans jamais convertir :

| Version | Traitement |
|---|---|
| `4` | `validateRegistrationV4` + `validateStudentCardsV4` ; erreur → 400/413/415 avec `field` ; payload et cartes valides → **503** `« AIVEX form v4 registrations are not open yet. Nothing was saved. »`. Aucun client Supabase n'est créé, rien n'est écrit ni uploadé. |
| autre | chemin V3 de production **inchangé** (`validateRegistrationV3` → écriture). |

### 6.3 Pipeline d'écriture V4 (Phase 2)

1. Origine + rate limit.
2. `parseMultipart` (5 Mo max par fichier, 3 fichiers max).
3. `JSON.parse(payload)` ; honeypot.
4. `validateRegistrationV4(body)` — pur, **aucune écriture**.
5. `validateStudentCardsV4(students, files)` — lit les octets.
6. Idempotence : recherche par `submission_id` (§14).
7. `INSERT aivex_registrations` (`form_version = 4`, `edition`, `reference`, statuts : **serveur**).
8. Upload des 3 cartes vers `{registrationId}/student-{n}.{ext}` (`upsert: false`).
9. `INSERT aivex_students` des **3 lignes en une seule requête** (le trigger différé exige 0 ou 3 lignes au COMMIT).
10. Réponse 201.

En cas d'échec après l'étape 7 : **cleanup compensatoire** obligatoire (suppression des objets Storage déjà envoyés, puis de l'inscription — les étudiants suivent par `ON DELETE CASCADE`), comme le fait déjà `cleanupFailedRegistration()` en V3. Storage et PostgreSQL ne partagent pas de transaction : la Phase 2 devra aussi prévoir un balayage des inscriptions V4 restées à 0 étudiant au-delà de quelques minutes (crash entre deux étapes). Alternative à étudier : upload d'abord, puis une RPC SQL qui insère inscription + étudiants dans une seule transaction.

### 6.4 Autorité serveur

| Le frontend fournit | Le serveur décide |
|---|---|
| `team`, `wilaya`, `institution`, `activityOfficial`, `delegationHead`, `driver`, `students`, `consent`, `submissionId` | `id`, `reference`, `edition`, `form_version`, `registration_status`, `document_status`, `submitted_at`, `created_at`, `updated_at`, `template_version`, libellés wilaya/établissement (re-dérivés du dataset) |

### 6.5 Réponses (`registrationResponsesV4`)

| Cas | HTTP | Corps |
|---|---|---|
| Nouvelle inscription | 201 | `{ "success": true, "reference": "AX2-26-A83F19C2" }` |
| Rejeu idempotent | 200 | `{ "success": true, "reference": "AX2-26-A83F19C2", "alreadyProcessed": true }` |
| Validation | 400 | `{ "success": false, "message": "…", "field": "answers.students[1].rfid" }` |
| Fichier trop gros | 413 | `{ "success": false, "message": "…", "field": "studentCard_2" }` |
| Type de fichier refusé | 415 | idem |
| Conflit métier | 409 | `{ "success": false, "message": "…" }` |
| Rate limit | 429 | + en-tête `Retry-After` |
| Erreur serveur | 500 | message générique |

Jamais d'erreur SQL, de détail Supabase, de stack trace, de secret ni de clé service role dans une réponse.

## 7. Contrat base de données

### 7.1 `public.aivex_registrations` (table existante, étendue)

| Colonne | Type | Contrainte | Origine |
|---|---|---|---|
| `id` | uuid | PK | existante |
| `submission_id` | uuid | **UNIQUE** ; requis si `form_version >= 4` | **V4** |
| `reference` | text | UNIQUE (index ajouté seulement s'il n'existe pas déjà) | existante |
| `edition` | smallint | NOT NULL | existante |
| `form_version` | smallint | `between 1 and 4` | existante (check élargi) |
| `team_name` | text | | existante |
| `wilaya_code` | text | `^(0[1-9]\|[1-4][0-9]\|5[0-8])$` | existante (v3) |
| `wilaya_name` | text | snapshot | existante (v3) |
| `institution_id`, `institution_name`, `institution_custom` | text, text, boolean | `custom ⇔ id = 'other'` | existantes (v3) |
| `activity_official_role/_name/_email/_phone` | text | rôle ∈ enum, e-mail en minuscules | existantes (v3) |
| `delegation_head_name`, `delegation_head_phone` | text | | existantes (v3) |
| `delegation_head_rfid` | text | 1–64, trim, sans caractère de contrôle | **V4** |
| `driver_name`, `driver_phone` | text | | existantes (v3) |
| `driver_rfid` | text | idem | **V4** |
| `student_count` | smallint | `= 3` dès v3 | existante (v3) |
| `consent` | boolean | `true` requis en V4 | existante |
| `registration_status` | text | NOT NULL DEFAULT `'submitted'`, enum §13 | **V4** |
| `document_status` | text | NOT NULL DEFAULT `'not_generated'`, enum §13 | **V4** |
| `current_form_revision` | smallint | NOT NULL DEFAULT 0, `>= 0` | **V4** |
| `template_version` | text | 1–64 | **V4** |
| `source` | text | | existante |
| `submitted_at` | timestamptz | requis en V4 | existante |
| `created_at` | timestamptz | | existante |
| `updated_at` | timestamptz | NOT NULL, maintenu par trigger | **V4** |

`aivex_registrations_v4_required_check` : pour `form_version >= 4`, toutes les données officielles sont présentes, `submission_id`, `delegation_head_rfid`, `driver_rfid` non nuls, `consent = true`, `student_count = 3`, et **`*_national_id` NULL** (V4 ne collecte jamais de numéro d'identité nationale).

Écarts assumés avec la cible du brief :
- `wilaya_code` reste `text` + CHECK (équivalent à `varchar(2)`, sans réécriture de table).
- Le DEFAULT de `form_version` n'est pas modifié : le serveur fixe toujours la version explicitement.
- `updated_at` des lignes existantes est initialisé à `created_at`.

### 7.2 `public.aivex_students` (nouvelle table)

| Colonne | Type | Contrainte |
|---|---|---|
| `id` | uuid | PK `gen_random_uuid()` |
| `registration_id` | uuid | FK → `aivex_registrations(id)` **ON DELETE CASCADE** |
| `edition` | smallint | NOT NULL, **copiée du parent par trigger** |
| `position` | smallint | `between 1 and 3` |
| `full_name` | text | 3–120 |
| `phone` | text | `^\+?[0-9]{9,15}$` |
| `bac_year` | smallint | 1990–2100 (statique) + `<= année courante + 1` (trigger) |
| `rfid_number` | text | 1–64, trim, sans caractère de contrôle |
| `student_card_path` | text | NOT NULL, `= registration_id || '/student-' || position || '.' || ext` |
| `student_card_mime` | text | `image/jpeg \| image/png \| image/webp` |
| `student_card_size_bytes` | bigint | 1 … 5 242 880 |
| `created_at`, `updated_at` | timestamptz | NOT NULL, `updated_at` par trigger |

Contraintes clés : `UNIQUE (registration_id, position)`, `UNIQUE (registration_id, rfid_number)`.
**Pas** de `UNIQUE (edition, rfid_number)` : règle métier non confirmée (§19).

Triggers :
- `aivex_students_before_write` : édition copiée du parent, refus si le parent n'est pas `form_version >= 4` (les étudiants V1–V3 restent dans `aivex_members`), refus d'une année de BAC future.
- `aivex_students_team_size` (constraint trigger **différé**) : au COMMIT, une inscription a 0 ou 3 étudiants — jamais 1, 2 ou 4.

Le nom `aivex_members` n'est pas utilisé pour le modèle V4.

### 7.3 `public.aivex_settings` (nouvelle table)

Une ligne par édition : `edition` (PK), `edition_name`, `event_start_date`, `event_end_date`, `submission_deadline`, `submission_email`, `template_version`, `registration_open_at`, `registration_close_at`, `signed_document_deadline`, `registration_enabled` (défaut `false`), `document_upload_enabled` (défaut `false`), `created_at`, `updated_at`. Cohérence des dates vérifiée par CHECK.
**Aucune ligne n'est insérée** : les valeurs officielles (nom imprimé, dates, e-mail) doivent venir des organisateurs.

## 8. Contrat Storage

| Propriété | Valeur |
|---|---|
| Bucket | `aivex-student-cards` |
| Visibilité | **PRIVÉ** (la migration le crée s'il manque et force `public = false` s'il existe) |
| Chemin | `{registrationId}/student-{position}.{jpg\|png\|webp}` — `studentCardStoragePath()` |
| Contenu du chemin | uniquement un UUID et une position : aucune donnée personnelle |
| Écriture | service role, côté serveur, `upsert: false` |
| Lecture (phase admin) | backend sécurisé → URL signée **temporaire** |
| Policies Storage | **aucune** : anon/authenticated n'ont aucun accès |
| `getPublicUrl()` | **interdit** (test automatique sur `api/` et `shared/`) |

```
Admin → Backend sécurisé → Supabase Storage (privé) → URL signée temporaire → carte
```

Le binaire n'est jamais stocké dans PostgreSQL : seulement `student_card_path`, `student_card_mime`, `student_card_size_bytes`.

## 9. Politique « carte étudiant »

La photo de la carte étudiant est **toujours obligatoire** (une par étudiant, trois par inscription) et appartient au sous-système **INTERNAL VERIFICATION DOCUMENT** :

| | |
|---|---|
| Obligatoire | oui (`studentCard_1`, `_2`, `_3`) |
| Usage | validation administrative, contrôle d'identité, contrôle manuel |
| Dans le Word / PDF | **jamais** (aucune variable, `STUDENT_CARD_POLICY.printable = false`) |
| Public | **jamais** (bucket privé, pas d'URL publique, pas dans le HTML, pas d'analytics, pas de logs) |
| Types | JPEG, PNG, WEBP — **images uniquement**, comme en V3 (le PDF n'est pas ajouté sans besoin métier confirmé, §19) |
| Taille | 5 Mo max par fichier (limite métier existante conservée) |

Contrôles serveur (`validateStudentCardsV4`), aucun ne suffit seul :

1. présence des 3 parties, aucune partie inattendue ;
2. fichier non vide, ≤ 5 Mo (413 sinon) ;
3. **signature binaire réelle** (`file-type`) ∈ JPEG/PNG/WEBP (415 sinon — un PDF, un script renommé `.jpg` sont refusés) ;
4. MIME déclaré = MIME détecté (alias `image/jpg`, `image/pjpeg` acceptés) ;
5. extension du nom de fichier cohérente avec le type détecté.

Correspondance fichier ↔ étudiant : `students[i].studentCard === "studentCard_{i+1}"` (validateur), puis chemin déterministe `student-{position}` (Storage) et CHECK `student_card_path` (base) — une carte ne peut pas être attribuée au mauvais étudiant.

Rien dans cette phase ne retire l'input carte, l'aperçu, la validation, l'upload multipart, le bucket ou les colonnes `student_card_*`.

## 10. Mapping Word

Le template Word officiel **n'est pas dans le dépôt** et n'a pas été modifié. Le mapping reprend les **29 variables** du brief ; il est à confronter au vrai template en Phase 3. `resolveWordDataV4({ settings, registration, students })` résout les variables à partir des lignes de base (valeurs brutes en texte ; le formatage des dates et téléphones sera décidé avec le template). Aucune librairie docx/PDF n'est ajoutée.

### 10.1 FRONTEND → API → DATABASE → WORD

| Frontend (état) | API (payload) | Base | Word |
|---|---|---|---|
| — | — | `aivex_settings.edition_name` | `{{edition_name}}` |
| — | — | `aivex_settings.event_start_date` | `{{event_start_date}}` |
| — | — | `aivex_settings.event_end_date` | `{{event_end_date}}` |
| — (affichée après succès) | — (générée par le serveur) | `aivex_registrations.reference` | `{{registration_reference}}` |
| `team.institution` \| `team.customInstitution` | `answers.team.institution.name` | `aivex_registrations.institution_name` | `{{institution_name}}` |
| `team.wilaya` | `answers.team.wilaya.name` | `aivex_registrations.wilaya_name` | `{{wilaya_name}}` |
| `team.name` | `answers.team.name` | `aivex_registrations.team_name` | `{{team_name}}` |
| `activityOfficial.phone` | `answers.activityOfficial.phone` | `aivex_registrations.activity_official_phone` | `{{activity_official_phone}}` |
| `activityOfficial.email` | `answers.activityOfficial.email` | `aivex_registrations.activity_official_email` | `{{activity_official_email}}` |
| `students[0].fullName` | `answers.students[0].fullName` | `aivex_students[position=1].full_name` | `{{student_1_name}}` |
| `students[0].phone` | `answers.students[0].phone` | `aivex_students[position=1].phone` | `{{student_1_phone}}` |
| `students[0].bacYear` | `answers.students[0].bacYear` | `aivex_students[position=1].bac_year` | `{{student_1_bac_year}}` |
| `students[0].rfid` | `answers.students[0].rfid` | `aivex_students[position=1].rfid_number` | `{{student_1_rfid}}` |
| `students[0].studentCard` | multipart `studentCard_1` | Storage privé + `aivex_students[position=1].student_card_*` | **AUCUN** |
| `students[1].fullName` | `answers.students[1].fullName` | `aivex_students[position=2].full_name` | `{{student_2_name}}` |
| `students[1].phone` | `answers.students[1].phone` | `aivex_students[position=2].phone` | `{{student_2_phone}}` |
| `students[1].bacYear` | `answers.students[1].bacYear` | `aivex_students[position=2].bac_year` | `{{student_2_bac_year}}` |
| `students[1].rfid` | `answers.students[1].rfid` | `aivex_students[position=2].rfid_number` | `{{student_2_rfid}}` |
| `students[1].studentCard` | multipart `studentCard_2` | Storage privé + `aivex_students[position=2].student_card_*` | **AUCUN** |
| `students[2].fullName` | `answers.students[2].fullName` | `aivex_students[position=3].full_name` | `{{student_3_name}}` |
| `students[2].phone` | `answers.students[2].phone` | `aivex_students[position=3].phone` | `{{student_3_phone}}` |
| `students[2].bacYear` | `answers.students[2].bacYear` | `aivex_students[position=3].bac_year` | `{{student_3_bac_year}}` |
| `students[2].rfid` | `answers.students[2].rfid` | `aivex_students[position=3].rfid_number` | `{{student_3_rfid}}` |
| `students[2].studentCard` | multipart `studentCard_3` | Storage privé + `aivex_students[position=3].student_card_*` | **AUCUN** |
| `delegationHead.fullName` | `answers.delegationHead.fullName` | `aivex_registrations.delegation_head_name` | `{{delegation_head_name}}` |
| `delegationHead.phone` | `answers.delegationHead.phone` | `aivex_registrations.delegation_head_phone` | `{{delegation_head_phone}}` |
| `delegationHead.rfid` | `answers.delegationHead.rfid` | `aivex_registrations.delegation_head_rfid` | `{{delegation_head_rfid}}` |
| `driver.fullName` | `answers.driver.fullName` | `aivex_registrations.driver_name` | `{{driver_name}}` |
| `driver.phone` | `answers.driver.phone` | `aivex_registrations.driver_phone` | `{{driver_phone}}` |
| `driver.rfid` | `answers.driver.rfid` | `aivex_registrations.driver_rfid` | `{{driver_rfid}}` |
| — | — | `aivex_settings.submission_deadline` | `{{submission_deadline}}` |
| — | — | `aivex_settings.submission_email` | `{{submission_email}}` |

Champs **exclus** du Word (`WORD_EXCLUDED_FIELDS_V4`) : `studentCard`, `student_card_path`, `student_card_mime`, `student_card_size_bytes`. Aucune variable `student_n_card` n'existe ni ne doit exister (test 21).

## 11. Règles de validation

`validateRegistrationV4(body, { now })` — pure, sans écriture, retourne `{ ok: true, value }` ou `{ ok: false, status: 400, message, field }` (premier problème, dans l'ordre du formulaire).

| Champ | Règle |
|---|---|
| `form` | `=== 'aivex'` |
| `version` | `=== 4` (nombre) |
| `submissionId` | UUID **v4** (stocké en minuscules) |
| `source` | chaîne optionnelle, ≤ 500 |
| `team.name` | 2–120 caractères après normalisation |
| `team.wilaya.code` | chaîne `01`–`58` présente dans le dataset ; `name` re-dérivé du dataset |
| `team.institution` | `custom` booléen strict. `custom: true` ⇒ `id === 'other'` + nom 3–180. `custom: false` ⇒ `id` listé **dans la wilaya choisie** (≠ `other`) ; `name` re-dérivé du dataset |
| `activityOfficial.role` | `sub_director_activities` \| `activities_officer` (jamais un libellé UI) |
| `activityOfficial.fullName` | 3–120 |
| `activityOfficial.email` | format e-mail, ≤ 254, **non unique** |
| téléphones (tous) | chaîne ≤ 40 en entrée ; après normalisation `^\+?\d{9,15}$` |
| `delegationHead` / `driver` | `fullName` 3–120, téléphone, `rfid` |
| `rfid` (tous) | **chaîne** (un nombre JSON est refusé), 1–64 après trim, sans caractère de contrôle |
| `students` | tableau de **exactement 3** |
| `students[i].position` | `=== i + 1` (entier) |
| `students[i].bacYear` | **entier**, `1990 ≤ bacYear ≤ année UTC courante + 1` |
| `students[i].rfid` | distinct des deux autres étudiants |
| `students[i].studentCard` | `=== "studentCard_{i+1}"` |
| `consent` | `=== true` (strict) |
| clés inconnues | refusées (champ legacy compris) |

Les fichiers sont validés séparément par `validateStudentCardsV4` (§9).

## 12. Règles de normalisation

Helpers purs, identiques frontend / backend ; **le backend reste l'autorité**, le frontend n'est jamais une frontière de sécurité.

| Helper | Règle | Exemple |
|---|---|---|
| `normalizeText` | NFC, caractères de contrôle → espace, espaces multiples → un, trim | `'  Amina \t Benali '` → `'Amina Benali'` |
| `normalizeEmail` | trim + minuscules | `' Amina@Univ-BBA.DZ'` → `'amina@univ-bba.dz'` |
| `normalizePhone` | trim, suppression de `espaces ( ) . -`, `+` initial conservé ; toujours une chaîne | `'0555 12 34 56'` → `'0555123456'` ; `'+213 555 12 34 56'` → `'+213555123456'` |
| `normalizeRfid` | trim **uniquement** (zéros initiaux et casse conservés), jamais `Number` | `' 00471236 '` → `'00471236'` |
| `normalizeBacYear` | entier, ou chaîne de 4 chiffres → entier ; sinon `null` | `'2023'` → `2023` ; `'BAC 2023'` → `null` |

Le format canonique du téléphone reste celui de V3 (tel que saisi, sans séparateurs). Le passage en E.164 est une décision ouverte (§19).

## 13. Modèle de statuts

`registration_status` (décision administrative sur l'inscription) :

| Valeur | Sens |
|---|---|
| `submitted` | reçue (défaut) |
| `under_review` | en cours d'examen |
| `approved` | acceptée |
| `rejected` | refusée |
| `cancelled` | annulée |

`document_status` (document officiel : génération → impression → signature + cachet → upload → vérification) :

| Valeur | Sens |
|---|---|
| `not_generated` | défaut |
| `generating` | génération Word/PDF en cours |
| `generation_failed` | échec de génération |
| `awaiting_signature` | PDF disponible, en attente de signature et cachet |
| `signed_document_uploaded` | document signé reçu |
| `under_review` | vérification admin |
| `changes_required` | corrections demandées |
| `validated` | document validé |
| `expired` | délai dépassé |

`current_form_revision` (révision du document généré, 0 = jamais) et `template_version` préparent la régénération. Tous sont **fixés par le serveur**. Les lignes existantes reçoivent `registration_status` depuis l'ancienne colonne `status` quand la valeur existe dans la nouvelle liste, sinon `submitted` (backfill unique à la création de la colonne).

## 14. Idempotence

- **Clé** : `submissionId` (UUID v4) ↔ `aivex_registrations.submission_id` **UNIQUE**.
- **Pas l'e-mail** : un même responsable peut inscrire plusieurs équipes. L'index unique V3 `(edition, lower(email))` est remplacé par le même index **limité à `form_version < 4`**.

Frontend :
1. générer `crypto.randomUUID()` à la création de l'état ;
2. le conserver pendant tous les envois de la même tentative : double clic, timeout, réponse perdue, retry réseau, **rechargement de page** (à persister dans le brouillon `sessionStorage`) ;
3. le renouveler **uniquement** après un succès confirmé (201/200) ou une réinitialisation explicite — sinon une seconde équipe inscrite depuis le même onglet serait prise pour un rejeu.

Backend (Phase 2) :

```
POST (submissionId = X) → inscription créée → réponse perdue
POST (submissionId = X) → trouvée par submission_id → 200 { reference, alreadyProcessed: true }
```

- Course entre deux requêtes identiques : la seconde tombe sur la violation d'unicité de `submission_id` → relire la ligne → rejeu.
- Inscription trouvée mais incomplète (upload en cours, ou crash) : ne pas renvoyer de référence tant que les 3 étudiants ne sont pas enregistrés (409 + `Retry-After` proposé, §19).

## 15. Sécurité

- `SUPABASE_SECRET_KEY` (service role) **uniquement côté serveur**, jamais préfixée `VITE_` / `INFINITY_` / `AIVEX_`.
- `vite.config.js` expose les préfixes `VITE_`, `INFINITY_`, `AIVEX_` au navigateur. `src/lib/applicationSubmission.js` lisait `import.meta.env[name]` **dynamiquement**, ce qui faisait embarquer tout l'objet d'environnement préfixé ; il lit désormais chaque variable **statiquement** (vérifié : le bundle ne contient plus de table de variables). Une variable serveur V4 (édition, e-mails, secrets) ne doit tout de même **jamais** porter ces préfixes. `VITE_AIVEX_FORM_VERSION` est publique par nature (simple flag).
- `VITE_SUPABASE_PUBLISHABLE_KEY` n'est pas utilisée aujourd'hui ; elle ne pourra l'être que si des policies RLS explicites existent. Le modèle V4 n'en prévoit aucune : **tout passe par l'API**.
- RLS activée sur `aivex_registrations`, `aivex_members`, `aivex_students`, `aivex_settings`, **sans policy** ; `REVOKE ALL` pour `anon` et `authenticated` sur les nouvelles tables.
- Bucket des cartes privé, sans policy ; lecture admin future par URL signée courte.
- Validation serveur systématique ; signature binaire des fichiers ; objets JSON fermés.
- Défenses existantes conservées : contrôle d'origine (production), rate limit (5 / 15 min / IP, en mémoire par instance — limite connue), honeypot, limites mémoire multipart.

## 16. Confidentialité

- Les cartes étudiantes sont des documents privés : jamais publiques, jamais dans le HTML servi, jamais dans une URL publique, jamais dans le PDF, jamais dans les logs ni les analytics.
- Les chemins Storage ne contiennent qu'un UUID et une position ; le nom de fichier d'origine n'est pas transmis en V4.
- Les logs serveur ne contiennent que des codes d'erreur et des étapes : **ni payload, ni nom, téléphone, e-mail, RFID, chemin**.
- Les messages d'erreur citent un chemin de champ, jamais une valeur saisie.
- V4 ne collecte plus aucun numéro d'identité nationale ; les numéros V3 existants restent en base (durée de conservation à décider, §19).

## 17. Champs legacy

| Champ | Statut | Remplacement V4 |
|---|---|---|
| `aivex_registrations.delegation_head_national_id` | **deprecated** (V3 uniquement, NULL imposé en V4) | `delegation_head_rfid` |
| `aivex_registrations.driver_national_id` | **deprecated** (idem) | `driver_rfid` |
| `aivex_members.registration_number` / payload `registrationNumber` | **deprecated** | aucun |
| `aivex_members.study_level` / payload `studyLevel` | **deprecated** | aucun |
| `aivex_members` (table) | **legacy** (étudiants V1–V3, conservée) | `aivex_students` |
| `aivex_members.student_card_path/_mime/_size_bytes` | **NON deprecated** — données de vérification V3 existantes | `aivex_students.student_card_*` (**REQUIRED V4 INTERNAL VERIFICATION**) |
| `aivex_registrations.status` | **legacy** (lue par l'API V3) | `registration_status` |
| index `aivex_registrations_edition_contact_uidx` | **remplacé** (e-mail non unique en V4) | `aivex_registrations_edition_contact_v3_uidx` (`where form_version < 4`) |
| payload `reference` généré par le navigateur (`makeReference`) | **legacy** (ignoré par l'API V3 sauf honeypot) | aucun — **refusé** en V4, référence serveur uniquement |
| brouillon `aivex-registration-draft-v3` | **legacy** (formulaire V3) | `aivex-registration-draft-v4` (+ `submissionId`) ; jamais relu par V4 |
| UI : champs `nationalId`, `registrationNumber`, `studyLevel` | **legacy** (servis tant que le flag vaut 3) | `rfid`, `bacYear` (flag = 4) |
| `leader_name`, `university`, `team_email`, `member_count`, `aivex_members.role` | déjà supprimés par la migration v3 « contract » | — |

Rien n'est supprimé dans cette phase (aucun `DROP TABLE` / `DROP COLUMN`, vérifié par test).

## 18. Stratégie de migration V3 → V4

| Étape | Contenu | Production |
|---|---|---|
| **Phase 1 (cette phase)** | Contrat, validateurs, mapping, migration préparée, tests, doc. Handler : dispatch par version (V4 validé puis 503). Frontend V4 complet **derrière le flag** (RFID, BAC, `submissionId`, brouillon v4, envoi sans référence client). `validateRegistration` → `validateRegistrationV3`. `parseMultipart` expose `filename`. | inchangée (V3, flag absent) |
| Phase 2a — base | Revue de la migration → staging → production. Après application, **V3 continue de fonctionner** : chaque nouvelle règle est limitée à `form_version >= 4` ou aux nouvelles tables. | V3 |
| Phase 2b — backend | Remplacer le 503 V4 par l'écriture §6.3 : idempotence `submission_id`, référence serveur, `aivex_students`, cleanup. Déployé **avant** le basculement du flag. | V3 (V4 accepté côté API) |
| Phase 2c — frontend | Build avec `VITE_AIVEX_FORM_VERSION=4` (d'abord en Preview Vercel, puis en Production). Aucun code UI supplémentaire requis. | V4 |
| Phase 2d — fin de V3 | Après une fenêtre de transition (anciens bundles en cache), l'API refuse V3 avec un 400 explicite ; le modèle V3, les branches `v4 ? … : …` de l'UI, les libellés V3 et `validateRegistrationV3` passent en REMOVE LATER. | V4 |

Ordre impératif : **migration → backend → flag frontend**. Retour arrière : repasser le flag à `3` (le code V3 est intact).
Données V3 existantes : conservées telles quelles (`aivex_members`, `*_national_id`). Aucune conversion automatique vers `aivex_students` : BAC et RFID n'existent pas pour ces lignes et ne peuvent pas être déduits.

## 19. Décisions métier ouvertes

1. **RFID** — que désigne-t-il exactement (UID de puce, numéro imprimé) ? Format, jeu de caractères, longueur ? Sensible à la casse ? (Aujourd'hui : chaîne 1–64, trim seul, comparaison exacte.)
2. **Unicité RFID** — faut-il `UNIQUE (edition, rfid_number)` entre équipes ? Un RFID peut-il être partagé entre un étudiant, le chef de délégation et le chauffeur ? (Aujourd'hui : unique seulement entre les 3 étudiants d'une inscription.)
3. **Année du BAC** — le validateur accepte jusqu'à « année courante + 1 » (brief) mais le sélecteur ne propose que jusqu'à l'année courante (un étudiant a déjà son BAC). Aligner les deux ? Borne basse 1990 ?
4. **Carte étudiant** — PDF accepté ? Recto seul ou recto + verso ? Durée de conservation et suppression après l'événement ?
5. **Téléphone** — garder le format saisi (`0555…` / `+213…`) ou canoniser en E.164 ? Impact sur l'impression Word.
6. **Référence** — conserver le générateur actuel de la base (défini hors dépôt, format à vérifier avec les requêtes en fin de migration) ou générer `AX{edition}-{yy}-{8 hex}` dans l'API (avec retry sur collision) ?
7. **Template Word** — `activity_official_name` et `activity_official_role` (libellé arabe ?) ne figurent pas dans la liste de variables : à confirmer sur le vrai template. Format des dates et de la référence imprimée.
8. **`aivex_settings` édition 2** — nom officiel imprimé, dates, e-mail de dépôt, version du template.
9. **Rejeu avec contenu différent** (même `submissionId`, réponses modifiées après une erreur ambiguë) : recommandé d'ajouter une empreinte du payload normalisé et de répondre 409.
10. **Rejeu pendant le traitement** : 409 + `Retry-After`, ou attente côté serveur ?
11. **Numéros d'identité nationale V3** : durée de conservation / purge.
12. **Limite Vercel 4,5 Mo par requête** vs 3 × 5 Mo : garder la compression navigateur obligatoire (actuelle) ou passer à un upload direct vers Storage par URL signée d'upload ?
13. **Consentement** : stocker la version du texte accepté ?

---

## Annexe A — Audit du code existant

Recherche globale sur le code suivi (`src/`, `api/`, `scripts/`, `supabase/`, `shared/`, `tests/`), refaite après les modifications de la Phase 1. Les références sont données par symbole (plus stables que les numéros de ligne).

Constat de départ : le formulaire V3 avait déjà exactement 3 étudiants fixes, sans leader ni ajout/suppression ; `rfid`, `bacYear`, `submissionId` n'existaient nulle part.

Catégories : **V3 legacy** (servi en production tant que le flag vaut 3) · **V4** (nouveau contrat) · **KEEP** · **REMOVE LATER** (fin de V3, Phase 2d) · **PHASE 2 / PHASE 3**.

### A.1 `registrationNumber` / `studyLevel` / `nationalId`

| Fichier | Rôle | V3 / V4 | Action |
|---|---|---|---|
| `api/_lib/aivex-validation.js` — `readPerson`, `readStudents`, `STUDY_LEVELS`, `NATIONAL_ID_RE` | Validation serveur V3 | V3 legacy | KEEP tant que V3 est servi → REMOVE LATER |
| `api/aivex/register.js` — `findDuplicate`, `storeRegistration` (`registration_number`, `study_level`, `*_national_id`) | Écriture V3 | V3 legacy | KEEP → REMOVE LATER ; le chemin V4 (Phase 2) écrit `aivex_students` / `*_rfid` |
| `src/pages/aivex/register/registrationModel.js` — `SECTIONS`, `STUDENT_FIELDS`, `studyLevels`, `emptyPerson`, `createStudent`, `normalizeNationalId`, `personIssues`, `studentIssues`, `buildSubmission`, `buildSummary` | Modèle V3 | V3 legacy | KEEP (modèle `REGISTRATION_MODELS[3]`) → REMOVE LATER |
| `src/pages/aivex/register/registrationModel.js` — `SECTIONS_V4`, `STUDENT_FIELDS_V4`, `emptyPersonV4`, `createStudentsV4`, `personIssuesV4`, `studentIssuesV4`, `buildSubmissionV4`, `buildSummaryV4` | Modèle V4 (RFID, BAC) | **V4** | fait (Phase 1) |
| `src/pages/aivex/register/DelegationStep.jsx` | Champ `nationalId` (V3) / `rfid` (V4) | les deux | fait : branche V4 ; branche V3 → REMOVE LATER |
| `src/pages/aivex/register/StudentsStep.jsx` | Matricule + niveau (V3) / BAC + RFID (V4) | les deux | fait : branche V4 ; branche V3 → REMOVE LATER |
| `src/pages/aivex/register/ReviewStep.jsx` | Relecture des mêmes champs | les deux | fait : branche V4 ; branche V3 → REMOVE LATER |
| `src/pages/aivex/register/registrationI18n.js` — `nationalId*`, `regNumber*`, `studyLevels`, `revNationalId`, `revRegId`, `revStudyLevel`, `errNational*`, `errReg*`, `errLevelRequired`, `getStudyOptions`, `getStudyLabel` (en/fr/ar) | Libellés V3 | V3 legacy | KEEP → REMOVE LATER |
| `src/pages/aivex/register/registrationI18n.js` — `rfid*`, `bacYear*`, `revRfid`, `revBacYear`, `errRfid*`, `errBacYear*`, `v4Wording` (`uploadHint`, `privacyIntro` sans n° d'identité), `getBacYearOptions` | Libellés V4 (en/fr/ar) | **V4** | fait (Phase 1) |
| `shared/aivex/contract-v4.js` (commentaire) | Cite ces champs comme **refusés** en V4 | V4 | KEEP |
| `tests/aivex-contract-v4.test.mjs` | Vérifie leur **refus** en V4 et le maintien de V3 | V4 | KEEP |
| `supabase/migrations/20260917200000_aivex_registration_v3_expand.sql` | Historique V3 (colonnes, checks) | V3 legacy | KEEP — migration appliquée, jamais réécrite |
| `src/pages/join/JoinPage.jsx`, `src/pages/join/joinModel.js` (`studyLevel`) | Formulaire d'**adhésion au club** | hors AIVEX | KEEP (sans rapport) |

### A.2 `leader` / `isLeader`

| Fichier | Rôle | V3 / V4 | Action |
|---|---|---|---|
| `supabase/migrations/20260917200000…expand.sql`, `…200100…contract.sql` | Suppression historique de `leader_name` (V2) | historique | KEEP |
| `tests/aivex-contract-v4.test.mjs` | Vérifie qu'aucun leader n'existe en V4 | V4 | KEEP |
| code applicatif (`src/`, `api/`, `shared/`) | — | — | **0 occurrence** : aucun système leader/member étudiant |

### A.3 `aivex_members`

| Fichier | Rôle | V3 / V4 | Action |
|---|---|---|---|
| `api/aivex/register.js` — `findDuplicate`, `storeRegistration` | Étudiants V3 | V3 legacy | KEEP → REMOVE LATER ; V4 écrira `aivex_students` (Phase 2) |
| `supabase/migrations/20260917200000…`, `…200050…trigger.sql`, `…200100…` | Historique V3 | historique | KEEP |
| `supabase/migrations/20260918120000_aivex_v4_contract.sql` | Commentaire « LEGACY », RLS confirmée, **aucune** modification de structure | V4 (prép.) | KEEP |

### A.4 `studentCard` (conservé partout)

| Fichier | Rôle | Action |
|---|---|---|
| `StudentCardUpload.jsx`, `useObjectUrl.js`, `prepareCardUploads.js` | Input, glisser-déposer, aperçu local, compression | KEEP (communs V3/V4 ; `prepareCardUploads` conserve désormais `position`) |
| `StudentsStep.jsx`, `ReviewStep.jsx` | Carte obligatoire + aperçu en relecture | KEEP (V3 et V4) |
| `registrationModel.js` — `checkCardFile`, `studentIssues*` (`studentCard` requis), `buildSubmission*` (parties `studentCard_1..3`) | Validation et transport | KEEP |
| `api/_lib/aivex-validation.js` — `validateCards` ; `api/_lib/aivex-validation-v4.js` — `validateStudentCardsV4` | Signature binaire serveur | KEEP (V3) / V4 |
| `api/aivex/register.js` — upload bucket privé, `student_card_*` | Stockage V3 | KEEP (la politique reste identique en V4) |

### A.5 Autres points

| Fichier | Rôle | Action |
|---|---|---|
| `src/lib/applicationSubmission.js` — `makeReference` | Référence client V3 (repli) | V3 legacy → REMOVE LATER ; V4 (`submitAivexRegistrationV4`) n'en a pas |
| `src/lib/applicationSubmission.js` — lecture de l'environnement | Était dynamique (`import.meta.env[name]`) | **corrigé** : lecture statique |
| `api/aivex/register.js` — honeypot (`body.reference`) | Écho d'une référence client | V3 legacy → REMOVE LATER |
| Génération Word/PDF, upload du document signé, workflow `document_status` | — | PHASE 3 (non implémenté) |

## Annexe B — Commandes

```bash
npm run test:contract   # tests du contrat V4 (node --test)
npm run lint
npm run build
```
