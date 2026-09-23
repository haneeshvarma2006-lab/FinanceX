# Deploying Nested Flow to Vercel

**Nothing here has been deployed.** This document was written against the
Vercel documentation and a local production build. No Vercel project exists,
no deployment has been run, and no step below has been executed end to end.
Treat it as a checklist to follow, not a report of something that worked.

What _was_ verified locally: the production build succeeds with the
configuration in this repository, argon2 still runs after being marked
external, and the migrations apply to an empty database.

---

## 1. What is in the repository

| File             | Purpose                                                                   |
| ---------------- | ------------------------------------------------------------------------- |
| `vercel.json`    | Install and build commands, region, headers for the paths the proxy skips |
| `.vercelignore`  | Keeps tests, docs and fixtures out of the upload                          |
| `next.config.ts` | Marks `@node-rs/argon2` external so the native binary is not bundled      |

### Why the region is `bom1`

The base currency is INR and the first market is India, so functions run in
Mumbai to keep the round trip to the database short. **Put the database in the
same region.** A function in Mumbai talking to a database in Virginia pays that
latency on every query, and this app makes several per page.

Region selection may depend on your Vercel plan. If the deployment is rejected
for that reason, remove the `regions` key and accept the default.

---

## 2. A database, and the one thing that will bite you

Any managed Postgres works — Neon, Supabase, RDS. **Use the pooled connection
string, not the direct one.**

This is the failure mode worth understanding before it happens at 2am. A
long-lived server is one process holding one connection pool. A serverless
platform runs many instances at once, and **each instance opens its own pool**.
With the old hard-coded `max: 10`, ten warm instances would open a hundred
connections and exhaust a default Postgres `max_connections`. Sign-in then
fails for everyone, and the logs blame the database rather than the deployment
shape.

The pool size is now configurable. Behind a transaction-mode pooler set:

```
DATABASE_MAX_CONNECTIONS=1
```

and let the pooler do the multiplexing. Without a pooler, keep it small and
size it deliberately against your database's `max_connections`.

If you later see connection pressure anyway, Vercel documents
`attachDatabasePool` from `@vercel/functions`, which ties pool lifecycle to the
function lifecycle:
<https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package>.
**This is not wired up** — it would add a Vercel-specific dependency to the
database path, and it is not something this build could test.

---

## 3. Environment variables

Set these in Project Settings → Environment Variables.

| Variable                   | Value                             | Notes                                              |
| -------------------------- | --------------------------------- | -------------------------------------------------- |
| `DATABASE_URL`             | Your **pooled** connection string | Required. The process refuses to boot without it   |
| `AUTH_SECRET`              | `openssl rand -base64 48`         | Required, ≥32 chars. **Never reuse the dev value** |
| `APP_URL`                  | `https://your-domain`             | Must be the real HTTPS origin — see below          |
| `DATABASE_MAX_CONNECTIONS` | `1` behind a pooler               | Defaults to 10, which is wrong for serverless      |
| `TRUST_PROXY_HEADERS`      | `true`                            | **Set this on Vercel** — see below                 |

### `APP_URL` is not cosmetic

Two things switch on it. The session cookie only takes the `__Host-` prefix
when the origin is `https://`, and HSTS is only sent when the build is not in
development. Point it at the real origin or you silently lose both.

### `TRUST_PROXY_HEADERS` must be `true` here

It defaults to `false` on purpose: with no trusted proxy, a caller can forge
`X-Forwarded-For` and walk past per-IP rate limits. Vercel _is_ a trusted proxy
and overwrites that header, so the safe setting flips. Leave it `false` and
every anonymous request shares one rate-limit bucket, which is the degraded
mode the code falls back to — it will not break, it will just throttle real
users together.

---

## 4. Migrations

Vercel does not run them, and they are deliberately not in the build command:
a build runs on every preview deployment, and migrating a production database
from a preview build is how you lose data.

Run them yourself, against production, after provisioning and before the first
real traffic:

```bash
DATABASE_URL='<direct, non-pooled connection string>' pnpm db:migrate
```

Use the **direct** connection string here, not the pooled one. Migrations take
locks and run DDL; transaction-mode poolers handle that badly.

`drizzle-kit` generates forward migrations only. There is no down migration and
no rollback path — see `docs/OPEN-DECISIONS.md` D-15, which is still open.

---

## 5. After the first deploy, check these

Do not assume any of them:

- [ ] `curl -sI https://your-domain` shows `Strict-Transport-Security` and a
      `Content-Security-Policy` with a fresh `nonce-` value on each request.
- [ ] The session cookie is named `__Host-nestedflow_session`. If the prefix is
      missing, `APP_URL` is wrong.
- [ ] Sign-up, sign-in and sign-out work. Sign-up exercises argon2, which is
      the native module most likely to break in a bundled deployment.
- [ ] `/manifest.webmanifest` and `/icon.svg` both return 200.
- [ ] Rate limiting attributes requests to distinct IPs, not one shared bucket.
- [ ] Watch the database connection count under a little concurrent load.

---

## 6. What is still missing

Deploying does not make this launch-ready. From `docs/RELEASE-CHECKLIST.md`,
still outstanding:

- **No password reset and no email provider.** A user who forgets their
  password is locked out permanently. This alone rules out a public launch.
- **The name is not cleared** — see `docs/NAME-RESEARCH.md`.
- **Legal pages are drafts** and say so on their face.
- **No backups, no monitoring, no external security review.**
- **CI has never run.**

A private staging deployment is reasonable now. A public one is not.
