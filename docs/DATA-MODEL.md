# Nested Flow — Data Model (proposed)

> Status: **PROPOSED.** Not yet implemented as migrations.

## Conventions

- **Primary keys** — UUID v7 (time-sortable, non-enumerable).
- **Money** — `BIGINT` in **minor units** (paise, cents) plus an ISO-4217 `currency` column.
  Floating point is never used for money anywhere in the system.
- **Market quantities and prices** — `NUMERIC(24,8)`. Crypto and fractional shares need the
  precision; `BIGINT` minor units do not fit an 8-decimal asset price.
- **Ownership** — every user-scoped table carries `user_id` with a FK and an index whose
  leading column is `user_id`.
- **Soft delete** — `deleted_at` on user-recoverable entities; hard delete on join tables.
- **Timestamps** — `timestamptz`, always UTC. Calendar-day fields (`occurred_on`,
  `scheduled_for`) are `date`, resolved against the user's stored timezone.

---

## Identity

| Table       | Key columns                                                                                                                       |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `users`     | `id`, `email` (citext unique), `password_hash`, `display_name`, `timezone`, `locale`, `base_currency`, `created_at`, `deleted_at` |
| `sessions`  | `id`, `user_id`, `token_hash` (unique), `expires_at`, `idle_expires_at`, `ip`, `user_agent`, `created_at`                         |
| `audit_log` | `id`, `user_id`, `action`, `entity_type`, `entity_id`, `metadata` jsonb, `ip`, `created_at` — append-only                         |

## Tasks & focus

| Table            | Key columns                                                                                                                                                                                                                                                |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `projects`       | `id`, `user_id`, `name`, `color`, `archived_at`                                                                                                                                                                                                            |
| `tasks`          | `id`, `user_id`, `project_id?`, `parent_task_id?`, `title`, `notes`, `status` (todo/doing/done/cancelled), `priority`, `due_at`, `scheduled_for` date, `estimate_minutes`, `completed_at`, `rrule` text, `recurrence_parent_id?`, `sort_key`, `created_at` |
| `focus_sessions` | `id`, `user_id`, `task_id?`, `started_at`, `ended_at`, `planned_minutes`, `interrupted`                                                                                                                                                                    |

Recurrence stores an RFC 5545 `RRULE` and **materialises only the next occurrence** on
completion. Infinite series are never expanded into rows.

## Habits

| Table           | Key columns                                                                                           |
| --------------- | ----------------------------------------------------------------------------------------------------- |
| `habits`        | `id`, `user_id`, `name`, `cadence` (daily/weekly/custom), `target_per_period`, `color`, `archived_at` |
| `habit_entries` | `id`, `habit_id`, `on_date`, `count`, `note` — unique `(habit_id, on_date)`                           |

Streaks are computed, never stored — a stored streak is a cache that silently goes wrong
after a backfill or a timezone change.

## Goals

| Table              | Key columns                                                                                                                            |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `goals`            | `id`, `user_id`, `title`, `type` (numeric/habit/financial/milestone), `target_value`, `current_value`, `unit`, `target_date`, `status` |
| `goal_checkpoints` | `id`, `goal_id`, `at`, `value`, `note`                                                                                                 |

## Finance

| Table                 | Key columns                                                                                                                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `accounts`            | `id`, `user_id`, `name`, `kind` (cash/bank/card/investment/broker/loan), `currency`, `opening_balance_minor`, `archived_at`                                                                   |
| `categories`          | `id`, `user_id`, `name`, `kind` (income/expense/transfer), `parent_id?`, `color`, `icon`                                                                                                      |
| `transactions`        | `id`, `user_id`, `account_id`, `category_id?`, `occurred_on` date, `amount_minor` (signed), `currency`, `description`, `merchant`, `kind`, `transfer_group_id?`, `external_id?`, `created_at` |
| `budgets`             | `id`, `user_id`, `category_id`, `period` (monthly/weekly), `amount_minor`, `starts_on`, `ends_on?`                                                                                            |
| `subscriptions`       | `id`, `user_id`, `name`, `account_id?`, `category_id?`, `amount_minor`, `currency`, `cadence`, `next_due_on`, `last_charged_on`, `status`, `cancel_by?`                                       |
| `net_worth_snapshots` | `id`, `user_id`, `on_date`, `assets_minor`, `liabilities_minor` — unique `(user_id, on_date)`                                                                                                 |

