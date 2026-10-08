# Infinity administrator notifications

This subsystem gives authenticated administrators a persistent notification history and, when they explicitly opt in, privacy-safe Web Push alerts. The database is authoritative: browser state and the former live review queue are not used as notification storage.

## Architecture

- `admin_notifications` stores one immutable, deduplicated event.
- `admin_notification_recipients` stores each administrator's delivered, seen, read, and archived state.
- `admin_push_subscriptions` stores private, per-device Push API credentials. Browser roles have no direct table access.
- `admin_create_notification(...)` atomically creates the event and resolves active recipients according to role and category preferences.
- `/api/admin/notifications*` uses the existing HttpOnly administrator session, same-origin mutation checks, strict JSON validation, and the server Supabase credential.
- `public/admin-sw.js` handles push and notification clicks only. It deliberately has no `fetch` handler and therefore does not cache or intercept the public site.
- The dashboard refreshes when focused, brought online, made visible, or notified by the service worker, with a 60-second visible-tab fallback.

Push is optional. If VAPID is absent, unsupported, or denied, the persistent in-dashboard Notification Center continues to work.

## Retention and cleanup

The follow-up retention migration provides the service-role-only `admin_prune_notifications()` function. It removes notifications older than 90 days, plus explicitly expired rows; recipient rows cascade with them. The migration intentionally does not create an unreviewed scheduler. Call this function from the project's trusted scheduled operations or during an approved maintenance run.

## Event and recipient matrix

| Event | Source | Recipients | Deep link |
| --- | --- | --- | --- |
| New Join application | `join` | `super_admin` with Join alerts enabled | Exact application record |
| Signed AIVEX document uploaded | `aivex` | `super_admin`, `administrator`, `reviewer` with AIVEX alerts enabled | Exact AIVEX reference |
| AIVEX corrections resubmitted | `aivex` | Same AIVEX roles | Exact AIVEX reference |
| AIVEX document generation failed | `aivex` | Same AIVEX roles, excluding the acting administrator when known | Exact AIVEX reference |
| Test notification | `system` | Requesting administrator only | Notification settings |

Business operations remain successful if notification creation or Push delivery fails. Each event has a stable deduplication key, so retries do not create a second recipient or Push wave.

## Required configuration

1. Apply `supabase/migrations/20261015120000_admin_notification_system.sql` after `20261012120000_admin_user_preferences.sql`.
2. Generate one VAPID key pair outside the repository:

   ```sh
   npx web-push generate-vapid-keys
   ```

3. Configure the following values locally and in the appropriate Vercel environments:

   ```dotenv
   VITE_WEB_PUSH_VAPID_PUBLIC_KEY=<public key>
   WEB_PUSH_VAPID_PRIVATE_KEY=<private key>
   WEB_PUSH_VAPID_SUBJECT=mailto:<monitored contact>
   ```

The private key must never use a `VITE_` prefix or be committed. Changing the public key requires a frontend rebuild and users must register their devices again.

## API contract

- `GET /api/admin/notifications?source=aivex|join|system|security&unread=true&cursor=<ISO>&limit=1..30`
- `POST /api/admin/notifications/actions`
  - `{ "action": "mark_seen", "notificationIds": ["<uuid>"] }`
  - `{ "action": "mark_read", "notificationId": "<uuid>" }`
  - `{ "action": "mark_all_read" }`
  - `{ "action": "archive", "notificationId": "<uuid>" }`
  - `{ "action": "test" }`
- `GET /api/admin/notifications/push-subscription`
- `POST /api/admin/notifications/push-subscription` with a standard Push API subscription and optional device label
- `DELETE /api/admin/notifications/push-subscription` with `{ "endpoint": "https://..." }`

All state changes are scoped to the current authenticated administrator. A user cannot read or mutate another recipient's state or device subscription through these routes.

## Privacy and security properties

- Push titles and bodies contain no applicant names, email addresses, phone numbers, document contents, institution names, or identity-document data.
- Notification payloads are allowlisted; only a validated AIVEX reference may be exposed to the UI.
- Deep links are same-origin `/admin` paths validated independently on the server, client, and service worker.
- Push endpoints and encryption keys are service-role-only data protected by RLS and explicit grants.
- `404` and `410` Push responses revoke the expired subscription; transient failures are counted without deleting it.
- Browser permission is requested only after the administrator presses **Enable browser notifications**.
- Signing out revokes and unsubscribes the current browser device before the server session is closed; other registered devices are unaffected.
- When an admin window is visible, the worker sends an in-app message and suppresses the duplicate native notification.

Password changes revoke other admin sessions, but subscriptions do not currently carry a reliable session identifier. Consequently, the implementation does not guess which remote device rows belonged to those sessions. Administrators can revoke each listed device, and explicit logout revokes the current browser.

## Push troubleshooting

- **Not configured:** confirm all three VAPID values exist in the same deployment environment and rebuild after changing the public key.
- **Permission blocked:** re-enable notifications in the browser's site settings; the application will not repeatedly prompt.
- **Unsupported on iPhone/iPad:** install the administration site to the Home Screen where the platform requires it, then use the installed app. Detection remains standards-based rather than browser-specific.
- **No background alert:** verify OS notification permissions, browser background policy, battery restrictions, and that the device remains listed in Settings. Delivery ultimately depends on the browser/OS push service.
- **Subscription error:** disable and re-enable the current device. Permanent `404/410` endpoints are automatically revoked by the server.

## Manual verification

Use a non-production Supabase project and HTTPS (or localhost):

1. Sign in as a super administrator. Open **Settings → Notifications**, save category choices, enable this device, and send a test notification.
2. Verify one persistent row, one recipient row, one unread badge increment, a privacy-safe native alert when the admin tab is hidden, and no duplicate native alert when it is visible.
3. Click the native alert and verify it focuses an existing admin tab or opens the safe admin route.
4. Submit one Join application. Verify only eligible super administrators receive it and that the exact record opens.
5. Complete the signed-document and corrections flows for AIVEX. Verify all eligible AIVEX roles receive one event and the exact reference opens.
6. Force a document-generation failure in the test environment. Verify the business response shape is unchanged and one warning event is created.
7. Replay each business request and confirm the deduplication key prevents a second event and second Push wave.
8. Disable the AIVEX or Join category for one account, repeat the matching event, and confirm that account is not selected as a recipient.
9. Disable Push on one device and confirm its subscription is revoked while dashboard notifications still arrive.
10. Check mobile, RTL AIVEX, keyboard focus, reduced motion, empty, loading, error, and pagination states.

Automated validation:

```sh
npm run lint
npm test
npm run build
```

## Rollout and rollback

Roll out in this order: database migration, server environment variables, server/frontend deployment, then opt in on a test administrator device. Do not prompt every user during rollout.

For a non-destructive rollback, remove the three VAPID values and redeploy. This disables native delivery while preserving the Notification Center and all history. The feature code can then be rolled back independently; leave the tables in place until retention and audit requirements permit a separate, reviewed cleanup migration.
