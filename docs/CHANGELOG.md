# Changelog

All notable changes to Receipt Wrecker are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [0.3.1] — 2026-08-07

First field results from a real probe round, cheered at the live channel and printed on the real machine. Two of the six carriers came back clean, one came back too wide, and the default came back **not at all**.

### Fixed
- **The default carrier was blocked.** The list took `<img` in the same round that killed the SVG form, so 0.3.0's default never reached chat — every real-picture payload was dead on arrival. `img` is now flagged blocked and the default moves to **`embed`**, which printed perfectly in the field. Saved blocks still pointing at `img` migrate on next load (`EMBED_V` 2 → 3).
- **Pictures printed too wide.** The box the app asks for (263 px = 70 mm) is wider than the receipt body: printer-bot renders at `paperWidth - 8` mm with `body { margin: 1em }`, leaving ~240 px on an 80 mm roll. Measured, every carrier drew to the paper edge and lost its right margin. Every live carrier now carries `max-width:100%`, which adapts to whatever the body really is instead of betting on another hardcoded number — verified on the engine at a true 240×180 with the aspect intact.
- **`embed` no longer states a height.** With one, the width clamp left the stated height in place and stretched the picture ~8%; without it the engine takes the height from the image. Shorter payload, correct aspect.

### Added
- **A warning before a blank print.** `embed` and `object` pick their image renderer from the URL's file extension and fail *silently* without one — the message sends, the tape prints, and there's just no picture. Picking one of those with an extensionless link now shows a warning naming the fix. (`urlHasImageExt` strips the query string first, so a CDN link ending `.png?ex=…` still counts.)
- Each carrier now declares the literal `token` a blocked-terms list would have to match, and tests assert every entry emits its own token and that no two share one — otherwise a single blocked term would take out two supposed "alternatives" at once.

### Notes
- The probe's letters are positional, so they shifted with the reordering: **A** is now `embed`, **B** `input`, **C** `iframe`, **D** `img`, **E** `SVG image`, **F** `object`.
- `iframe` printed cleanly in the field, but the crop caveat stands — it has no shrink-to-fit, so it only looks right for a picture already smaller than the box, and `/upload` re-encodes up to 720 px.

---

## [0.3.0] — 2026-08-06

### Fixed
- **Real pictures print again.** The channel's blocked-terms list added `<image`, which killed the SVG form every real-image payload was built on (`<object`, the form before it, was already blocked). Picture payloads now default to a plain `img` tag.

- **Expired upload links no longer kill the whole print.** `/upload` now returns a link ending in `.png`. wkhtmltopdf only treats a failed subresource as a soft error when its extension is in a hardcoded list (`css/js/svg/png/jpg/jpeg/gif`); anything else — including a bare `/i/<hex>` — is escalated to a fatal page error, exit code 1, print job dead. `--load-error-handling ignore`, which printer-bot does pass, does **not** suppress it. Since these links expire after 15 minutes, cheering a stale one was the ordinary case. `handleServe` strips the suffix, so links minted earlier still resolve.

### Added
- **Carrier tags** — the tag that carries a real picture is now a per-block setting with **six** interchangeable surfaces, each building the same picture out of a different token: `img` (default), `input type=image`, `embed`, `iframe`, plus the two blocked forms (`SVG image`, `object`) kept for A/B in case a list gets pruned. Recovering from the next block is a dropdown change, not a release.
- **Find what still sends** — a second diagnostic button beside *Print test strip*. It builds the same picture with every carrier, one labelled cheer each (`A`–`F`), to be sent one at a time: a letter that prints *with a picture under it* names the carrier to pick, a bare letter means the tag didn't render, and a missing letter means chat blocked it.
- Saved Image blocks still pointing at a blocked carrier are migrated to the working default once, stamped so a deliberate re-pick of a blocked tag still survives a reload.

### Measured, not assumed
Every carrier was rendered through the exact binary printer-bot ships (wkhtmltopdf 0.12.6 "with patched qt" = Qt 4.8.7 / WebKit 534.34) with its exact print flags, against its real receipt stylesheet. What that settled:

- `img` and `input type=image` render correctly **including with an extensionless URL**; `embed` and `object` draw *nothing* without a file extension. That — not an `object`-vs-`img` difference — is what the old "renders at native size, ignores the width" note was really describing.
- `iframe` renders but **crops**: a subframe gets no shrink-to-fit, so the picture is drawn at natural pixel size and clipped. Labelled accordingly rather than presented as a clean fallback.
- A **CSS background** carrier was built, measured dead, and cut before release. It looks like the ideal answer to a tag blocklist (no tag name to block), but printer-bot passes `--no-background`, which drops every element background from the print — and the `background:url(x) 0 0/100%` slash shorthand is separately invalid in that WebKit vintage. A comment in `EMBEDS` records this so it isn't re-added on the same reasoning.
- `SVG image` still renders fine; it is purely a blocked-terms casualty. (An `svg { height: auto }` rule collapses it to nothing — that's Receipt Wrecker's own preview CSS, not the printer's.)

### Changed
- All real-image markup is built in one pure-core function (`buildImageEmbed`), unit-tested for escaping, sizing, and payload budget — the legacy tabbed-UI path routes through it too, so no code path emits a blocked tag any more.
- `escapeHtml` / `escapeAttr` moved into the pure core, shared with the embed builders and unit-tested there.

### Known, not fixed
- **The print box is ~23 px wider than the receipt body.** `PAPER_PX` is 263 (70 mm), but printer-bot renders at `paperWidth - 8` mm and its template sets `body { margin: 1em }` — so on an 80 mm roll the usable width is 272 − 32 = **240 px**. Measured: every carrier draws from x=16 to the page edge at x=271, losing ~7 px off the right and the entire right margin. This affects big type and sideways type too, which share `PAPER_PX` and are field-verified at the current value, and the real number depends on the streamer's configured paper width — so it is reported rather than silently changed. Dropping **Print width** to ~62 mm fits exactly today.

---

## [0.2.0] — 2026-07-17

### Added
- GitHub link — a prominent "GitHub" link (octocat mark + label) at the top of the app, in a header bar beside the title, linking to the source repo. Inline SVG only; no external resources.
- Crawler policy — static files served from `public/` at the site root that explicitly **welcome** AI/LLM crawlers: a permissive `robots.txt` that `Allow`s named AI agents (GPTBot, ClaudeBot, Google-Extended, CCBot, PerplexityBot, and others), an [llmstxt.org](https://llmstxt.org)-style `llms.txt` summarizing the tool for LLM agents, and a minimal `sitemap.xml`.

### Notes
- No runtime dependencies, external resources, or Worker routes were added — Cloudflare already serves `public/` as static assets, so the new files are reachable at `/robots.txt`, `/llms.txt`, and `/sitemap.xml`. The single-file app and all payload/glyph constraints are unchanged.

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
