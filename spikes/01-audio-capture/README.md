# Spike 01 — Audio capture

Design refs: [DESIGN.md](../../docs/DESIGN.md) §5, §12; [ADR 0003](../../docs/adr/0003-platform-baseline-windows-first.md).

## Goal

Prove that a **packaged** Electron build can capture remote call audio and the user's microphone
as two separately labelled, monotonically timestamped PCM streams, while the user wears
headphones, without monitoring capture back into the meeting.

## Checklist (run on Windows first, then macOS)

- [ ] Record the machine: OS version, CPU, audio devices, headphones model.
- [ ] Enumerate sources via `desktopCapturer` and `getUserMedia`; label each `me` or `call`.
- [ ] Windows: system loopback (WASAPI) via `getUserMedia({ audio: { mandatory: { chromeMediaSource: 'desktop' } } })`. Note whether per-application capture is possible or only whole-system output.
- [ ] macOS: note permission prompts (Screen Recording / Microphone), whether a native helper is required, and OS version tested.
- [ ] Write 20–100 ms frames to a bounded queue; dump 30 s of each source to WAV in `samples/`.
- [ ] **Dead-stream check:** assert non-silent RMS on both sources; a resolved capture promise is not success.
- [ ] Headphones on: confirm the remote voice is captured and the mic does _not_ contain the remote voice.
- [ ] Confirm nothing is played back into the meeting (ask the remote participant).
- [ ] Meeting matrix: Zoom desktop, Microsoft Teams desktop, Google Meet in Chrome and Edge.
- [ ] Device change mid-capture (unplug headphones) and sleep/wake: what events fire, does the stream die silently?
- [ ] Pause/stop timing: time from stop() to capture resources released (target ≤ 1 s).
- [ ] 60-minute run: memory and queue depth sampled every minute.
- [ ] Repeat in the packaged installer (electron-builder), not just `electron .`.

## Report (`results/REPORT.md`)

Table of matrix rows × outcomes, the sample-rate/channel format that worked, the timestamp
source used, and every divergence between Windows and macOS. Ends with a recommendation for the
`AudioSourceAdapter` implementation per OS.
