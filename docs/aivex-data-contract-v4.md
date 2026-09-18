# AIVEX — Data Contract V4

> **Statut : Phase 1 (fondation) — 2026-09-18.**
> Le contrat V4 est défini, codé et testé. **Il n'est pas encore branché en production** :
> le formulaire en ligne et `POST /api/aivex/register` restent en **V3 (legacy)**.
> La migration SQL V4 est **préparée mais non exécutée**.

| Élément | Fichier |
|---|---|
| Contrat canonique (constantes, enums, normalisation, validateur, builders frontend, chemin Storage, réponses) | [`shared/aivex/contract-v4.js`](../shared/aivex/contract-v4.js) |
| Validation serveur des cartes (signature binaire, MIME, extension, taille) | [`api/_lib/aivex-validation-v4.js`](../api/_lib/aivex-validation-v4.js) |
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
- **Aucune conversion silencieuse** : un payload V3 envoyé au validateur V4 est refusé (`field: "version"`), et inversement. Testé (tests 1a, 1b) et vérifié sur le handler de production (un payload V4 y reçoit un 400).

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

État cible (`createRegistrationStateV4()`) :

```js
{
  submissionId,                       // UUID v4, créé une fois
  team: { name, wilaya, institution, customInstitution },
  activityOfficial: { role, fullName, email, phone },
  delegationHead: { fullName, phone, rfid },
  driver: { fullName, phone, rfid },
  students: [                         // toujours 3, positions 1..3
    { position: 1, fullName, phone, bacYear, rfid, studentCard },  // studentCard = File | null
    { position: 2, … },
    { position: 3, … },
  ],
  consent,
}
```

- `team.wilaya` = code (`'34'`), `team.institution` = id du dataset ; `customInstitution` porte le nom saisi quand `institution === 'other'` (nécessaire à l'UI, converti en `{ id: 'other', name, custom: true }` dans le payload).
- `bacYear` est une chaîne dans l'état (valeur d'input) et un **entier** dans le payload.
- **Pas d'ajout / suppression d'étudiant** : les trois cartes « Student 1 / 2 / 3 » sont affichées directement (déjà le cas en V3).
- `buildRegistrationPayloadV4(state)` produit le payload canonique (sans `reference`).
- `buildStudentCardPartsV4(state)` produit `[{ field: 'studentCard_1', file, filename: 'studentCard_1.jpg' }, …]`. Le nom de fichier envoyé est **dérivé** (position + type) : le nom d'origine (souvent `IMG_…` ou le nom de l'étudiant) ne quitte jamais l'appareil.
- La compression existante (`prepareCardUploads.js`) reste nécessaire (voir §19 — limite Vercel 4,5 Mo).

L'UI n'est **pas** migrée dans cette phase (voir §18).

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

### 6.2 Pipeline (Phase 2)

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

### 6.3 Autorité serveur

| Le frontend fournit | Le serveur décide |
|---|---|
| `team`, `wilaya`, `institution`, `activityOfficial`, `delegationHead`, `driver`, `students`, `consent`, `submissionId` | `id`, `reference`, `edition`, `form_version`, `registration_status`, `document_status`, `submitted_at`, `created_at`, `updated_at`, `template_version`, libellés wilaya/établissement (re-dérivés du dataset) |

### 6.4 Réponses (`registrationResponsesV4`)

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

Le template Word officiel **n'est pas dans le dépôt** et n'a pas été modifié. Le mapping suit la liste de variables du brief ; il est à confronter au vrai template en Phase 3. `resolveWordDataV4({ settings, registration, students })` résout les variables à partir des lignes de base (valeurs brutes en texte ; le formatage des dates et téléphones sera décidé avec le template). Aucune librairie docx/PDF n'est ajoutée.

### 10.1 FRONTEND → API → DATABASE → WORD

| Frontend (état) | API (payload) | Base | Word |
|---|---|---|---|
| — | — | `aivex_settings.edition_name` | `{{edition_name}}` |
| — | — | `aivex_settings.event_start_date` | `{{event_start_date}}` |
| — | — | `aivex_settings.event_end_date` | `{{event_end_date}}` |
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
- ⚠️ `vite.config.js` expose les préfixes `VITE_`, `INFINITY_`, `AIVEX_`, et `src/lib/applicationSubmission.js` lit `import.meta.env[name]` **dynamiquement** : Vite embarque alors **tout** l'objet d'environnement préfixé dans le bundle. Toute future variable serveur V4 (édition, secrets, e-mails) doit donc utiliser un autre préfixe.
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
| `leader_name`, `university`, `team_email`, `member_count`, `aivex_members.role` | déjà supprimés par la migration v3 « contract » | — |

