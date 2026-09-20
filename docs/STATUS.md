# KyliX — Build Status

Last verified: 2026-09-20. Every claim below was produced by running the command
named, in this environment. Nothing here is asserted from inspection alone.

## Completed

### M0 — Foundation ✅

| Acceptance criterion                                      | Evidence                                                        |
| --------------------------------------------------------- | --------------------------------------------------------------- |
| `pnpm install && pnpm build` succeeds from a clean clone   | `pnpm build` — compiled, 5 routes emitted                        |
| `pnpm lint` passes with zero warnings                      | `pnpm lint` — no output, exit 0                                  |
| `pnpm typecheck` passes                                    | `tsc --noEmit` — exit 0                                          |
| `pnpm test` passes                                         | 92 tests across 7 files                                          |
| Drizzle connects; baseline migration applies               | `pnpm db:migrate` against Postgres 16; 4 tables created          |
| Env schema rejects a missing variable with a readable error | 17 tests in `tests/unit/env.test.ts`                            |
| Design tokens render in light and dark                     | `src/app/globals.css`; verified in a browser                     |
| CI runs lint, typecheck, format, tests and build           | `.github/workflows/ci.yml` — **not yet executed**, see below     |

### M1 — Identity & security baseline ✅

| Acceptance criterion                                                  | Evidence                                                                              |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Password hashed with argon2id, never logged or returned                 | `password.test.ts`; an integration test reads the column back and asserts `$argon2id$` |
| Session cookie `httpOnly` + `SameSite`, rotated, invalidated server-side | E2E `security.spec.ts` inspects the real cookie                                       |
| **Horizontal access test passes**                                       | `tests/integration/tenancy.test.ts` — 7 tests                                          |
| Rate limiter blocks brute force                                         | 6 tests, including a concurrency test proving the counter is atomic                    |
| CSP with nonce, no `unsafe-inline` in `script-src`                      | E2E asserts the header on the production build                                         |
| Zod rejects malformed input at every boundary                           | `validators.ts`, exercised by unit and E2E tests                                        |
| Audit log records sign-in, sign-out, and failures                       | Integration tests assert both the rows and their attribution                            |

## Test inventory

| Suite                       | Count | What it covers                                                  |
| --------------------------- | ----- | --------------------------------------------------------------- |
| `src/lib/money`             | 22    | Integer arithmetic, parsing, allocation, precision               |
| `src/lib/security`          | 13    | argon2id, session tokens, constant-time compare                  |
| `tests/unit/env`            | 17    | Boot-time environment contract                                   |
| `tests/unit/architecture`   | 10    | The invariants — verified to fail when violated                  |
| `tests/integration/auth`    | 23    | Sign-up, sign-in, sessions, rate limiting, audit                 |
| `tests/integration/tenancy` | 7     | Cross-account isolation                                          |
| `tests/e2e`                 | 11    | Full journey and security headers, production build, real browser |

Integration and E2E tests run against real PostgreSQL databases, not mocks.

## Defects found and fixed during M0/M1

1. **Global registration lockout.** With `TRUST_PROXY_HEADERS` off the client IP
   is null, so every anonymous caller shared one bucket — making the strict
   per-IP rule a _global_ ceiling of five sign-ups an hour. One script could
   have denied registration to everybody. Attributable and unattributable
   traffic now get separate ceilings (`networkScope` in `rate-limit.ts`), with
   regression tests. Found by the E2E suite failing on its own throttling.
2. **Timing oracle in the dummy digest.** The constant used to equalise timing
   on unknown accounts was hand-written and would not have parsed as argon2, so
   verification would have returned instantly — recreating the exact
   account-enumeration signal it existed to remove. Now computed at startup.
3. **`DATABASE_URL` validation too loose.** Zod's `.url()` accepts
   `localhost:5432`, reading `localhost` as the scheme. That passed boot
   validation and failed later with a confusing connection error. The scheme is
   now checked explicitly.
4. **Precision loss in currency formatting.** `Intl.NumberFormat#format` was
   being reached through the number overload. Measured: the number path rendered
   `…567.89` as `…568.00`. It now formats the exact decimal string.

## Deviations from the approved proposal

| Planned              | Actual          | Why                                                                                                                                                              |
| -------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ESLint 10.11.0       | **9.39.5**      | ESLint 10 crashes `eslint-plugin-react`, a dependency of `eslint-config-next`: `contextOrFilename.getFilename is not a function`. Same reasoning as TypeScript 5 vs 7 |
| `src/middleware.ts`  | `src/proxy.ts`  | Next 16 deprecated the `middleware` convention in favour of `proxy`                                                                                              |

## Not done, and not claimed

- **CI has never run.** The workflow is written and every step passes locally,
  but no push has triggered GitHub Actions, so it is unverified as a workflow.
- **No rollback migration.** drizzle-kit generates forward migrations only.
  M0's "applies and rolls back" is therefore only half met; a rollback strategy
  is still owed. Forward application to an empty database is verified.
- **No password reset.** Deferred deliberately (D-07): there is no mail
  provider, and a reset flow that cannot deliver mail is security theatre.
- **No security audit or penetration test.** The automated review in M7 has not
  been run. No third party has reviewed this code.
- **No deployment.** Nothing is hosted anywhere.
- **Lighthouse not measured.** That is an M6 criterion, and M6 has not started.

## Next

M2 (tasks, focus, habits, goals) — held pending review of M0/M1.