**Transfers** are two rows sharing a `transfer_group_id`, signs opposite. A transfer is
therefore never double-counted as income or expense, which is the single most common
correctness bug in personal-finance apps.

**Account balance** is derived from `opening_balance_minor` plus the sum of transactions —
never a mutable `balance` column that can drift out of sync with its own ledger.

**`external_id`** is unique per `(user_id, account_id)` and exists so CSV re-imports are
idempotent rather than duplicating history.

## Trading

| Table               | Key columns                                                                                                                                                                                                                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `trading_accounts`  | `id`, `user_id`, `name`, `broker`, `currency`, `starting_balance_minor`, `risk_per_trade_pct`                                                                                                                                                                                                                                              |
| `strategies`        | `id`, `user_id`, `name`, `description`, `rules` md, `archived_at`                                                                                                                                                                                                                                                                          |
| `trades`            | `id`, `user_id`, `trading_account_id`, `strategy_id?`, `symbol`, `asset_class`, `direction` (long/short), `status` (planned/open/closed/cancelled), `opened_at`, `closed_at`, `quantity`, `entry_price`, `exit_price`, `stop_price`, `target_price`, `fees_minor`, `realized_pnl_minor`, `r_multiple`, `planned_risk_minor`, `tags` text[] |
| `trade_executions`  | `id`, `trade_id`, `side` (buy/sell), `quantity`, `price`, `fee_minor`, `executed_at`                                                                                                                                                                                                                                                       |
| `trade_notes`       | `id`, `trade_id`, `kind` (thesis/review/psychology), `body`, `emotion_tag`, `confidence`, `created_at`                                                                                                                                                                                                                                     |
| `trade_attachments` | `id`, `trade_id`, `storage_key`, `mime`, `bytes`                                                                                                                                                                                                                                                                                           |

`trade_executions` is the source of truth. Entry price, exit price, quantity, and realised
P&L on `trades` are **derived aggregates**, recomputed on every execution write. This is
what makes partial fills and scaling in/out representable — a journal that assumes one
entry and one exit is unusable for real trading.

`r_multiple` is computed from `planned_risk_minor`, so risk discipline is measurable rather
than self-reported.

## Connections

| Table              | Key columns                                                                                                                       |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `links`            | `id`, `user_id`, `source_type`, `source_id`, `target_type`, `target_id`, `relation` — unique on the whole tuple                   |
| `automation_rules` | `id`, `user_id`, `name`, `trigger_type`, `trigger_config` jsonb, `action_type`, `action_config` jsonb, `enabled`, `last_fired_at` |
| `automation_runs`  | `id`, `rule_id`, `fired_at`, `status`, `payload` jsonb, `error?`                                                                  |
| `notifications`    | `id`, `user_id`, `kind`, `title`, `body`, `entity_type?`, `entity_id?`, `read_at?`, `created_at`                                  |

`links` is intentionally polymorphic and therefore cannot carry FK constraints to targets.
Referential integrity is enforced in the service layer and swept by a scheduled integrity
check. This trade-off is accepted deliberately: the alternative is a join table per pair,
which does not scale as modules are added.

## Insights

| Table           | Key columns                                                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `daily_rollups` | `user_id`, `on_date`, `tasks_completed`, `focus_minutes`, `habits_hit`, `net_cashflow_minor`, `trades_closed`, `realized_pnl_minor` — PK `(user_id, on_date)` |

Recomputed idempotently from source tables, so a rebuild is always safe.

## Multi-currency

`base_currency` on `users` plus a `currency` on every money-bearing row. **M1–M6 assume a
single base currency**; foreign-currency rows are stored faithfully but not converted.
An `fx_rates` table and conversion-at-read are a documented later extension (D-03) —
designed for, not built, so the schema does not need rewriting later.
