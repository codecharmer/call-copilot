# 0004 — Local index in SQLite with FTS5; vector backend chosen by spike

Status: Proposed · 2026-09-17 · Finalised by spike 02

## Context

Retrieval needs both lexical search (exact identifiers, paths, BM25) and semantic search
(natural-language questions against code) within one atomic index generation
([DESIGN.md](../DESIGN.md) §6, §8). Embeddings must be computed locally by default (§10). The
store must run inside a packaged Electron app on Windows and macOS with no server.

## Decision (proposed)

- SQLite is the single local store: repository metadata, generations, chunks, FTS5 virtual table
  for lexical search with BM25 ranking, and vectors keyed by chunk ID.
- Identifiers are stored both verbatim and split (`processWebhook` / `process_webhook` /
  "process webhook") so spoken forms match without losing exact-match signals.
- Vector search backend is **open** until spike 02 benchmarks: candidates are an embedded
  extension (e.g. sqlite-vec) versus a bounded exact scan in the worker. FTS5 does not provide
  vector search and must not be described as doing so.
- Local embedding model: a small pinned model whose id, checksum, dimensions and preprocessing
  version are recorded on every generation. Licence, download size and RAM are spike outputs.

## Consequences

- Indexes are copies of source code stored under the user's app-data directory with restrictive
  permissions. They are _not_ encrypted by SQLite; app-level encryption stays an open decision.
- Windows prebuilt availability for the SQLite binding, the vector extension and the embedding
  runtime is a hard gate (see ADR 0003).
