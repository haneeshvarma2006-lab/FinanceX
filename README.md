# KyliX

> A personal operating system for tasks, habits, goals, finances, and trading —
> connected, not merely co-located.

**Current status: Phase 1 — architecture proposed, awaiting approval. No application code
exists yet.**

"KyliX" is a temporary working name. Domain and trademark availability have not been
checked and must not be assumed.

## Documents

| Document                                           | Contents                                                                                                                   |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)     | Product thesis, verified environment, technology choices with rationale, module structure, security posture, design system |
| [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md)         | Entities, money and precision conventions, correctness invariants                                                          |
| [`docs/ROADMAP.md`](docs/ROADMAP.md)               | Milestones M0–M7, each with acceptance criteria                                                                            |
| [`docs/OPEN-DECISIONS.md`](docs/OPEN-DECISIONS.md) | Blocking questions, reversible defaults, risk register, and what is explicitly **not** claimed                             |

## The idea in one paragraph

Most tools track one of these things well. KyliX treats them as one system: a run of losing
trades creates a review task, a task can carry a goal, a goal can track a budget, and a
broken habit streak shows up tomorrow rather than disappearing. The connective layer — a
typed link graph and a declarative rules engine — is the product, not the dashboards.

## Deliberate limitations

No bank, broker, or market-data integration. No payment provider. No OAuth. No compliance
certification. These require credentials, commercial agreements, or approvals that do not
exist, and none of them are designed in as though they did. See `docs/OPEN-DECISIONS.md`.

## Design attribution

Visual direction — dark, calm, domain-coloured, high-contrast — is informed by a reference
image supplied by the project owner. Branding, wordmark, illustrations, icon set, and
layout compositions from that reference are **not** reproduced.
