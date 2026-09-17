# Data boundary

What leaves the machine, what is stored, and what is logged, from [DESIGN.md](DESIGN.md) §10.
Shown to the user during provider setup.

## What is sent externally (default design)

| Destination              | Data sent                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| Speech provider          | Audio from sources explicitly enabled during the session                                   |
| Question/answer provider | Bounded transcript context, questions, relevant symbol vocabulary, retrieved code excerpts |
| Embedding provider       | **None** — embeddings run locally                                                          |
| Application backend      | **None**                                                                                   |

A later cloud-indexing mode is an explicit configuration change with its own documented handling.
Local deletion cannot promise deletion from a provider's independent logs; provider-side
retention settings are configured deliberately and documented per account.

## What is stored locally

| Entity                                          | Retention                                                                                                     |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Repository registration, ignore policy          | Until removed                                                                                                 |
| Index generations, chunks, embeddings           | Current plus snapshots referenced by the session                                                              |
| Credential reference (not the key)              | Until removed; key itself in OS credential store ([ADR 0006](adr/0006-credentials-in-os-credential-store.md)) |
| Session, transcript segments, questions/answers | **Memory only**; discarded on stop                                                                            |

Indexes live in the OS app-data directory (`%APPDATA%` on Windows, `~/Library/Application Support`
on macOS) with restrictive permissions. They contain copies of source code and are not encrypted
by default; see OPEN-DECISIONS.

## Logging rules

Default logs contain timing, error codes, provider/model IDs, and aggregate usage. They **never**
contain transcript text, source excerpts, raw audio, or keys. Diagnostic content capture is an
explicit user action with a defined deletion path.
