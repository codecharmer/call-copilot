# Codebase Call Copilot

A desktop companion for technical calls. It listens to the call, spots questions about a
repository you selected, finds the relevant code in a local index, and shows a short, cited
answer before the conversation moves on. Think of a live interview copilot whose central skill
is understanding _your_ codebase.

**Status: early Phase 1.** The repository ingestion core is built and tested (discovery, ignore
rules, exclusions, secret redaction, chunking, identifier splitting, generation manifests). No
UI, no audio, no providers yet. The design lives in [docs/DESIGN.md](docs/DESIGN.md).

## Platforms

Windows 10/11 x64 first, then macOS (universal). See
[ADR 0003](docs/adr/0003-platform-baseline-windows-first.md).

## Getting started (any OS)

```bash
git clone git@github.com:codecharmer/call-copilot.git
cd call-copilot
corepack enable
pnpm install
pnpm typecheck
pnpm test
pnpm build
node apps/cli/dist/cli.js .   # run the ingestion core against this repo itself
```

Requires Node 22 (`.nvmrc` / `.node-version`; use nvm, fnm, or nvm-windows). `corepack enable`
gives you the pinned pnpm version on Windows and macOS without a global install.

## Layout

| Path                 | Purpose                                                                     |
| -------------------- | --------------------------------------------------------------------------- |
| `apps/desktop`       | Electron shell, orchestrator, React renderer                                |
| `packages/contracts` | Shared types: event envelope, state machines, adapter interfaces            |
| `packages/indexer`   | Index worker: discovery, secret filter, parsing, chunking, local embeddings |
| `packages/retrieval` | FTS5 + vector search, evidence packs, citation validation                   |
| `packages/providers` | Transcription and answer-model adapters                                     |
| `packages/eval`      | Evaluation corpus and replay harness                                        |
| `spikes/`            | Phase 0 throwaway experiments with checklists and reports                   |
| `docs/`              | Design doc, roadmap, ADRs, open decisions, acceptance gates, data boundary  |

## Roadmap

| Phase | Deliverable                              | Status |
| ----- | ---------------------------------------- | ------ |
| 0     | Audio-capture and index-packaging spikes | Next   |
| 1     | Repository Q&A with typed questions      | —      |
| 2     | Live transcript                          | —      |
| 3     | Live answers                             | —      |
| 4     | Release hardening and installers         | —      |
| 5     | Expansion                                | —      |

Details in [docs/ROADMAP.md](docs/ROADMAP.md).

## Data handling

Audio goes to the configured speech provider; questions plus retrieved code excerpts go to the
configured answer provider; embeddings stay local; there is no application backend. Keys live in
the OS credential store. Full table in [docs/DATA-BOUNDARY.md](docs/DATA-BOUNDARY.md).
