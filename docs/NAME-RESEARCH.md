# Nested Flow — Name Status

## Current name

**Nested Flow.** Chosen by the product owner on 2026-09-23 and adopted
throughout the codebase. This is the permanent product name, not a working
name.

> ## ⚠️ This is NOT a trademark clearance search
>
> What follows is a preliminary conflict scan by public web search, performed
> on **2026-09-23** from this build session. It searched no trademark
> register, covered no goods-and-services class, and is not legal advice.
> **No clearance is claimed and none should be inferred.** A qualified
> trademark attorney must run a proper clearance search in every intended
> market before this name is used publicly.

## Headline finding

**No direct same-sector collision was found for "Nested Flow" — unlike the
previous name. The risks here are different in kind: the phrase is an
established generic technical term, and the "Flow" personal-finance app space
is already crowded.**

Neither is a blocker on its own. Both are things an attorney needs to be told.

## What was found

### 1. "Nested flow" is a standard technical term 🟠

This is the most consequential finding. "Nested flow" / "nested workflow" is
the ordinary industry term for a workflow embedded inside another workflow —
it appears as a **glossary definition** and in Microsoft's own Power Platform
documentation. It is also used in engineering, in granted US patents for
"nested-flow heat exchangers".

| Source                                          | URL                                                                                |
| ----------------------------------------------- | ---------------------------------------------------------------------------------- |
| Activepieces glossary, "Nested Flows"           | https://resources.activepieces.com/glossary/nested-flows                           |
| Microsoft Power Platform blog                   | https://www.microsoft.com/en-us/power-platform/blog/2017/06/23/build-nested-flows/ |
| US patent 10465990, nested-flow heat exchangers | https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/10465990          |

**Why this matters:** a descriptive or commonly-used phrase is generally weaker
as a trademark than an invented word. That cuts both ways — harder to own,
easier for others to adopt without infringing. It is the same weakness the
previous research flagged for "kylix" being a dictionary word, and here it is
stronger, because the term is used specifically in software.

### 2. NestedFlow Automation — exact compound, software sector 🟠

A free Windows scriptless test-automation tool trading as **NestedFlow**, at
`nestedflowautomation.com`. Same compound word, software sector, different
purpose — test automation, not personal finance.

| Source          | URL                               |
| --------------- | --------------------------------- |
| Product website | https://nestedflowautomation.com/ |

**Not verified.** The site could not be fetched from this environment (see
_Limits_ below), so its size, activity, ownership and any trademark claim are
unknown. It was found via search index only.

### 3. Nest Flow — near-identical name, adjacent purpose 🟡

A product called **Nest Flow** whose own description uses the phrase "nested
flows": it builds and shares nested workflows for teaching and learning.

| Source  | URL                           |
| ------- | ----------------------------- |
| Product | https://nest-flow.vercel.app/ |

One word apart, and the marketing copy uses the exact phrase. Appears to be a
small hosted project rather than an established brand, but it is the closest
name found.

### 4. A crowded "Flow" personal-finance space 🟡

No app named "Nested Flow" was found on either store. But the sector is
saturated with "Flow" finance apps, which is a discoverability and
consumer-confusion risk even where it is not a legal one:

| App                        | Source                                                                 |
| -------------------------- | ---------------------------------------------------------------------- |
| Budget Flow                | https://apps.apple.com/us/app/budget-flow-expense-tracker/id1640091876 |
| FLOW: Personal Finance     | https://apps.apple.com/us/app/flow-personal-finance/id6765567567       |
| FinanceFlow Budget Planner | https://apps.apple.com/us/app/financeflow-budget-planner/id6770877159  |
| Flowfy: Budget & Expenses  | https://play.google.com/store/apps/details?id=com.flowfy.app           |
| FlowMoney                  | https://play.google.com/store/apps/details?id=com.flowmoney.app        |
| Flow Tasks                 | https://play.google.com/store/apps/details?id=com.flow.tasks           |

Note also that **FLOW** is itself a registered mark in other sectors — a
trademark listing exists for Dapper Labs' blockchain "FLOW". Not a conflict
with this product, but it shows the base word is actively contested.

| Source                                     | URL                                                     |
| ------------------------------------------ | ------------------------------------------------------- |
| Justia, FLOW, Dapper Labs, serial 90223765 | https://trademarks.justia.com/902/23/flow-90223765.html |

## Comparison with the previous name

