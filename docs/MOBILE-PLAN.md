# Nested Flow — Native Mobile Application Plan

> **Status: PLAN ONLY. No mobile code has been written, and none should be
> until the prerequisites in §2 are done.**
>
> **This environment cannot build or test either platform.** Verified, not
> assumed: the host is Linux (no macOS, no Xcode, so an iOS build is
> impossible here), and there is no Android SDK, `adb`, or emulator —
> `ANDROID_HOME` is unset and `sdkmanager`, `adb` and `emulator` are all
> absent. A JDK 21 and Gradle exist, which is not sufficient.
>
> **No claim of iOS or Android readiness will be made from this session.**

---

## 1. The gate, and whether it is met

The plan was to begin once the web app's core workflows, authorization and
automated tests were stable. Measured on 2026-09-21:

| Gate            | State                                                                     |
| --------------- | ------------------------------------------------------------------------- |
| Core workflows  | ✅ Tasks, habits, goals, finance, trading, rules, notifications           |
| Authorization   | ✅ 23 cross-account isolation tests; ownership enforced in the data layer |
| Automated tests | ✅ 320 unit/integration + 46 E2E, all passing against real PostgreSQL     |
| CI              | ⚠️ **Never executed.** Written, unverified as a workflow                  |

The functional gate is met. CI remains unverified and should be run before a
second client starts depending on this backend — the cost of a regression rises
sharply once two clients consume the same services.

---

## 2. Prerequisites on the web side

**These are the blocking findings. None is mobile-specific, all are needed
before a mobile client can exist, and all are verifiable in this environment.**

### 2.1 There is no API a native client can call 🔴

Audited, not assumed:

- **3 HTTP route handlers** exist: `/api/auth/google`, its callback, and
  `/api/account/export`. None serves application data.
- **38 exported Server Actions across 9 files** carry every mutation.

Server Actions are an RPC mechanism bound to React's rendering protocol. They
are not a documented wire format, they depend on the React client runtime, and
their payload encoding is an implementation detail that changes between
versions. **A native client cannot call them, and should not try.**

**What this does _not_ mean:** rewriting the domain. The `service.ts` layer is
already transport-agnostic — every function takes `(userId, input)` and returns
`Result<T>`. A JSON API over those services is a thin shim, and the business
rules stay in exactly one place, which is the constraint you set.

```
Server Action ─┐
               ├─→ modules/*/service.ts ─→ repository.ts ─→ PostgreSQL
HTTP API      ─┘   (unchanged, already tested)
```

**Milestone W1 — JSON API.** Route handlers under `/api/v1/*` that authenticate,
validate with the existing Zod schemas, call the existing service functions, and
map `AppError.kind` to a status code via the existing `statusFor()`. Acceptance:
every mobile use case in §5 is served; the isolation test suite is extended to
hit the API surface with another account's ids; no business rule is duplicated.

### 2.2 The session model is browser-shaped 🟠

Auth is an opaque 256-bit token in a `__Host-` prefixed, `httpOnly`,
`SameSite=Lax` cookie. The _store_ is sound and reusable — only the SHA-256 is
persisted, with absolute (30d) and idle (72h) deadlines.

The _presentation_ is not. A native client has no cookie jar worth relying on
and no same-site concept. It needs `Authorization: Bearer <token>` against the
same `sessions` table.

**Milestone W2 — Bearer presentation.** Accept the existing session token from
an `Authorization` header as an alternative to the cookie, resolved by the same
`resolveSession()`. Record a `client` column on `sessions` so a user can tell
"iPhone" from "Chrome on Mac" in Settings → Security, and revoke one without
the other. Acceptance: a token issued to mobile is revocable from the web
session list, and vice versa; both deadlines still apply.

### 2.3 The schema cannot express what offline sync needs 🔴

Audited per table:

| Gap                                                                | Tables affected                                                                                                                                                                                                |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **No `updatedAt`** — nothing to compare for last-writer-wins       | 12 of 18 syncable tables: `projects`, `habits`, `habitEntries`, `goalCheckpoints`, `focusSessions`, `categories`, `budgets`, `subscriptions`, `tradeExecutions`, `tradeNotes`, `tradingAccounts`, `strategies` |
| **Hard delete** — an offline client can never learn a row vanished | 13 of 18: `tasks`, `habitEntries`, `goals`, `goalCheckpoints`, `focusSessions`, `transactions`, `budgets`, `subscriptions`, `trades`, `tradeExecutions`, `tradeNotes`, `automationRules`, `notifications`      |

Neither is a defect in the web app, which always reads fresh from the server.
Both are blocking for sync: a client that pulls "everything changed since T"
cannot see a deletion that left no trace, so deleted rows resurrect on the next
push.

