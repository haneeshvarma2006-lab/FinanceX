# @kylix/domain

Pure domain logic, shared by every client.

**Nothing here touches a database, a network, a React component, or a clock.**
Every export is a function over values — which is what makes it safe to run
unchanged on a server, in a browser, and on a phone.

This package exists to satisfy one rule: **financial calculations, and the
rules that govern them, are written once.** A trading journal that signs a
short's P&L one way on the web and another on mobile is worse than one with no
mobile app at all.

| Module                    | Guards                                                        |
| ------------------------- | ------------------------------------------------------------- |
| `money`                   | Integer minor units; exact parsing, formatting and allocation |
| `trading/decimal`         | 8-decimal market quantities and prices                        |
| `trading/pnl`             | Long/short P&L, fees, partial fills, R-multiple, drawdown     |
| `productivity/streaks`    | Habit streaks across backfill, deletion and timezone change   |
| `productivity/recurrence` | RFC 5545 recurrence, DST, month-end, leap day                 |
| `productivity/goal-math`  | Exact goal progress per goal kind                             |

## Constraints

- **No I/O.** No `fetch`, no database, no filesystem.
- **No framework.** No React, no Next, no React Native.
- **No ambient time.** A function that needs "now" takes it as an argument, so
  every behaviour is testable at a boundary rather than dependent on when the
  suite happens to run.
- **No floating point for money.** Enforced by a test in the web app's
  architecture suite.
