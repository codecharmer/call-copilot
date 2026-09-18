# @call-copilot/cli — ccinspect

A diagnostic CLI over [@call-copilot/indexer](../../packages/indexer), not a product surface from
[docs/DESIGN.md](../../docs/DESIGN.md). It runs discovery, ignore rules, default exclusions,
secret redaction, chunking and generation hashing against a real folder and prints what happened.

It exists because the ingestion core had only ever been exercised against synthetic
temp-directory fixtures in vitest. Pointing it at a real, arbitrarily messy repository — especially
on Windows, where paths, line endings and permissions genuinely differ from macOS — is the fastest
way to catch what those fixtures cannot.

## Build and run

```bash
pnpm build
node apps/cli/dist/cli.js <path-to-a-repository>
```

Or, from within this package:

```bash
pnpm --filter @call-copilot/cli start -- <path-to-a-repository>
```

After `pnpm build`, `pnpm exec ccinspect <path>` also works (pnpm generates a `.cmd` shim for the
`bin` entry on Windows automatically).

## Options

| Flag              | Effect                                                             |
| ----------------- | ------------------------------------------------------------------ |
| `--verbose`, `-v` | List every excluded file instead of a summary by reason.           |
| `--json`          | Print one machine-readable JSON object instead of the text report. |
| `--limit N`       | How many sample files/findings to print per section (default 15).  |

## What to look for

- **The generation ID is deterministic.** Run it twice against an unmodified folder; the ID must
  match. Edit one file; it must change. That invariant is what makes an index generation a
  trustworthy citation target ([DESIGN.md §6](../../docs/DESIGN.md)).
- **Secret findings never print the matched value**, only the file, line and rule name.
- **Exit code is 1 only when the given path cannot be resolved as a directory.** Finding excluded
  files or secrets in a normal run is not a CLI failure.
