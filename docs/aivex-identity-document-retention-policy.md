# AIVEX identity-document retention policy

## Approval status

**Status: PENDING UNIVERSITY APPROVAL**

Approved retention duration:  
**[NOT SET]**

Approved deletion trigger:  
**[NOT SET]**

Approved by:  
**[NOT SET]**

Role:  
**[NOT SET]**

Approval date:  
**[NOT SET]**

Policy version:  
**[NOT SET]**

## A. Facts implemented technically

- AIVEX collects three student-card images and, for the head of delegation and driver, one national identity-card image each. They support manual eligibility/identity verification for the competition.
- Images are stored as objects, never in PostgreSQL. PostgreSQL contains private object metadata only.
- `aivex-student-cards` accepts JPEG/PNG/WEBP up to 5 MB. `aivex-id-cards` accepts JPEG/PNG up to 5 MB. Both are private.
- Direct uploads use a short-lived Supabase signed upload capability restricted to one server-derived `staging/` object. No service-role credential reaches the browser.
- Finalization downloads each staged object server-side, checks actual byte length and magic bytes, reconciles MIME/extension, computes the existing SHA-256 values, and promotes it to the existing private permanent path.
- Paths contain random/session/registration identifiers, not names, phone numbers, e-mails, RFID values or national ID numbers.
- There is no OCR. No national ID number, address, date of birth or other image-derived value is extracted.
- There is no public URL and no persistent read signed URL. Access requires server-side service-role authority.
- Application logs are limited to stage names and technical codes. Tokens, PII, filenames and Storage paths must not be logged.
- A manual purge command exists: `npm run aivex:purge-identity`. It is dry-run by default and requires `--execute` plus complete approval configuration and `identity_document_purge_enabled=true`.
- The purge removes an `aivex-id-cards` object first and clears its four metadata fields only after successful Storage deletion. It deletes neither registrations nor students, student cards, generated DOCX files or signed documents.
- No purge cron or other automatic deletion is configured.
- Technical access is held by the Supabase service-role credential used by the backend and explicitly authorized operators with equivalent project access. Organisational access roles still require university approval.
- Provider encryption, physical data location and international-transfer terms must be confirmed from the university's current Supabase and Vercel contracts/project settings; this repository alone cannot prove them. The current Vercel runtime region documented by the project is `iad1`, which is outside Algeria.

## B. Decisions requiring university/DPO approval

The university/DPO must approve and record:

1. the lawful and precise purpose of each collected image;
2. which named organisational roles may inspect it;
3. the retention duration;
4. the deterministic deletion trigger;
5. any exceptional legal/incident hold procedure and its authorization trail;
6. the responsible data controller and candidate contact;
7. the correction/deletion-request workflow and response deadlines;
8. Supabase/Vercel processing regions, transfers and contractual safeguards;
9. the review frequency for access/audit records;
10. the incident notification and containment process.

The technical configuration fields remain nullable and purge is default-off so absence of approval fails closed. The only implemented trigger name is `registration_submitted_at`; selecting it is a university policy decision, not a technical recommendation.

## Deletion and audit procedure after approval

1. An authorized operator reviews the dry-run counts; the command prints no PII or paths.
2. The operator verifies the edition's approval metadata and exceptional holds outside this script.
3. A second authorized operator approves execution according to university procedure.
4. The operator runs the command with `--execute` from a controlled environment.
5. Failures leave metadata in place for safe retry; successful object deletion is followed by metadata clearing and a purge timestamp.
6. Operators retain only aggregate execution evidence and incident references, never copied identity images.
7. If unauthorized access is suspected, disable relevant access, preserve authorized audit evidence, notify the responsible controller, assess scope, and follow the approved incident plan.

**AUTOMATIC PURGE REMAINS DISABLED UNTIL UNIVERSITY APPROVAL.**
