# AIVEX — Data Contract V4

> **Statut : Phase 2 — formulaire migré en V4 (2026-09-19).**
> Frontend, API et schéma de base parlent uniquement le contrat V4. Le formulaire V3 et son validateur ont été retirés du code ; aucune colonne ni donnée ancienne n'est supprimée.
> **Déploiement : appliquer les deux migrations V4 AVANT de déployer ce code** (§14).

| Élément | Fichier |
|---|---|
| Contrat canonique (versions, enums, limites, règles de champ, validateur, état/payload du formulaire, politique des cartes, chemin Storage) | [`shared/aivex/contract-v4.js`](../shared/aivex/contract-v4.js) |
| Handler HTTP (POST, origine, rate limit, multipart, honeypot) | [`api/aivex/register.js`](../api/aivex/register.js) |
| Contrôle serveur des cartes (règle partagée + octets réels + extension) | [`api/_lib/aivex-validation-v4.js`](../api/_lib/aivex-validation-v4.js) |
| Écriture V4 (idempotence, inscription, Storage, étudiants, nettoyage) | [`api/_lib/aivex-registration-v4.js`](../api/_lib/aivex-registration-v4.js) |
| Référence publique (format unique) | [`api/_lib/aivex-reference.js`](../api/_lib/aivex-reference.js) |
| Modèle du formulaire (étapes, messages traduits) | [`src/pages/aivex/register/registrationModel.js`](../src/pages/aivex/register/registrationModel.js) |
| État, brouillon, envoi | [`src/pages/aivex/register/useCompetitionRegistration.js`](../src/pages/aivex/register/useCompetitionRegistration.js) |
| Mapping Word (données officielles uniquement) | [`shared/aivex/word-mapping-v4.js`](../shared/aivex/word-mapping-v4.js) |
| Migrations | [`20260918120000_aivex_v4_contract.sql`](../supabase/migrations/20260918120000_aivex_v4_contract.sql), [`20260919120000_aivex_v4_write_path.sql`](../supabase/migrations/20260919120000_aivex_v4_write_path.sql) |
| Tests | [`tests/aivex-contract-v4.test.mjs`](../tests/aivex-contract-v4.test.mjs) — `npm test` / `npm run test:contract` |

---

## 1. Objectif et séparation des responsabilités

```
Word officiel          → contrat du document     (shared/aivex/word-mapping-v4.js)
Modèle applicatif V4   → contrat de base          (aivex_registrations, aivex_students)
Cartes étudiantes      → pièces de vérification   (bucket privé aivex-student-cards)
```

| Classe | Usage | Champs |
|---|---|---|
| **OFFICIAL DATA** | PostgreSQL, Word/PDF, administration | équipe, wilaya, établissement, responsable des activités, chef de délégation, chauffeur, étudiants (nom, téléphone, année du BAC, RFID), référence |
| **INTERNAL VERIFICATION DATA** | Contrôle d'identité par l'administration | `students[].studentCard` (photo de la carte) |

## 2. Architecture

```
Navigateur                                        API (Vercel, Node)                       Supabase
─────────                                         ──────────────────                       ────────
createRegistrationStateV4()  submissionId (UUID v4)
buildSubmission(state)  ──── multipart ───────▶  POST /api/aivex/register
  payload = JSON V4                                origine · rate limit · parseMultipart
  studentCard_1..3 = fichiers                      honeypot
                                                   validateRegistrationV4()   (contrat partagé)
                                                   validateStudentCardsV4()   (règle partagée + octets)
                                                   registerV4()
                                                     1. submission_id déjà vu ?       ──▶ aivex_registrations
                                                     2. INSERT inscription + référence ──▶ aivex_registrations
                                                     3. upload des 3 cartes           ──▶ Storage privé
                                                     4. INSERT des 3 étudiants        ──▶ aivex_students
                                  ◀──── 201 { success, reference } / 200 rejeu / 4xx / 500
```

Le contrat partagé est **pur** (ni React, ni `window`, ni Supabase, ni `process.env`) : le même fichier tourne dans Vite, dans la fonction Vercel et sous `node --test`. Les constantes `AIVEX_FORM_VERSION = 4`, `AIVEX_EDITION = 2`, `AIVEX_STUDENT_COUNT = 3` n'existent qu'à cet endroit (vérifié par test).

## 3. Payload canonique (partie multipart `payload`)

```json
{
  "submissionId": "3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b",
  "edition": 2,
  "formVersion": 4,
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
    { "position": 2, "fullName": "…", "phone": "…", "bacYear": 2023, "rfid": "…", "studentCard": "studentCard_2" },
    { "position": 3, "fullName": "…", "phone": "…", "bacYear": 2024, "rfid": "…", "studentCard": "studentCard_3" }
  ],
  "consent": true
}
```

