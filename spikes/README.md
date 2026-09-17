# Phase 0 spikes

Throwaway experiments that answer the two biggest unknowns before any product code is written
([docs/ROADMAP.md](../docs/ROADMAP.md)). Each spike has a checklist, a pass/fail gate, and writes
a short report to `results/REPORT.md` (committed) with raw numbers in `results/*.json` (ignored).

Order: **01 on Windows → 02 on Windows → both on the Intel Mac.** Nothing here is reused in the
app without being rewritten against `@call-copilot/contracts`.

| Spike                                              | Question it answers                                                                                                                 | Gate                                                                                              |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| [01-audio-capture](01-audio-capture/README.md)     | Can a packaged Electron app capture call audio and the mic as separate sources, with headphones, on the meeting matrix?             | Real audio samples verified by ear and by transcription on every row of the matrix                |
| [02-index-packaging](02-index-packaging/README.md) | Can tree-sitter, SQLite FTS5, a local embedding model and a vector backend install from a fresh clone and meet the latency targets? | Fresh-clone install succeeds on Windows and macOS; retrieval p95 ≤ 500 ms on the reference corpus |
