# KyliX — Asset & Dependency License Inventory

**Compiled: 2026-09-20**, by reading the `license` field of each installed
package from `node_modules`. Every entry below was read from the package
actually installed, not assumed from memory.

## Summary

Every direct dependency is under a permissive licence — MIT, Apache-2.0,
ISC, BSD-2-Clause, or SIL OFL-1.1. **No copyleft (GPL/AGPL/LGPL) licence
appears among the direct dependencies**, and nothing here restricts commercial
use.

## Fonts

| Asset                                             | Version | Licence         | How it is served                           |
| ------------------------------------------------- | ------- | --------------- | ------------------------------------------ |
| Inter (variable) via `@fontsource-variable/inter` | 5.3.0   | **SIL OFL-1.1** | Self-hosted `.woff2`, bundled by the build |

The OFL permits bundling and commercial use. Its conditions — the font must not
be sold on its own, and a derivative must not use the reserved name — are both
satisfied: Inter is shipped unmodified as part of an application.

**No remote font loading.** Nothing is fetched from Google Fonts or any other
third-party font host at runtime. This is both a privacy property (no request
carrying the user's IP leaves the origin) and a Content Security Policy one —
`font-src` is `'self'`, so a remote font could not load even if one were added
by mistake.

## Icons

| Asset          | Version | Licence | Notes                                              |
| -------------- | ------- | ------- | -------------------------------------------------- |
| `lucide-react` | 1.47.0  | **ISC** | Consistent stroke weight, used as React components |

Emoji are **not** used as interface icons anywhere. Icons are rendered as
inline SVG from the library, so no icon request leaves the origin either.

## Runtime dependencies

| Package                      | Version | Licence    |
| ---------------------------- | ------- | ---------- |
| `@fontsource-variable/inter` | 5.3.0   | OFL-1.1    |
| `@node-rs/argon2`            | 2.2.1   | MIT        |
| `arctic`                     | 3.7.0   | MIT        |
| `clsx`                       | 2.1.1   | MIT        |
| `date-fns`                   | 4.4.0   | MIT        |
| `drizzle-orm`                | 0.45.2  | Apache-2.0 |
| `jose`                       | 6.2.12  | MIT        |
| `lucide-react`               | 1.47.0  | ISC        |
| `next`                       | 16.3.5  | MIT        |
| `pg`                         | 8.23.0  | MIT        |
| `react`                      | 19.3.0  | MIT        |
| `react-dom`                  | 19.3.0  | MIT        |
| `tailwind-merge`             | 3.7.0   | MIT        |
| `uuidv7`                     | 1.2.1   | Apache-2.0 |
| `zod`                        | 4.6.5   | MIT        |

## Development dependencies

| Package                | Version | Licence      |
| ---------------------- | ------- | ------------ |
| `@playwright/test`     | 1.63.0  | Apache-2.0   |
| `@tailwindcss/postcss` | 4.3.3   | MIT          |
| `@types/node`          | 26.6.2  | MIT          |
| `@types/pg`            | 8.23.1  | MIT          |
| `@types/react`         | 19.3.0  | MIT          |
| `@types/react-dom`     | 19.3.0  | MIT          |
| `dotenv`               | 18.0.1  | BSD-2-Clause |
| `drizzle-kit`          | 0.31.10 | MIT          |
| `eslint`               | 9.39.5  | MIT          |
| `eslint-config-next`   | 16.3.5  | MIT          |
| `postcss`              | 8.5.28  | MIT          |
| `prettier`             | 3.9.8   | MIT          |
| `tailwindcss`          | 4.3.3   | MIT          |
| `tsx`                  | 4.23.15 | MIT          |
| `typescript`           | 5.9.3   | Apache-2.0   |
| `vitest`               | 5.0.1   | MIT          |

## Vulnerability audit

`pnpm audit` — **no known vulnerabilities** as of 2026-09-20.

One moderate advisory was present before it was fixed: `esbuild <=0.25.0`
([GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99)),
reached transitively through `drizzle-kit → @esbuild-kit/*`. It is a
development-server issue and never reaches production, but it is resolved
rather than merely triaged, via a pnpm override pinning `esbuild >=0.25.0`.

## Original work

All UI design, layout, component styling, colour tokens, type scale, and copy in
this repository are original.

**From the supplied reference image**, only the general visual _direction_ was
taken: a dark foundation with restrained blue, mint, green and violet accents,
generous spacing, subtle borders. Deliberately **not** reproduced:

- its wordmark, logotype, or any lettering;
- its illustrations or decorative artwork;
- its icon set;
- its specific layout compositions;
- any marketing copy or taglines.

No screenshots, mockups, templates, stock imagery, or third-party design assets
have been copied into this repository. There are no image assets at all — every
visual element is CSS or an inline SVG icon from the ISC-licensed library above.

## Not verified

- Transitive dependency licences were **not** enumerated. Only direct
  dependencies were checked. A full tree audit (e.g. `license-checker`) should
  run before public release.
- No patent review of any kind has been performed.
- No legal review of licence compatibility has been performed. The observation
  that these licences are permissive and mutually compatible is a developer's
  reading, not advice.

## Maintenance

Re-run before each release:

```bash
pnpm audit            # vulnerability advisories
pnpm outdated         # version drift
```

Adding a dependency means adding it to this inventory and checking its licence
first, not afterwards.
