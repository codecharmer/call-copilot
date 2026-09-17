# @call-copilot/indexer

Index worker (runs in a Node utility process, never the main process). Responsibilities from
[docs/DESIGN.md](../../docs/DESIGN.md) §6:

- Discovery inside a canonical root; symlinks ignored; nested `.gitignore` + `.callcopilotignore`.
- Default exclusions (deps, bundles, binaries, caches, media, keys, `.env*`) with visible reasons.
- Content-based secret filter before storage; line numbers preserved when redacting.
- Tree-sitter parsing for JS/TS/PHP/Python into symbol-bounded chunks; line-based fallback.
- Local embeddings with a pinned model (id, checksum, dimensions, preprocessing version recorded).
- File watching, debounced incremental reindex, atomic index generations bound to git branch/HEAD/dirty.

Never runs repository scripts, hooks, or builds. Status: placeholder until Phase 1.