- `studentCard` nomme la partie multipart ; le fichier n'est **jamais** en base64 dans le JSON.
- `edition` et `formVersion` sont envoyés par le formulaire et **vérifiés** par l'API (`2` et `4` exactement) : une page périmée ne peut pas déposer dans une autre édition.
- Objets **fermés** : toute clé inconnue est refusée avec son chemin. Champs V3 (`form`, `version`, `answers`, `nationalId`, `registrationNumber`, `studyLevel`, `leader`, `isLeader`, `member`) → 400 « belongs to the old registration form ». Champs serveur (`reference`, `status`, `registrationStatus`, `documentStatus`, `submittedAt`, `source`, …) → 400 « assigned by the server ».
- `source` (page d'origine, sans paramètres) et `submitted_at` sont déterminés par le serveur.

## 4. Multipart

| Partie | Contenu | Règle |
|---|---|---|
| `payload` | JSON ci-dessus | obligatoire, ≤ 64 Kio |
| `studentCard_1` | carte de l'étudiant position 1 | obligatoire |
| `studentCard_2` | carte de l'étudiant position 2 | obligatoire |
| `studentCard_3` | carte de l'étudiant position 3 | obligatoire |

Toute autre partie ou un 4ᵉ fichier → refus. Le navigateur nomme chaque partie `studentCard_N.{jpg|png|webp}` (après une éventuelle recompression) : le nom d'origine du fichier ne quitte pas l'appareil et le serveur ne l'utilise jamais comme chemin.

## 5. Validation

Une seule source de règles (`contract-v4.js`) : le formulaire les applique champ par champ avec des messages traduits, l'API les réapplique et renvoie la première erreur `{ success: false, message, field }`. La concordance formulaire ⇔ API est testée sur des jeux de valeurs.

| Champ | Règle |
|---|---|
| `submissionId` | UUID **v4** |
| `edition` / `formVersion` | `=== 2` / `=== 4` (nombres) |
| `team.name` | 2–120 caractères (normalisé) |
| `team.wilaya.code` | `01`–`58` présent dans le dataset ; `name` re-dérivé du dataset (snapshot) |
| `team.institution` | `custom` booléen ; `custom: false` ⇒ `id` listé **dans la wilaya choisie**, `name` re-dérivé ; `custom: true` ⇒ `id = "other"` + nom 3–180 |
| `activityOfficial.role` | `sub_director_activities` \| `activities_officer` |
| `activityOfficial.email` | format e-mail, ≤ 254, minuscules — **non unique** |
| téléphones | chaîne ≤ 40, puis `^\+?\d{9,15}$` après suppression des séparateurs |
| noms | 3–120 caractères |
| `rfid` (tous) | **chaîne** (un nombre est refusé), trim, 1–64, sans caractère de contrôle, zéros initiaux conservés |
| `students` | tableau d'**exactement 3**, positions `1, 2, 3` dans l'ordre |
| `students[i].bacYear` | **entier**, `1990 ≤ année ≤ année courante + 1` (le sélecteur propose jusqu'à l'année courante) |
| RFID étudiants | distincts dans l'équipe |
| `students[i].studentCard` | `=== "studentCard_{i+1}"` |
| `consent` | `=== true` |

**Cartes** (`studentCardFileIssue`, identique formulaire / API) : présente, type `image/jpeg|png|webp`, 1 octet à 5 Mo. L'API ajoute : signature binaire réelle (`file-type`), type déclaré = type détecté, extension cohérente. Codes : 400 absente/vide, 413 trop grande, 415 type refusé.

## 6. Base de données

### 6.1 `public.aivex_registrations`

| Colonne | V4 |
|---|---|
| `id` | uuid PK |
| `submission_id` | uuid **NOT NULL UNIQUE** (défaut `gen_random_uuid()` pour les anciennes écritures) |
| `submission_fingerprint` | SHA-256 des réponses validées (détection d'un rejeu divergent) |
| `reference` | text NOT NULL UNIQUE, générée par l'API |
| `edition`, `form_version` (défaut 4) | 2, 4 |
| `team_name`, `wilaya_code`, `wilaya_name`, `institution_id`, `institution_name`, `institution_custom` | équipe (snapshots) |
| `activity_official_role/_name/_email/_phone` | responsable des activités |
| `delegation_head_name/_phone/_rfid`, `driver_name/_phone/_rfid` | délégation |
| `student_count` (= 3), `consent` (= true) | |
| `registration_status` (`submitted`), `document_status` (`not_generated`) | statuts serveur |
| `current_form_revision` (0), `template_version` | préparés pour le document officiel |
| `source`, `submitted_at`, `created_at`, `updated_at` | serveur |

Contrôles pour `form_version >= 4` : toutes les données officielles présentes, `delegation_head_national_id` et `driver_national_id` **NULL**, empreinte présente. L'unicité par e-mail ne s'applique plus qu'aux lignes `form_version < 4`.

### 6.2 `public.aivex_students`

`id`, `registration_id` (FK `ON DELETE CASCADE`), `edition` (copiée du parent par trigger), `position` (1–3), `full_name`, `phone`, `bac_year`, `rfid_number`, `student_card_path`, `student_card_mime`, `student_card_size_bytes`, `created_at`, `updated_at`.

- `UNIQUE (registration_id, position)`, `UNIQUE (registration_id, rfid_number)` ; **pas** de `UNIQUE (edition, rfid_number)` (décision métier non prise).
- Trigger différé : une inscription a 0 ou 3 étudiants au COMMIT (l'API insère les 3 lignes en une requête).
- `student_card_path` doit valoir `edition-{edition}/{registration_id}/student-{position}.{ext}` (CHECK).
- Seules les inscriptions V4 peuvent y avoir des lignes ; `aivex_members` reste la table des inscriptions V1–V3.

### 6.3 `public.aivex_settings`

Une ligne par édition (dates, e-mail de dépôt, version du template, interrupteurs). Préparée, **non utilisée** par l'API en Phase 2, sans ligne insérée.

### 6.4 Migrations

| Fichier | Contenu |
|---|---|
| `20260918120000_aivex_v4_contract.sql` | colonnes V4, `aivex_students`, `aivex_settings`, statuts, index, RLS, bucket privé |
| `20260919120000_aivex_v4_write_path.sql` | `submission_fingerprint`, `submission_id` NOT NULL (défaut + remplissage des anciennes lignes), `form_version` défaut 4, chemin des cartes avec l'édition, droits `service_role` |

Toutes deux additives et rejouables (aucun `DROP TABLE` / `DROP COLUMN` / `DELETE`). Elles ont été exécutées sur un PostgreSQL 18 local (PGlite) à partir d'un schéma d'origine reconstitué : migrations, ré-exécution, conservation des anciennes lignes, insertion au format V3 pendant la bascule, écriture V4 complète et 12 contraintes vérifiées. Le schéma d'origine réel n'étant pas dans le dépôt, **une exécution sur un projet Supabase de staging reste nécessaire** avant la production.

## 7. Storage

| | |
|---|---|
| Bucket | `aivex-student-cards`, **privé** (forcé par la migration), sans policy pour `anon`/`authenticated` |
| Chemin | `edition-2/{registration_id}/student-{1,2,3}.{jpg,png,webp}` |
| Écriture | service role côté serveur, `upsert: false` |
| Base | `student_card_path`, `student_card_mime`, `student_card_size_bytes` par étudiant |
| Lecture | aucune en Phase 2 ; plus tard par URL signée courte côté serveur. Aucune URL publique (vérifié par test). Les chemins ne sont jamais renvoyés au navigateur. |

## 8. Cartes étudiantes

Obligatoires (3 par inscription), données **internes de vérification** : jamais dans le Word/PDF, jamais publiques, jamais journalisées. Formulaire : un bloc « Student 0N · Student card — Front side » par étudiant, avec nom, type, taille et état (« Valid file ✓ » ou refus détaillé : nom, type, taille, raison), boutons Remplacer / Supprimer. Une carte absente bloque l'étape Étudiants et l'envoi. Les fichiers restent dans l'état React et ne sont jamais écrits dans le brouillon.

## 9. Mapping Word

29 variables, données officielles uniquement : édition et dates (`aivex_settings`), `registration_reference`, wilaya, établissement, équipe, téléphone et e-mail du responsable, chef de délégation et chauffeur (nom, téléphone, RFID), 3 étudiants (nom, téléphone, année du BAC, RFID), date limite et e-mail de dépôt. **Aucune** variable de carte, de n° d'identité, de matricule ou de niveau. Le template Word n'est pas dans le dépôt ; aucune génération n'est implémentée.

## 10. Statuts

| `registration_status` | `document_status` |
|---|---|
| `submitted` (création) · `under_review` · `approved` · `rejected` · `cancelled` | `not_generated` (création) · `generating` · `awaiting_signature` · `signed_document_uploaded` · `under_review` · `changes_required` · `validated` · `generation_failed` · `expired` |

## 11. Idempotence

- **Clé** : `submissionId`, UUID v4 créé par le navigateur au début d'une tentative, conservé dans le brouillon (retry, timeout, rechargement), renouvelé seulement après un succès (« Recommencer »). Ce n'est pas la référence.
- **Référence** : `AIVEX2-XXXXXXXX` (8 caractères Crockford base32, sans I/L/O/U), générée par `generateRegistrationReference()` côté serveur uniquement, unique (index), redessinée en cas de collision.
- **E-mail** : jamais une clé ; un même responsable peut inscrire plusieurs équipes.

| Même `submissionId` déjà en base | Réponse |
|---|---|
| inscription complète, mêmes réponses | **200** `{ success, reference, alreadyProcessed: true }`, rien de créé |
| inscription complète, réponses différentes | **409** avec la référence existante (« contactez les organisateurs ») |
| inscription sans étudiants, < 3 min | **409** « encore en traitement » + `Retry-After: 15` |
| inscription sans étudiants, ≥ 3 min (tentative morte) | supprimée (cartes + ligne), puis recréée |

L'index UNIQUE de `submission_id` est la garde finale : deux requêtes simultanées → une seule insertion, l'autre relit la ligne et suit le tableau. `maxDuration` de la fonction est fixé à 60 s (`vercel.json`), bien sous le seuil de 3 minutes.

**Échec en cours d'écriture** (upload ou insertion des étudiants) : les cartes déjà envoyées et l'inscription sont supprimées (nettoyage compensatoire), réponse 500 générique.

## 12. Sécurité et confidentialité

- `SUPABASE_SECRET_KEY` uniquement dans l'environnement serveur ; les variables `VITE_`/`INFINITY_`/`AIVEX_` sont publiques et lues statiquement.
- Conservés : POST seul, contrôle d'origine (production), rate limit (5 / 15 min / IP), honeypot (succès neutre sans écriture), limites mémoire multipart.
- Validation serveur complète : UUID, versions, objets fermés, types réels des fichiers, taille, nombre de fichiers.
- RLS sur les 4 tables sans policy ; `anon`/`authenticated` sans droits sur `aivex_students`/`aivex_settings`.
- Réponses : jamais de SQL, de détail Supabase, de chemin Storage ni de stack trace. Journaux : une étape et un code d'erreur, jamais de payload, nom, téléphone, e-mail, RFID ou chemin (vérifié par test).

## 13. Legacy

| Élément | État |
|---|---|
| `aivex_members` (table) | conservée, plus écrite ; étudiants des inscriptions V1–V3 |
| `aivex_members.registration_number`, `.study_level` | conservées, jamais écrites par V4 |
| `aivex_registrations.delegation_head_national_id`, `.driver_national_id` | conservées pour V3, **NULL imposé** en V4 |
| `aivex_registrations.status` | conservée (V1–V3) ; V4 utilise `registration_status` |
| `student_card_path/_mime/_size_bytes` | **pas legacy** : utilisées par V4 (`aivex_students`) |
| index e-mail unique | limité à `form_version < 4` |
| brouillons `aivex-registration-draft-v1..v3` | supprimés du navigateur au chargement, jamais relus |
| code V3 (`api/_lib/aivex-validation.js`, flag `formVersion.js`, branches UI, libellés) | **supprimé** |

Les inscriptions V3 existantes ne sont **pas** converties : l'année du BAC et les RFID n'existent pas pour elles.

## 14. Déploiement (ordre obligatoire)

1. Vérifier sur **staging** puis appliquer en production, dans l'ordre : `20260918120000_aivex_v4_contract.sql`, `20260919120000_aivex_v4_write_path.sql` (requêtes de contrôle en fin de fichier : bucket privé, aucune policy, générateur actuel de `reference`, contraintes).
2. Déployer ce code (frontend + API ensemble, même déploiement Vercel).
3. Tester une inscription réelle en production puis la supprimer si nécessaire.

Tant que les migrations ne sont pas appliquées, l'API V4 répond 500 à toute inscription (colonnes absentes). Les anciennes pages V3 encore ouvertes reçoivent un 400 « reload the page ».

## 15. Décisions métier ouvertes

1. RFID : format exact, casse, unicité sur toute l'édition, partage possible entre étudiant, chef de délégation et chauffeur.
2. Borne haute de l'année du BAC (année courante ou + 1).
3. Cartes : PDF accepté ? recto seul ? durée de conservation.
4. Téléphones : format saisi ou E.164 pour le document imprimé.
5. Template Word : `activity_official_name` / rôle, formats des dates.
6. Valeurs officielles de `aivex_settings` (édition 2).
7. Conservation des numéros d'identité des inscriptions V3.
8. Limite Vercel de 4,5 Mo par requête : compression navigateur (actuelle) ou upload direct vers Storage.
