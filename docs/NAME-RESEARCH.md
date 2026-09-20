# KyliX — Preliminary Name Conflict Research

**Search date: 2026-09-20.** Performed by automated web search from this build
session.

> ## ⚠️ This is NOT a trademark clearance search
>
> This is a preliminary conflict scan: public web search only. It is not a
> search of any trademark register, it covers no specific goods-and-services
> class, and it is not legal advice. **No clearance is claimed and none should
> be inferred.** A qualified trademark attorney must run a proper clearance
> search in every intended market before this name is used publicly.

## Headline finding

**"Kylix" is in active use as a brand in the financial-services sector, and is
a registered trademark elsewhere. Adopting it for a personal finance product
carries material risk.**

The recommendation below is to change the name.

## Conflicts found

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

## Domains

`kylix.online` resolves to an active company site. **No domain availability
check was performed** — that needs registrar or WHOIS queries, which were not
run. Nothing about `.com`, `.in`, `.app` or any other TLD is known.

## Not searched

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

## Recommendation

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

## Where the name currently appears

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
