# Spike 02 — Index packaging and performance

Design refs: [DESIGN.md](../../docs/DESIGN.md) §6, §8, §11; [ADR 0004](../../docs/adr/0004-local-index-sqlite-fts5.md).

## How this spike is built

This spike owns **no indexing logic**. It imports `@call-copilot/indexer` and
`@call-copilot/retrieval`, runs them over a reference corpus, and writes timings to
`results/REPORT.md`. What it measures is exactly what ships.

## Goal

Prove that the local indexing stack installs from a fresh clone on Windows and macOS with no
manual steps, and meets the retrieval latency targets on a reference corpus, without executing
anything inside the indexed repository.

## Candidate stack (each item is swappable)

| Concern       | Candidate                                                                                | Windows/macOS prebuilt? |
| ------------- | ---------------------------------------------------------------------------------------- | ----------------------- |
| Parsing       | tree-sitter (web-tree-sitter WASM, or node bindings) for JS/TS/PHP/Python                | record                  |
| Lexical index | SQLite via better-sqlite3 (or node:sqlite in Node 22.5+) with FTS5                       | record                  |
| Embeddings    | Small local model via a Node runtime (e.g. ONNX / transformers.js), pinned id + checksum | record                  |
| Vector search | sqlite-vec extension vs bounded exact scan in the worker                                 | record                  |

## Checklist

- [ ] Fresh clone → `corepack enable && pnpm install` on Windows x64 and on the Intel Mac; note every native build step or failure.
- [ ] Pick a reference corpus (≤ 10,000 text files / 1M lines) the user has permission to process; record its size.
- [ ] Apply ignore rules (nested `.gitignore` + `.callcopilotignore`) and default exclusions; count included/excluded with reasons.
- [ ] Secret filter pass; confirm line numbers survive redaction.
- [ ] Chunk by symbol boundaries (400–900 tokens) with line-based fallback; verify line numbers on a CRLF file and a file with multi-byte characters.
- [ ] Store identifiers verbatim + split forms in FTS5; test `processWebhook` / `process_webhook` / "process webhook".
- [ ] Embed all chunks; record model id, checksum, dimensions, download size, RAM, wall time.
- [ ] 50 sample queries: measure exact/BM25/semantic search latency individually and merged (target p95 ≤ 500 ms).
- [ ] Incremental: edit one file, measure time to a new generation (target p95 ≤ 5 s).
- [ ] Branch switch: confirm the old generation stays readable until the new one is published atomically.
- [ ] Package the worker inside an Electron utility process and repeat the latency measurement.

## Report (`results/REPORT.md`)

Hardware, corpus, every timing against the §11 targets, install friction per OS, and the final
recommendation that closes [ADR 0004](../../docs/adr/0004-local-index-sqlite-fts5.md).
