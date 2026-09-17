# 0003 — Windows first, macOS second; clone-and-run on both

Status: Accepted · 2026-09-17 · Deviates from [DESIGN.md](../DESIGN.md) §2

## Context

The design document proposes "macOS first, initially Apple Silicon" as a _default_, not a
requirement. Two facts override it:

1. The user's stated first priority is that the repository can be cloned and run on a
   **Windows** machine.
2. The primary development Mac is Intel (x86_64, macOS 26.6), not Apple Silicon.

Windows is also the platform where Electron's `desktopCapturer` provides system-audio loopback
(WASAPI) with the least native work, whereas macOS requires additional permissions and, on some
versions, a native helper for per-application capture.

## Decision

- **Windows 10/11 x64 is the first supported platform.** Every phase gate in
  [ROADMAP.md](../ROADMAP.md) is measured on Windows first.
- **macOS is second**, shipped as a universal (x64 + arm64) build. Performance targets are
  validated on the Intel Mac available to the project; Apple Silicon numbers are reported when
  hardware is available, never assumed.
- The repository must clone and run on both from a fresh checkout: LF line endings enforced by
  `.gitattributes` and prettier, shell-agnostic scripts, no committed absolute paths, no
  dependency that lacks a Windows prebuilt binary (spike 02 gate).
- Platform-specific code is confined to adapters: audio capture, credential store, packaging.

## Consequences

- Spike 01 (audio capture) runs on Windows first: WASAPI loopback + microphone, headphones test,
  packaged build. The macOS run is the second half of the same spike.
- Native modules (SQLite, tree-sitter, embedding runtime) are selected only if they ship Windows
  x64 and macOS universal prebuilds, or can be built by `electron-rebuild` on both.
- Reference environment in §11 becomes a Windows x64 machine (spec recorded when benchmarks run)
  plus the Intel Mac; results always state the hardware used.
- Credential storage maps to Windows Credential Manager on Windows and Keychain on macOS.
