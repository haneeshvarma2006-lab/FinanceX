# KyliX — Architecture Proposal

> Status: **PROPOSED — awaiting approval.** No application code has been written.
> "KyliX" is a temporary working name. Domain and trademark availability have **not** been
> checked and must not be assumed. See `OPEN-DECISIONS.md` D-01.

## 1. Product thesis

KyliX is not four dashboards behind one login. The product is the **connective tissue**:
tasks generate discipline, finances generate stability, trading generates wealth, and the
system observes all three and acts on the relationships between them.

Everything that follows exists to make that thesis implementable rather than decorative.
The differentiator is the **Signals & Rules engine** (§6), not the charts.

## 2. Verified environment

Measured in this session, not assumed:

| Capability | State |
|---|---|
| Repository | Empty — `.git` only, zero commits, remote `haneeshvarma2006-lab/FinanceX` also empty |
| Node / npm / pnpm / bun | 22.22.2 / 10.9.7 / 10.33.0 / 1.3.11 |
| PostgreSQL 16.13 | Installed; server started and accepting connections on :5432 |
| Docker | 29.3.1 available |
| Python | 3.11.15 |
| npm registry | Reachable through the agent proxy |
| Chromium + Playwright | Pre-installed at `/opt/pw-browsers` |
| Disk / RAM | ~30 GB free / 15 GB |

Note the name mismatch: the **repository** is `FinanceX`, the **product** is `KyliX`.
Resolve before any public artifact is produced (D-01).

## 3. Technology choices

All versions below were resolved from the registry during discovery. Where the newest
release is a beta or a risky major, the proposal pins the conservative option and says why.

| Layer | Choice | Version | Rationale |
|---|---|---|---|
| Framework | Next.js App Router | 16.3.5 | Server Components keep financial data server-side by default; Server Actions remove a hand-written API tier |
| UI runtime | React | 19.3.0 | Required by Next 16 |
| Language | TypeScript | **5.9.3**, not 7.0.2 | 7.x is the new native compiler; ecosystem tooling compatibility is unproven. Reversible — upgrade once ESLint/Next toolchains confirm support |
| Styling | Tailwind CSS | 4.3.3 | CSS-first token layer maps cleanly onto the design system in §7 |
| Primitives | Radix UI via shadcn-style vendored components | — | Accessibility (focus traps, ARIA, keyboard) without inheriting someone's visual identity. We own every styled file |
| ORM | Drizzle ORM + drizzle-kit | 0.45.2 / 0.31.10 | SQL-first, typed, real migration files, no shadow-database step |
| Database | PostgreSQL | 16 | Correct numeric types, constraints, partial indexes, `jsonb` for rule configs |
| Driver | pg | 8.23.0 | Works against local Postgres and any hosted Postgres |
| Validation | Zod | 4.6.5 | One schema shared by client form, Server Action, and DB write |
| Auth | **First-party session auth** (see §5) | — | Auth.js v5 is still `5.0.0-beta.32`. A production auth claim should not rest on a perpetual beta, and OAuth needs credentials we do not have |
| Hashing | @node-rs/argon2 | 2.2.1 | argon2id, native speed |
| Charts (general) | Recharts | 3.10.1 | Donut / bar / area for finance and habits |
| Charts (price) | lightweight-charts | 5.2.1 | Apache-2.0, purpose-built for candlesticks and equity curves |
| Client cache | TanStack Query | 5.103.1 | Only for genuinely interactive views; most reads stay server-rendered |
| Dates | date-fns 4.4.0 + rrule 2.8.1 | — | Recurrence needs RFC 5545, not hand-rolled arithmetic |
| Unit tests | Vitest | 5.0.1 | |
| E2E | Playwright | 1.63.0 | Browser already provisioned |

Package manager: **pnpm**. Rejected alternatives are recorded in `OPEN-DECISIONS.md`.

## 4. Structure

A modular monolith. Feature modules own their schema, data access, and UI; they talk to
each other only through the links/rules layer, never by importing each other's internals.