**Milestone W3 — sync primitives.** Add `updatedAt` to every syncable table,
maintained by the repository layer as it already is elsewhere. Add tombstones:
either a `deletedAt` column with reads filtered, or a single `change_log`
(userId, entityType, entityId, op, at) written on delete. **Recommendation: the
change-log table** — one index serves every entity's delta query, and it does
not require auditing every existing read for a `deletedAt` filter it might have
missed. Acceptance: a delta query returns creations, updates _and_ deletions
since a cursor; a test asserts a deleted row does not resurrect after a
round trip.

---

## 3. Framework evaluation

### The decisive criterion

You set a hard constraint: _do not duplicate financial calculations, permission
logic, or critical business rules in multiple clients._ That constraint alone
decides this, and it is worth being explicit about why.

Nested Flow's correctness lives in pure, heavily-tested TypeScript modules:

| Module                                | Tests            | What it guards                                    |
| ------------------------------------- | ---------------- | ------------------------------------------------- |
| `src/lib/money`                       | 22               | Integer minor units; exact parsing and allocation |
| `src/modules/trading/pnl`             | 27               | Long/short sign, fees, partial fills, R-multiple  |
| `src/modules/trading/decimal`         | (in pnl)         | 8-decimal market quantities                       |
| `src/modules/productivity/streaks`    | 15               | Streaks across backfill, DST, leap year           |
| `src/modules/productivity/recurrence` | 17               | RFC 5545, DST, month-end                          |
| `src/modules/productivity/goal-math`  | (in integration) | Exact goal progress per kind                      |

That is **81+ tests of arithmetic that must not be re-derived.** A trading
journal that computes a short's P&L with one sign on web and another on mobile
is worse than one that has no mobile app.

### The options

| Option                                                 | Reuses the tested logic?                                                 | Verdict                                                                                          |
| ------------------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| **Expo / React Native** (Expo 57.0.24, RN 0.87.1, MIT) | ✅ Verbatim — same TypeScript, same tests                                | **Recommended**                                                                                  |
| **Flutter**                                            | ❌ Dart. Every module above must be re-implemented and re-tested         | Rejected — directly violates the constraint                                                      |
| **Native Swift + Kotlin**                              | ❌ Twice over, and the two can drift from each other as well as from web | Rejected — worst case for the constraint                                                         |
| **Capacitor / PWA shell**                              | ✅ (it _is_ the web app)                                                 | Not a native app. Reasonable fallback if native is deferred, but it answers a different question |

**Recommendation: Expo (React Native).** Not because it is popular — because it
is the only option under which `parseAmount`, `computeTradeMetrics` and
`summarise` run on the phone as the _same code_, covered by the _same tests_,
that the web app runs.

The honest costs of that choice, stated rather than glossed:

- A JavaScript runtime and bridge sit under the UI; very heavy list rendering
  needs care that a native app would not.
- Expo's managed workflow constrains which native modules can be used without
  ejecting to a development build.
- React Native version upgrades are historically more disruptive than web
  framework upgrades.

### Repository shape

A pnpm workspace, so sharing is a dependency rather than a copy:

```
packages/
  domain/      ← money, pnl, decimal, streaks, recurrence, goal-math + their tests
  tokens/      ← design tokens as the single source (§7)
  api-client/  ← typed client generated from the Zod schemas
apps/
  web/         ← the existing Next.js app
  mobile/      ← Expo
```

**Milestone W4 — extract `packages/domain`.** Move the pure modules and their
tests; `apps/web` imports them instead of local paths. Acceptance: all 320 tests
still pass, and `packages/domain` has zero dependency on Next, React, or the
database — it is pure functions over values.

---

## 4. Decisions to make before any mobile code

### 4.1 Synchronization model

**Recommendation: offline-capable, not offline-first.**

An offline-first product needs conflict resolution a user can understand, and
for a _financial ledger_ that is a bad trade. Two devices editing the same
transaction and silently merging is how a balance becomes wrong.

Proposed:

| Data                                                 | Behaviour offline                                                                                             |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Reads (dashboard, lists, goals)                      | Served from a local cache, clearly marked stale with the time of last sync                                    |
| **Quick capture** (new task, new expense, new trade) | **Queued locally and sent on reconnect.** Creations are the only offline writes                               |
| Edits and deletions                                  | Require connectivity. Attempting one offline says so plainly rather than queueing something that may conflict |

Rationale: a creation has no prior state to conflict with. An edit does. Allowing
only creations offline covers the real mobile use cases in §5 — which are
overwhelmingly capture, not revision — while removing conflict resolution from
the critical path of money.

