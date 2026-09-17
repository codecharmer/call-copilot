# 0005 — Provider and model selection is configuration

Status: Accepted · 2026-09-17

## Context

Transcription and answer generation are cloud services paid with the user's own API keys
([DESIGN.md](../DESIGN.md) §2, §4). Models change quickly; the design forbids scattering
provider logic through the app and requires pinned, tested model identifiers at release time.

## Decision

- Every external service sits behind a contract in `@call-copilot/contracts`
  (`TranscriptionProvider`, `AnswerProvider`) implemented in `@call-copilot/providers`.
- Initial candidates: **Deepgram streaming** for transcription (needs `is_final` vs
  `speech_final` distinction) and the **OpenAI Responses API** for question classification and
  streamed answers. Anthropic's Claude API is a second answer candidate; both are evaluated on
  latency and evidence quality, not name.
- Provider, model id, endpointing/debounce values, evidence token budget and output limits are
  configuration with tested defaults. Model ids are pinned per release.
- Adapters normalise provider events into the internal `EventType` union; the orchestrator never
  sees provider-specific payloads.

## Consequences

- Swapping or adding a provider touches one package plus configuration.
- The evaluation harness in `@call-copilot/eval` can compare providers on the same replay.
- Users must configure and test connectivity before a session; failures name the service.
