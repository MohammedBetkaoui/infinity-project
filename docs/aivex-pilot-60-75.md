# AIVEX controlled pilot — 60 to 75 participants

Status: **NOT RUN**. This is a privacy-minimizing plan and result template; it is not evidence of a successful pilot.

## Cohort and coverage

Target 60–75 real students, identified only as `P001` through `P075`:

- 25–30 Android;
- 10–15 iPhone;
- 15–20 Windows/macOS desktop or laptop;
- remaining participants on mixed devices/tablets.

Cover university Wi-Fi, home Wi-Fi, 4G and deliberately weak/slow 4G; Arabic, French and English UI; Arabic, accented Latin and French names; normal phone photos, 3–5 MB cards, and large valid PDF/JPG/PNG signed documents.

Assign every scenario to multiple participant codes: normal registration; refresh/resume; double finalize; connection loss and retry; browser background/resume; slow 4G; QR/second-device flow; Magic Link on another phone; DOCX download/reopen/print/sign/stamp; signed re-upload; correction and `changes_required` re-upload; invalid/oversized/mismatched files; just-before and after close; after signed deadline; Arabic RTL mobile; repeated Magic Link; accidental back navigation.

## Privacy-safe result row

| Participant | Device class | Browser | Network | Language | Scenario | Result | Duration | Error category | Retry | Sanitized note |
|---|---|---|---|---|---|---|---|---|---|---|
| P001 | Android | [version] | 4G | AR | [scenario] | PASS/FAIL | [mm:ss] | [category/none] | yes/no | [no PII] |

Never record a name, phone, e-mail, RFID, card filename, token, Storage path or payload in this log.

## GO / NO-GO criteria

Any critical failure means **NO-GO**: data/secret leak; public identity exposure; retry-created duplicate; lost successful registration; post-close registration; post-deadline signed upload; corrupted registration/document state.

Reliability gates: at least 98% valid registration completion after retry; at least 98% direct upload/finalization after retry; 100% Magic Link association; 100% correct document versioning. UX gates: no blocking RTL, Android or iPhone issue; actionable errors; connection loss is retryable without duplication.

## Monitoring

Use existing Vercel and Supabase operational tools only. Monitor aggregate 4xx/5xx rates, endpoint latency, init/finalize failures, Storage failures, document generation and Magic Link failures, signed-finalize failures, expired/orphan staging sessions, and idempotency conflicts. Never put PII, tokens, filenames or paths into logs.

## Runbook

Before: verify migrations, RLS and all private buckets; confirm official e-mail and campaign dates; confirm backups; require green CI; pin deployment and rollback target.  
During: one technical operator monitors and one organiser supports candidates; categorize incidents; avoid manual database edits.  
After: inspect sanitized errors/incomplete sessions/orphans; verify registration and `students = registrations × 3` counts; verify documents and Magic Links; re-check buckets remain private; write the real pilot report.

Do not mark PASS until real participants completed the plan and every critical/reliability/UX gate was evaluated.
