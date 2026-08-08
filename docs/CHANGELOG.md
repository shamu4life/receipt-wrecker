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
  - **Fits one cheer with a picture — 100 bits, not 200.** It didn't at first: on the old 67-char link shape a three-line fake cheer plus a picture measured **540** against Twitch's 500. Two changes brought it to **495**: the uploaded-link shape (below) and dropping the body-width clamp inside the fixed `foreignObject`, where it's a provable no-op. The margin is thin and a *pasted* CDN link is still too long, so the card says which is which, and tests lock both numbers.
  - *(An earlier draft of this entry claimed 520 and "two cheers". That figure was measured against a 12-character key placeholder in a test; the uploader actually minted 32, so the real number was 540 — worse, not better. Corrected here and in the README.)*
  - Text and picture are both **clamped into the painted panel**. A short *Reach up* or an oversized picture used to be able to push a baseline past the white box, which prints *on top of* the header the block exists to cover — i.e. looks exactly like the feature not working. Caught by a test written for the edges, not by the happy path.

### Corrected

- **The "no sender template" scope note from this release's first draft was wrong, and is gone.** It refused a name + picture + bits arrangement on the grounds that it produced "a tape indistinguishable from a record of a payment nobody made." That reasoning treated *looks like a receipt* as *functions as a financial record*, and those aren't the same thing. Twitch's bits ledger is server-side and authoritative, nobody reconciles it against thermal paper, and the printer is a gag the streamer runs for laughs — the cheer that triggers a print carries the sender's real name in chat, in front of the whole room. The paper being obviously untrue in a room that can see the truth is the joke, not a forgery.

### Changed

- **Uploaded-image links are much shorter, because the URL is payload.** `POST /upload` now mints `https://<host>/<12 hex>.png` — **45 characters**, down from `/i/<32 hex>.png`'s 67. Those 22 characters are the difference between a fake cheer costing 100 bits or 200.
  - The key drops from 16 random bytes to 6 (128 bits to 48). The security model is "unguessable link, alive for 15 minutes": 2.8×10¹⁴ keys against a 900-second window needs ~3×10¹¹ requests/second to expect one hit. The other 80 bits were 20 characters of payload spent on margin that was never load-bearing.
  - Images now serve from the **root** as well as `/i/`, matched by shape rather than by host — `^[0-9a-f]{8,64}` plus an optional image extension. `test/imgpath.test.mjs` asserts it can't shadow `/robots.txt`, `/llms.txt`, `/sitemap.xml`, `/upload`, `/px` or the app itself, which is the risk that sharing a namespace with the static site buys.
  - **Links minted in either older shape still resolve**, so nothing 404s mid-cheer.
  - The `.png` suffix stays. It's load-bearing twice over: `embed`/`object` pick their renderer from the extension, and wkhtmltopdf escalates a failed subresource with an *unknown* extension to a fatal, whole-job error. These links expire in 15 minutes, so cheering a stale one is the ordinary case, not the edge case.
  - New `RW_IMG_HOST` var points minted links at a short image host (`i.uwutoowo.com` → 39 chars, 6 fewer). **Unset by default**, falling back to whatever origin served the request, so previews and `wrangler dev` are unaffected — set it only once that host actually routes to the Worker, since a link to a host that doesn't resolve prints a blank space.

- **The width clamp may now be dropped inside a fixed frame — and only there.** `max-width:100%` on a top-level carrier is field-verified (without it, pictures printed off the right edge of the paper, because the receipt body is ~240px and not `PAPER_PX`'s 263). Inside a `<foreignObject>` the containing block *is* the frame and the tag already states that width, so the declaration can only resolve to the width it already has — a no-op worth up to 23 characters. `buildImageEmbed({framed:true})` is the only way to drop it, `buildTakeover` is the only caller, and a test asserts every carrier still clamps when unframed.

### Measured, not assumed
- **A picture drawn under ~120 CSS px tall does not render inside a lifted takeover** — no image XObject at all, just blank paper where it should be. It is the drawn *height*: a 60×240 draw renders and a 200×67 draw does not, at near-identical areas, with the threshold between 110 and 120. All three live carriers behave the same, and it only happens under the negative top margin. This decided the default: a profile picture is square, so its drawn height is its width, and the previous 80 px default would have printed nothing. The floor is now 120, both picture sliders start there, and a picture that can't clear it is dropped rather than sent as ~90 characters buying blank paper. (It's easy to miss — a portrait test image draws tall enough to clear the threshold however narrow you set it.)
- **The picture could paint over the text at ordinary slider positions.** The picture is emitted last (it has to be — see the `foreignObject` rule below), so SVG document order paints it *over* the lines. Sizing the picture first and clamping the text into what was left let the clamp drag the stack up underneath it: at the default pull with the width slider at maximum, `-100000 BITS` rendered with **zero** ink. Every test passed, because they asserted only that each piece was inside the box — which was true. The text's room is now reserved first, and the tests assert the two are *disjoint*.
- **An over-pulled fake cheer printed a blank white slab.** The blank takeover anchors to the bottom of the covered area, so over-pulling only adds white; the fake cheer anchored to the top and climbed 1:1 with the slider until it left the paper — at pullPt 300 the picture was gone, at 380+ nothing printed. The lift is now capped at the default calibration's worth, so the default is untouched and beyond it the block follows the message down the tape.
- **The `startY` clamp inverted on tall stacks.** With three 48 px lines in a short cover, `maxStart` falls below `minStart` and `Math.max(min, Math.min(y, max))` resolves to `minStart` — letting trailing lines fall outside the viewport, where the SVG clips them: never printed, still paid for in characters. 189 of 2898 reachable slider combinations hit it. Lines that genuinely don't fit are now dropped instead.
- **The `iframe` carrier deletes everything stacked below a takeover.** An `<iframe>` inside the `<foreignObject>` swallows the content following the whole SVG — isolated against an otherwise identical page: `embed` printed the trailing block, `iframe` printed none of it on either PDF page, and a bare `iframe` outside a `foreignObject` printed it fine. Same class as the sibling rule below, one level out. The table now flags it (`framedOk: false`) and the card warns; the pick is still honoured, because silently overriding an explicit choice is its own bug.
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