|                              | KyliX                                 | Nested Flow                         |
| ---------------------------- | ------------------------------------- | ----------------------------------- |
| Same-word, same-sector rival | **Yes** — Kylix Finance, DeFi lending | **None found**                      |
| Registered mark on the word  | Borland mark reported, status unknown | None found for the phrase           |
| Weakness as a mark           | Dictionary word (Greek drinking cup)  | **Generic term of art in software** |
| Crowded namespace            | No                                    | **Yes** — many "Flow" finance apps  |

The head-on collision that forced the last rename is absent. What replaces it
is a weaker mark in a busier space, which is a commercial problem more than a
legal one.

## Limits of this scan — what was NOT done

This environment constrained the scan, and the constraints are recorded rather
than papered over:

- **No trademark register was searched.** `trademarks.justia.com` is blocked by
  this environment's network egress proxy, and USPTO TSDR requires a serial
  number you already have. USPTO, UKIPO, EUIPO, India's Trade Marks Registry
  and the WIPO Global Brand Database were all unsearched.
- **No class-specific search** — in particular **class 9** (software) and
  **class 36** (financial services).
- **No domain availability check.** DNS does not resolve in this container at
  all: a lookup of `google.com` and `github.com` returns no record, so every
  domain result here would have been a false negative. **Nothing is known about
  `nestedflow.com` or any other TLD.** Do not read the absence of a finding as
  availability.
- **Two of the three sites found could not be fetched** — the egress proxy
  blocked them. They are reported from the search index alone.
- No company-register search in any jurisdiction.
- No common-law or unregistered-rights search.
- No social media handle check.
- Search results are US-weighted; India, the stated first market, was not
  searched specifically.

## Assessment

Adopting "Nested Flow" does not reproduce the specific mistake that forced the
last rename: no active financial-services product of the same name was found.

Two things an attorney should be told explicitly:

1. The phrase is a **term of art in software** for a workflow inside a
   workflow. Expect a distinctiveness objection, and expect the mark to be
   hard to enforce against others using the words descriptively.
2. An existing **NestedFlow** trades in software, and a **Nest Flow** exists
   one word away. Both need checking properly before launch.

**This does not change the recommendation: get a real clearance search in
classes 9 and 36, in every intended market, before any public use.** Nothing
above substitutes for it.

## What adopting the name already cost

Unlike last time, the name is no longer scattered through the codebase. It now
lives in one file:

| Location                                | Notes                                                                  |
| --------------------------------------- | ---------------------------------------------------------------------- |
| `src/lib/brand.ts`                      | **The only place the name is written.** Everything else reads from it. |
| `src/components/ui/wordmark.tsx`        | Renders the wordmark from `brand.wordmark`                             |
| `src/app/manifest.ts`                   | PWA manifest, generated from `brand`                                   |
| `public/icon.svg`, `icon-maskable.svg`  | The mark. Original artwork; replaceable in isolation                   |
| `docs/*`                                | Prose, which a rename would still have to sweep                        |
| Postgres role and database `nestedflow` | Local development only; a deployment sets its own `DATABASE_URL`       |

An architecture test fails if the literal name appears anywhere in `src/`
outside `src/lib/brand.ts`, so a future rename stays a one-file change plus the
icon and the docs. That is the lesson from the last rename, encoded.

The database function `kylix_log_change()` created by migration `0007` was
**deliberately not renamed**: it is referenced by eighteen triggers in an
already-applied migration, and renaming an applied migration breaks every
existing database. It is invisible to users. If it ever needs to change, it
needs a new forward migration, not an edit to an old one.

---

# Appendix — why the previous name was dropped

The research below is preserved verbatim. It was performed on the previous
working name and is the evidence for abandoning it. **It says nothing about
"Nested Flow."**

## KyliX — Preliminary Name Conflict Research

**Search date: 2026-09-20.** Performed by automated web search from this build
session.

> ## ⚠️ This is NOT a trademark clearance search
>
> This is a preliminary conflict scan: public web search only. It is not a
> search of any trademark register, it covers no specific goods-and-services
> class, and it is not legal advice. **No clearance is claimed and none should
> be inferred.** A qualified trademark attorney must run a proper clearance
> search in every intended market before this name is used publicly.

### Headline finding

**"Kylix" is in active use as a brand in the financial-services sector, and is
a registered trademark elsewhere. Adopting it for a personal finance product
carries material risk.**

The recommendation below is to change the name.

### Conflicts found

### 1. Kylix Finance — direct sector conflict 🔴

An active DeFi lending protocol built on Substrate/Polkadot, operating under the
name "Kylix Finance" with visible funding and ecosystem presence.