Rien n'est supprimé dans cette phase (aucun `DROP TABLE` / `DROP COLUMN`, vérifié par test).

## 18. Stratégie de migration V3 → V4

| Étape | Contenu | Production |
|---|---|---|
| **Phase 1 (cette phase)** | Contrat, validateurs, mapping, migration préparée, tests, doc. `validateRegistration` → `validateRegistrationV3`. `parseMultipart` expose `filename`. | inchangée (V3) |
| Phase 2a — base | Revue de la migration → staging → production. Après application, **V3 continue de fonctionner** : chaque nouvelle règle est limitée à `form_version >= 4` ou aux nouvelles tables. | V3 |
| Phase 2b — backend | `register.js` : dispatch par `version` (3 → chemin legacy, 4 → chemin V4 §6.2), idempotence, référence serveur. Déployé **avant** le frontend. | V3 + V4 acceptés |
| Phase 2c — frontend | État/payload V4 (`createRegistrationStateV4`, `buildRegistrationPayloadV4`) ; RFID à la place de `nationalId` ; BAC + RFID à la place de matricule + niveau ; nouvelle clé de brouillon avec `submissionId` ; plus de référence client ; libellés i18n et texte de confidentialité. Carte étudiant inchangée. | V4 |
| Phase 2d — fin de V3 | Après une fenêtre de transition (anciens bundles en cache), l'API refuse V3 avec un 400 explicite ; le code V3 passe en REMOVE LATER. | V4 |

Ordre impératif : **migration → backend → frontend**.
Données V3 existantes : conservées telles quelles (`aivex_members`, `*_national_id`). Aucune conversion automatique vers `aivex_students` : BAC et RFID n'existent pas pour ces lignes et ne peuvent pas être déduits.

## 19. Décisions métier ouvertes

