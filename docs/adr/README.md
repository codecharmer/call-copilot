# Architecture Decision Records

One file per decision, numbered in the order the decision was made. Format:
**Context** (what forced the decision), **Decision** (what we chose), **Consequences**
(what it costs and what it unlocks). Status is one of `Proposed`, `Accepted`, `Superseded by NNNN`.

Rows in [OPEN-DECISIONS.md](../OPEN-DECISIONS.md) become ADRs here once settled.

| ADR                                                         | Title                                                           | Status   |
| ----------------------------------------------------------- | --------------------------------------------------------------- | -------- |
| [0001](0001-electron-desktop-shell.md)                      | Electron desktop shell with a separate index worker process     | Accepted |
| [0002](0002-monorepo-tooling.md)                            | pnpm + Turborepo monorepo                                       | Accepted |
| [0003](0003-platform-baseline-windows-first.md)             | Windows first, macOS second; clone-and-run on both              | Accepted |
| [0004](0004-local-index-sqlite-fts5.md)                     | Local index in SQLite with FTS5; vector backend chosen by spike | Proposed |
| [0005](0005-provider-adapters-are-configuration.md)         | Provider and model selection is configuration                   | Accepted |
| [0006](0006-credentials-in-os-credential-store.md)          | Provider keys live only in the OS credential store              | Accepted |
| [0007](0007-transcripts-and-repo-contents-are-untrusted.md) | Transcripts and repository contents are untrusted evidence      | Accepted |
