# Nested Flow — Release Checklist

Run before any deployment. An item is ticked only when the command was actually
run and its output read.

## Automated gates

```bash
pnpm install --frozen-lockfile
pnpm lint            # zero errors, zero warnings
pnpm format:check
pnpm typecheck
pnpm audit           # advisories triaged or resolved
pnpm db:migrate      # against a copy of production, not production
pnpm test            # unit + integration, real PostgreSQL
pnpm build
pnpm test:e2e        # production build, real browser
```

`pnpm verify` chains lint → typecheck → test → build.

## Current status — 2026-09-21

| Gate                | Result                                                    |
| ------------------- | --------------------------------------------------------- |
| `pnpm lint`         | ✅ clean, 0 warnings                                      |
| `pnpm format:check` | ✅ clean                                                  |
| `pnpm typecheck`    | ✅ clean                                                  |
| `pnpm audit`        | ✅ no known vulnerabilities                               |
| `pnpm test`         | ✅ **348 passing** (258 app + 81 domain + 9 tokens)       |
| `pnpm test:e2e`     | ✅ **58 passing**, Chromium, production build             |
| `pnpm build`        | ✅ 24 routes                                              |
| Migrations          | ✅ 9 applied to a clean database                          |
| CI workflow         | ⚠️ **never executed** — written, unverified as a workflow |

Every gate above passes **locally, in a development environment**. None of it
says anything about a deployed origin, because nothing has been deployed.

## Before a first public deployment

### Blocking

- [x] **Resolve the product name.** Renamed to **Nested Flow** on 2026-09-23,
      after `docs/NAME-RESEARCH.md` found an active "Kylix Finance" in the same
      sector plus a registered Borland mark.
- [ ] **Clear the new name.** A preliminary web scan was run on 2026-09-23
      (`docs/NAME-RESEARCH.md`): no same-sector collision, but "nested flow" is
      a generic term of art in software and a NestedFlow test-automation tool
      already exists. **No register search and no domain check were possible**
      from the build environment. Still blocking: a real clearance search in
      classes 9 and 36, in every intended market.
- [ ] **Legal review** of `src/app/legal/terms` and `src/app/legal/privacy`.
      Both are drafts and say so.
- [ ] **Confirm launch markets** and take advice on the age policy for each
      (`docs/AGE-POLICY.md`).
- [ ] **Decide the migration rollback strategy** (D-15). drizzle-kit generates
      forward migrations only.
- [ ] **Decide on field-level encryption at rest** (D-10) — much harder to
      retrofit once real data exists.
- [ ] **Set `TRUST_PROXY_HEADERS=true`** and put a proxy in front that rewrites
      `X-Forwarded-For`, or accept that per-IP rate limiting does not work.

### Configuration

- [ ] Generate a fresh `AUTH_SECRET` (`openssl rand -base64 48`). Never reuse
      the development value.
- [ ] Separate databases and separate credentials for staging and production.
- [ ] Database role limited to `SELECT/INSERT/UPDATE/DELETE` on the application
      schema — not a superuser, and not the migration role.
- [ ] `APP_URL` set to the real HTTPS origin, so the `__Host-` cookie prefix and
      HSTS activate.
- [ ] TLS terminated, HTTP redirected to HTTPS.

### If enabling Google sign-in

- [ ] Create an OAuth 2.0 Web application client in a Google Cloud project.
- [ ] Register the exact redirect URI `${APP_URL}/api/auth/google/callback`.
- [ ] Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
- [ ] Complete Google's verification if requesting sensitive scopes (the current
      scopes — `openid profile email` — normally do not require it).
- [ ] Test the full flow in staging, including cancellation and an unverified
      Google address.

### If enabling email

- [ ] Choose a provider, verify a sending domain, configure SPF, DKIM and DMARC.
- [ ] Implement the transport against `Transport` in
      `src/modules/email/service.ts` — the interface exists; no provider is wired.
- [ ] Wire bounce and complaint webhooks into `emailSuppressions`.
- [ ] Verify `List-Unsubscribe` survives the provider (some rewrite headers).
- [ ] Send a real test to each category and confirm gating behaves.
- [ ] Only then enable password reset, which currently does not exist.

### Backup and recovery

- [ ] Automated `pg_dump`, encrypted at rest, retention agreed.
- [ ] **Restore actually rehearsed** into an empty database — an untested backup
      is a hope, not a backup.
- [ ] Recovery time and recovery point objectives written down.
- [ ] Access to backups restricted and logged.

**Status: not done.** No backup exists because nothing is deployed.

### Observability

- [ ] Error monitoring that **redacts** request bodies — those contain financial
      data.
- [ ] Alert on spikes in `auth.signin.failed` and `auth.signup.age_restricted`.
- [ ] Uptime monitoring.
- [ ] Confirm no stack trace or internal error reaches a user; service errors
      are already mapped to fixed copy in the action layer.

### Security

- [ ] Independent security review or penetration test. **Not done.**
- [ ] Verify headers on the deployed origin, not just locally.
- [ ] Confirm the database is not reachable from the public internet.
- [ ] Rotate every credential that has ever appeared in a development
      environment.

## Known limitations at this build

These are real and should appear in release notes rather than being discovered
by users:

1. **No password reset.** No email provider.
2. **No email is sent at all.** The console transport logs and discards.
3. **Google sign-in is inert** unless credentials are configured.
4. **Single base currency.** Foreign-currency rows are stored faithfully but not
   converted; cross-currency transfers are refused rather than guessed at.
5. **No bank, broker, or market-data connection.** Every figure is user-entered.
6. **No CSV import yet** — the schema supports idempotent import via
   `externalId`, but no importer is built.
7. **Web only.** No native mobile or desktop application. Milestones W1–W5
   removed the architectural blockers (a JSON API, bearer sessions, sync
   primitives, a shared domain package and shared design tokens), but no
   mobile client exists and neither iOS nor Android has been built or tested.
8. **No automated backups, monitoring or alerting**, because nothing is
   deployed to attach them to.
9. **No MFA.**
10. **CI has never run.**

## Deployment rule

Never run a destructive database operation against production without an
explicit, recorded instruction and a verified backup taken immediately before.