1. **RFID** — que désigne-t-il exactement (UID de puce, numéro imprimé) ? Format, jeu de caractères, longueur ? Sensible à la casse ? (Aujourd'hui : chaîne 1–64, trim seul, comparaison exacte.)
2. **Unicité RFID** — faut-il `UNIQUE (edition, rfid_number)` entre équipes ? Un RFID peut-il être partagé entre un étudiant, le chef de délégation et le chauffeur ? (Aujourd'hui : unique seulement entre les 3 étudiants d'une inscription.)
3. **Année du BAC** — borne haute « année courante + 1 » (brief) ou « année courante » (un étudiant a déjà son BAC) ? Borne basse 1990 ?
4. **Carte étudiant** — PDF accepté ? Recto seul ou recto + verso ? Durée de conservation et suppression après l'événement ?
5. **Téléphone** — garder le format saisi (`0555…` / `+213…`) ou canoniser en E.164 ? Impact sur l'impression Word.
6. **Référence** — conserver le générateur actuel de la base (défini hors dépôt, format à vérifier avec les requêtes en fin de migration) ou générer `AX{edition}-{yy}-{8 hex}` dans l'API (avec retry sur collision) ?
7. **Template Word** — `activity_official_name`, `activity_official_role` (libellé arabe ?), `reference` ne figurent pas dans la liste de variables : à confirmer sur le vrai template. Format des dates.
8. **`aivex_settings` édition 2** — nom officiel imprimé, dates, e-mail de dépôt, version du template.
9. **Rejeu avec contenu différent** (même `submissionId`, réponses modifiées après une erreur ambiguë) : recommandé d'ajouter une empreinte du payload normalisé et de répondre 409.
10. **Rejeu pendant le traitement** : 409 + `Retry-After`, ou attente côté serveur ?
11. **Numéros d'identité nationale V3** : durée de conservation / purge.
12. **Limite Vercel 4,5 Mo par requête** vs 3 × 5 Mo : garder la compression navigateur obligatoire (actuelle) ou passer à un upload direct vers Storage par URL signée d'upload ?
13. **Consentement** : stocker la version du texte accepté ?

---

## Annexe A — Audit du code existant

Recherche sur le code suivi (`src/`, `api/`, `scripts/`, `supabase/`) avant modification.
Résultat global : `rfid`, `bacYear`, `submissionId` : **0 occurrence** (introduits par V4) ; `leader` / `isLeader` : **0 occurrence dans le code** (seulement dans les migrations v3 historiques) ; le formulaire V3 a déjà exactement 3 étudiants fixes sans leader.

Catégories : KEEP · REFACTOR · LEGACY · REMOVE LATER · MIGRATE PHASE 2 · MIGRATE PHASE 3.

| Fichier | Lignes | Rôle actuel | Action V4 |
|---|---|---|---|
| `api/aivex/register.js` | 1–24 | En-tête : pipeline V3 | LEGACY (annoté V3) |
| `api/aivex/register.js` | 88–109 | `findDuplicate` : unicité e-mail + `aivex_members.registration_number` | LEGACY — ne pas porter en V4 (e-mail non unique, pas de matricule) |
| `api/aivex/register.js` | 111–150 | `INSERT aivex_registrations` avec `delegation_head_national_id`, `driver_national_id` ; `select status` | MIGRATE PHASE 2 (chemin V4 : `*_rfid`, `submission_id`, statuts) |
| `api/aivex/register.js` | 153–190 | Upload cartes (`{registrationId}/{uuid}.{ext}`) + `INSERT aivex_members` (`registration_number`, `study_level`, `student_card_*`) | MIGRATE PHASE 2 → `aivex_students` + `studentCardStoragePath` ; `student_card_*` **KEEP** |
| `api/aivex/register.js` | 68–84 | `cleanupFailedRegistration` | KEEP (même stratégie en V4) |
| `api/aivex/register.js` | 233–237 | Honeypot : renvoie `body.reference` fourni par le client | REFACTOR PHASE 2 (V4 : pas de référence client) |
| `api/aivex/register.js` | 240–241 | Appel `validateRegistrationV3` | KEEP (dispatch par version en Phase 2) |
| `api/_lib/aivex-validation.js` | 1–17, 159 | Validateur V3 (`validateRegistrationV3`, renommé) | LEGACY → REMOVE LATER (fin de V3) |
| `api/_lib/aivex-validation.js` | 22, 49, 149 | `CARD_FIELD_PATTERN`, `cardField`, contrôle `studentCard` | KEEP (V3) ; équivalents V4 dans le contrat |
| `api/_lib/aivex-validation.js` | 107–121 | `readPerson` : `nationalId` | LEGACY → REMOVE LATER |
| `api/_lib/aivex-validation.js` | 138–151 | `registrationNumber`, `studyLevel` | LEGACY → REMOVE LATER |
| `api/_lib/aivex-validation.js` | 197–223 | `validateCards` (signature binaire V3) | KEEP (V3) ; V4 : `validateStudentCardsV4` |
| `api/_lib/multipart.js` | 17–19, 106 | Parser multipart | KEEP (+ `filename`, additif) |
| `src/lib/applicationSubmission.js` | 30–34, 53, 67, 108 | `makeReference` : référence générée par le navigateur, envoyée et utilisée en repli | REFACTOR PHASE 2 (V4 : référence serveur uniquement) |
| `src/lib/applicationSubmission.js` | 3 | `import.meta.env[name]` dynamique | REFACTOR PHASE 2 (accès statique, cf. §15) |
| `src/pages/aivex/register/registrationModel.js` | 1–11 | Constantes V3 (`FORM_VERSION = 3`) | LEGACY (annoté) |
| `src/pages/aivex/register/registrationModel.js` | 23–24, 48, 73, 115–123, 182 | `nationalId` (sections, état, normalisation, validation, payload) | MIGRATE PHASE 2 → `rfid` |
| `src/pages/aivex/register/registrationModel.js` | 26, 34–44, 55–56, 138–147, 205–206, 236 | `registrationNumber`, `studyLevel` | MIGRATE PHASE 2 → `bacYear` + `rfid` |
| `src/pages/aivex/register/registrationModel.js` | 58, 149, 153–158, 208, 213–214, 237 | `studentCard` (état, validation, contrôle fichier, multipart, résumé) | KEEP |
| `src/pages/aivex/register/registrationModel.js` | 221–240 | `buildSummary` (texte copiable, sans n° d'identité) | MIGRATE PHASE 2 (sans RFID non plus) |
| `src/pages/aivex/register/useCompetitionRegistration.js` | 11–12, 58, 180–181 | Brouillon V3 (`aivex-registration-draft-v3`) avec matricule/niveau | MIGRATE PHASE 2 (clé v4 + `submissionId`) |
| `src/pages/aivex/register/useCompetitionRegistration.js` | 111, 177 | Carte : `droppedCard`, fichiers non persistés | KEEP |
| `src/pages/aivex/register/useCompetitionRegistration.js` | 259 | Envoi `version: FORM_VERSION` (3) | MIGRATE PHASE 2 |
| `src/pages/aivex/register/DelegationStep.jsx` | 28–29 | Champ `nationalId` | MIGRATE PHASE 2 → champ RFID |
| `src/pages/aivex/register/StudentsStep.jsx` | 28, 47–51 | Champs matricule + niveau | MIGRATE PHASE 2 → BAC + RFID |
| `src/pages/aivex/register/StudentsStep.jsx` | 55–65 | `StudentCardUpload` | KEEP |
| `src/pages/aivex/register/StudentCardUpload.jsx` | tout | Input, glisser-déposer, aperçu, contrôle type/taille | KEEP |
| `src/pages/aivex/register/prepareCardUploads.js` | tout | Compression sous la limite Vercel | KEEP |
| `src/pages/aivex/register/useObjectUrl.js` | tout | Aperçus locaux (object URL, jamais uploadés ailleurs) | KEEP |
| `src/pages/aivex/register/ReviewStep.jsx` | 29 | Relecture `nationalId` | MIGRATE PHASE 2 → RFID |
| `src/pages/aivex/register/ReviewStep.jsx` | 50–51 | Relecture matricule + niveau | MIGRATE PHASE 2 → BAC + RFID |
| `src/pages/aivex/register/ReviewStep.jsx` | 37, 56–70 | Aperçu de la carte | KEEP |
| `src/pages/aivex/register/registrationI18n.js` | 78–81, 264–267, 444–447 | Libellés `nationalId` (en/fr/ar) | MIGRATE PHASE 2 → libellés RFID |
| `src/pages/aivex/register/registrationI18n.js` | 93–98, 278–283, 458–463, 573–588 | Libellés matricule / niveau, `getStudyOptions`, `getStudyLabel` | MIGRATE PHASE 2 (BAC/RFID) puis REMOVE LATER |
| `src/pages/aivex/register/registrationI18n.js` | 134–136, 316–318, 496–498 | Relecture : n° d'identité, matricule, niveau | MIGRATE PHASE 2 |
| `src/pages/aivex/register/registrationI18n.js` | 112, 296, 476 | `uploadHint` : « matricule lisible » | MIGRATE PHASE 2 (texte) — l'upload reste |
| `src/pages/aivex/register/registrationI18n.js` | 151, 332, 512 | `privacyIntro` : mentionne les n° d'identité | MIGRATE PHASE 2 (texte de confidentialité V4) |
| `src/pages/aivex/register/registrationI18n.js` | 183–190, 362–369, 542–549 | Erreurs `errNational*`, `errReg*`, `errLevel*` | MIGRATE PHASE 2 puis REMOVE LATER |
| `src/pages/aivex/register/RegistrationSuccess.jsx` | 18 | Affiche la référence | KEEP (V4 : référence serveur) |
| `src/pages/aivex/register/RecordCard.jsx` | 1 | Commentaire « delegation members » | KEEP (pas un rôle étudiant) |
| `supabase/migrations/20260917200000…`, `…200050…`, `…200100…` | — | Historique V3 (`aivex_members`, `national_id`, `leader_name`, `role`) | KEEP — migrations appliquées, jamais réécrites |
| `src/pages/join/*`, `api/join.js`, `src/pages/community/*`, `src/admin/*` | — | « member » / `studyLevel` de l'**adhésion au club** et de la page communauté | Hors périmètre AIVEX — KEEP |
| — | — | Génération Word/PDF, upload du document signé, workflow admin (`document_status`) | MIGRATE PHASE 3 |

## Annexe B — Commandes

```bash
npm run test:contract   # tests du contrat V4 (node --test)
npm run lint
npm run build
```