| Source                          | URL                                                                                                 |
| ------------------------------- | --------------------------------------------------------------------------------------------------- |
| Web3 Foundation announcement    | https://medium.com/web3foundation/decentralized-futures-introducing-kylix-finance-6e2d35fc92a9      |
| Polkadot Forum proposal         | https://forum.polkadot.network/t/decentralised-futures-kylix-finance-the-lending-hub-parachain/6827 |
| Polkassembly funding referendum | https://polkadot.polkassembly.io/referenda/951                                                      |
| GitHub organisation             | https://github.com/Kylix-Finance                                                                    |
| Preqin asset profile            | https://www.preqin.com/data/profile/asset/kylix/759757                                              |

**Why this matters most:** it is the same word, in the same broad sector
(financial software), with an established public presence. A personal finance
app called KyliX would sit close enough to invite confusion, and this is the
conflict most likely to become a dispute.

### 2. Borland Kylix — registered mark 🟠

"Kylix" was a Borland IDE (announced 1999, released 2001, since discontinued)
and is described in public sources as a registered trademark of Borland
Software Corporation.

| Source                                  | URL                                         |
| --------------------------------------- | ------------------------------------------- |
| Wikipedia                               | https://en.wikipedia.org/wiki/Borland_Kylix |
| Borland/SUSE certification announcement | https://www.suse.com/news/kylix_cert/       |
| LWN coverage                            | https://lwn.net/Articles/8529/              |

**Status unknown.** Whether any registration remains live, and in which classes
and territories, was **not** determined — that requires a register search, which
was not performed. Discontinuation of a product does not automatically
extinguish a mark.

### 3. UK trademark record 🟠

A trademark listing for "KYLIX" appears under reference `UK00917881196`.

| Source              | URL                                             |
| ------------------- | ----------------------------------------------- |
| Trademarkia listing | https://www.trademarkia.com/kylix-UK00917881196 |

**Not verified.** This was not confirmed against the UK IPO register, and its
owner, classes, and current status are unknown.

### 4. Other trading entities 🟡

| Entity                         | Source                                                      |
| ------------------------------ | ----------------------------------------------------------- |
| Kylix Technologies Ltd         | https://www.zoominfo.com/c/kylix-technologies-ltd/547159014 |
| Kylix Enterprises Inc          | https://www.zoominfo.com/c/kylix-enterprises-inc/462775289  |
| Kylix Technologies (live site) | https://kylix.online/                                       |

### 5. The word itself 🟡

A _kylix_ is an ancient Greek drinking cup. A common dictionary word is
generally weaker as a trademark than an invented one, which cuts both ways: it
is harder to own, and easier for others to adopt.

### Domains

`kylix.online` resolves to an active company site. **No domain availability
check was performed** — that needs registrar or WHOIS queries, which were not
run. Nothing about `.com`, `.in`, `.app` or any other TLD is known.

### Not searched

For completeness, none of the following was done:

- No search of any official trademark register (USPTO, UKIPO, EUIPO, India's
  Trade Marks Registry, WIPO Global Brand Database).
- No class-specific search — in particular **class 9** (software) and **class 36**
  (financial services), the two that matter here.
- No app store name search (Apple App Store, Google Play).
- No company-register search in any jurisdiction.
- No common-law or unregistered-rights search.
- No domain availability or WHOIS check.
- No social media handle check.

### Recommendation

**Change the working name before any public use.** The Kylix Finance conflict is
in the same sector as this product, which is the worst kind of overlap, and the
Borland mark adds a second unknown on top of it.

The name is currently confined to internal documentation and trivially
renameable UI strings — no logo, no domain, no app store listing, no manifest
branding — exactly so that this decision stays cheap. It gets more expensive
every week it is deferred.

### Suggested process

1. Shortlist 3–5 candidate names, preferring invented words over dictionary ones.
2. Run this same preliminary scan on each, and record it here.
3. Instruct a trademark attorney for a proper clearance search in the intended
   markets, in classes 9 and 36.
4. Only after clearance: register domains and social handles, commission a
   wordmark, and update every reference in this repository.

### Where the name currently appears

| Location                                                | Notes                               |
| ------------------------------------------------------- | ----------------------------------- |
| `src/app/layout.tsx`                                    | Page title metadata                 |
| `src/app/(auth)/layout.tsx`, `src/app/(app)/layout.tsx` | Text wordmark                       |
| `src/app/legal/*`                                       | Terms and privacy notice body text  |
| `package.json`                                          | Package name                        |
| `docs/*`                                                | Throughout                          |
| Cookie name `kylix_session`                             | Changing it signs everyone out once |
| Database role and name `kylix`                          | Local development only              |

No logo file, icon set, domain, or store listing exists — deliberately.
