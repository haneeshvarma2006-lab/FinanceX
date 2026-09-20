# KyliX — Implementation Plan

> Status: **PROPOSED.** Estimates are relative sizing, not calendar commitments.

Every milestone is **shippable and verifiable**. A milestone is done only when its
acceptance criteria are demonstrated by a command whose output can be read — not when the
code merely exists. "Tests written" is not "tests passing"; only actual runs count.

---

## M0 — Foundation

Scaffold, tooling, CI, database connection, design tokens, app shell. No features.

**Acceptance criteria**

- `pnpm install && pnpm build` succeeds from a clean clone.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` all pass with zero warnings.
- Drizzle connects to Postgres; a baseline migration applies and rolls back.
- Env schema rejects a missing required variable at boot with a readable error.
- Design tokens render in light and dark; app shell is keyboard navigable.
- CI runs lint + typecheck + unit + build on push.

## M1 — Identity & security baseline

Sign-up, sign-in, sign-out, session lifecycle, ownership enforcement, security headers.

**Acceptance criteria**

- Password hashed with argon2id; hash never appears in any response or log.
- Session cookie is `httpOnly` + `Secure` + `SameSite=Lax`, rotates on sign-in, and is
  invalidated server-side on sign-out.
- **Horizontal access test passes**: user A receives 404 on every one of user B's entities,
  across every module route, asserted in automated tests.
- Rate limiter blocks brute-force sign-in, verified by test.
- CSP with nonce present; no `unsafe-inline` in production config.
- Zod rejects malformed input at every boundary with a structured error.
- Audit log records sign-in, sign-out, and failed attempts.

## M2 — Tasks, focus, habits, goals

Task CRUD, projects, subtasks, recurrence, Today view, focus timer, habit tracking, goals.

**Acceptance criteria**

- Recurring task completion generates exactly one next occurrence, correct across a DST
  boundary and across the user's timezone — asserted by test, not by inspection.
- Today view composes due, scheduled, and overdue items in one ordered list.
- Focus timer survives a page reload without losing elapsed time.
- Habit streak is computed correctly across timezone changes and backfilled entries.
- Goal progress updates from checkpoints; run-rate is derived, not entered.
- Keyboard: create, complete, and navigate tasks without a mouse.

## M3 — Finance tracker

Accounts, categories, transactions, transfers, budgets, subscriptions, net worth, CSV import.

**Acceptance criteria**

- Money arithmetic is integer-only; a test asserts no float path exists in money code.
- A transfer produces two balanced rows and is **excluded** from both income and expense
  totals — asserted by test.
- Account balance derived from the ledger always equals opening balance + transaction sum.
- CSV re-import of the same file creates zero duplicate rows (idempotent via `external_id`).
- Budget progress is correct at period boundaries, including partial first periods.
- Charts have accessible data-table equivalents.

## M4 — Trading journal

Trading accounts, strategies, trades, executions, notes, P&L and risk analytics.

**Acceptance criteria**

- Partial fills: a trade with multiple executions reports correct average entry, average
  exit, and realised P&L — asserted against hand-computed fixtures for long **and** short.
- Fees are included in realised P&L; a test asserts the sign convention for shorts.
- R-multiple computed from planned risk; win rate, expectancy, and profit factor verified
  against fixtures.
- Equity curve and drawdown render from closed trades only.
- Psychology notes attach to trades and are filterable.

## M5 — Connections & rules engine

`links` graph, event dispatcher, rule builder, the five shipping rules, notifications.

**Acceptance criteria**

- Each of the five shipping rules fires under test from a simulated domain event.
- Every evaluation writes an `automation_runs` row — a user can see _why_ something fired.
- Rules are data-driven; **no user-supplied code or expression is ever executed**.
- A disabled rule never fires. A rule cannot act on another user's entities.
- Deleting a linked entity does not orphan a rule into a crash.

## M6 — Insights & polish

Cross-module Today/Insights surfaces, rollups, onboarding, empty states, PWA, responsive pass.

**Acceptance criteria**

- Rollups are idempotent: recomputation produces identical rows.
- Insights surface at least three genuinely cross-module observations.
- Every list has a designed empty state and a loading skeleton.
- Responsive from 360 px to ultrawide with no horizontal scroll.
- Lighthouse: Performance ≥ 90, Accessibility ≥ 95 on the main authenticated views.
- PWA installs and renders the shell offline.

## M7 — Hardening & release readiness

Security review, performance pass, backup/restore, data export, documentation.

**Acceptance criteria**

- Dependency audit clean or every finding triaged in writing.
- Automated security review run and findings resolved or accepted with rationale.
- `EXPLAIN` reviewed for the ten hottest queries; indexes justified.
- Full data export (JSON + CSV) and verified restore into an empty database.
- Documented backup and restore procedure, actually executed once.
- Release notes state plainly what is **not** covered: no external audit, no compliance
  certification, no bank/broker integration.

---

## Sequencing

M0 → M1 are strictly serial. M2, M3, M4 are independent once M1 lands and may be reordered
to taste. M5 requires at least two of M2/M3/M4 to have real data to connect. M6 requires
M5. M7 is last.

## Definition of done (applies to every milestone)

1. Typecheck, lint, unit tests, and build pass — output shown, not asserted from memory.
2. E2E covers the milestone's primary user journey.
3. Ownership/authorization tested for every new entity.
4. Accessibility: keyboard path and visible focus verified.
5. Documentation updated in the same commit as the behaviour change.
