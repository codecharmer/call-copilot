# @call-copilot/retrieval

Retrieval and evidence validation from [docs/DESIGN.md](../../docs/DESIGN.md) §8: parallel
exact-identifier, BM25 (SQLite FTS5) and semantic search within one index generation; merge and
dedupe; one bounded relation expansion (imports, definitions, callers, config, tests); evidence
pack of ~8–12 chunks within a token budget; request-local source IDs; citation validation against
the supplied pack.

Returns only evidence from the requested repository and generation. Status: placeholder.
