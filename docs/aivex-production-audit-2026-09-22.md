# AIVEX production audit — 2026-09-22

Scope: read-only checks through the configured production Supabase project. No registration, row, setting, bucket, object, policy or migration was changed. No PII, token, filename or Storage path is reproduced here.

## Migration capabilities

| Capability | Status | Evidence available read-only |
|---|---|---|
| V4 registration contract (`20260918120000`) | PASS | Edition/form/status columns and V4 registrations are queryable. |
| V4 write path (`20260919120000`) | PASS | Submission id/fingerprint contract and exactly-three-student production rows are present. |
| Generated documents (`20260920120000`) | PASS | Generated-document table is queryable; 5 rows observed. |
| Magic Links (`20260921120000`) | PASS | Magic-Link table is queryable; 5 rows observed. No raw token values inspected/output. |
| Signed documents (`20260922120000`) | PASS | Submitted-document table is queryable; 6 rows observed. |
| Identity documents (`20260923120000`) | PASS | Identity metadata columns and the private ID-card bucket are present. Values were not output. |
| Direct upload sessions + retention (`20260924120000`) | MISSING | New local migration was not applied automatically, as required. |

Observed aggregate consistency: 5 registrations and 15 students, matching exactly three students per registration. These are production records, not automatically classified as test data and not deleted.

## Bucket audit

| Bucket | Public | Limit | MIME allow-list | Result |
|---|---:|---:|---|---|
| `aivex-student-cards` | false | 5 MB | JPEG, PNG, WEBP | PASS |
| `aivex-id-cards` | false | 5 MB | JPEG, PNG | PASS |
| `aivex-generated-forms` | false | 10 MB | DOCX, PDF | PASS |
| `aivex-signed-forms` | false | 10 MB | PDF, JPEG, PNG | PASS |

No new staging bucket is planned; direct uploads use isolated `staging/` prefixes in these private buckets. The application never gives the browser a service-role key. Anonymous `storage.objects` policy grants could not be conclusively enumerated through the available REST credential, so launch requires a privileged SQL Editor policy check; private bucket flags alone are not treated as proof of policy absence.

## RLS audit

Local migrations enable RLS and revoke `anon`/`authenticated` access for AIVEX tables, including the new session table. Production table reachability through the service credential was confirmed, but live `pg_class`, grants and `pg_policies` were not exposed through the available REST interface. Therefore:

- service-role server access: PASS;
- `anon`/`authenticated` live posture: NOT VERIFIED — privileged SQL audit required;
- broad candidate database reads in frontend code: PASS (none).

## Edition 2 settings

| Setting | Production value | Desired launch value | Result |
|---|---|---|---|
| `registration_enabled` | false | true | DIFFERENT |
| `registration_open_at` | null | `2026-09-21T00:00:00+01:00` | MISSING |
| `registration_close_at` | null | `2026-10-25T23:59:59+01:00` | MISSING |
| `document_upload_enabled` | false | true | DIFFERENT |
| `signed_document_deadline` | null | `2026-10-25T23:59:59+01:00` | MISSING |
| `submission_email` | placeholder | official approved address | BLOCKED |

No contradictory approved production date was found: the three date fields are null. This does not authorize changing them; campaign activation remains a reviewed manual step after migration/deployment checks and official e-mail confirmation.

## Blocking finding

BLOCKER: OFFICIAL AIVEX SUBMISSION EMAIL REQUIRED  
WHY: `aivex_settings.submission_email` contains a placeholder; inventing an address could misdirect official documents.  
REQUIRED ACTION: an authorized university/AIVEX owner must provide and approve the exact official address, then an authorized operator must update edition 2 and verify it before enabling registration/document uploads.

## Required privileged pre-launch queries

In Supabase SQL Editor, an authorized operator must read (not infer) migration history, table RLS flags, table grants, all AIVEX policies in `pg_policies`, and all `storage.objects` policies affecting the four buckets. Save a sanitized PASS/MISSING/DIFFERENT report. Do not copy candidate rows or object names into the report.
