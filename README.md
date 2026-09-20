# KyliX

> A personal operating system for tasks, habits, goals, finances and trading —
> connected, not merely co-located.

**⚠️ "KyliX" is a working name with a known conflict.** A preliminary search
found an active _Kylix Finance_ in the same sector and a registered Borland
mark. See [`docs/NAME-RESEARCH.md`](docs/NAME-RESEARCH.md). No trademark
clearance or domain availability has been established, and the recommendation
is to rename before any public use.

## Status

Milestones **M0–M1** (foundation, identity, security) plus **M3–M4** (finance,
trading) are built, tested and verified. Tasks, habits, goals and the rules
engine are not started.

| Gate                      | Result                                       |
| ------------------------- | -------------------------------------------- |
| Lint / format / typecheck | clean                                        |
| Dependency audit          | no known vulnerabilities                     |
| Unit + integration tests  | **217 passing** against real PostgreSQL      |
| End-to-end tests          | **23 passing** in Chromium, production build |
| Build                     | 20 routes                                    |

Full evidence in [`docs/STATUS.md`](docs/STATUS.md).

## What it does

- **Finance** — accounts, categories, transactions, transfers, budgets,
  subscriptions, net worth. Money is integer minor units throughout; transfers
  are two balanced rows and never inflate income or spending; balances are
  derived from the ledger rather than stored.
- **Trading journal** — trading accounts, strategies, trades, executions,
  psychology notes. Entry price, exit price and realised P&L are **derived from
  executions**, so partial fills and scaling in/out are representable. Win rate,
  profit factor, expectancy, R-multiple, equity curve and drawdown.
- **Identity** — email/password with argon2id, optional Google OIDC, an age
  gate, versioned consent, session listing and revocation, data export, and
  permanent account deletion.
- **Email preferences** — four categories, opt-in marketing, one-click
  unsubscribe with `List-Unsubscribe`, suppression, replay-protected tokens.

## Documentation

| Document                                                 | Contents                                         |
| -------------------------------------------------------- | ------------------------------------------------ |
| [`docs/STATUS.md`](docs/STATUS.md)                       | What is built, verified how, and what is not     |
| [`docs/SECURITY.md`](docs/SECURITY.md)                   | Controls implemented, and what is not claimed    |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)           | Technology choices, structure, design system     |
| [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md)               | Entities, money conventions, invariants          |
| [`docs/AGE-POLICY.md`](docs/AGE-POLICY.md)               | The age gate, and why it is not age verification |
| [`docs/NAME-RESEARCH.md`](docs/NAME-RESEARCH.md)         | Name conflicts found, with sources and dates     |
| [`docs/LICENSES.md`](docs/LICENSES.md)                   | Dependency and asset licence inventory           |
| [`docs/RELEASE-CHECKLIST.md`](docs/RELEASE-CHECKLIST.md) | What must happen before deploying                |
| [`docs/OPEN-DECISIONS.md`](docs/OPEN-DECISIONS.md)       | Open questions, defaults, risk register          |
| [`docs/ROADMAP.md`](docs/ROADMAP.md)                     | Milestones and acceptance criteria               |

## Getting started

```bash
pnpm install
cp .env.example .env          # then fill in DATABASE_URL and AUTH_SECRET
createdb kylix
pnpm db:migrate
pnpm dev
```

Generate a real secret with `openssl rand -base64 48`. The application refuses
to start if the environment is incomplete, rather than failing later.

```bash
pnpm verify      # lint + typecheck + test + build
pnpm test:e2e    # production build, real browser
```

## Deliberate limitations

No bank, broker or market-data integration. No payment provider. No email
provider — so no password reset and no email verification. No compliance
certification. These require credentials, commercial agreements or approvals
that do not exist, and **none of them are designed in as though they did**.

Google sign-in is fully implemented but inert without credentials: the routes
fail honestly and the button is not rendered.

## This is not financial advice

KyliX records what you tell it. It places no orders, fetches no prices, and
connects to no institution. Statistics describe trades you have already
recorded and say nothing about future results.

## Design attribution

Visual direction — dark, calm, domain-coloured — is informed by a reference
image supplied by the project owner. Its branding, wordmark, illustrations,
icon set and layout compositions are **not** reproduced. There are no image
assets in this repository; every visual element is CSS or an inline SVG icon
from an ISC-licensed library. Fonts are self-hosted under the SIL OFL; nothing
is loaded from a third-party origin.
