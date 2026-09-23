# Nested Flow — Build Status

Last verified: **2026-09-21**. Every result below was produced by running the
command named, in this environment. Nothing is asserted from inspection alone.

## Quality gates — all run

| Gate                | Result                                                    |
| ------------------- | --------------------------------------------------------- |
| `pnpm lint`         | ✅ clean, **0 errors, 0 warnings**                        |
| `pnpm format:check` | ✅ clean                                                  |
| `pnpm typecheck`    | ✅ clean                                                  |
| `pnpm audit`        | ✅ **no known vulnerabilities**                           |
| `pnpm test`         | ✅ **348 passing** (258 app + 90 package)                 |
| `pnpm test:e2e`     | ✅ **58 passing**, Chromium, production build             |
| `pnpm build`        | ✅ 24 routes                                              |
| Migrations          | ✅ 9 applied to clean databases                           |
| CI workflow         | ⚠️ **never executed** — written, unverified as a workflow |

Integration and E2E tests run against real PostgreSQL databases, not mocks.

## Test inventory — 258 app + 90 package + 58 E2E

Counts below are read from an actual runner report, not maintained by hand. An
earlier revision of this table drifted out of step with the totals; it is
regenerated from the runner now.

The domain and token packages run their own suites (`pnpm test` runs all
three), which is why the app total dropped while the overall total rose: the
money, P&L, recurrence and streak tests moved into `@nestedflow/domain`.

| Suite                                 | Count | Covers                                                     |
| ------------------------------------- | ----- | ---------------------------------------------------------- |
| `tests/integration/productivity`      | 31    | Tasks, recurrence, habits, goals, notifications, isolation |
| `tests/integration/auth`              | 30    | Sign-up, sign-in, sessions, rate limits, age, consent      |
| `tests/integration/email`             | 23    | Preferences, suppression, unsubscribe, replay              |
| `tests/integration/rules`             | 21    | Rules engine: firing, dedupe, thresholds, isolation        |
| `src/lib/query`                       | 18    | Pagination bounds, sort allow-list, LIKE escaping          |
| `tests/unit/architecture`             | 18    | Invariants — each verified to fail when violated           |
| `tests/unit/env`                      | 17    | Boot-time environment contract                             |
| `tests/integration/finance`           | 14    | Transfers, balances, budgets, revisions                    |
| `tests/integration/oauth-linking`     | 13    | Account-linking takeover, pending registration             |
| `tests/integration/finance-isolation` | 12    | IDOR across every finance operation                        |
| `tests/integration/sync`              | 12    | Change-log cursor, tombstones, per-user scoping            |
| `tests/integration/trading`           | 12    | Lifecycle, derived aggregates, isolation                   |
| `src/modules/identity/age`            | 12    | Age policy, boundaries, leap day                           |
| `tests/integration/tenancy`           | 7     | Cross-account isolation (identity)                         |
| `src/lib/security/tokens`             | 7     | Session tokens, constant-time compare                      |
| `src/lib/security/password`           | 6     | argon2id                                                   |
| `src/modules/identity/oauth`          | 5     | Open-redirect defence, state hashing                       |
| **App total**                         | 258   |                                                            |

| Package suite                                | Count | Covers                                                 |
| -------------------------------------------- | ----- | ------------------------------------------------------ |
| `@nestedflow/domain` trading/pnl             | 27    | P&L for long/short, fees, partial fills, statistics    |
| `@nestedflow/domain` money                   | 22    | Integer arithmetic, parsing, allocation, precision     |
| `@nestedflow/domain` productivity/recurrence | 17    | RRULE, DST, leap day, month-end, exhausted series      |
| `@nestedflow/domain` productivity/streaks    | 15    | Streaks across backfill, deletion, timezone, leap year |
| `@nestedflow/tokens` css                     | 9     | Generated CSS matches the pre-extraction design system |
| **Package total**                            | 90    |                                                        |

| `tests/e2e` | 58  | Full journeys, security headers, real browser |
| ----------- | --- | --------------------------------------------- |

**23 dedicated cross-account isolation tests** span read, write, update,
delete, archive, bulk operations and cascade behaviour.

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

## Name — decided, but not cleared

**The product is Nested Flow.** Renamed on 2026-09-23 from the previous working
name, which `docs/NAME-RESEARCH.md` showed collided with an active _Kylix
Finance_ in the same sector.

A preliminary conflict scan for "Nested Flow" was run on 2026-09-23 and is
recorded in `docs/NAME-RESEARCH.md`. **No same-sector collision was found** —
the head-on conflict that forced the last rename is absent. Two things did
turn up: "nested flow" is a standard term of art in software for a workflow
inside a workflow, which makes it a weak mark; and a **NestedFlow** test-
automation tool already trades under the compound word.

