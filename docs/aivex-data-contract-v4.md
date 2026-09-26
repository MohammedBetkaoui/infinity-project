# AIVEX — Data Contract V4

> **Statut : document officiel généré en DOCX uniquement, téléchargeable après l'inscription ; aucune conversion PDF automatique (PDF manuel, hors application) — 2026-09-19.**
> Frontend, API et schéma de base parlent uniquement le contrat V4 (Phase 2, en production depuis la Phase 3). Chaque inscription produit désormais son document officiel Word dans un bucket privé (§9.1).
> **Déploiement : appliquer `20260920120000_aivex_v4_generated_documents.sql`** (§14).
>
> **Mise à jour 2026-09-23 — documents d'identité de la délégation (§8b).** Toute *nouvelle* inscription joint l'image de la carte nationale d'identité du chef de délégation et du chauffeur (5 images au total avec les 3 cartes étudiantes). **Le contrat reste en version 4** : l'ajout est purement additif (deux clés dans des objets déjà fermés, deux parties multipart, huit colonnes NULLables), l'API et le formulaire sont déployés ensemble, et une page périmée reçoit déjà un 400 « rechargez la page ». **Déploiement : appliquer `20260923120000_aivex_v4_identity_documents.sql` AVANT de déployer ce code** (§14).
>
> **Mise à jour 2026-09-23 — règles de validation de l'édition 2 (§5b).** Téléphone : **10 chiffres, 05 / 06 / 07** (`+213…` refusé). RFID **étudiant** : **exactement 8 chiffres** (celui du chef de délégation et du chauffeur reste borné à 1–64). Année du BAC : **2019 à 2026**, fixe. Noms de personnes : **lettres Unicode et espaces**, 3–120. Toutes ces règles n'existent qu'une fois, dans le contrat partagé, et l'API les réapplique avant toute écriture. **Aucune migration** : les colonnes stockent déjà ces valeurs (§5b).

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
| Migrations | [`20260918120000_aivex_v4_contract.sql`](../supabase/migrations/20260918120000_aivex_v4_contract.sql), [`20260919120000_aivex_v4_write_path.sql`](../supabase/migrations/20260919120000_aivex_v4_write_path.sql), [`20260920120000_aivex_v4_generated_documents.sql`](../supabase/migrations/20260920120000_aivex_v4_generated_documents.sql), [`20260923120000_aivex_v4_identity_documents.sql`](../supabase/migrations/20260923120000_aivex_v4_identity_documents.sql) |
| Documents d'identité (formulaire) | [`IdentityDocuments.jsx`](../src/pages/aivex/register/IdentityDocuments.jsx), [`IdentityCardUpload.jsx`](../src/pages/aivex/register/IdentityCardUpload.jsx) |
| Tests | [`tests/aivex-contract-v4.test.mjs`](../tests/aivex-contract-v4.test.mjs), [`tests/aivex-document-generation.test.mjs`](../tests/aivex-document-generation.test.mjs), [`tests/aivex-identity-documents.test.mjs`](../tests/aivex-identity-documents.test.mjs), [`tests/aivex-validation-rules.test.mjs`](../tests/aivex-validation-rules.test.mjs) — `npm test` / `npm run test:contract` |

---

## 1. Objectif et séparation des responsabilités

```
Word officiel          → contrat du document     (shared/aivex/word-mapping-v4.js)
Modèle applicatif V4   → contrat de base          (aivex_registrations, aivex_students)
Cartes étudiantes      → pièces de vérification   (bucket privé aivex-student-cards)
Cartes d'identité      → pièces de vérification   (bucket privé aivex-id-cards)
```

