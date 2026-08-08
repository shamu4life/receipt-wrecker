# Changelog

All notable changes to Receipt Wrecker are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [0.3.2] — 2026-08-07

### Added
- **Takeover blocks.** A third block type that paints over printer-bot's own header — the avatar, the bits line and the name it draws — so the tape comes out as your artwork rather than a receipt with a message stapled underneath. It's an opaque SVG lifted over the header with a negative top margin; anything below it in the stack still prints as normal. Three optional lines with independent sizes, an optional picture, and one **Reach up (pt)** calibration slider, since the bot's header height depends on the streamer's avatar and can't be a constant.
  - The picture rides in a `<foreignObject>` through the ordinary **carrier tag** table, so it inherits the blocked-tag data instead of hardcoding SVG's `<image` (blocked since Aug 2026). Measured working through both the `embed` and `input` carriers.
  - Measured: a three-line takeover is 350 chars, and a takeover **plus** a full real-picture payload plus the cheer wrapper is 458 — one cheer, not two. A test locks that in, since it's the difference between the gag costing 100 or 200 bits.
  - The preview is WYSIWYG: it renders the same receipt chrome, so the overlay covers the preview's header exactly as it covers the real one.

- **Fake cheer**, a second style on the same block. Arranges the overlay the way printer-bot arranges a real cheer — picture on top, then the bits figure, then the name, then an italic message — reproducing the hand-built payload this feature was reverse-engineered from, the one that printed correctly on a real rig (80 px picture, baselines 24/900, 19/700, 13/italic). Type the figure only; ` BITS` is appended. It stays **free text rather than a number**, because `-100000` and `∞` are the jokes people actually want and coercion kills them.
  - It **composes `buildTakeover`** instead of emitting its own markup, so the escaping, the carrier table and the `foreignObject`-last rule are inherited rather than re-implemented — one place to get them right.
  - The two styles keep **separate text fields**, so flipping the selector to compare them and flipping back doesn't eat what you typed. The three size sliders are shared, being the same three visual slots either way.
  - **Costs two cheers with a picture, and says so.** Three lines alone are ~357 chars with the cheer wrapper and fit one message; with a picture it's ~520 against Twitch's 500 — even on the shortest `/i/<hex>.png` link the uploader can mint. Nothing is truncated: it splits into two parts, i.e. 200 bits instead of 100. The card warns before you send and the part count shows it. A test locks the number in **both** directions, so if the markup ever shrinks enough to fit, the suite says to update the docs.
  - Text and picture are both **clamped into the painted panel**. A short *Reach up* or an oversized picture used to be able to push a baseline past the white box, which prints *on top of* the header the block exists to cover — i.e. looks exactly like the feature not working. Caught by a test written for the edges, not by the happy path.

### Corrected

- **The "no sender template" scope note from this release's first draft was wrong, and is gone.** It refused a name + picture + bits arrangement on the grounds that it produced "a tape indistinguishable from a record of a payment nobody made." That reasoning treated *looks like a receipt* as *functions as a financial record*, and those aren't the same thing. Twitch's bits ledger is server-side and authoritative, nobody reconciles it against thermal paper, and the printer is a gag the streamer runs for laughs — the cheer that triggers a print carries the sender's real name in chat, in front of the whole room. The paper being obviously untrue in a room that can see the truth is the joke, not a forgery.

### Measured, not assumed
- **`<foreignObject>` swallows every SVG sibling that follows it.** It's an HTML integration point: the parser switches to HTML inside and never cleanly returns to SVG context, so a `<text>` emitted *after* one is parsed as HTML and silently never drawn. The markup looked perfect and the print came out with the text simply missing. `buildTakeover` emits the picture **last** for this reason, with a regression test — the cost is that a picture tall enough to reach the text will overlap it, which at least shows up in the preview.

---

## [0.3.1] — 2026-08-07

First field results from a real probe round, cheered at the live channel and printed on the real machine. Two of the six carriers came back clean, one came back too wide, and the default came back **not at all**.

### Fixed
- **The default carrier was blocked.** The list took `<img` in the same round that killed the SVG form, so 0.3.0's default never reached chat — every real-picture payload was dead on arrival. `img` is now flagged blocked and the default moves to **`embed`**, the carrier that printed perfectly on the real machine. `input type=image` is more forgiving about URLs and sits second, but it printed *too wide* in the field and the bench can't reproduce why (best guess: Qt themes form controls per-platform, so Windows may draw native chrome the Linux build doesn't) — so it doesn't lead until someone re-probes it there. Each entry now records its real-rig verdict in a `field` property, and a test enforces that only a carrier marked `"prints"` can be the default. Saved blocks still pointing at `img` migrate on next load (`EMBED_V` 2 → 3).
- **Pictures printed too wide.** The box the app asks for (263 px = 70 mm) is wider than the receipt body: printer-bot renders at `paperWidth - 8` mm with `body { margin: 1em }`, leaving ~240 px on an 80 mm roll. Measured, every carrier drew to the paper edge and lost its right margin. Every live carrier now carries `max-width:100%`, which adapts to whatever the body really is instead of betting on another hardcoded number — verified on the engine at a true 240×180 with the aspect intact.
- **`embed` no longer states a height.** With one, the width clamp left the stated height in place and stretched the picture ~8%; without it the engine takes the height from the image. Shorter payload, correct aspect.

### Added
- **A warning before a blank print.** `embed` and `object` pick their image renderer from the URL's file extension and fail *silently* without one — the message sends, the tape prints, and there's just no picture. Picking one of those with an extensionless link now shows a warning naming the fix. (`urlHasImageExt` strips the query string first, so a CDN link ending `.png?ex=…` still counts.)
- Each carrier now declares the literal `token` a blocked-terms list would have to match, and tests assert every entry emits its own token and that no two share one — otherwise a single blocked term would take out two supposed "alternatives" at once.

### Fixed (UI)
- **Two hint blocks were overlapping the controls above them.** `.hint` carried a negative top margin that only makes sense directly under a `<label>` (it cancels the label's bottom margin); applied after a `<select>` or a button row it dragged the text up into them. It's now an adjacent-sibling rule — `label + .hint` snugs up, everything else gets normal spacing — so the carrier-tag hint and the *Find what still sends* explanation no longer collide with the select and the buttons. Same for `.over-note`.

### Notes
- The probe now says **how many letters are worth sending**. Live carriers lead the list, so a normal round is the first three; the rest are already known blocked and only worth a re-test if a mod prunes the list. At 100 bits a cheer that's 300 bits saved per round.
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
