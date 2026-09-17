# Acceptance criteria and quality gates

From [DESIGN.md](DESIGN.md) §11 and §13. Every gate is passed on Windows first, then macOS
([ADR 0003](adr/0003-platform-baseline-windows-first.md)). Numbers are proposed targets, not
observed results; each report states hardware, models, corpus, network conditions and error rate.

## Scenarios

- [ ] **AC-01** A new local repository indexes with visible coverage, excludes configured secrets/dependencies, and can answer a typed implementation question.
- [ ] **AC-02** A question spoken by a remote participant is captured while the user wears headphones and automatically produces a grounded answer.
- [ ] **AC-03** A short follow-up resolves its subject from the preceding exchange without switching repositories or inventing context.
- [ ] **AC-04** Duplicate transcript events produce one question; a correction supersedes the earlier answer request.
- [ ] **AC-05** Every rendered citation resolves to the exact supplied excerpt and generation, including after local edits.
- [ ] **AC-06** A branch switch cannot combine old-branch evidence with new-branch metadata.
- [ ] **AC-07** An unavailable answer is identified as unsupported rather than filled in from general programming knowledge.
- [ ] **AC-08** Pausing capture stops new audio transmission; stopping closes streams and clears unsaved session state.
- [ ] **AC-09** Provider failures, lost connectivity, and missing permissions produce visible recoverable states.
- [ ] **AC-10** The packaged application meets the latency and 60-minute call reliability targets on the supported meeting matrix.
- [ ] **AC-11** Repository text containing hostile instructions cannot invoke commands, expose keys, or change application settings.
- [ ] **AC-12** API keys and repository contents do not appear in default logs, exported diagnostics, or renderer persistence.
- [ ] **AC-13** (added) A fresh `git clone` on Windows followed by `corepack enable && pnpm install && pnpm build` succeeds with no manual steps. A [CI workflow](../.github/workflows/ci.yml) exists to enforce this on `windows-latest`, but **it has not run yet** — the Windows leg is currently asserted, not observed. Verified on macOS only: a clean clone installs with `--frozen-lockfile` and passes typecheck, format and test. Tick this only after a green Windows run, and re-check after every new dependency.

## Retrieval and answer quality

| Gate                                                          | Target                                              |
| ------------------------------------------------------------- | --------------------------------------------------- |
| Relevant evidence in top-10 retrieved chunks                  | ≥ 90% of answerable questions                       |
| Reviewed answers materially supported by cited evidence       | ≥ 90%                                               |
| Unanswerable questions that clearly identify missing evidence | ≥ 90%                                               |
| Held-out question set                                         | ≥ 100 questions, separate from development examples |
| Question detection (labeled replays)                          | ≥ 90% precision, ≥ 85% recall                       |

Evaluation corpus: at least one PHP/WordPress app, one TypeScript app, one Python service, plus
one language without structured parsing to exercise the fallback.

## Performance (reference corpus: ≤ 10,000 text files or 1M source lines, warm index)

| Metric                                 | Target                                                          |
| -------------------------------------- | --------------------------------------------------------------- |
| First useful short-answer text         | median ≤ 2.5 s, p95 ≤ 5 s after the speaker finishes            |
| Complete short answer with sources     | p95 ≤ 10 s                                                      |
| Local retrieval after query acceptance | p95 ≤ 500 ms                                                    |
| Small-file index refresh               | p95 ≤ 5 s after the file settles                                |
| Pause/stop                             | stop enqueueing immediately; release capture within 1 s         |
| Session reliability                    | 60-minute call with no capture crash or unbounded memory growth |

"First useful" means the first complete, relevant clause, not the first token.