**Still outstanding and still blocking public launch:** no trademark register
was searched (the register site is blocked by this environment's egress
proxy), no class-9 or class-36 search was run, and **no domain check was
possible** — DNS does not resolve in this container at all, which was verified
against `google.com`. Availability must not be inferred from any of this.

The rename is cheap to repeat now. The name is written in `src/lib/brand.ts`
and nowhere else in `src/`; two architecture tests enforce that, each verified
by introducing the violation and watching it fail. What a future rename would
still touch: that one file, the two SVG icons, and prose in `docs/`.

One deliberate exception: the Postgres function `kylix_log_change()` from
migration `0007` keeps its name. Eighteen triggers reference it in an
already-applied migration, and editing an applied migration breaks every
existing database. It is invisible to users; changing it needs a new forward
migration, not a rewrite of an old one.

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

---

## Rules engine and design system — 2026-09-21

### The rules engine

The five hardcoded dashboard conditions are now **rows the user owns**. Each is
a trigger and an action chosen from fixed catalogues, plus a Zod-validated
config. Seeded at sign-up, visible at `/rules`, and fully editable — retune the
threshold, pause it, or delete it.

**Nothing user-supplied is executed.** There is no expression language and no
template interpolation, so there is nothing to escape. A rules engine that
evaluates user-supplied expressions is a remote-code-execution feature wearing
a friendly hat; this one cannot become that.

Seven triggers (overdue tasks, streak at risk, goal behind pace, budget
exceeded, consecutive losing trades, monthly spend above an amount, nothing
completed today) and two actions (notify, create a task).

Three properties, each tested:

- **Every evaluation is recorded, including the misses.** A rule that quietly
  does nothing is otherwise indistinguishable from a broken one, so `/rules`
  shows why each rule did or did not fire.
- **Firing is idempotent per occurrence.** The dashboard evaluates on every
  load; re-checking the same condition on the same day shows as _already
  handled_ rather than acting twice. Creating a task checks the run log first,
  since tasks have no unique constraint to absorb a duplicate.
- **Money thresholds compare in exact minor units.** A test asserts that ₹1000.00
  exactly does not fire a "more than ₹1000" rule and ₹1000.01 does — the
  boundary a float comparison would get wrong.

### Design system

Tokens defined first, then applied: colour (OKLCH, so equal-lightness accents
do not shout over each other), an eight-step type scale, radii, three elevation
levels, motion curves and durations, and four named breakpoints. Components
reference tokens only — no component defines a raw hex, a one-off pixel value,
or its own easing curve.

Dark is a cinematic navy (hue 265) rather than neutral grey, so the foundation
has depth without a gradient doing the work. Light is defined alongside it, not
retrofitted.

### Errors fixed in this pass

1. **Form input loss — now actually fixed.** React 19 auto-resets an
   _uncontrolled_ form once its action resolves, wiping anything typed in the
   gap. My earlier "fix" reset from an effect, which made it worse by adding a
   second, later wipe. The real fix is to stop the automatic reset happening at
   all: the primary field is controlled, and the deliberate clear only fires
   when the field still holds exactly what was submitted. Two E2E tests cover
   it, including typing during an in-flight submit.
2. **Stale test inventory.** This document's per-suite table summed to 217 while
   its own header said 298. It is now generated from a verbose runner pass.
3. **Over-broad SQL guard.** The architecture invariant flagged
   `` `Delete ${rule.name}` `` in an aria-label as SQL string-building. A guard
   that cries wolf gets disabled, which is worse than no guard — it now requires
   a real statement shape and has tests asserting it accepts the benign cases
   and still rejects hostile ones.
4. **Collapsed notification switches — a regression I introduced.** Routing
   every rule's alert through one `rule_fired` kind silently broke the granular
   per-kind switches in Settings. Alerts are now filed under the kind their
   trigger belongs to. Caught by an existing E2E test.
5. **Truncated money on mobile.** Stat tiles elided figures to `₹80,77…` at
   390px. Numbers are never truncated now; the grid stacks instead.
6. **Clipped navigation.** The active-item underline was cut off by the nav's
   scroll container, and items clipped mid-word. Active state is a soft pill,
   and the trailing edge fades to signal scrollability.

## Native mobile — planned, not started

`docs/MOBILE-PLAN.md` evaluates the options and defines the sync model, conflict
handling, auth lifecycle and privacy requirements, as required before any
mobile code is written.

**Three blocking findings from the audit**, all web-side and all verifiable
here:

