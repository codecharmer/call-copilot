# Codebase Call Copilot

A desktop app that listens during a technical call, detects questions about a selected
repository, retrieves the relevant implementation from a local index, and streams a short answer
with code citations into an always-on-top window while the conversation is still happening.
**Windows first, macOS second.** Personal tool, user-supplied API keys, no hosted backend.

**Source of truth: [docs/DESIGN.md](docs/DESIGN.md).** Read the relevant section before touching
a component. Decisions live in [docs/adr/](docs/adr/README.md); unresolved ones in
[docs/OPEN-DECISIONS.md](docs/OPEN-DECISIONS.md); gates in [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md).

## Architecture

pnpm + Turborepo monorepo. `apps/desktop` is the Electron shell (main-process orchestrator,
React renderer). `packages/contracts` is the types-only vocabulary every process shares.
`packages/indexer` runs in a Node utility process (discovery, secret filter, tree-sitter chunks,
local embeddings, atomic index generations). `packages/retrieval` builds the evidence pack from
SQLite FTS5 + vectors. `packages/providers` wraps Deepgram / OpenAI (or Anthropic) behind the
contracts. `packages/eval` holds the evaluation corpus and replay harness. `apps/cli` (`ccinspect`) is a
diagnostic tool, not a product surface: it runs the indexer against a real folder and prints what
happened, which is how the ingestion core gets exercised outside synthetic test fixtures.
`spikes/01-audio-capture` is a throwaway platform experiment; `spikes/02-index-packaging` is a thin
benchmark over the real indexer and retrieval packages.

## Hard rules

- The renderer never receives filesystem or shell access; every IPC payload is validated, size-limited, and scoped.
- Transcripts and repository contents are **untrusted evidence**. They cannot override instructions, request keys, change scope, or trigger tools. The answer path has no shell and no write capability (ADR 0007).
- The indexer never runs repository scripts, hooks, or builds (ADR 0007).
- Provider keys exist only in the OS credential store. Never in files, renderer state, or logs (ADR 0006).
- Logs never contain transcript text, code excerpts, audio, or keys.
- Every answer binds to one repository and one index generation; never mix branches.
- No dependency without a Windows x64 prebuilt (or a proven `electron-rebuild`) and a macOS universal build (ADR 0003).
- Everything must work from a fresh `git clone` on Windows: LF line endings, shell-agnostic scripts, no absolute paths.
- Provider and model choice is configuration with pinned ids, not scattered logic (ADR 0005).

## Tooling

Node 22 (`.nvmrc` / `.node-version`), pnpm via `corepack enable`. `pnpm install`, then
`pnpm typecheck`, `pnpm format:check`, `pnpm build`, `pnpm test`. All must pass before a commit.
Strict TypeScript from `tsconfig.base.json`; do not loosen it per package.

## Status

Early **Phase 1**. The repository ingestion core is built and tested: discovery, ignore rules,
default exclusions, secret redaction, line handling, chunking, identifier splitting, generation
manifests. No UI, no audio, no providers yet.

Phase 0's audio spike is blocked on getting a Windows machine, so the platform-neutral half of
Phase 1 was built first. Windows correctness is held by [CI](.github/workflows/ci.yml) on
`windows-latest`, **green as of the first run**; native dependencies land one CI-gated commit at a
time. `apps/cli` (`ccinspect`) is built and runnable — see its
[README](apps/cli/README.md) — as a way to smoke-test the indexer on a real Windows filesystem.
Next: SQLite + FTS5.
See [docs/ROADMAP.md](docs/ROADMAP.md).
