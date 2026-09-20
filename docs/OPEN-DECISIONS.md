# KyliX — Open Decisions, Defaults & Risks

Each entry is either **BLOCKING** (needs an answer before the affected milestone) or has a
**documented reversible default** already applied so work is not stalled.

---

## Blocking decisions

### D-01 — Product name and repository name
The product is called "KyliX"; the repository is `FinanceX`. **Domain availability,
trademark clearance, and app-store name availability have not been checked and must not be
assumed.** No such check has been performed in this session.

*Impact:* branding, package name, PWA manifest, any public artifact.
*Default until answered:* the name appears only in internal docs and UI copy that is
trivially renameable — no logo, domain, or store listing is produced.

### D-02 — Single-user or multi-user
This determines whether sign-up is open, whether there is any notion of sharing or
household accounts, and how hard the tenancy boundary must be tested.

*Impact:* M1 in full, and the ownership test suite.
*Default if unanswered:* **multi-user with self-registration**, full per-user isolation.
This is the strictly safer assumption — a multi-user-safe system runs correctly as
single-user, but the reverse is a data breach.

### D-03 — Currency model
The reference shows ₹. Supporting multiple currencies properly means FX rates, a rate
source, conversion-at-read, and historical-rate correctness.

*Impact:* M3, M4, and every reported total.
*Default if unanswered:* **single base currency chosen at sign-up**, stored per row so the
schema never needs rewriting. FX conversion is a later extension (schema already
accommodates it; see `DATA-MODEL.md`).

---

## Documented reversible defaults

### D-04 — Authentication
**Default:** first-party email + password with argon2id and opaque server-side sessions.

*Why not Auth.js v5:* it remains `5.0.0-beta.32`. *Why no OAuth:* Google/Apple/GitHub
sign-in each require a registered OAuth application and client credentials. **No OAuth
credentials have been created, and none will be invented.** OAuth can be added later
without a data migration; `better-auth` (1.7.5) is the noted alternative if social login
becomes a requirement.

### D-05 — Bank and broker connectivity
**Default:** manual entry plus CSV import, both first-class rather than a fallback.

Plaid, Salt Edge, Yodlee, and broker APIs require commercial agreements, production
approval, and credentials. **None are held.** No integration is designed as if they existed;
`external_id` on `transactions` leaves the door open for a future sync.

### D-06 — Live market data
**Default:** no live prices. Trades record manually entered prices; the journal is a
*record* of decisions, not a quote terminal.

Every viable market-data provider requires an API key and carries redistribution licensing
terms. **No key is held and none is assumed.**

### D-07 — Transactional email
**Default:** M1 ships without email. Password reset is therefore deferred, because a reset
flow that cannot deliver mail is security theatre.

Requires a provider (Resend/Postmark/SES) plus a verified sending domain — neither exists.
This is an accepted, stated limitation of M1, not an oversight.

### D-08 — Hosting and deployment
**Default:** Docker Compose (app + Postgres) as the reference deployment, plus a documented
path to any Node host. Vercel and Neon are both reachable from this session but **no
project has been created and no account state is assumed.**

### D-09 — File storage for trade attachments
**Default:** local filesystem behind an authenticated route, with a storage interface thin
enough to swap for S3-compatible object storage. No bucket or cloud credential is assumed.

### D-10 — Encryption of sensitive fields at rest
**Default:** rely on database/disk-level encryption provided by the deployment target.

Application-level envelope encryption of trade notes and transaction descriptions is
*possible* but costs searchability and adds key-management burden. Flagged for a decision
before any real user data exists — it is materially harder to retrofit afterwards.

### D-11 — Native desktop and mobile
**Default:** responsive web plus installable PWA. The reference image advertises Windows,
macOS, and Android builds; **this plan does not deliver those**, and no milestone should be
read as implying them.

### D-12 — Package manager
**Default:** pnpm 10.33.0 — strict node_modules layout catches phantom dependencies that
npm hoisting hides. Trivially reversible.

### D-13 — TypeScript major version
**Default:** pin **5.9.3** rather than the latest 7.0.2. The 7.x native compiler is new and
ecosystem plugin compatibility is unverified. Revisit once the toolchain confirms support.

---

## Risks

| # | Risk | Mitigation |
|---|---|---|
| R-1 | **Scope.** Four products in one is genuinely large; a rushed monolith of half-features would be worse than fewer complete ones | Strict milestone gating; each ships complete and verified before the next starts |
| R-2 | **Money correctness.** Float arithmetic, transfer double-counting, and short-P&L sign errors are the classic failures | Integer minor units enforced by lint + test; transfer and short-P&L correctness are explicit M3/M4 acceptance criteria with hand-computed fixtures |
| R-3 | **Tenancy leak.** A single unscoped query exposes another user's finances | Ownership enforced in the data layer, not the UI; automated cross-user access tests in M1 |
| R-4 | **Timezone and recurrence.** DST and date-vs-timestamp confusion silently corrupt streaks, budgets, and due dates | `timestamptz` throughout, `date` for calendar days, RFC 5545 recurrence, DST tests in M2 |
| R-5 | **Rules engine as a code-execution hole** | Rules are declarative data; no user-supplied expression is ever evaluated |
| R-6 | **Trading journal that assumes one entry and one exit** — unusable for real trading | `trade_executions` is the source of truth from the start; aggregates are derived |
| R-7 | **Design derivation.** Inspiration drifting into copying protected elements | Original tokens, type scale, icons, and layout; reference informs direction only. Explicitly out: wordmark, illustrations, icon set, layout compositions |
| R-8 | **Perceived financial advice.** A trading journal can be mistaken for advice | Product surfaces record and analyse user-entered history only; no recommendations, no signals, no projections presented as guidance |
| R-9 | **Beta dependency risk** | Auth.js v5 beta avoided (D-04); TS 7 deferred (D-13) |
| R-10 | **Ephemeral environment.** This container is reclaimed on inactivity | Everything of value is committed and pushed; nothing important lives only on disk |

---

## Explicitly not claimed

To be unambiguous, none of the following has been done, and none will be asserted as done
unless it is actually performed and its output shown:

- No security audit, penetration test, or third-party review has been performed.
- No compliance certification (SOC 2, PCI DSS, GDPR, ISO 27001) is held or implied.
- No API keys, OAuth credentials, or service accounts have been created or obtained.
- No domain, trademark, or app-store name has been registered or checked.
- No payment provider relationship or approval exists.
- No bank, broker, or market-data integration is available.
- No production deployment exists.
