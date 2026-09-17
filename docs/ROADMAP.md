# Roadmap

Phases from [DESIGN.md](DESIGN.md) §14, with the platform order from
[ADR 0003](adr/0003-platform-baseline-windows-first.md): every gate is passed on **Windows first**,
then macOS. No duration or budget is committed. Audio compatibility and local embedding
performance are the first uncertainties to resolve.

| Phase                | Deliverable                                                                                                                                                                                 | Exit condition                                                                                              | Status      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------- |
| 0. Technical spikes  | [Spike 01](../spikes/01-audio-capture/README.md) packaged capture test (Windows, then macOS); [Spike 02](../spikes/02-index-packaging/README.md) parser / embedding / vector packaging test | Supported OS/device matrix confirmed; native dependencies proven to ship on Windows x64 and macOS universal | **Next**    |
| 1. Repository Q&A    | Folder picker, versioned local index, typed questions, streamed answers, source viewer                                                                                                      | Retrieval and source-integrity tests pass on the evaluation repositories (AC-01, AC-05, AC-06, AC-07)       | Not started |
| 2. Live transcript   | Independent audio sources, transcription adapter, transcript assembly, permission diagnostics                                                                                               | Headphone and 60-minute capture tests pass on Windows and macOS (AC-02, AC-08, AC-09)                       | Not started |
| 3. Live answers      | Question detection, follow-up context, cancellation, pending queue, compact window                                                                                                          | Live end-to-end acceptance and latency gates pass (AC-03, AC-04, AC-10)                                     | Not started |
| 4. Release hardening | Credential storage, recovery, packaging, code signing (Windows Authenticode, macOS notarization), usage reporting                                                                           | Installable build passes the supported meeting matrix (AC-11, AC-12)                                        | Not started |
| 5. Expansion         | Additional providers, languages, cross-repository context, Linux                                                                                                                            | Each extension receives its own compatibility and quality evaluation                                        | Not started |

## Phase 0 order

1. **Spike 01 on Windows.** Electron `desktopCapturer` with WASAPI loopback plus microphone, as
   separate labelled sources, user wearing headphones, in a _packaged_ build. Zoom, Teams, and
   Google Meet in Chrome/Edge.
2. **Spike 02 on Windows.** tree-sitter (JS/TS/PHP/Python), SQLite + FTS5, one candidate local
   embedding model, one candidate vector backend. Report install-from-clone success, index time,
   query latency, RAM, and download size against §11 targets.
3. **Spike 01 and 02 on the Intel Mac.** Same checklists; note every divergence.
4. Convert findings into ADR 0004 (final) and an ADR for the audio adapter.

## Definition of done for the first release

The user can clone the repository on Windows, install, select a repository, join a supported
call, hear a technical question, and receive a concise answer with inspectable code evidence
before the discussion moves on (§15).
