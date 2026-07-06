# Changelog

All notable changes to Receipt Wrecker are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [0.1.0] — 2026-07-05

### Added
- Tiers — four glyph tiers to choose from: **Blocks `░▒▓█`** (Image mode's default, widest-compatibility 4-level tone ramp), **CJK ramp** (a curated Han-character density ramp for richer tone on photos), **Braille** (2×4 dot packing for the highest spatial resolution), and **Big text (on/off)** (a maximum-contrast binary tier that's Big Text mode's default — crisp letters, but the tier selector can override it to render big text in CJK or Braille too).
- Big Text mode — type a word or short phrase and get it rendered as oversized block letters, with a **Sideways** (rotate 90°) orientation option.
- Image mode — pick a picture from your device (nothing is uploaded) and get it downsampled and quantized into a grid of tone glyphs, with a **Threshold vs. Floyd–Steinberg dither** toggle plus contrast and invert controls.
- Census — a **Print test strip** button emits a fixed diagnostic payload: labeled samples of every tier plus a numbered ruler, for a one-print, blind-first-paste calibration of which tiers render and the true column count on a given destination renderer.
- Cheer-ready output — an on-by-default toggle that appends a space-delimited `Cheer100` token plus a small visible rotating nonce, so the payload registers as a Twitch cheer and survives a duplicate-message filter; turn it off for a raw glyph-only payload.
- Budget — a live character counter against a 490-character budget (headroom under Twitch's ~500-char single-message cap); going over is flagged, never silently truncated.
- Output — every payload is a single newline-free line with a **Copy** button (Clipboard API with an `execCommand` fallback) and a collapsible-free live preview.
- Persistence — control-panel settings (mode, tier, columns, toggles, text) are remembered between visits via `localStorage`, wrapped in `try/catch` so locked-down contexts still work.
- Privacy — runs **fully client-side**: no network calls, no analytics, no accounts, no uploads. Text and images never leave the device.

### Notes
- This is the initial release. HTML/markup injection was evaluated and deliberately **not implemented** — see `CLAUDE.md` and the design spec for the reasoning. A channel's AutoMod/blocked-terms list can still hold or drop a cheer message; that is outside this tool's control.
- This baseline release also adds the contributor docs, CI, and unit tests.