| Classe | Usage | Champs |
|---|---|---|
| **OFFICIAL DATA** | PostgreSQL, Word/PDF, administration | équipe, wilaya, établissement, responsable des activités, chef de délégation, chauffeur, étudiants (nom, téléphone, année du BAC, RFID), référence |
| **INTERNAL VERIFICATION DATA** | Contrôle d'identité par l'administration | `students[].studentCard` (photo de la carte), `delegationHead.idCard`, `driver.idCard` (image de la carte nationale d'identité) |

## 2. Architecture

```
Navigateur                                        API (Vercel, Node)                       Supabase
─────────                                         ──────────────────                       ────────
createRegistrationStateV4()  submissionId (UUID v4)
buildSubmission(state)  ──── multipart ───────▶  POST /api/aivex/register
  payload = JSON V4                                origine · rate limit · parseMultipart (5 fichiers max)
  studentCard_1..3 = fichiers                      honeypot
  delegationHeadIdCard, driverIdCard = fichiers    validateRegistrationV4()   (contrat partagé)
                                                   validateRegistrationFilesV4() (règle partagée + octets + SHA-256)
                                                   registerV4()
                                                     1. submission_id déjà vu ?       ──▶ aivex_registrations
                                                     2. INSERT inscription + référence
                                                        + métadonnées des 2 cartes d'identité ──▶ aivex_registrations
                                                     3. upload des 3 cartes étudiantes ──▶ Storage privé aivex-student-cards
                                                        puis des 2 cartes d'identité   ──▶ Storage privé aivex-id-cards
                                                     4. INSERT des 3 étudiants        ──▶ aivex_students  (marqueur de complétude, TOUJOURS en dernier)
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
  "delegationHead": { "fullName": "…", "phone": "…", "rfid": "…", "idCard": "delegationHeadIdCard" },
  "driver": { "fullName": "…", "phone": "…", "rfid": "…", "idCard": "driverIdCard" },
  "students": [
    { "position": 1, "fullName": "…", "phone": "…", "bacYear": 2023, "rfid": "…", "studentCard": "studentCard_1" },
    { "position": 2, "fullName": "…", "phone": "…", "bacYear": 2023, "rfid": "…", "studentCard": "studentCard_2" },
    { "position": 3, "fullName": "…", "phone": "…", "bacYear": 2024, "rfid": "…", "studentCard": "studentCard_3" }
  ],
  "consent": true
}
```

- `studentCard` et `idCard` nomment la partie multipart ; le fichier n'est **jamais** en base64 dans le JSON. `idCard` doit valoir exactement `delegationHeadIdCard` / `driverIdCard` (un chemin, une URL ou un autre nom est refusé, champ `delegationHead.idCard` / `driver.idCard`) : le client ne choisit jamais un chemin de stockage. Aucun numéro d'identité, checksum ou chemin n'existe dans le JSON (objets fermés).
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
| `delegationHeadIdCard` | image de la carte nationale d'identité du chef de délégation | obligatoire (nouvelles inscriptions) |
| `driverIdCard` | image de la carte nationale d'identité du chauffeur | obligatoire (nouvelles inscriptions) |

Toute autre partie, un 6ᵉ fichier, un fichier en double ou un champ texte portant le nom d'un fichier → refus. Le navigateur nomme chaque partie `studentCard_N.{jpg|png|webp}` / `delegationHeadIdCard.{jpg|png}` / `driverIdCard.{jpg|png}` (après une éventuelle recompression) : le nom d'origine du fichier (souvent un nom de personne) ne quitte pas l'appareil et le serveur ne l'utilise jamais comme chemin. Limite Vercel de 4,5 Mo par requête : le navigateur recompresse chaque image pour tenir dans un budget partagé (≈ 800 Ko chacune avec 5 images).

## 5. Validation

Une seule source de règles (`contract-v4.js`) : le formulaire les applique champ par champ avec des messages traduits, l'API les réapplique et renvoie la première erreur `{ success: false, message, field }`. La concordance formulaire ⇔ API est testée sur des jeux de valeurs.

| Champ | Règle |
|---|---|
| `submissionId` | UUID **v4** |
| `edition` / `formVersion` | `=== 2` / `=== 4` (nombres) |
| `team.name` | 2–120 caractères (normalisé) |
| `team.wilaya.code` | `01`–`58` présent dans le dataset ; `name` re-dérivé du dataset (snapshot) |
| `team.institution` | `custom` booléen ; `custom: false` ⇒ `id` listé **dans la wilaya choisie**, `name` re-dérivé ; `custom: true` ⇒ `id = "other"` + nom 3–180 |
| `activityOfficial.role` | `sub_director_activities` \| `activities_officer`, valeur exacte |
| `activityOfficial.email` | format e-mail, ≤ 254, minuscules — **non unique** |
| téléphones (6 champs) | chaîne ≤ 40 ; espaces, tirets et points retirés, puis `^0[567][0-9]{8}$` : **10 chiffres, 05 / 06 / 07** (`+213…` refusé, jamais réécrit) — §5b |
| noms de personnes (6 champs) | NFC, contrôle et formatage invisible retirés, espaces réduites, **lettres Unicode + espaces**, 3–120 — §5b |
| RFID chef de délégation / chauffeur | **chaîne** (un nombre est refusé), trim, 1–64, sans caractère de contrôle, zéros initiaux conservés |
| RFID étudiant | **chaîne**, trim, `^[0-9]{8}$` : **exactement 8 chiffres**, zéros initiaux conservés ; distincts dans l'équipe — §5b |
| `students` | tableau d'**exactement 3**, positions `1, 2, 3` dans l'ordre |
| `students[i].bacYear` | **entier de 2019 à 2026**, fixe pour l'édition (le sélecteur propose exactement ces années) — §5b |
| `students[i].studentCard` | `=== "studentCard_{i+1}"` |
| `delegationHead.idCard` / `driver.idCard` | `=== "delegationHeadIdCard"` / `=== "driverIdCard"` |
| `consent` | `=== true` |

**Cartes** (`imageFileIssue`, identique formulaire / API, une politique par type de document) : présente, type `image/jpeg|png|webp` pour une carte étudiante, `image/jpeg|png` pour une carte d'identité (**pas de WEBP** : le texte du formulaire annonce JPG, JPEG ou PNG), 1 octet à 5 Mo. L'API ajoute : signature binaire réelle (`file-type`), type déclaré = type détecté, extension cohérente ; pour les cartes d'identité, le SHA-256 des octets reçus (minuscules, calculé par le serveur — jamais fourni par le client). Codes : 400 absente/vide, 413 trop grande (refusée pendant la réception du fichier), 415 type refusé (PDF, SVG, GIF, TIFF, HEIC, ZIP, exécutable, HTML, JavaScript, fichier renommé, type ≠ contenu). Ordre de contrôle = ordre du formulaire : cartes d'identité, puis cartes étudiantes ; rien n'est écrit tant que les cinq images ne sont pas valides.

## 5b. Règles de l'édition 2 (téléphone, RFID, BAC, noms)

Toutes vivent **une seule fois**, dans [`shared/aivex/contract-v4.js`](../shared/aivex/contract-v4.js) ; le formulaire ([`registrationModel.js`](../src/pages/aivex/register/registrationModel.js)) et l'API (`validateRegistrationV4`) appellent les mêmes fonctions — aucune expression régulière n'est recopiée dans React ni dans l'API (vérifié par test). Le formulaire est la couche d'ergonomie ; **l'API refait chaque contrôle avant toute écriture** : `400` + `field`, et rien n'est ouvert, stocké, généré ni émis.

| Règle | Fonctions / constantes | Valeur canonique |
|---|---|---|
| Téléphone (responsable des activités, chef de délégation, chauffeur, 3 étudiants) | `normalizePhone`, `isValidPhone`, `isValidPhoneInput`, `PHONE_PATTERN` | `^0[567][0-9]{8}$` — 10 chiffres, 05 / 06 / 07 |
| RFID **étudiant** | `isValidStudentRfid`, `STUDENT_RFID_PATTERN` | `^[0-9]{8}$` — texte, zéros initiaux conservés |
| RFID **chef de délégation / chauffeur** | `isValidDelegationRfid`, `LIMITS.delegationRfid` | texte, trim, 1–64, sans caractère de contrôle (**inchangé**) |
| Année du BAC | `BAC_YEAR_RANGE`, `isValidBacYear`, `bacYearChoices` | entier de 2019 à 2026 |
| Nom de personne (6 champs) | `normalizePersonName`, `personNameIssue`, `isValidPersonName` | lettres Unicode + espaces, 3–120 |

**Téléphone.** Les séparateurs inoffensifs saisis — espaces, tirets, points — sont retirés **avant** la validation : `0555 12 34 56`, `0555-12-34-56` et `0555.12.34.56` deviennent `0555123456`, et c'est cette valeur canonique qui est validée, comparée (empreinte d'idempotence : la même inscription retapée avec d'autres séparateurs est un rejeu, pas un conflit) et stockée. Tout le reste rend le numéro invalide : la notation internationale n'est **pas** une représentation alternative (`+213555123456` est refusé, jamais réécrit en `0555123456`), les parenthèses ne sont pas des séparateurs, seuls les chiffres ASCII 0–9 comptent (pas les chiffres arabo-indiens), un nombre JSON n'est pas un téléphone. Refusés : `055512345`, `05551234567`, `0455123456`, `0855123456`, `1234567890`, `05551234AB`. **Doublons autorisés** : aucune règle d'unicité n'a été spécifiée, donc aucune n'est inventée (le chef de délégation et le chauffeur peuvent partager un numéro ; un étudiant peut avoir celui du responsable).

**RFID étudiant ≠ RFID de la délégation.** Deux validateurs distincts, volontairement : `isValidStudentRfid` (exactement 8 chiffres) ne s'applique qu'aux **étudiants**. Le RFID du chef de délégation et du chauffeur garde sa règle technique (`isValidDelegationRfid`, 1–64 caractères) car aucun besoin métier ne confirme le même format pour eux (décision ouverte n°1) ; il n'existe plus de validateur générique « isValidRfid » qu'on pourrait appliquer au mauvais type de personne. Un RFID est un **identifiant, pas un nombre** : il reste du texte de bout en bout (formulaire, JSON, API, colonne `text`) — `"00123456"` ne devient jamais `123456`. Un nombre JSON est refusé (« must be sent as text »), les espaces internes ne sont pas retirés (`1234 5678` est refusé), seuls ceux de début et de fin le sont. Unicité **entre les 3 étudiants** d'une inscription, contrôlée dans le formulaire et dans l'API ; aucune contrainte entre un étudiant et la délégation (non spécifiée).

**Année du BAC.** Fixe pour l'édition 2 : `BAC_YEAR_RANGE = { min: 2019, max: 2026 }`. Elle ne dépend pas de l'horloge (ni année courante, ni +1) et ne s'étend pas d'elle-même : pour une édition ultérieure, on modifie ce contrat volontairement. Le `<select>` propose exactement ces 8 années (la plus récente d'abord) ; l'API refuse toute autre valeur envoyée à la main (2018, 2027, 1990, `"2023"`, 2023.5…). Un brouillon enregistré avant cette règle qui contiendrait une autre année n'est pas restauré dans le sélecteur.

**Noms de personnes** (responsable des activités, chef de délégation, chauffeur, 3 étudiants). `normalizePersonName` : NFC, caractères de contrôle remplacés par une espace, marques de formatage invisibles supprimées (marques directionnelles, joiners de largeur nulle : elles ne changent aucune lettre, mais collées depuis un texte arabe elles feraient échouer un nom pour une raison invisible, et une inversion de direction peut faire afficher un nom pour un autre), espaces multiples réduites à une, début et fin retirés — `"  Mohammed    Amine  "` devient `"Mohammed Amine"`. **L'orthographe n'est jamais modifiée** : pas de translittération, pas de majuscules ni de minuscules forcées, l'arabe reste de l'arabe. Puis `personNameIssue` : `required` (rien après normalisation), `chars` (autre chose que des lettres et des espaces), `short` / `long` (hors 3–120) ; les caractères sont jugés avant la longueur (`12` n'est pas un nom, quelle que soit sa longueur). « Lettre » = propriété Unicode `\p{L}` (latin accentué, arabe, cyrillique…), avec ses marques combinantes `\p{M}` (voyelles arabes, accents sans forme précomposée) ; un mot commence toujours par une lettre. Refusés : chiffres, ponctuation (tiret, apostrophe, point, virgule…), symboles, soulignement, `@ # / \ *`, emojis. Acceptés : `Mohammed`, `Mohammed Amine`, `عبد الرحمان`, `محمد أمين`, `مُحَمَّد`, `José Núñez`. Refusés : `Mohammed123`, `Mohammed@`, `Mohammed_Amine`, `Mohammed.Amine`, `Mohammed/Amine`, `محمد123`, `عبد-الرحمان`. **À valider avec les organisateurs** : les noms à trait d'union ou à apostrophe (`Jean-Pierre`, `Ait M'Hamed`, `Abd-Errahmane`) sont refusés par cette règle, telle que spécifiée.

**Nom d'équipe : une autre règle.** Pas de « lettres seulement » : `Null Pointers`, `404 Not Found`, `Team_42`, `C++ Crew!` restent valides ; seules la présence, la longueur (2–120) et la normalisation (`normalizeText`) s'appliquent.

**Autres contrôles (audit).** E-mail : syntaxe, ≤ 254, minuscules, **aucune restriction de domaine** ; un caractère de contrôle ou de formatage invisible est refusé (un NUL provoquerait une erreur PostgreSQL). Rôle, code de wilaya et identifiant d'établissement : **valeur exacte** — jamais `trim`, jamais un libellé traduit : le formulaire les prend dans une liste, tout écart est une requête fabriquée. L'établissement officiel est toujours **re-résolu depuis le dataset** : un établissement d'une autre wilaya ou un identifiant inventé (`__proto__`, `constructor`…) est refusé ; `other` n'est admis que si `custom: true`, et inversement. Exactement 3 étudiants en positions entières 1, 2, 3 (`"1"`, `"01"`, `null`, `0`, `4` refusés). `consent === true` exactement, jamais converti (`"true"` refusé). `submissionId` : UUID v4 (un v1 est refusé). Champs inconnus, champs V3 et champs réservés au serveur (dont `reference`) : refusés. Texte libre : jamais de caractère de contrôle conservé (NUL → espace) ; un type inattendu (nombre, tableau, objet…) est un 400 propre, jamais une exception.

**Formulaire.** Erreur sous le champ à la sortie du champ (`onBlur`), à la sortie de l'étape (« Continuer ») et à l'envoi (chaque étape est revérifiée), jamais avant toute interaction. Téléphones : `type="tel" inputMode="tel"` ; RFID étudiant : `inputMode="numeric"` (jamais `type="number"`, qui supprimerait les zéros initiaux) ; ni `maxLength`, ni filtre clavier, ni blocage du collage : une valeur collée doit échouer visiblement (le validateur partagé l'attrape), pas être tronquée en silence. Le nom du responsable des activités (la personne qui remplit le formulaire) accepte l'auto-remplissage `name` ; les autres noms non (ce ne sont pas ceux de l'utilisateur) ; les téléphones ne sont pas auto-remplis (les navigateurs proposent `+213…`, que la règle refuse). Messages FR / EN / AR dédiés : `errPhoneInvalid`, `errStudentRfidInvalid`, `errBacYearInvalid`, `errNameInvalid` (+ `studentRfidHint`, `phoneHint`, `bacYearHint`). Les nombres de ces messages sont ceux du contrat : un test échoue si le contrat change sans que les textes soient revus.

**Base de données : aucune migration.** `phone`, `rfid_number`, `delegation_head_rfid`, `driver_rfid` sont `text` (le zéro initial est préservé), `bac_year` est `smallint`. Les contraintes existantes (téléphones `^\+?[0-9]{9,15}$`, RFID de 1 à 64 caractères, `bac_year` entre 1990 et 2100 et au plus l'année courante + 1) acceptent toutes les valeurs que l'API peut maintenant produire : les nouvelles règles en sont un sous-ensemble (testé). L'API est donc la seule à imposer les formats stricts ; les ajouter en base (`CHECK … NOT VALID`) serait un durcissement possible, non fait ici.

**Inscriptions existantes.** Rien n'est revalidé ni modifié : celles déjà enregistrées ont pu être acceptées avec les anciennes règles (téléphone `+213…`, RFID d'une autre longueur, année du BAC hors 2019–2026, nom avec chiffre) et restent lisibles telles quelles (document Word, Magic Link). Pour les repérer, requête de contrôle en **lecture seule** (éditeur SQL Supabase) :

```sql
select r.reference, r.submitted_at
  from public.aivex_registrations r
 where r.form_version >= 4
   and (r.activity_official_phone !~ '^0[567][0-9]{8}$'
     or r.delegation_head_phone !~ '^0[567][0-9]{8}$'
     or r.driver_phone !~ '^0[567][0-9]{8}$'
     or exists (select 1 from public.aivex_students s
                 where s.registration_id = r.id
                   and (s.phone !~ '^0[567][0-9]{8}$'
                     or s.rfid_number !~ '^[0-9]{8}$'
                     or s.bac_year not between 2019 and 2026)))
 order by r.submitted_at;
```

Tests : [`tests/aivex-validation-rules.test.mjs`](../tests/aivex-validation-rules.test.mjs) (matrice complète sur les fonctions partagées, concordance formulaire ⇔ API sur des valeurs générées, requêtes forgées envoyées directement à l'API, absence de règle recopiée hors du contrat).

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
| `delegation_head_id_card_path/_mime/_size/_sha256`, `driver_id_card_path/_mime/_size/_sha256` | **documents d'identité** (métadonnées seulement, NULLables : `20260923120000_…`). Chemin privé dans `aivex-id-cards`, `image/jpeg` \| `image/png`, taille en octets (1 – 5 Mo), SHA-256 en hexadécimal minuscule. Jamais l'image, une URL, une URL signée, du base64, un numéro lu sur la carte ni un résultat d'OCR. |
| `student_count` (= 3), `consent` (= true) | |
| `registration_status` (`submitted`), `document_status` (`not_generated`) | statuts serveur |
| `current_form_revision` (0), `template_version` | préparés pour le document officiel |
| `source`, `submitted_at`, `created_at`, `updated_at` | serveur |

Contrôles pour `form_version >= 4` : toutes les données officielles présentes, `delegation_head_national_id` et `driver_national_id` **NULL**, empreinte présente. L'unicité par e-mail ne s'applique plus qu'aux lignes `form_version < 4`.

Contrôles des documents d'identité (`aivex_registrations_delegation_head_id_card_check`, `aivex_registrations_driver_id_card_check`) : pour chaque personne, les quatre colonnes sont **toutes NULL** (inscriptions historiques) **ou toutes valides** — jamais un document à moitié enregistré ; le chemin doit valoir `edition-{edition}/{id de l'inscription}/{delegation-head|driver}/{uuid}.{jpg|png}` (une carte ne peut appartenir qu'à sa propre inscription et à sa propre personne) avec une extension cohérente avec le type ; type `image/jpeg|png`, taille 1 – 5 242 880, SHA-256 `^[0-9a-f]{64}$`. Les colonnes restent NULLables **au niveau base** : une règle « NOT NULL » ne saurait distinguer une nouvelle inscription d'une ancienne ; c'est l'API qui exige les deux documents. Les inscriptions existantes n'ont donc aucun document d'identité et n'en reçoivent pas rétroactivement.

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
| `20260923120000_aivex_v4_identity_documents.sql` | 8 colonnes NULLables (`*_id_card_path/_mime/_size/_sha256`), 2 contraintes « tout ou rien », bucket privé `aivex-id-cards`. Aucune policy, aucun `grant`/`revoke`, RLS inchangée. |

Toutes additives et rejouables (aucun `DROP TABLE` / `DROP COLUMN` / `DELETE`). Elles ont été exécutées sur un PostgreSQL 18 local (PGlite) à partir d'un schéma d'origine reconstitué : migrations, ré-exécution, conservation des anciennes lignes, insertion au format V3 pendant la bascule, écriture V4 complète et 12 contraintes vérifiées. Le schéma d'origine réel n'étant pas dans le dépôt, **une exécution sur un projet Supabase de staging reste nécessaire** avant la production.

## 7. Storage

| | |
|---|---|
| Bucket | `aivex-student-cards`, **privé** (forcé par la migration), sans policy pour `anon`/`authenticated` |
| Chemin | `edition-2/{registration_id}/student-{1,2,3}.{jpg,png,webp}` |
| Écriture | service role côté serveur, `upsert: false` |
| Base | `student_card_path`, `student_card_mime`, `student_card_size_bytes` par étudiant |
| Lecture | aucune en Phase 2 ; plus tard par URL signée courte côté serveur. Aucune URL publique (vérifié par test). Les chemins ne sont jamais renvoyés au navigateur. |

**Cartes d'identité** *(documents d'identité)* : bucket **séparé** `aivex-id-cards`, **privé** (forcé par la migration), 5 Mo, `image/jpeg` et `image/png`, sans policy pour `anon`/`authenticated` — séparé de `aivex-student-cards` pour que l'accès aux pièces d'identité puisse être accordé et audité à part. Chemin : `edition-2/{registration_id}/{delegation-head|driver}/{uuid aléatoire}.{jpg|png}` — l'UUID de l'inscription et un UUID tiré par le **serveur** pour chaque fichier ; jamais un nom, un téléphone, un RFID, un e-mail ou un numéro d'identité, jamais rien venu du client. Écriture par le service role, `upsert: false`. Le chemin figure dans la ligne d'inscription **dès son INSERT** (avant l'upload), de sorte qu'une tentative interrompue sait toujours quels fichiers elle devait créer.

## 8. Cartes étudiantes

Obligatoires (3 par inscription), données **internes de vérification** : jamais dans le Word/PDF, jamais publiques, jamais journalisées. Formulaire : un bloc « Student 0N · Student card — Front side » par étudiant, avec nom, type, taille et état (« Valid file ✓ » ou refus détaillé : nom, type, taille, raison), boutons Remplacer / Supprimer. Une carte absente bloque l'étape Étudiants et l'envoi. Les fichiers restent dans l'état React et ne sont jamais écrits dans le brouillon.

## 8b. Documents d'identité (chef de délégation, chauffeur)

Une image de la **carte nationale d'identité** par personne, **obligatoire pour toute nouvelle inscription** — mêmes principes que les cartes étudiantes (données internes de vérification : jamais dans le Word, jamais publiques, jamais journalisées, jamais téléchargeables par le Magic Link ni visibles sur `/aivex/status`), plus **minimisation** : seule l'image est collectée. Rien n'en est lu (ni OCR, ni numéro d'identité, ni date ou lieu de naissance, adresse, photo) ; la base ne garde que chemin privé, type, taille et SHA-256.

**Formulaire.** Étape « Délégation », section séparée « Documents d'identité » après les deux fiches : intitulés « Carte nationale d'identité — Chef de délégation » / « — Chauffeur », consigne « Veuillez importer une image lisible de la carte nationale d'identité. », « Image JPG, JPEG ou PNG. Taille maximale : 5 Mo. », et une note de confidentialité (« … collectés uniquement pour la vérification des membres de la délégation. Ils sont stockés dans un espace privé et ne sont pas publiquement accessibles. ») — FR/EN/AR, **sans durée de conservation ni promesse juridique** puisqu'aucune n'est définie. Par document : `<label>` réel, `aria-describedby`, `aria-invalid`, erreur annoncée (`role="alert"`), nom + type + taille du fichier, Remplacer / Supprimer, glisser-déposer. L'image n'est **pas affichée** (ni aperçu, ni URL d'objet) ; l'écran de relecture n'indique que « ✓ Jointe » + type et taille. Un brouillon ne garde jamais le fichier ni son nom, seulement le fait qu'une carte avait été jointe (pour la redemander après un rechargement).

**Écriture (idempotence et échecs).** L'inscription n'est complète que si ses **3 étudiants** existent, et ils sont insérés **en dernier**, après les 5 fichiers : impossible d'avoir une inscription « réussie » à laquelle il manque un document. Un échec (stockage ou base) supprime les fichiers de la tentative — les deux chemins d'identité prévus, envoyés ou non — puis la ligne. **Si un fichier n'a pas pu être supprimé, la ligne est conservée** (incomplète) : c'est la seule trace de l'endroit où il se trouve ; la tentative suivante avec le même `submissionId` (après 3 minutes) ou un opérateur le supprime. Un rejeu d'une inscription complète répond 200 sans rien renvoyer au stockage. `registerV4` refuse d'écrire une inscription sans les deux cartes validées, et un store qui ne conserve pas l'identifiant d'inscription généré par le serveur (les chemins le nomment).

**Anciennes inscriptions.** `delegation_head_id_card_*` et `driver_id_card_*` restent NULL : acceptable pour l'historique, rien n'est réclamé rétroactivement.

**Compatibilité administration (Phase 5C).** Le modèle est prêt — chemin, type, taille et SHA-256 par personne, rattachés à l'inscription — mais **aucune lecture n'existe encore** : à concevoir avec l'accès administrateur (lecture côté serveur uniquement, `Content-Type` image fixe et `nosniff`, jamais de chemin renvoyé au navigateur).

## 9. Mapping Word

30 variables, données officielles uniquement : édition et dates (`aivex_settings`), `registration_reference`, wilaya, établissement, équipe, nom, téléphone et e-mail du responsable, chef de délégation et chauffeur (nom, téléphone, RFID), 3 étudiants (nom, téléphone, année du BAC, RFID), date limite et e-mail de dépôt. **Aucune** variable de carte (étudiante ou d'identité), de n° d'identité, de matricule ou de niveau : les colonnes `*_id_card_*` sont dans `WORD_EXCLUDED_FIELDS_V4` et le générateur ne lit que les colonnes que le mapping nomme (test).

### 9.1 Génération du document officiel (Phase 4)

| Élément | Fichier |
|---|---|
| Template officiel (version `aivex-participation-template-02`) | [`public/word-form/aivex-participation-template-01.docx`](../public/word-form/aivex-participation-template-01.docx) |
| Rendu DOCX | [`api/_lib/aivex-document-template.js`](../api/_lib/aivex-document-template.js) |
| Orchestration, statuts, présentation des dates | [`api/_lib/aivex-document-generation.js`](../api/_lib/aivex-document-generation.js) |
| Accès Supabase (claim atomique, Storage, métadonnées) | [`api/_lib/aivex-document-store.js`](../api/_lib/aivex-document-store.js) |
| Téléchargement sécurisé (`POST /api/aivex/document`) | [`api/aivex/document.js`](../api/aivex/document.js) |
| Relance administrative | [`scripts/aivex-retry-documents.mjs`](../scripts/aivex-retry-documents.mjs) |
| Migration | [`20260920120000_aivex_v4_generated_documents.sql`](../supabase/migrations/20260920120000_aivex_v4_generated_documents.sql) |
| Tests | [`tests/aivex-document-generation.test.mjs`](../tests/aivex-document-generation.test.mjs) |

**Template.** Corrigé une fois, trois interventions ciblées (tout le reste du .docx est identique octet pour octet) :
1. `{{edition_name}}`, `{{event_start_date}}`, `{{event_end_date}}` et `{{activity_official_name}}` sont maintenant dynamiques ; les 30 placeholders sont chacun d'un seul tenant ;
2. le tableau des étudiants était **flottant** (`w:tblpPr`) : l'intitulé « تأطير الوفد » s'enroulait lettre par lettre à côté ; tableau rendu *inline* comme celui de la délégation ;
3. les cellules « سنة البكالوريا » étaient en 9 pt (réduites pour loger le long placeholder), contre 14 pt pour le reste de la ligne : remises à 14 pt.

**Rendu DOCX.** Substitution littérale `{{clé}}` → valeur (échappée XML) dans chaque partie XML du .docx, avec `jszip` (MIT) comme seule nouvelle dépendance. Un placeholder sans donnée, ou une donnée sans placeholder, fait échouer la génération : un document officiel n'affiche jamais « {{…}} ». `docxtemplater` n'est pas utilisé : inutile une fois le template propre, et sa version libre est sous AGPL-3.0.

**PDF : manuel, hors application.** L'application produit **un seul** document automatiquement : le DOCX. Aucune conversion DOCX → PDF n'est faite ni tentée (pas de LibreOffice, Microsoft Graph, CloudConvert ni autre service) ; aucune ligne `pdf` n'est créée. L'établissement télécharge le DOCX, le convertit ou l'imprime lui-même, le fait signer et cacheter. La table et le bucket acceptent toujours `pdf` / `application/pdf` pour un futur dépôt du document **signé** (§10 `signed_document_uploaded`), qui n'est pas implémenté.

**Lignes `pdf` historiques.** Les inscriptions générées avant ce changement ont une ligne `aivex_generated_documents` `document_type = 'pdf'`, `generation_status = 'failed'`, `error_code = 'pdf_conversion_not_configured'`, sans fichier. Elles sont **héritées et inertes** : rien ne les lit ni ne les réécrit. Conservées volontairement (pas de migration destructive) ; les supprimer éventuellement est une décision manuelle.

**Dates.** `event_*_date` (`date`) sont imprimées telles quelles (`YYYY-MM-DD`) ; `submission_deadline` (`timestamptz`) est imprimée comme sa date calendaire à Alger (`Africa/Algiers`), au même format — jamais comme un horodatage machine. Le format d'affichage reste une décision ouverte (§15).

**Workflow.** Après une inscription valide (`registration_status = submitted`) :

```
not_generated ──claim──▶ generating ──docx OK──▶ awaiting_signature
                              └──────docx KO──▶ generation_failed ──(rejeu du même submissionId / téléchargement / script)──▶ generating
```

- Le claim est un `UPDATE … WHERE … RETURNING` atomique : un seul appelant génère ; `not_generated`, `generation_failed`, ou `generating` inchangé depuis plus de 3 min (tentative morte) sont repris ; `awaiting_signature` et au-delà ne sont jamais régénérés.
- Un échec de génération **ne touche jamais l'inscription** (ni suppression, ni rollback, cartes conservées) et **ne change pas la réponse** de l'API : `201 { success, reference }` reste le contrat.
- Relance : automatiquement au rejeu du même `submissionId` ou à une demande de téléchargement ; administrativement avec `node scripts/aivex-retry-documents.mjs` (liste seule) puis `--apply`.
- `document_status` suit le DOCX : `awaiting_signature` = **la fiche officielle Word est prête à être téléchargée**, puis signée et cachetée à la main. Aucun statut ne dépend d'un PDF.

**Stockage.** Bucket **privé** `aivex-generated-forms`, `edition-{edition}/{registration_id}/{reference}.docx` (MIME `application/vnd.openxmlformats-officedocument.wordprocessingml.document`) ; table `aivex_generated_documents` (une ligne `docx` par inscription ; une relance met la ligne à jour). Aucune URL publique ni signée ; le chemin, le bucket et la table n'atteignent jamais le navigateur. Les cartes étudiantes n'entrent jamais dans le document.

**Téléchargement.** Écran de succès : « Votre fiche officielle a été générée au format Word. » + bouton « 📄 Télécharger la fiche officielle » + consigne (convertir ou imprimer, faire signer et cacheter). Le navigateur envoie `POST /api/aivex/document` `{ reference, submissionId }` — en corps JSON, jamais dans une URL. Le serveur retrouve l'inscription par **les deux** (la référence seule, imprimée sur papier, ne suffit pas ; le `submissionId` n'est connu que de l'onglet qui a soumis et n'apparaît dans aucune réponse), lit le fichier avec la clé serveur et le renvoie en pièce jointe (`fiche-officielle-{reference}.docx`, `Cache-Control: no-store`). Couple inconnu ou discordant : même 404. DOCX pas encore `generated` : une tentative de génération idempotente (claim), sinon 409. Contrôle d'origine et limite de débit (20 / 15 min / IP) comme l'inscription ; journaux : étape + code uniquement. Limite assumée : après fermeture ou réinitialisation de l'onglet, le `submissionId` est perdu et le téléchargement n'est plus proposé (le DOCX reste conservé dans le bucket privé ; un renvoi passe par les organisateurs).

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

**Échec en cours d'écriture** (upload ou insertion des étudiants) : les cartes déjà envoyées (étudiantes **et** d'identité) et l'inscription sont supprimées (nettoyage compensatoire), réponse 500 générique — sauf si un fichier n'a pas pu être supprimé : la ligne est alors conservée (§8b). Une tentative morte (≥ 3 min) est découverte au rejeu : ses cartes étudiantes (chemin déterministe) et ses cartes d'identité (chemins enregistrés dans la ligne) sont supprimées, puis l'inscription est refaite.

## 12. Sécurité et confidentialité

- `SUPABASE_SECRET_KEY` uniquement dans l'environnement serveur ; les variables `VITE_`/`INFINITY_`/`AIVEX_` sont publiques et lues statiquement.
- Conservés : POST seul, contrôle d'origine (production), rate limit (5 / 15 min / IP), honeypot (succès neutre sans écriture), limites mémoire multipart (5 fichiers, 5 Mo chacun, refusés pendant la réception).
- Validation serveur complète : UUID, versions, objets fermés, types réels des fichiers, taille, nombre de fichiers.
- Documents d'identité : jamais d'URL publique ni signée, jamais de chemin ou de secret renvoyé au navigateur, jamais de contenu, chemin, nom de fichier ni checksum dans les journaux (une étape et un code, vérifié par test sur chaque chemin d'échec), aucune lecture par le Magic Link ni par `/aivex/status`.
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

**Phase 4 (documents).** Appliquer `20260920120000_aivex_v4_generated_documents.sql`, puis déployer. L'ordre n'est pas bloquant : sans cette migration, les inscriptions continuent de réussir et leurs documents passent en `generation_failed`, relançables ensuite avec `scripts/aivex-retry-documents.mjs --apply`. Renseigner aussi la ligne `aivex_settings` de l'édition 2 (nom, dates, date limite, e-mail) : sans elle, ces champs sortent vides dans le document.

**Documents d'identité (2026-09-23).** Appliquer `20260923120000_aivex_v4_identity_documents.sql` (SQL editor Supabase) **avant** de déployer : le nouveau code sélectionne et insère les colonnes `*_id_card_*`, donc une inscription répondrait 500 tant qu'elles n'existent pas. La migration est additive et rejouable ; ses requêtes de contrôle (lecture seule) figurent en fin de fichier : colonnes NULLables, aucune inscription existante modifiée, contraintes actives, bucket `aivex-id-cards` privé, aucune policy `storage.objects`. Déployer ensuite frontend et API ensemble ; les onglets restés ouverts sur l'ancien formulaire reçoivent un 400 « rechargez la page ». Après la première vraie inscription, vérifier qu'elle a les deux documents (requête fournie dans la migration). La migration a été exécutée sur PostgreSQL (PGlite) à la suite complète des migrations à partir d'un schéma d'origine reconstitué : idempotence, lignes existantes inchangées octet pour octet, droits et RLS inchangés, 14 valeurs invalides refusées ; **une exécution sur un projet Supabase de staging reste recommandée** (le schéma d'origine réel n'est pas dans le dépôt).

**DOCX seul + téléchargement.** Aucune migration : le schéma existant suffit (la contrainte `document_type in ('docx','pdf')` et le MIME PDF du bucket restent, pour un futur dépôt signé). Déployer suffit : nouvelle fonction `api/aivex/document.js` (déclarée dans `vercel.json` avec le template inclus), mêmes variables `SUPABASE_URL` / `SUPABASE_SECRET_KEY`, aucune variable PDF.

## 15. Décisions métier ouvertes

1. RFID **du chef de délégation et du chauffeur** : format exact (aujourd'hui seulement 1–64 caractères, non confirmé), casse, unicité sur toute l'édition, partage possible entre étudiant et délégation. *(Le RFID étudiant est décidé : exactement 8 chiffres.)*
2. ~~Borne haute de l'année du BAC~~ **Décidé** : 2019 à 2026 pour l'édition 2, fixe ; à revoir volontairement à chaque édition.
3. Cartes : PDF accepté ? recto seul ? durée de conservation.
4. ~~Téléphones : format saisi ou E.164~~ **Décidé** : national à 10 chiffres (05 / 06 / 07), imprimé tel que stocké.
5. Template Word : le rôle reste présenté par l'intitulé officiel commun ; formats des dates à confirmer.
6. Valeurs officielles de `aivex_settings` (édition 2).
7. Conservation des numéros d'identité des inscriptions V3.
8. Limite Vercel de 4,5 Mo par requête : compression navigateur (actuelle) ou upload direct vers Storage. Avec 5 images le budget passe à ≈ 800 Ko chacune (contre 1,2 Mo pour 3).
9. Cartes d'identité : durée de conservation (aucune n'est définie ni annoncée), qui peut les lire et avec quelle traçabilité, recto seul ou recto-verso, WEBP accepté ou non (refusé aujourd'hui).
10. Noms de personnes : la règle « lettres et espaces » refuse le trait d'union et l'apostrophe (`Jean-Pierre`, `Ait M'Hamed`, `Abd-Errahmane`) — à confirmer, car de tels noms sont courants.
11. Chiffres arabo-indiens (٠–٩) : non acceptés dans les téléphones et les RFID (seuls 0–9) ; ils ne sont pas convertis.
12. Unicité des téléphones : aucune règle imposée (le chef de délégation et le chauffeur peuvent partager un numéro).
13. Contraintes de format en base (`CHECK … NOT VALID` sur téléphone, RFID étudiant, année du BAC) : non ajoutées, l'API fait foi ; à décider avec les migrations de la phase d'administration.
