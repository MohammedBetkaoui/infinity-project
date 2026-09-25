# Infinity Administration authentication

## Status

Prepared in the repository only. The migration is not applied, no production
administrator is created, and `ADMIN_AUTH_ENABLED` remains an explicit rollout
switch.

## Architecture

1. The browser submits username/password to `POST /api/admin/auth/login`.
2. The Vercel Function loads `admin_users` with the Supabase service role and
   verifies the scrypt hash server-side.
3. A 256-bit opaque token is generated. Only its SHA-256 hash is inserted into
   `admin_sessions`; the raw token is returned only in an HttpOnly cookie.
4. `GET /api/admin/auth/session` resolves the cookie on every initial admin
   load. React renders no workspace content until that check succeeds.
5. Every future `/api/admin/*` handler must call `requireAdminSession(req)`.
   React routing is UX protection, never API authorization.

The four public `/api/admin/auth/*` URLs are dispatched by one
`api/admin-auth.js` Vercel Function. This keeps the Vite deployment within the
12-Function Hobby limit without changing the public API contract.

Production cookie: `__Host-infinity_admin_session`; `HttpOnly`; `Secure`;
`SameSite=Strict`; `Path=/`; no `Domain`. Local HTTP development uses the
separate `infinity_admin_session_dev` cookie.

Sessions have a 30-minute idle timeout and an eight-hour absolute lifetime.
`last_seen_at` is touched at most every five minutes. Revoked, expired, inactive
or pre-password-change sessions fail immediately.

## Passwords

Passwords are hashed with Node 22's built-in `crypto.scrypt`: unique 16-byte
salt, `N=65536`, `r=8`, `p=1`, 64-byte derived key. This uses roughly 64 MiB per
verification and avoids a native Argon2 dependency in Vercel Functions. Length
is 12–128 characters (and at most 512 UTF-8 bytes). Password input is never
trimmed, transformed, logged, sent to Supabase, or accepted as a CLI argument.

## Abuse and CSRF protection

- Five consecutive account failures create a 15-minute database lock.
- HMAC-pseudonymous username and IP burst counters are persisted in
  `admin_login_rate_limits`; raw usernames/IPs are not retained there.
- Unknown usernames still execute the same scrypt workload.
- Authentication errors do not reveal whether an account exists.
- Admin POST requests require an exact trusted `Origin`; missing/cross-origin
  headers fail closed. `SameSite=Strict` is an additional layer.
- Authentication responses are `Cache-Control: no-store`.

## Manual production rollout

1. Review and manually apply
   `supabase/migrations/20260925120000_admin_authentication.sql` through the
   project's approved Supabase migration process.
2. Keep `ADMIN_AUTH_ENABLED=false` while applying the migration.
3. On a trusted operator machine, configure server-only `SUPABASE_URL` and
   `SUPABASE_SECRET_KEY`. Never prefix them with `VITE_`.
4. Generate a rate-limit secret of at least 32 random bytes:

   ```sh
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
   ```

   Store the output as the server-only Vercel variable
   `ADMIN_RATE_LIMIT_SECRET`. Do not commit it.
5. Create the first account interactively:

   ```sh
   npm run admin:create-user
   ```

   No default username or password exists.
6. Deploy the code with `ADMIN_AUTH_ENABLED=false`, verify function health,
   then change it to `true` and redeploy/promote through the normal release
   process.
7. Verify anonymous `/admin/overview` redirects to login, valid login works,
   logout revokes the session, and the security section can rotate a password.

`ADMIN_ALLOWED_ORIGINS` is normally empty in production because the browser and
API are same-origin. Use it only for an explicitly reviewed reverse proxy,
as a comma-separated list of exact origins.

## Operator commands

Create an administrator:

```sh
npm run admin:create-user
```

Reset a password and revoke all active sessions:

```sh
npm run admin:reset-password
```

Both commands read credentials interactively from a TTY. They do not accept a
password argument and never print a password or hash.
