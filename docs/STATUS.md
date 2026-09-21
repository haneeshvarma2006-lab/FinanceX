# KyliX — Build Status

Last verified: **2026-09-21**. Every result below was produced by running the
command named, in this environment. Nothing is asserted from inspection alone.

## Quality gates — all run

| Gate                | Result                                                    |
| ------------------- | --------------------------------------------------------- |
| `pnpm lint`         | ✅ clean, **0 errors, 0 warnings**                        |
| `pnpm format:check` | ✅ clean                                                  |
| `pnpm typecheck`    | ✅ clean                                                  |
| `pnpm audit`        | ✅ **no known vulnerabilities**                           |
| `pnpm test`         | ✅ **298 passing**, 19 files                              |
| `pnpm test:e2e`     | ✅ **36 passing**, Chromium, production build             |
| `pnpm build`        | ✅ 23 routes                                              |
| Migrations          | ✅ 6 applied to clean databases                           |
| CI workflow         | ⚠️ **never executed** — written, unverified as a workflow |

Integration and E2E tests run against real PostgreSQL databases, not mocks.

## Test inventory — 298 unit/integration + 36 E2E

| Suite                                 | Count | Covers                                                |
| ------------------------------------- | ----- | ----------------------------------------------------- |
| `src/lib/money`                       | 22    | Integer arithmetic, parsing, allocation, precision    |
| `src/lib/security`                    | 13    | argon2id, session tokens, constant-time compare       |
| `src/modules/identity/age`            | 12    | Age policy, boundaries, leap day                      |
| `src/modules/identity/oauth`          | 5     | Open-redirect defence, state hashing                  |
| `src/modules/trading/pnl`             | 27    | P&L for long/short, fees, partial fills, statistics   |
| `tests/unit/env`                      | 17    | Boot-time environment contract                        |
| `tests/unit/architecture`             | 10    | Invariants — verified to fail when violated           |
| `tests/integration/auth`              | 32    | Sign-up, sign-in, sessions, rate limits, age, consent |
| `tests/integration/tenancy`           | 7     | Cross-account isolation (identity)                    |
| `tests/integration/oauth-linking`     | 13    | Account-linking takeover, pending registration        |
| `tests/integration/email`             | 23    | Preferences, suppression, unsubscribe, replay         |
| `tests/integration/finance`           | 14    | Transfers, balances, budgets, revisions               |
| `tests/integration/finance-isolation` | 12    | IDOR across every finance operation                   |
| `tests/integration/trading`           | 12    | Lifecycle, derived aggregates, isolation              |
| `tests/e2e`                           | 23    | Full journeys, security headers, real browser         |

**19 dedicated cross-account isolation tests** span read, write, update, delete,
archive, bulk operations and cascade behaviour.

---

## Security review — performed, findings fixed

An independent security review was run against the codebase. **Two real
vulnerabilities were found, both in the OAuth path, and both are fixed with
regression tests.**

### 1. Pre-account-linking takeover — HIGH 🔴 FIXED

`resolveGoogleIdentity()` auto-linked a Google identity to an existing local
account on an email match, requiring `email_verified` from Google but **not**
that the local account had ever proven the address. Since this build has no
email provider, no local address is ever verified — so any address could be
claimed.

**The attack:** an attacker signs up locally with `victim@example.com` and a
password only they know. The victim later clicks "Continue with Google". Google
correctly asserts the address is theirs, the old code linked the victim's
identity into the attacker's account and signed the victim into it — where
everything they subsequently recorded was readable by the attacker.

**Fix:** auto-linking now requires proof on _both_ sides. An unverified local
account is refused, and the user is told to sign in with their password and link
from Settings. The old code also marked the unverified account as verified as a
side effect of linking, laundering an unproven address; that is gone too.

**Verified:** reverting the fix makes `tests/integration/oauth-linking.test.ts`
fail. Confirmed by actually doing it.

### 2. OAuth state not bound to the browser — MEDIUM 🟠 FIXED

The handshake `state` existed only as a server-side row. The callback accepted
any browser presenting a live state value, so `state` gave replay protection but
**no CSRF protection** — an attacker could start their own flow, capture their
`code` and `state`, and have a victim's browser complete it, planting the
attacker's session in the victim's browser (login CSRF / session fixation).

