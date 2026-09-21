# KyliX — Domain Model

How the data is shaped, who owns it, and which rules the database enforces
rather than trusting the application to remember.

## Ownership

**Every user-scoped table carries `user_id`, and every repository function
takes `userId` as its first argument and filters on it.** That is the entire
tenancy boundary — there is no second layer, and no query in the codebase omits
it.

Enforced three ways:

1. **Lint** — importing `drizzle-orm` outside a `repository.ts` is an error.
2. **Test** — `tests/unit/architecture.test.ts`, verified to fail when violated
   by deliberately introducing a violation.
3. **Cascade** — every child table references `users.id` with
   `ON DELETE CASCADE`, so deleting an account removes its data rather than
   orphaning it.

An id belonging to another account reads as **not found**, never "forbidden":
confirming that an id exists is itself a disclosure.

## Modules

| Module         | Owns                                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `identity`     | users, sessions, OAuth accounts, pending registrations, consents, audit log, rate limits, email preferences/tokens/suppressions |
| `productivity` | projects, tasks, focus sessions, habits, habit entries, goals, goal checkpoints, notifications, notification preferences        |
| `finance`      | accounts, categories, transactions, budgets, subscriptions, net-worth snapshots, record revisions                               |
| `trading`      | trading accounts, strategies, trades, executions, trade notes                                                                   |
| `dashboard`    | no tables — composes reads across the others                                                                                    |

Modules talk through service functions, never by importing each other's
repositories. `productivity` holds tasks _and_ habits _and_ goals in one module
because the dashboard reads them together; splitting them would put a join
across a module boundary on the hottest query in the product.

## Value representation

| Kind of value           | Stored as                                                       | Why                                                                                                                                     |
| ----------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Money                   | `bigint` minor units + ISO-4217 `currency`                      | Binary floating point cannot represent 0.1, and this is exactly the domain where that stops being academic                              |
| Market quantity / price | `numeric(24,8)`, read as a string, handled as a scaled `bigint` | A crypto price of 0.00003421 needs more than two decimals; reading it into a JS number would round it                                   |
| Goal target / progress  | `varchar` + a kind discriminator                                | A financial goal is minor units; a numeric goal may be fractional (42.195 km). One numeric column cannot hold both without rounding one |
| Calendar day            | `date`                                                          | "Due Tuesday" is a day, not an instant. Mixing the two is what makes streaks wrong across timezones                                     |
| Moment in time          | `timestamptz`                                                   | Always UTC, resolved against the user's stored timezone at the edge                                                                     |
| Recurrence              | RFC 5545 `RRULE` string                                         | "Every second Tuesday" needs no schema change, and the semantics are a well-specified standard rather than ours                         |

## Invariants the database enforces

Application code can forget; a constraint cannot.

| Constraint                                                                       | What it prevents                                                              |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `tasks_completed_consistency` — `(status = 'done') = (completed_at is not null)` | A done task with no completion time, which would make history and streaks lie |
| `tasks_priority_check`, `tasks_status_check`                                     | Values outside the known set                                                  |
| `transactions_amount_nonzero`                                                    | A zero-value ledger entry                                                     |
| `transactions_account_external_key` (partial unique)                             | Duplicate rows on CSV re-import                                               |
| `habit_entries_habit_date_key` (unique)                                          | Double-counting a habit within one day                                        |
| `goals_financial_has_currency`                                                   | A money goal with no currency, which could not be formatted or compared       |
| `trade_executions_quantity_positive`                                             | A fill of zero or negative size                                               |
| `trade_notes_confidence_range`                                                   | A 1–5 rating outside 1–5                                                      |
| `notifications_user_dedupe_key` (partial unique)                                 | The same alert raised twice                                                   |
| `users_email_lower_key` (unique on `lower(email)`)                               | Two accounts differing only in case                                           |
| `sessions_token_hash_key` (unique)                                               | Token collision                                                               |

## Derived, never stored

Storing a computed value creates a cache with no invalidation story. These are
computed on read:

