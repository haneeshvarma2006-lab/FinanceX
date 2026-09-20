# KyliX — Security Controls

Every control below is implemented and covered by tests. Where something is
**not** done, it says so rather than being omitted.

## Authentication

| Control             | Implementation                                                               | Tested by                           |
| ------------------- | ---------------------------------------------------------------------------- | ----------------------------------- |
| Password hashing    | argon2id, 39 MiB memory / t=3 / p=1, per-hash salt                           | `src/lib/security/password.test.ts` |
| Password policy     | 12-character minimum, no composition maze (NIST 800-63B)                     | `validators.ts`, E2E                |
| Session tokens      | 256-bit, base64url, **only the SHA-256 is stored**                           | `tokens.test.ts`, integration       |
| Session lifetime    | Absolute (30d) **and** idle (72h) deadlines, both enforced                   | `tests/integration/auth.test.ts`    |
| Sign-out            | Row deleted server-side — a captured cookie stops working                    | integration + E2E                   |
| Account enumeration | Identical response and matched timing for unknown-address and wrong-password | integration                         |
| Brute force         | Per-IP and per-account counters, atomic in one SQL statement                 | integration, incl. concurrency      |

## Google OAuth / OIDC

Built on `arctic` (MIT), a reviewed OAuth library, rather than hand-rolled.

| Control                                                               | Why                                                                    |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **PKCE (S256)** on every authorization request                        | A stolen authorization code is useless without the verifier            |
| **State**, hashed and single-use                                      | CSRF on the callback. Deleted as it is read, so a replay finds nothing |
| **OIDC nonce**, bound into the ID token and checked                   | Stops an ID token from another session being replayed into this one    |
| **ID token verified against Google's JWKS**, with issuer and audience | A decoded-but-unverified token is attacker-controlled data             |
| **Fixed redirect URI** derived from `APP_URL`                         | A spoofed `Host` header cannot move the callback                       |
| Handshake rows expire in 10 minutes                                   | Narrow replay window                                                   |

**Account-linking takeover defence:** auto-linking a Google identity to an
existing local account requires `email_verified: true` from Google. Without that
check, anyone able to create a Google account asserting `victim@example.com`
could seize the KyliX account with that address. This is the pre-account-linking
attack and the verified flag is the whole defence. See
`src/modules/identity/linking.ts`.

**Open redirect:** `safeRedirectPath()` rejects absolute URLs, scheme-relative
URLs, backslash paths, and schemes hidden behind leading slashes. It strips
tab/newline/CR **before** validating, because browsers do too — `/\t/evil.example`
resolves to `//evil.example` otherwise. That exact bypass was found by a test
during development and is now a regression case.

## Authorization

**Every repository function takes `userId` as its first argument and filters on
it.** That is the entire tenancy boundary; there is no second layer.

- Enforced by an ESLint rule: importing `drizzle-orm` outside a `repository.ts`
  is an error.
- Enforced by a test in `tests/unit/architecture.test.ts` — **verified to fail
  when violated**, by deliberately introducing a violation.
- An ID belonging to another account reads as **not found**, never "forbidden":
  confirming that an ID exists is itself a disclosure.
- Services re-check ownership of every _referenced_ entity, not just the row
  being written — otherwise an `accountId` from a form would let a caller post
  a transaction into someone else's account.

Covered by 19 dedicated isolation tests (`tenancy`, `finance-isolation`,
`trading` isolation) spanning read, write, update, delete, archive, bulk
operations, and cascade behaviour.

## Input validation

- Zod at every boundary, with explicit length bounds on all strings.
- Server Actions validate independently of the form — the form is a convenience,
  not a control.
- Money arrives as a **string** and is parsed to integer minor units; a
  `z.number()` would put the value through a double first.
- Database `CHECK` constraints back the application rules (enum values,
  non-zero amounts, positive quantities, confidence range).
- The age gate runs server-side before any row is written.

## Injection

- Drizzle parameterises everything. Raw `sql` templates are used only inside
  repositories and interpolate values as bound parameters.
- A test scans for SQL keywords in template literals with interpolation outside
  drizzle's `sql` tag.
- `dangerouslySetInnerHTML`, `eval`, and `new Function` appear nowhere.
- OAuth error codes are looked up in a fixed table; nothing from a query string
  is reflected into a response.

## Transport & headers

Applied to every response by `src/proxy.ts`, asserted on the production build by
E2E:

- `Content-Security-Policy` — per-request nonce, `'strict-dynamic'`, **no
  `unsafe-inline` in `script-src`**, `object-src 'none'`, `frame-ancestors 'none'`,
  `base-uri 'self'`, `form-action 'self'`
- `Strict-Transport-Security` (production only — meaningless over plain HTTP)
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` denying camera, microphone, geolocation
- `X-Powered-By` removed

## Cookies

`httpOnly` + `Secure` + `SameSite=Lax` + `Path=/`. Over HTTPS the cookie uses
the `__Host-` prefix, which the browser enforces — so no subdomain can overwrite
the session cookie, which is the usual route to cookie fixation.

## Secrets

- All configuration via Zod-validated environment variables; the process refuses
  to boot on a missing or malformed secret.
- A test asserts no module outside `env.ts` reads `process.env` for anything but
  `NODE_ENV`.
- A test asserts `.env.example` documents every declared variable — this caught
  two undocumented variables during development.
- A test asserts no client component imports `env`, `security`, `auth`, or any
  repository/service module.
- A test asserts no `console.*` call receives a password, token, or secret.
- No credentials in the repository. `.env` and `.env.test` are gitignored; only
  the placeholder template is tracked.

## Data exposure

- The account export **excludes the password hash and all session token
  hashes** — exporting a credential into a file a user may email themselves is
  of no use to them and is a liability. Asserted by E2E.
- The email log stores subject and category only, never the rendered body.
- Age rejection messages never state the applicant's computed age, which would
  let someone probe for the threshold.
- A rejected under-age sign-up does not retain the date of birth.

## Dependencies

`pnpm audit` — no known vulnerabilities (2026-09-20). One moderate transitive
advisory was resolved by a pnpm override rather than merely documented. Full
inventory in `docs/LICENSES.md`.

## NOT done, and NOT claimed

- **No penetration test.** None has been performed.
- **No third-party security audit.** Nobody outside this work has reviewed this
  code.
- **No compliance certification** — not SOC 2, PCI DSS, ISO 27001, GDPR, or
  India's DPDP Act. None is held, none is in progress, none is implied.
- **No password reset**, because there is no email provider — a reset flow that
  cannot deliver mail is security theatre.
- **No MFA.**
- **No encryption of individual fields at rest** beyond whatever the deployment
  target provides at disk or database level (open decision D-10).
- **No production deployment**, so no production security configuration has been
  exercised.
- **No secrets-management system** — configuration is environment variables,
  which is appropriate for the current stage and not for a real deployment at
  scale.
- **Per-IP rate limiting is ineffective unless `TRUST_PROXY_HEADERS` is enabled
  behind a proxy that rewrites `X-Forwarded-For`.** With it off, unattributable
  traffic falls back to a higher global ceiling. This is a deployment
  requirement that code cannot satisfy on its own.
