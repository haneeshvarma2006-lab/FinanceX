# KyliX — Build Status

Last verified: **2026-09-20**. Every result below was produced by running the
command named, in this environment. Nothing is asserted from inspection alone.

## Quality gates — all run

| Gate                | Result                                                    |
| ------------------- | --------------------------------------------------------- |
| `pnpm lint`         | ✅ clean, **0 errors, 0 warnings**                        |
| `pnpm format:check` | ✅ clean                                                  |
| `pnpm typecheck`    | ✅ clean                                                  |
| `pnpm audit`        | ✅ **no known vulnerabilities**                           |
| `pnpm test`         | ✅ **217 passing**, 15 files                              |
| `pnpm test:e2e`     | ✅ **23 passing**, Chromium, production build             |
| `pnpm build`        | ✅ 20 routes                                              |
| Migrations          | ✅ 5 applied to clean databases                           |
| CI workflow         | ⚠️ **never executed** — written, unverified as a workflow |

Integration and E2E tests run against real PostgreSQL databases, not mocks.

## Test inventory — 217 unit/integration + 23 E2E

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

## Next

1. **Decide the product name** — blocking for anything public.
2. M2: tasks, focus timer, habits, goals.
3. M5: the connections and rules engine — the product thesis.
4. Legal review of the drafted terms and privacy notice.