**Delta protocol.** `GET /api/v1/sync?since=<cursor>` returns changes from the
change log plus the affected rows, and a new cursor. The cursor is a server
timestamp, never a client one — **client clocks are not trustworthy**, and a
phone with a wrong clock must not be able to skip or replay a window.

### 4.2 Conflict handling

For the narrow surface that can conflict:

- **Queued creations are idempotent.** Every queued item carries a
  client-generated UUIDv7 as its primary key. Replaying a queue after a partial
  failure inserts nothing twice, because the id collides. This is the same
  mechanism `transactions.external_id` already uses for CSV re-import.
- **Edits use optimistic concurrency.** The client sends the `updatedAt` it
  read; the server rejects with `409 conflict` if the row has moved. The
  existing `AppError` contract already has a `conflict` kind, so this needs no
  new error shape.
- **A rejected write is shown, never discarded.** The user sees what they
  entered, what the server has, and chooses. Silent last-writer-wins on a
  financial record is data loss with a friendly face.

### 4.3 Authentication lifecycle

| Stage                | Behaviour                                                                                                                                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign in              | Email + password, or Google via the system browser (`ASWebAuthenticationSession` / Custom Tabs). **Never an embedded webview** — it hides the address bar, trains users to enter credentials in an unverifiable frame, and Google blocks it |
| Token storage        | iOS Keychain / Android Keystore via `expo-secure-store`. **Never `AsyncStorage`**, which is plaintext on disk                                                                                                                               |
| Session lifetime     | The existing absolute (30d) and idle (72h) deadlines, unchanged. A mobile session is not privileged over a web one                                                                                                                          |
| Biometric re-auth    | Face ID / fingerprint to _unlock the app_, gating local cache access. It is a convenience over a live session, **not an authentication factor** — the server never sees it and must not treat it as one                                     |
| Revocation           | Mobile sessions appear in Settings → Security beside web ones, individually revocable                                                                                                                                                       |
| Sign out             | Token deleted server-side (as the web does), local cache and queue wiped                                                                                                                                                                    |
| Age gate and consent | Enforced server-side already. The OAuth path routes through `/complete-signup`, so mobile inherits it without new logic                                                                                                                     |

### 4.4 Data privacy

| Requirement                            | Approach                                                                                                                                           |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local cache contains financial records | Encrypted at rest — SQLCipher via an Expo dev build, or platform file encryption with `expo-secure-store` for the key                              |
| Screenshots in the app switcher        | Blur or mask the view when backgrounded. A balance in a task-switcher thumbnail is a real disclosure                                               |
| Analytics / crash reporting            | **None by default.** If ever added, no financial values in payloads, disclosed in the privacy notice, and version-bumped consent                   |
| Device permissions                     | Only notifications. No contacts, no location, no camera unless receipt capture is built, and then only with a stated purpose string                |
| Sign-out and uninstall                 | Local database and queue destroyed on sign-out. Uninstall removes the sandbox; the Keychain item is explicitly deleted rather than relying on that |
| Data export                            | The existing `/api/account/export` covers mobile-captured data automatically, since it is the same database                                        |

---

## 5. The mobile experience

Built around what a phone is actually for. Each screen below maps to a use case
you named, with a defined acceptance criterion.

| Screen                      | Use case                                                  | Acceptance                                                                                                                                               |
| --------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Quick capture**           | Task, expense or trade in under ~5 seconds from cold open | Reachable from the app icon's long-press shortcut and a home-screen widget; works offline by queueing; the form remembers the last-used account/category |
| **Today**                   | Daily overview                                            | The same snapshot the web dashboard renders, from `/api/v1/dashboard`; honest empty states; marked stale with last-sync time when offline                |
| **Expense log**             | Log spending where it happens                             | Amount keypad first, category second; defaults to today and the most-used account; integer minor units end to end                                        |
| **Trade entry**             | Journal a trade after placing it elsewhere                | Symbol, direction, quantity, price, fee; P&L derived by the shared `computeTradeMetrics`, never re-implemented                                           |
| **Goals & progress**        | Review, and record a checkpoint                           | Read-mostly; a checkpoint is a creation, so it queues offline                                                                                            |
| **Notifications & account** | Alerts, preferences, session control, deletion            | Push registration is opt-in; preferences are the same per-kind switches; account deletion is reachable, as stores require                                |

**Not shipping on mobile initially, and why:** the rules builder, budgets
configuration, CSV import, and trading analytics. These are deliberate,
infrequent, screen-hungry tasks. Cramming them onto a phone produces a worse
version of a thing that already works on the web.

---

## 6. Push notifications — external dependencies

