# Nested Flow — Age Policy

**Implemented in:** `src/modules/identity/age.ts`, enforced server-side in
`src/modules/identity/service.ts`, covered by 12 unit tests and 2 E2E tests.

## The policy

**Minimum age to hold a Nested Flow account: 18.**

A self-declared date of birth is collected at sign-up and checked on the server
before any account is created.

## Why 18

Nested Flow stores personal financial records and a trading journal. Two things drive
the threshold:

1. **India's DPDP Act, 2023** treats anyone under 18 as a child and requires
   verifiable parental consent before processing their personal data. Nested Flow has
   no parental-consent mechanism, and building a half-working one would be worse
   than not admitting minors at all.
2. The subject matter — spending, budgets, trading outcomes — is written for
   adults managing their own money.

Setting the bar at 18 means the product does not need a parental-consent flow,
a guardian relationship model, or a separate minor experience. That is a
deliberate simplification, and it is the reason under-18s are refused rather
than onboarded into a restricted mode.

## What this is NOT

**This is not age verification, and Nested Flow does not claim it is.**

A date typed into a form proves nothing. Anyone can enter a different year. In
every jurisdiction that mandates _age assurance_ — as opposed to an age
declaration — a self-declared date of birth is explicitly insufficient.

Specifically, Nested Flow makes **no claim** to satisfy:

- the UK's Online Safety Act "highly effective age assurance" duties;
- any age-verification requirement under US state law;
- the EU's evolving age-assurance expectations under the DSA;
- any regulator's standard, anywhere, for verified age.

What the gate actually achieves: it stops casual under-age sign-up, it records
a good-faith check, and it gives a clear, documented basis for refusing an
account. That is its entire scope.

## What Nested Flow deliberately does not collect

- **No government identity documents.** None are requested and none are
  accepted. Collecting them would create a far more sensitive data store than
  anything else in the product, to solve a problem the product does not have.
- **No biometric or facial age estimation.**
- **No third-party age-assurance provider.** None is integrated. If one is ever
  needed, that is a separate design with a named provider, a data-protection
  assessment, and an update to this document.

## Handling an under-age applicant

When the check fails:

1. **No account is created.** The refusal happens before any row is written.
2. **The date of birth is not retained.** An `auth.signup.age_restricted` audit
   entry records only the reason (`underage`, `future`, `implausible`,
   `invalid`) — never the date itself. Keeping a child's data after refusing
   them would defeat the purpose of the refusal. This is asserted by test.
3. **The message does not state the applicant's computed age**, which would let
   someone probe for the exact threshold. Also asserted by test.
4. There is no appeal flow and no restricted mode. The account simply is not
   created.

## Where the threshold is enforced

Server-side, in the sign-up service, before the user row exists. The form field
is a convenience for honest users; it is not the control. A request posted
directly to the server, bypassing the form entirely, hits the same check — this
is covered by an integration test that calls the service directly.

## Before public launch

- [ ] Confirm the intended launch markets, since the applicable rules follow the
      user's location, not the operator's.
- [ ] Take legal advice on whether 18 is correct for each of those markets, and
      on whether age assurance rather than declaration is required.
- [ ] If assurance is required anywhere: name the provider, design the flow,
      complete a data-protection assessment, and rewrite this document.
- [ ] Review whether the date of birth needs to be retained at all after the
      check, or whether an `ageVerifiedAt` timestamp alone would do. Storing
      less would be better.

## Not claimed

No jurisdiction has been formally analysed. No regulator has reviewed this. No
compliance of any kind is asserted. This document describes what the code does
and the reasoning behind it — nothing more.