1. **No API a native client can call.** 38 Server Actions carry every mutation;
   only 3 HTTP routes exist and none serves app data. Server Actions are bound
   to React's rendering protocol and are not a wire format. The fix is thin —
   the `service.ts` layer is already transport-agnostic — but it does not exist.
2. **The session model is browser-shaped.** The store is reusable; the
   `__Host-` cookie presentation is not. Mobile needs Bearer presentation over
   the same session table.
3. **The schema cannot express offline sync.** 12 of 18 syncable tables lack
   `updatedAt`, and 13 hard-delete — so a deleted row would resurrect on an
   offline client's next push.

**Framework recommendation: Expo / React Native**, decided by one criterion —
81+ tests of financial arithmetic (`money`, `pnl`, `decimal`, `streaks`,
`recurrence`, `goal-math`) must run on the phone as the _same code_, not a Dart
or Swift re-derivation. A trading journal that signs a short's P&L differently
on two clients is worse than one with no mobile app.

**Not claimed:** no mobile code exists, no iOS or Android build has been
produced or tested, no device testing, no push credentials. This host is Linux
with no Xcode, no Android SDK, no `adb` and no emulator — verified, not
assumed.

## Next

1. **Decide the product name** — blocking for anything public, and the point at
   which a store listing makes the conflict expensive.
2. The focus timer — `focus_sessions` exists and the dashboard reads it, but
   there is no UI to start one.
3. CSV import for transactions. The schema is idempotent-import-ready via
   `external_id`; no importer is built.
4. Editing an existing rule. Rules can be created, paused and deleted, but not
   edited in place — changing a threshold means deleting and recreating.
5. Legal review of the drafted terms and privacy notice.

---

## Mobile-readiness milestones W1–W5 — complete

`docs/MOBILE-PLAN.md` identified five things the web build did that a second
client could not share. All five are done and verified in this environment.

| Milestone                        | Verification                                                        |
| -------------------------------- | ------------------------------------------------------------------- |
| W1 — JSON API beside the actions | 13 routes under `/api/v1`, 12 E2E tests driving them                |
| W2 — Bearer sessions             | Same session store, Authorization header preferred over the cookie  |
| W3 — Sync primitives             | Change log with a monotonic cursor, 18 DB triggers, 12 tests        |
| W4 — `@nestedflow/domain`        | Money, P&L, recurrence and streaks moved out; 81 tests move with it |
| W5 — `@nestedflow/tokens`        | Tokens authored as data, CSS generated; 9 tests                     |

**iOS and Android remain untested.** This environment is Linux with no Xcode,
no Android SDK and no emulator, so no claim about either platform is made here.
W1–W5 remove the architectural blockers; they do not constitute a mobile build.

### How the token extraction was proved to change nothing

Two independent checks, both run:

1. `packages/tokens/src/css.test.ts` parses a verbatim copy of `globals.css`
   as it stood before the extraction and asserts every one of its 60
   declarations still generates at the same value. Changing a token value in
   `packages/tokens/src/index.ts` makes it fail; adding one does not.
2. The compiled Tailwind stylesheet was built before and after the change and
   compared: **byte-for-byte identical, 35095 bytes.** This also confirmed that
   Tailwind honours `@theme` from an imported file.

## Interface pass — what changed and what was checked

Reviewed by capturing the rendered pages in a real browser at 1280px and
390px, not by reading the markup.

- Depth is now a lit one-pixel top edge (`--shadow-edge`) rather than a
  gradient or a glow. It applies to cards and to filled buttons.
- Each dashboard card carries its domain's accent as a small chip beside its
  title, connecting it to the navigation. The label says the same thing, so
  nothing depends on the colour.
- Figures share one `Stat`/`StatGrid` component across the dashboard, Finance
  and Trading. Finance and Trading previously hand-rolled their own.
- The task form moved its refining fields behind **More options**: capturing a
  task is one field and one click, and the list owns the page. Nothing was
  removed; the E2E tests open the disclosure as a user would.
- Priority now appears as a rail on the row as well as a badge, so scanning a
  long list does not mean reading every label.
- **Phone navigation is a bottom bar**, from the same markup as the desktop
  row — repositioned by CSS rather than rendered twice, which would put every
  destination in the page twice for a screen reader. Found and fixed while
  checking this: `backdrop-filter` on the header made it the containing block
  for its fixed descendants, which pinned the bar to the header instead of the
  viewport.
- Page content enters with an 8px, 200ms rise, collapsed to nothing under
  `prefers-reduced-motion`.

Two invariants were added and each was verified by introducing the violation
and watching the test fail: no source file may declare a design token by hand
outside `packages/tokens`, and none may use a one-off length such as
`mt-[1.625rem]`. Fixing the five existing violations produced the `3xs` type
size, the `hairline` radius and the `brand` tracking tokens.