**Fix:** the raw state is now also set as a short-lived httpOnly, SameSite=Lax
cookie, and the callback requires a constant-time match before consuming the row.

**Related, fixed in the same change:** the `needs_registration` branch parked a
pending identity in `oauth_states` with a **constant** code verifier
(`'pending'`) and a state hash derived from the provider subject — both
computable offline. It now lives in a dedicated `pending_registrations` table
under a random token held only in an httpOnly cookie.

**Also found:** that branch redirected to `/complete-signup`, **a page that did
not exist**. It has been built, and it applies the age gate and consent to the
OAuth path — signing in with Google is not a way around either.

### Verified clean by the review

SQL injection (no raw SQL, no concatenation anywhere), tenancy/IDOR across every
repository, the account export (no credentials), token handling (hashed,
single-use, kind-scoped), ID token verification (JWKS, issuer, audience, nonce),
open redirect, password crypto, mass assignment, XSS.

---

## Security controls implemented

Full detail in `docs/SECURITY.md`. Headlines:

- argon2id passwords; session tokens stored only as SHA-256
- Absolute **and** idle session deadlines; sign-out deletes server-side
- Account-enumeration defence with **matched timing** on unknown accounts
- Two-axis rate limiting, atomic in one SQL statement
- Google OIDC with PKCE, browser-bound state, nonce, and JWKS verification
- Ownership enforced in the data layer, by lint rule **and** by tests proven to
  fail when violated
- Nonce-based CSP with no `unsafe-inline` in `script-src`; full header set
- `__Host-` prefixed, httpOnly, SameSite cookies
- Zod at every boundary with explicit length bounds; DB `CHECK` constraints behind them
- Append-only audit log; append-only financial revision history

## Blocks addressed

| Block                        | State                                                           |
| ---------------------------- | --------------------------------------------------------------- |
| 1 — Defence in depth         | ✅ Implemented and tested                                       |
| 2 — Identity & age           | ✅ Google OIDC, age gate, linking, revocation, deletion         |
| 3 — Legal & IP               | ⚠️ Research done, **name conflict found** — see below           |
| 4 — Financial data & trading | ✅ Integer money, transfers, exact P&L, disclosures             |
| 5 — Email & communications   | ✅ Architecture complete; **no provider configured**            |
| 6 — Premium UI/UX            | ✅ Local fonts, tokens, all states, a11y                        |
| 7 — Functional completeness  | ⚠️ Finance and trading complete; tasks/habits/goals not started |
| 8 — Quality gates            | ✅ All run, results above                                       |

---

## ⚠️ Name conflict — needs a decision

`docs/NAME-RESEARCH.md` records a preliminary search dated 2026-09-20. It found:

- **Kylix Finance** — an active DeFi lending protocol, _same word, same sector_
- **Borland Kylix** — described in public sources as a registered trademark
- A UK trademark record for "KYLIX", owner and status unverified

**Recommendation: change the name before any public use.** It is currently
confined to internal docs and renameable UI strings — no logo, no domain, no
store listing — precisely so this stays cheap.

This is **not** a clearance search. No register was searched, no class was
checked, no domain availability was tested. A trademark attorney must do that.

---

## Not done, and NOT claimed

- **CI has never run.** The workflow is written and every step passes locally.
- **No penetration test.** The review above was a code review, not a pen test.
- **No compliance certification** — SOC 2, PCI DSS, ISO 27001, GDPR, DPDP: none
  held, none in progress, none implied.
- **Age verification is NOT claimed.** A self-declared date of birth is not
  legal age assurance anywhere. See `docs/AGE-POLICY.md`.
- **No email is sent.** No provider is configured; the console transport logs
  and discards. Consequently **no password reset and no email verification**.
- **Google sign-in is inert** unless credentials are configured. None are
  invented; the routes fail honestly and the button is hidden.
- **No bank, broker or market-data connection.** Every figure is user-entered.
- **No rollback migration** (D-15). drizzle-kit generates forward only.
- **No deployment, no backup, no restore rehearsal.**
- **No MFA.**
- **Lighthouse not measured.**
- **Transitive dependency licences not enumerated** — direct only.
- **No tasks, habits, goals** (M2) and **no rules engine** (M5).
- **Web only** — no native mobile or desktop build.