```
app/                      routes (route groups per module)
  (auth)/                 sign-in, sign-up
  (app)/                  authenticated shell
    today/ tasks/ habits/ goals/
    finance/ trading/ insights/ settings/
modules/
  identity/ tasks/ habits/ goals/ finance/ trading/
  connections/            links, rules engine, notifications
  insights/               cross-module rollups
  <module>/
    schema.ts             Drizzle tables
    repository.ts         the ONLY place SQL touches this module
    service.ts            business rules, emits domain events
    validators.ts         Zod
    components/
lib/
  db/ auth/ money/ security/ events/ env.ts
db/migrations/            generated SQL, committed
tests/ unit/ e2e/
```

**Enforced invariant:** every repository function takes an authenticated `userId` as its
first argument, and every query filters on it. No SQL exists outside `repository.ts` files.
A lint rule plus a test asserts this — it is the primary defence against horizontal data
leaks between accounts.

## 5. Security posture

Financial and trading data is sensitive. Non-negotiables for M1:

- **Passwords** — argon2id, per-user salt, tuned cost. Never logged, never returned.
- **Sessions** — opaque 256-bit tokens, only the SHA-256 hash stored. Cookies `httpOnly`,
  `Secure`, `SameSite=Lax`, absolute + idle expiry, rotated on privilege change.
- **Authorization** — ownership checked in the data layer (§4), not in the UI. Tested.
- **Input** — Zod at every boundary. Drizzle parameterises; string interpolation into SQL
  is a lint error.
- **Headers** — CSP with per-request nonces, HSTS, `X-Content-Type-Options`,
  `Referrer-Policy`, frame denial.
- **Rate limiting** — sign-in, sign-up, and password reset, per-IP and per-account.
- **Audit log** — append-only record of auth events and sensitive mutations.
- **Env** — validated by Zod at boot; the process refuses to start on a missing secret.
  No secret reaches a client bundle.
- **Money** — integers in minor units. Floats are banned by lint rule and test.

Deliberately **not** claimed: no penetration test, no SOC 2 / PCI / GDPR certification, no
third-party audit. A security *review* is a milestone (M7); a security *certification* is
not something this work can produce.

## 6. The connection layer

Two tables carry the product thesis.

**`links`** — a typed graph edge between any two entities, so a task can belong to a goal,
a goal can track a budget, a trade can hang off a strategy, and a review task can point
back at the trades that triggered it.

**`automation_rules`** — user-owned `trigger → condition → action`, evaluated by a
dispatcher subscribed to domain events. Every evaluation is written to `automation_runs`,
so a user can always see why something fired.

Shipping rules for M5, each mapping to a workflow in the product vision:

1. N consecutive losing trades → create a review task and pause new-trade entry prompts.
2. Category spend crosses a budget threshold → notify, and surface it on Today.
3. Goal falls behind its required run-rate → propose a scheduled task.
4. Habit streak breaks → next-day recovery prompt.
5. Subscription renews within N days → task plus cashflow forecast entry.

Rules are data, not code. Users get a constrained builder; we do not execute user-supplied
expressions.

## 7. Design system

Visual *direction* is taken from the reference — dark, calm, high-contrast, domain-coloured.
Its branding, wordmark, illustrations, icon set, and layout compositions are **not** copied.

- **Surface** — near-black base (`#0A0E1A`) with layered elevation, not flat grey cards.
- **Domain accents** — Tasks = azure, Finance = emerald, Trading = violet. Accent signals
  *which part of your life this is*; it is never the only carrier of meaning.
- **Semantics** — profit/loss and over/under-budget always pair colour with a sign, arrow,
  or label, so the UI survives colour-blindness and greyscale printing.
- **Type** — one variable sans for UI, tabular figures for every number. Money and P&L
  never reflow column width as digits change.
- **Motion** — 120–200 ms, easing-out, and fully disabled under `prefers-reduced-motion`.
- **Light mode** — token-driven from day one; not a retrofit.
- **Accessibility target** — WCAG 2.2 AA: keyboard reachable, visible focus, 4.5:1 text
  contrast, screen-reader labels on every chart (charts ship with a data-table equivalent).

## 8. What this architecture refuses to fake

- No bank, broker, or market-data integration is designed in as if credentials existed.
  Manual entry and CSV import are the real M3/M4 path; live sync is a post-approval
  extension documented in `OPEN-DECISIONS.md`.
- No payment provider, no email provider, no OAuth application is assumed.
- The reference image advertises Windows, macOS, Android, and Web. This proposal ships
  **responsive web + installable PWA**. Native desktop and mobile builds are a separate
  programme of work and are not implied by any milestone here.
