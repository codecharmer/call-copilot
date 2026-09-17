# @call-copilot/desktop

Electron desktop shell. Owns windows, global shortcuts, OS permissions, lifecycle, and the
session orchestrator (session state, request IDs, cancellation, provider adapters). The renderer
is React + TypeScript and never receives filesystem or shell access; every IPC payload is
validated, size-limited, and scoped to an approved operation.

Status: placeholder. See [docs/DESIGN.md](../../docs/DESIGN.md) §4 and §9, and
[ADR 0001](../../docs/adr/0001-electron-desktop-shell.md). Phase 1 introduces the first code.