---

## Core product modules — 2026-09-21

Built in priority order, each validated before the next began.

| Module                                         | State                                                          |
| ---------------------------------------------- | -------------------------------------------------------------- |
| 1 — Auth, onboarding, account settings         | ✅ Done previously                                             |
| 2 — Dashboard with actionable widgets          | ✅ Every widget reads real data; honest empty states           |
| 3 — Task management                            | ✅ CRUD, priority, scheduling, due dates, projects, recurrence |
| 4 — Goals and habits                           | ✅ Measurable targets, streaks, checkpoints, review history    |
| 5 — Finance                                    | ✅ Done previously                                             |
| 6 — Trading journal                            | ✅ Done previously                                             |
| 7 — Notifications and preferences              | ✅ In-app, per-kind switches, deduplicated                     |
| 8 — Search, filter, sort, pagination, export   | ✅ Shared primitives; export covers every module               |
| 9 — Privacy, security, deletion, data controls | ✅ Done previously                                             |

### What the dashboard actually does

Every figure is read from the user's own records. A widget with nothing behind
it returns `hasData: false` and renders a blank that names the missing thing and
links to the action that would create it. **No demo data, no seeded balances, no
placeholder streaks or win rates exist anywhere in the codebase** — an E2E test
asserts a new account's dashboard contains no money figure at all.

The "Worth your attention" panel is the connective tissue: overdue tasks,
streaks about to break, goals behind pace, budgets exceeded, and a run of losing
trades — each derived from the same read the page renders, so what the user is
told always matches what they can see. The same conditions raise in-app
notifications, deduplicated per day.

### Correctness work in this milestone

- **Recurrence** materialises exactly ONE successor, on completion, scheduled
  from the completion date. 17 tests cover DST, leap day, month-end, year
  boundaries, and exhausted finite series.
- **Streaks** are computed, never stored, and survive backfill, deletion and
  timezone change. 15 tests.
- **Goal values** stay exact: a money goal is minor units, a numeric goal is an
  8-decimal scaled integer. `₹45,000.50` round-trips without losing paise.
- **Search escapes `LIKE` wildcards**, so a term containing `%` matches a
  literal percent sign instead of everything.
- **Sort keys are allow-listed**, so an arbitrary column name cannot reach a
  query builder.

### Defects found and fixed

1. **rrule silently accepted garbage.** An empty string parsed to `freq = 0`,
   which is YEARLY, without throwing — so a corrupt stored rule would have
   turned a daily task into a yearly one. Now an explicit `FREQ=` token is
   required before the string reaches the parser.
2. **Clock reads during render.** `Date.now()` inside a component is impure;
   in a client component it also means the server and hydrating client can
   disagree about what is overdue. Clock reads now live in `src/lib/clock.ts`
   and the value is passed down.
3. **Two error contracts.** Finance and trading each had their own
   `ServiceError`/`Result`. Unified into `src/lib/result.ts`.

### A limitation I could not remove

The uncontrolled "add" forms clear when `revalidatePath` re-renders the tree,
which happens shortly after a submit resolves rather than at a defined moment.
Text typed inside that window is wiped.

At human typing speed the window is unreachable; an automated driver hits it.
**An explicit reset in an effect was tried and made it worse** — it adds a
second, later wipe. Closing the window entirely needs either controlled inputs
throughout, or clearing synchronously at submit time, which would discard the
user's text whenever validation fails. Left as-is and recorded here rather than
papered over.

## Next

1. **Decide the product name** — blocking for anything public.
2. A user-editable rules engine. The notification pipeline (kinds, dedupe keys,
   per-kind preferences) already exists; what is missing is letting the user
   define the conditions rather than shipping five fixed ones.
3. The focus timer — `focus_sessions` exists and the dashboard reads it, but
   there is no UI to start one.
4. CSV import for transactions. The schema is idempotent-import-ready via
   `external_id`; no importer is built.
5. Legal review of the drafted terms and privacy notice.
