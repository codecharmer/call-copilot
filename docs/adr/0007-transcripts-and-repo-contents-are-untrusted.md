# 0007 — Transcripts and repository contents are untrusted evidence

Status: Accepted · 2026-09-17

## Context

The answer model receives transcript text spoken by other people and code excerpts from arbitrary
repositories. Either can contain text that looks like instructions ([DESIGN.md](../DESIGN.md) §8,
AC-11). Indexing must also never execute anything found in the repository (§6).

## Decision

- Transcript text and code excerpts are passed to models only as clearly delimited evidence
  with request-local source IDs. They can never override application instructions, request
  credentials, change repository scope, or trigger tools.
- The answer service has **no shell and no write capability**. There are no tools exposed to the
  model in the initial design.
- The indexer reads files; it never runs scripts, package hooks, builds, or instructions found in
  source. Framework detection reads manifests and conventions only.
- Every cited source ID is validated against the supplied evidence pack; unresolved citations are
  flagged, and a resolved citation is not labelled "verified".

## Consequences

- AC-11 gets a dedicated test corpus of hostile repository text in `@call-copilot/eval`.
- Adding model tools later requires a new ADR with an explicit threat model.