- **Account balance** — opening balance plus the sum of transactions. A mutable
  `balance` column drifts from its own ledger the first time a write fails.
- **Habit streaks** — from the entry dates. A stored counter goes silently
  wrong after a backfill, a deletion, or a timezone change.
- **Trade entry/exit price and realised P&L** — from `trade_executions`, which
  are the source of truth. Recomputed in full on every execution write rather
  than adjusted incrementally, because incremental updates drift.
- **Goal progress percentage** — from current and target values.

`goals.current_value` and the aggregate columns on `trades` are explicit caches
of the latest derivation, written in the same operation that changes the source
rows.

## Indexes

Chosen from the queries that actually run, not speculatively:

| Index                                                        | Serves                                                       |
| ------------------------------------------------------------ | ------------------------------------------------------------ |
| `tasks_user_status_scheduled_idx`                            | The dashboard's hottest query: this user's open work, by day |
| `tasks_user_due_idx`                                         | Overdue detection                                            |
| `notifications_user_unread_idx` (partial, `read_at is null`) | The bell's unread count — the only list it queries           |
| `transactions_user_occurred_idx`                             | Ledger listing and period totals                             |
| `transactions_transfer_group_idx`                            | Finding both legs of a transfer                              |
| `habit_entries_user_date_idx`                                | Streak computation across all habits in one query            |
| `trades_account_status_idx`                                  | Open positions per account                                   |
| `sessions_token_hash_key`                                    | Session resolution on every authenticated request            |

Partial indexes are used where the query only ever wants a subset, so the index
stays small.

## Error contract

One shape, in `src/lib/result.ts`:

```ts
type Result<T> = { ok: true; value: T } | { ok: false; error: AppError };

type AppError = {
  kind: 'not_found' | 'invalid' | 'conflict' | 'forbidden' | 'rate_limited';
  message: string; // shown verbatim; never an internal code or stack
  field?: string; // for 'invalid', so a form can mark the control
  code?: string;
  retryAfterSeconds?: number;
};
```

Three rules it encodes:

1. **A failure is a value, not an exception.** Expected failures are returned;
   exceptions are reserved for genuine bugs, so a `catch` in a route handler
   means something is actually wrong.
2. **`not_found` covers unauthorised**, per the ownership rule above.
3. **Every user-facing message lives on the error**, so the UI never invents
   copy from a code and cannot leak an internal one.

`toFormState()` is the single mapping from an error to form state, so a
validation failure marks the same control everywhere in the product.

## Query primitives

`src/lib/query.ts` centralises pagination, sorting and search so every list has
the same guarantees:

- **Pagination is bounded** — `MAX_PAGE_SIZE` is a hard cap; a caller asking
  for more gets the cap, not an unbounded query.
- **Sort keys are allow-listed** — an arbitrary column name never reaches a
  query builder, which would let a caller order by a column they should not be
  able to observe.
- **Search terms are escaped** for `LIKE`, so a term containing `%` matches a
  literal percent sign rather than becoming a wildcard.
- **Ordering has a tiebreaker**, so pages do not overlap or skip rows when the
  primary sort key ties.

## Migration strategy

Forward-only, generated by `drizzle-kit` from the schema and committed as SQL.
Applied by `pnpm db:migrate`, which is idempotent and records what it has run.

**Rollback is still an open decision (D-15).** drizzle-kit generates forward
migrations only; either hand-written down-migrations or a documented
restore-from-backup procedure is needed before real data exists.

## Extension points designed for, not built

Deliberately shaped so these need no rewrite:

- **Multi-currency** — every money row already carries its own currency; an
  `fx_rates` table and conversion-at-read is additive.
- **Bank/broker import** — `transactions.external_id` is unique per account, so
  an importer is idempotent from day one.
- **A rules engine** — `notifications` already has kinds, dedupe keys and
  per-kind preferences; the dashboard raises them from conditions. A
  user-editable rule table would feed the same pipeline.
- **Shared/household accounts** — ownership is a single `user_id` column and a
  single repository argument, so a membership table would change one layer.
