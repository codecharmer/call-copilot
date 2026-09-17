# 0002 — pnpm + Turborepo monorepo

Status: Accepted · 2026-09-17

## Context

The design separates the desktop shell, contracts, index worker, retrieval, provider adapters and
an evaluation harness. Those boundaries should be real package boundaries so the worker cannot
accidentally import renderer code and the eval harness can run without Electron. The author's
most recent TypeScript project (`praxis`) already uses pnpm 9 + Turborepo + a strict shared
`tsconfig.base.json`, so the conventions are known.

## Decision

- pnpm workspaces (`apps/*`, `packages/*`, `spikes/*`), Turborepo for task orchestration.
- Node 22 LTS pinned in `.nvmrc` / `.node-version`; pnpm pinned via `packageManager` so
  `corepack enable` yields the same version on Windows and macOS.
- One strict `tsconfig.base.json` inherited by every package.
- `@call-copilot/contracts` is types-only and is the single shared vocabulary.

## Consequences

- Contributors run `corepack enable && pnpm install` on any OS; no global pnpm install needed.
- Root scripts must stay shell-agnostic (no `rm -rf`, no bash-isms) so they work in PowerShell.
- Turborepo caching keeps typecheck/test fast as packages grow.
