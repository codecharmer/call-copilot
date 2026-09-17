# @call-copilot/contracts

Shared TypeScript contracts from [docs/DESIGN.md](../../docs/DESIGN.md) §9: the `EventEnvelope`,
the required event-type union, the session / index / answer state machines, and the six adapter
interfaces (`AudioSourceAdapter`, `TranscriptionProvider`, `RepositoryIndexer`, `QuestionDetector`,
`CodeRetriever`, `AnswerProvider`).

Types only. No runtime code, no dependencies. Every other package imports from here so the
process boundaries (renderer, main, index worker) share one vocabulary.