The in-app notification pipeline (kinds, dedupe keys, per-kind preferences)
already exists and needs no change. Delivery to a device does.

**None of the following is held, and none will be assumed:**

| Requirement                                    | Status         |
| ---------------------------------------------- | -------------- |
| Apple Developer Program membership (~$99/year) | ❌ Not held    |
| APNs authentication key (.p8) and Team ID      | ❌ Not held    |
| Google Play Developer account (~$25 one-off)   | ❌ Not held    |
| Firebase project and FCM credentials           | ❌ Not held    |
| Expo push service, or self-hosted APNs/FCM     | ❌ Not decided |

Until these exist, push is **designed for and not built**: a `device_tokens`
table (userId, platform, token, lastSeenAt) and a `push` channel alongside the
existing in-app one, behind the same per-kind preferences. The transport is a
swappable interface exactly as `src/modules/email/service.ts` already does —
console transport by default, so nothing silently pretends to send.

---

## 7. Design token reuse

The tokens in `src/app/globals.css` are currently CSS custom properties — not
consumable by React Native, which has no CSS.

**Milestone W5 — `packages/tokens`.** Author tokens once as data (a TypeScript
object: colour in OKLCH with sRGB fallbacks, type scale, spacing, radii, motion
durations), and generate both the CSS custom properties the web consumes and
the plain constants React Native consumes. Acceptance: changing a token in one
file changes both clients; a test asserts the generated CSS matches the current
`globals.css` values so the refactor is provably behaviour-preserving.

React Native cannot use the web's `oklch()` values directly, and cannot use
Inter-as-a-web-font — the same OFL font ships as a bundled asset instead.

---

## 8. Accessibility, per platform

Not "make it accessible" but the specific obligations each platform imposes:

| Platform    | Requirement                                                                                                                                                                                   |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **iOS**     | VoiceOver labels and traits on every control; Dynamic Type support up to the accessibility sizes (a fixed 14pt body fails this); `accessibilityViewIsModal` on sheets; Reduce Motion honoured |
| **Android** | TalkBack labels; `minimumTouchTargetSize` of 48dp; font-scale support to 200%; content descriptions on icon-only buttons                                                                      |
| **Both**    | Contrast ratios already meet WCAG AA in the token set; colour never the sole carrier of meaning (already true — sign and label accompany every P&L figure)                                    |

**Acceptance: tested with VoiceOver and TalkBack actually running on a device
or simulator.** An accessibility claim from a code review is not a test, and
will not be made.

---

## 9. Milestones

| #      | Milestone                                             | Buildable & testable here?          |
| ------ | ----------------------------------------------------- | ----------------------------------- |
| **W1** | JSON API over existing services                       | ✅ Yes                              |
| **W2** | Bearer token presentation + per-client sessions       | ✅ Yes                              |
| **W3** | Sync primitives: `updatedAt` everywhere, change log   | ✅ Yes                              |
| **W4** | Extract `packages/domain`                             | ✅ Yes                              |
| **W5** | Extract `packages/tokens`                             | ✅ Yes                              |
| **W6** | CI actually executed                                  | ⚠️ Needs a push to GitHub           |
| **M1** | Expo shell, auth, secure storage                      | ❌ Needs a device or emulator       |
| **M2** | Today + quick capture                                 | ❌                                  |
| **M3** | Expense log + trade entry                             | ❌                                  |
| **M4** | Goals, notifications, account controls                | ❌                                  |
| **M5** | Offline queue and delta sync                          | ❌                                  |
| **M6** | Push delivery                                         | ❌ Also needs APNs/FCM credentials  |
| **M7** | Device testing, accessibility audit, store submission | ❌ Needs devices and store accounts |

**W1–W5 are web-side work that makes a mobile client possible, and every one of
them is verifiable in this environment.** They are the sensible next step
whether or not the mobile app is ever built, because each one also improves the
web app: a real API surface, revocable per-device sessions, sync-ready history,
and a token system with one source of truth.

---

## 10. What this plan does not claim

- **No mobile code exists.** Nothing has been scaffolded.
- **No iOS build has been produced or tested.** This host is Linux; Xcode
  cannot run on it. Verified.
- **No Android build has been produced or tested.** No SDK, no `adb`, no
  emulator. Verified.
- **No device testing of any kind.** No physical device is reachable.
- **No accessibility testing** with VoiceOver or TalkBack.
- **No store submission**, and no assessment of whether either store would
  accept the app.
- **No push notification has ever been sent**, and no APNs or FCM credential
  exists.
- **The product name is unresolved** (`docs/NAME-RESEARCH.md`) and app-store
  name availability has not been checked. A store listing is precisely where a
  name conflict becomes expensive.
