# @call-copilot/eval

Evaluation corpus and harness from [docs/DESIGN.md](../../docs/DESIGN.md) §13. Holds per-repository
question sets (answerable with known evidence, follow-ups, deliberately unanswerable), the
held-out set (≥100 questions, kept separate from development examples), labeled conversation
replays for question detection, and the latency replay runner.

Gates it measures are listed in [docs/ACCEPTANCE.md](../../docs/ACCEPTANCE.md). Status: placeholder.
