# Changelog

All notable changes to Receipt Wrecker are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

**Entries describe the state at that release, not today.** The 0.1.0 notes below say
the app makes no network calls and emits only plain Unicode glyphs — both were true
then and neither is true now. For current behaviour see the
[README](../README.md) and [`public/llms.txt`](../public/llms.txt).

---

## [0.4.2] — 2026-08-10

### Changed

- **The takeover's default pull is 240pt, set by tuning on the actual rig.** 0.4.1 had reverted it to 220 on the strength of a hand-built payload that printed flawlessly at that value; the owner has since looked at real prints and settled on 240. Tuning on the machine outranks a single earlier print under conditions nobody recorded, and it certainly outranks a render.

  For anyone reading this later and wondering why the number keeps moving: it was 220, then 240 on bench evidence (the message's `Cheer100 <nonce> ` lead takes a line and pushes a lifted takeover down, so 220 left ~18px of avatar showing on the engine), then 220 again because a bench harness using a 300px avatar — rendered at the 15em maximum — proves nothing about a rig whose avatar may be smaller, and now 240 from tuning. Each step used better evidence than the last. The lead-line measurement was always real and remains why the preview renders the lead; it just never got to pick the number.

  **The migration is now one rule instead of a chain of undos.** A block still sitting on *any* default this app has shipped is following the default, so it moves to the current one; a block on any other value was dragged deliberately and is left alone. That does move a block someone hand-set to 220 or 240, because a hand-set value equal to a former default is indistinguishable from a followed one — with the whole history spanning about a day, landing on the tuned value is the better failure.

  **One thing worth knowing before touching this again:** `CHEER_MAX_LIFT_PX` is derived from the default and caps how far a fake cheer may lift. Raising the default raises that ceiling, and the fake cheer's picture is anchored to the panel top — so if a picture ever prints cut off at the top of the roll, this is the cause and a lower pull on that block is the cure. Blank takeovers are unaffected, since their text is bottom-anchored and extra pull only paints more white.

  The tests around this were rewritten rather than re-pinned. Three previous versions asserted a specific pull or a specific rig header, and all three had to be rewritten within a day, because they were asserting facts about someone's printer that the suite cannot see. They now pin the invariants the code owes regardless of the number: the default is reachable on the slider, and the lift cap stays derived from it.

---

## [0.4.1] — 2026-08-10

### Fixed

- **The takeover's default pull is back to 220pt**, reverting the 240 that shipped hours earlier in 0.4.0. The bench evidence behind 240 was real and the conclusion was still wrong, which is worth recording rather than quietly undoing.

  What the bench measured, correctly: every message carries a lead (`Cheer100 <nonce> `) that occupies a line and pushes a lifted takeover down, so 220 left ~18px of the streamer's avatar showing on a render. What the bench got wrong was the **avatar**. The harness used a 300px source, which the bot's `max-height:15em` renders at 240px — the largest header that can exist. The real rig's is about 20px shorter.

  The evidence that settles it is field, not bench: a hand-built reference payload at `margin-top:-220pt`, sent as a real cheer with its picture at `y=5`, printed **flawlessly on the actual machine**, picture included. For that picture's top edge to land on paper the rig's header must be between 288 and 293 CSS px.

  And over-pulling is not free on the cheer path, which is the part that made this a regression rather than a harmless margin. `CHEER_MAX_LIFT_PX` is **derived from the default**, and it is the ceiling that stops an over-pulled fake cheer climbing off the roll — so raising the default silently raised that ceiling too. At 240 the fake cheer's picture, which is anchored to the top of the panel, lost roughly 24px off the top of the paper on a rig where 220 places it 3px on.

  A `pullV` 2 migration reverses what the 240 migration wrote. It cannot tell a block auto-moved to 240 from one deliberately set to 240 during those few hours and moves both, which is the right trade when 240 is known to amputate the picture here. Any other value is left alone.

  The test that pinned a 235pt floor is now a ceiling: the default must not exceed what the field confirmed, and raising it again needs a print rather than a render.

---

## [0.4.0] — 2026-08-09

### Added

- **Type formatting — font, weight, italic, underline, strikethrough — on every surface the printer draws as *type*.** Both takeover styles (three lines each, independently), and the Text block in both straight and sideways Big Text. Not the Text block's **Hanzi** render: that prints tiled glyphs rather than type, and the card hides the formatting row when you switch to it. Nine fonts (Default/Arial, Arial Black, Impact, Comic Sans MS, Georgia, Serif, Monospace, Script, Fantasy), a weight select, and **I / U / S** toggles. Formatting travels as one `fmt` object per line, and **two of the three surfaces** — the takeovers and straight-on Big Text, both SVG — turn it into markup through one emitter (`fmtAttrs`), so those two cannot drift on what "both decorations" means or on which defaults are omitted. The sideways strip is a deliberate exception rather than an oversight: it is a rotated HTML `<span>`, where SVG presentation attributes don't apply at all, so `rotatedSpan` assembles a CSS `font` shorthand itself and shares only `fmtDecoration` (the underline/strike vocabulary) with the other two — and unlike `fmtAttrs` it always states a weight, at Big Text's own 800 baseline, because absent-means-800 is that path's contract.
  - **Nothing you already saved changes.** `fmtAttrs` omits every default: no font attribute for Arial, no `font-weight` at 400, nothing for a decoration you didn't set — an untouched line is byte-identical to what 0.3.3 emitted, and a test asserts that rather than trusting it. The three takeover slots keep their original hand-built look (900 / 700 / 400-italic) as *slot defaults* applied at the call site, not as attributes on the wire.

- **Verified on the real engine, not in the preview.** Every claim below was rendered through wkhtmltopdf 0.12.6 (patched Qt / WebKit 534.34 — the binary printer-bot ships), rasterised at 203 dpi and hard-thresholded to 1 bit, which is what the RP332 head actually lays down. Fragments were built by calling the app's own `buildTakeover` / `buildBigTextSvg` / `rotateBodies` / `fmtAttrs`, not by hand-writing markup. Full method and rasters in [`docs/superpowers/plans/2026-08-09-phase1-verification.md`](superpowers/plans/2026-08-09-phase1-verification.md).
  - **The shared `<g>` inherits its decoration, which is why a multi-line caption is affordable.** `buildBigTextSvg` puts `fmtAttrs` **once** on the wrapping `<g>` rather than on each `<text>` — that was an unproven form (the takeover path attributes each `<text>`, which was already known to work), and it was chosen for the character budget: a `text-decoration="underline line-through"` is 41 characters, so repeating it on a four-line caption is 164 characters of a 500-character message spent saying the same thing four times. Measured: underline +6396 ink, strike +4793, both +11189 against the same-size baseline, and a two-line caption carried the decoration on **both** lines from one `<g>`. The optimisation is real and it holds. All nine fonts are legible and visibly distinct at 24px and 58px — with the honest caveat that Georgia, Serif and Fantasy read as one family of serifs next to each other on tiny 1-bit thermal type.
  - **Bold and Black are pixel-identical on the Default font.** Not "close" — `PIL.ImageChops.difference(...).getbbox()` returns `None` at both 24px and 58px: zero differing pixels between weight 700 and weight 900. Both are clearly heavier than no weight at all (+1838 ink at 24px, +6189 at 58px, the same delta for each), so the control works; it's the *distinction* that doesn't exist here. The likely cause is ordinary CSS weight matching — this render host's Arial substitute offers one bold face and both values round to it. **No code change**, because there is no markup bug: the two weights reach the wire byte-for-byte differently, and a font that ships more steps may well separate them. The real escape hatch for a heavier look is the separate **Arial Black** *font* entry — a distinct typeface rather than a synthesised weight — and that one is visibly different.
  - `text-decoration:` on the rotated HTML `<span>` (a CSS declaration, a different renderer path from the SVG attribute) also renders: +10852 ink, and the lines run the length of the strip perpendicular to the baseline, since the decoration rotates with the text. Italic renders with a small *negative* ink delta (−48 / −174) — it reshapes glyphs rather than thickening strokes, so less ink is the expected outcome, not a failure.

- **Formatting is payload, and on a fake cheer there is no room for it.** These attributes are characters in the message, on top of a message that already sits at 491 of Twitch's 500 with a picture attached. Measured on the shipped builder, uploaded short link, default pull:

  | change | cost | fake cheer + picture |
  |---|---|---|
  | untouched | — | **491** |
  | one line → Impact | +21 | 512 — **rejected** |
  | one line → underline | +28 | 519 — **rejected** |
  | all three lines → Impact | +63 | 554 — **rejected** |

  A fake cheer *without* a picture starts at 357 and has room: all three lines in Impact is 420, all three underlined is 441, both together is 504 and over again. So the honest summary is that on a fake cheer, formatting and a picture are alternatives rather than both — and even without the picture, "everything on every line" does not fit. Twitch **rejects** an over-length message rather than truncating or splitting it, and a takeover is one SVG that cannot be split regardless — so going over prints nothing at all. The counter turns red before you send; watch it, because the attribute that pushed you over is invisible on the tape.

- **Sideways Big Text warns about the font, because that is where the loss is loudest.** A sideways strip is sized by measuring the text in your browser, and the printer draws it on the streamer's machine. Measuring one font while another gets drawn makes the box the wrong length and **shears the last letters off** — so `bigFontFor` is now the single owner of "which font is this text in", read by `measureRun` and by every renderer, and the card says so out loud when you pick a non-default font on a rotated block. The card only warns on a rotated block, but straight-on is *not* immune — it is sized from a browser measurement too and clips at the paper edge rather than wrapping (see the shear fix below, and the README's font note). Widening that warning is a candidate for the next release, not something 0.4.0 does. Big Text's weight select also offers a **Default** entry the takeover card does not: absent weight resolves to the 800 baseline sideways text has always rendered at, so a select that could only say 400/700/900 had no way to state an untouched block's real state without lying about it. Choosing Default deletes the key rather than writing a number.

### Fixed

- **The takeover printed a crescent of the streamer's avatar above the artwork**, which is the feature visibly not working — you paint over the bot's header and the top of it survives anyway. The cause was not the overlay's geometry, which is correct. It was that **the calibration was measured against a preview that rendered something the app never sends.**

  Every real message carries a lead — `Cheer100 <nonce> `, or the nbsp guard when not cheering — *before* the first body. That lead is content: it takes a line in the bot's `#receipt-content`, which pushes a lifted takeover **down by that line's height**, so a fixed lift no longer reaches the top of the header. The preview dropped the block bodies into the receipt slot with no lead at all, so it showed the covered case, and the shortfall only ever appeared on paper — after the bits were spent.

  Measured on the real engine (wkhtmltopdf 0.12.6 patched-qt, printer-bot's exact flags and stylesheet, full-size avatar), rendering the payload the app actually sends:

  | what was rendered | header left showing |
  |---|---|
  | bare SVG — *what the old preview showed* | 1.9px |
  | `Cheer100 00 ` + SVG — *what is sent* | **17.9px** |
  | cheermote image + nonce + SVG — *what Twitch delivers* | **21.8px** |

  Three changes, because fixing only the number would leave the next calibration just as wrong:
  - **The preview renders the lead.** `packStackBodies` now publishes the `lead` it built, and the payload is literally `lead + bodies` — one string, so the two cannot be assembled differently again. A test pins that identity.
  - **The default pull is 240pt, not 220.** Re-measured with the lead present: 235pt clears the text form, 240pt clears both with margin. Blocks saved on the old default are migrated forward once (`pullV`); a pull you actually dragged is **left alone**, because that one was calibrated against paper, which was always telling the truth.
  - **`CHEER_MAX_LIFT_PX` is derived from the default** instead of being a literal `293`. Those two agreed only by coincidence, and moving the default would silently have started capping *below* it — shifting the reference layout for everyone. Its test was pinned to the same literal and is now derived too, so it asserts the behaviour rather than a number.

- **The preview clips at the paper edge, like the printer does.** `.rcpt` had no `overflow`, so an over-pulled takeover kept showing content that lands above the top of the page — where wkhtmltopdf simply doesn't draw it. The picture is what disappears first, because it sits highest in the block. Measured at 400pt: the overlay overhangs the paper by 199px, all of which the preview used to show and the tape never printed.

- **Big Text had letters sheared off at the paper edge.** `buildBigTextSvg` sizes a line by dividing the paper width by what the line measures — but it measured `measureText().width`, the **advance**, and the advance is not a bound on the ink. The loudest case is italic: for a font with no italic face (Impact, Arial Black) the browser *synthesises* the oblique, skewing the outline and leaving the advance untouched. Measured in the same canvas the app uses, "HI" in Impact reports the identical 84.33px advance upright and italic while the ink's right edge moves 80.18 → 99.94. SVG has no overflow, so everything past the viewport is simply not drawn — and `text-anchor="middle"` centres the *advance* box, so the sheared ink is not even centred in the space it was given.

  Rendered through the real engine (wkhtmltopdf 0.12.6, 203 dpi, 1-bit), the payload the app itself emits for a headline "HI"/Impact/italic, against the same glyphs drawn into a deliberately oversized viewport so nothing could clip:

  | | ink right edge, SVG user px | verdict (viewport = 263) |
  |---|---|---|
  | upright — the control | 248.8 | fits |
  | italic, before | 314.2 (clipped to 263.5) | **51px of the "I" never printed** |
  | italic, after | 254.6 (unclipped: 255.0) | fits, 8px clear |

  **It is not only italic**, which is what the first cut of this fix assumed. Sweeping all nine fonts against ten strings with real canvas metrics at the weight the app measures with, an advance-based fit puts ink outside the viewport in **64 of 180** cases — and six of those are *upright*: Script "L" (ink right edge 271.9), Script "Wj" (273.2), Script "gyp" (left −11.4), Fantasy "L" (274.4), Fantasy "gyp" (−3.3), Comic Sans "L" (264.2). A swash or a descender that overhangs its own advance box amputates exactly like a synthesised skew does. On the engine, upright "L"/Script emitted font-size 391 and inked to user x **318.3**: 55px of the letter gone.

  So the fit measures ink bounds (`actualBoundingBox*`, the same metrics the rotated path has always used) on **every** measurement, italic or not, takes twice the larger half-extent about the anchor rather than the raw span, and never returns less than the advance. Ink that already fits inside the advance box returns the advance verbatim, which is every non-overflowing upright case — so unformatted Big Text is byte-identical, and a test pins the exact string. A missing bounding box (older engine, or the null-DOM test harness) falls back to the advance rather than to `NaN`. Across the same 180-case sweep, the shipped fit clips in **0**.

  One more thing the raster showed: the engine synthesises its own oblique and shears **3.9% harder** than the measuring browser reported, at both sizes tried, and the fake-bold stroke spends another `S/64` a side. Ink bounds alone still left ~2px outside. An 8% pad — the same shape of correction `runLength` already makes, deliberately not sharing its constant, since that one answers a different question — closes it.

  **What the pad costs, stated plainly:** it is applied to every ink measurement that overhangs, and there is no exemption for a font that ships a *real* italic face. Georgia ships one, and its ink still exceeds its advance on 6 of the 10 strings swept ("HI": 136.38 advance against 149.07 of ink), so Georgia italic "HELLO" now prints **8% smaller** and "HI" **15% smaller** than the same unreleased code measured earlier in this cycle, before this fix landed — not than anything a 0.3.3 user ever printed, since font and italic on Big Text are new this release (`a5f0cce`) and 0.3.3 could not select either. That is a deliberate trade on `runLength`'s rule: erring long adds invisible blank tape, erring short shears a letter off, so over-measuring is the direction to be wrong in. A real italic face is not by itself evidence that the advance bounds the ink; only the measurement is, and there are strings on which Georgia's does (573.24 advance against 571.00 of ink on "WRECKED" — unchanged). And it is not only Georgia, and not only italic: once the fix stopped gating the pad on `italic` (the "for every face" change above), any upright face whose ink exceeds its advance pays it too — see the cliff below.

  **The pad is a step at a zero-width boundary, not a ramp, and that step is most of its cost.** `bigFitBasis` is `if (ink <= adv) return adv; return ink * BIG_INK_PAD`: cross from "ink exactly matches advance" to "ink exceeds it by a hair" and the multiplier jumps from 1.0 to ~1.08 in that one step, so a typeface can lose most of the pad's 8% for an overhang too small to matter on paper. Swept across the same 180 cases upright: **23 change size, and only 6 of those were actually clipping** — the other 17 shrink for nothing a printer would notice. The starkest is **Arial Black upright "WOW"**, which overhangs its advance by **0.10px** (279.88 against 279.98 of ink, 0.036%) and loses **6.7%** of its type size (font-size 89 → 83). Also upright: Arial Black "WRECKED" (45 → 41), Comic Sans "L" (454 → 420), Georgia "WOW" (81 → 74). The behaviour stays as shipped — see the note on `BIG_INK_PAD` for why a proportional curve isn't the fix — but a reader should know the cost isn't confined to the italic Georgia example above.

  **Not every measured case goes the amputated direction, either.** On the real engine, `fantasy` "L" printed **inside** the box before this fix — 262.5 against a 263 viewport — and prints at **243.1** after: about 20px of paper given away rather than taken. The cause is the same font-substitution gap the README warns about, just running the other way here: the `fantasy` face Chrome measured for the pad's ink calculation is wider than the face wkhtmltopdf actually drew, so the pad over-corrects for a shear that, on this string, the print engine didn't produce as large as measured. Every other illustration in this entry shows amputation; this one shows over-correction, and both are real outcomes of the same fix.

  **Still not fully fixed for the generic families, and it can't be from here:** re-probed on the engine, upright "L"/Script improved from 318.3 to 282.8 against the 263 viewport — better by 36px, still 19px amputated. The residue is not the fit, it is font *substitution*: `cursive` and `fantasy` name no actual typeface, so the browser that measures and the engine that prints resolve them to different faces with different outlines, and no measurement taken on one can size the other. That is the same hazard the sideways strip has always warned about; it applies straight-on too (see the README note), and a named family present on both machines is the only real answer.

### Known, not fixed

- **A takeover's picture cannot print on a rig whose header is shorter than the block.** The picture is anchored to the top of the lifted panel, so if *Reach up* overstates the real header, the picture is lifted off the paper and clipped — and turning the pull *down* instead shrinks the panel until the picture is dropped from the markup for being under the 120px floor. Swept the full 60–400pt range against a short header: it never printed once, while still costing ~90 characters every time. There is no way to fix this in the app, because the rig's true header height is exactly what it cannot measure — it only knows what you tell it via the pull. What *is* fixed is that both the preview and the card now show and say so, instead of the loss being invisible until the tape came out. Calibrate with a blank takeover first; the picture follows.

---

## [0.3.3] — 2026-08-08

### Added
- **Upload a picture directly on a Takeover block**, in both styles. Previously the only uploader lived on an Image block, so putting a picture on a takeover meant creating a block you didn't want, uploading there, copying the link, pasting it across, and deleting the block. The card's own hint said as much, which is a fair sign it was a papercut.
  - It matters most exactly where it was missing: the picture is the headline of a **Fake cheer**, and that payload sits at ~491 of Twitch's 500. A pasted Discord/imgur URL is routinely long enough on its own to push it over — and over the cap Twitch rejects the message outright rather than splitting it. Uploading mints a 39-character link, which is the only shape that reliably fits.
  - The shrink-and-POST core is now shared (`uploadPngForUrl`) rather than welded to the Image block's `block.url`, so both callers mint links the same way. The Image block's own upload path is unchanged in behaviour.
  - After an upload the URL field repaints with the minted link, so the control shows what's actually being used instead of sitting blank while the preview changes.

---

## [0.3.2] — 2026-08-08

### Added
- **Takeover blocks.** A third block type that paints over printer-bot's own header — the avatar, the bits line and the name it draws — so the tape comes out as your artwork rather than a receipt with a message stapled underneath. It's an opaque SVG lifted over the header with a negative top margin; anything below it in the stack still prints as normal. Three optional lines with independent sizes, an optional picture, and one **Reach up (pt)** calibration slider, since the bot's header height depends on the streamer's avatar and can't be a constant.
  - The picture rides in a `<foreignObject>` through the ordinary **carrier tag** table, so it inherits the blocked-tag data instead of hardcoding SVG's `<image` (blocked since Aug 2026). Measured working through both the `embed` and `input` carriers.
  - Measured: a three-line takeover is 350 chars, and a takeover **plus** a full real-picture payload plus the cheer wrapper is 458 — one cheer, not two. A test locks that in, since it's the difference between the gag costing 100 or 200 bits.
  - The preview is WYSIWYG: it renders the same receipt chrome, so the overlay covers the preview's header exactly as it covers the real one.

- **Fake cheer**, a second style on the same block. Arranges the overlay the way printer-bot arranges a real cheer — picture on top, then the bits figure, then the name, then an italic message — reproducing the hand-built payload this feature was reverse-engineered from, the one that printed correctly on a real rig (80 px picture, baselines 24/900, 19/700, 13/italic). Type the figure only; ` BITS` is appended. It stays **free text rather than a number**, because `-100000` and `∞` are the jokes people actually want and coercion kills them.
  - It **composes `buildTakeover`** instead of emitting its own markup, so the escaping, the carrier table and the `foreignObject`-last rule are inherited rather than re-implemented — one place to get them right.
  - The two styles keep **separate text fields**, so flipping the selector to compare them and flipping back doesn't eat what you typed. The three size sliders are shared, being the same three visual slots either way.
  - **Fits one cheer with a picture — 100 bits, not 200.** It didn't at first: on the old 67-char link shape a three-line fake cheer plus a picture measured **540** against Twitch's 500. Two changes in this release brought it to 497 — the uploaded-link shape (below) and dropping the body-width clamp inside the fixed `foreignObject`, where it's a provable no-op — and the short image host took it to **491** once that landed. The margin is real but thin: at 491, `IRS` fits and so does `shamu4life` (498), but a very long name still doesn't. The card names the number and the counter turns red before you send.
  - *(Two corrections to earlier drafts of this entry, both recorded rather than scrubbed. It first claimed **520**, measured against a 12-character key placeholder while the uploader actually minted 32 — the real figure was 540, worse than stated. It then said an over-length fake cheer "splits into a second cheer, 200 bits". It does not: `packStackBodies` treats the first body of a part as fitting whatever its length, and a takeover is a single SVG that cannot be split regardless — so going over means Twitch **rejects the message and nothing prints**. That is a materially different consequence, and the hint said the wrong one.)*
  - Text and picture are both **clamped into the painted panel**. A short *Reach up* or an oversized picture used to be able to push a baseline past the white box, which prints *on top of* the header the block exists to cover — i.e. looks exactly like the feature not working. Caught by a test written for the edges, not by the happy path.

### Corrected

- **The "no sender template" scope note from this release's first draft was wrong, and is gone.** It refused a name + picture + bits arrangement on the grounds that it produced "a tape indistinguishable from a record of a payment nobody made." That reasoning treated *looks like a receipt* as *functions as a financial record*, and those aren't the same thing. Twitch's bits ledger is server-side and authoritative, nobody reconciles it against thermal paper, and the printer is a gag the streamer runs for laughs — the cheer that triggers a print carries the sender's real name in chat, in front of the whole room. The paper being obviously untrue in a room that can see the truth is the joke, not a forgery.

### Changed

- **Uploaded-image links are much shorter, because the URL is payload.** `POST /upload` now mints `https://<host>/<12 hex>.png` — **45 characters**, down from `/i/<32 hex>.png`'s 67. Those 22 characters are the difference between a fake cheer costing 100 bits or 200.
  - The key drops from 16 random bytes to 6 (128 bits to 48). The security model is "unguessable link, alive for 15 minutes": 2.8×10¹⁴ keys against a 900-second window needs ~3×10¹¹ requests/second to expect one hit. The other 80 bits were 20 characters of payload spent on margin that was never load-bearing.
  - Images now serve from the **root** as well as `/i/`, matched by shape rather than by host — `^[0-9a-f]{8,64}` plus an optional image extension. `test/imgpath.test.mjs` asserts it can't shadow `/robots.txt`, `/llms.txt`, `/sitemap.xml`, `/upload`, `/px` or the app itself, which is the risk that sharing a namespace with the static site buys.
  - **Links minted in either older shape still resolve**, so nothing 404s mid-cheer.
  - The `.png` suffix stays. It's load-bearing twice over: `embed`/`object` pick their renderer from the extension, and wkhtmltopdf escalates a failed subresource with an *unknown* extension to a fatal, whole-job error. These links expire in 15 minutes, so cheering a stale one is the ordinary case, not the edge case.
  - New `RW_IMG_HOST` var points minted links at a short image host. It shipped **unset** in this release and was switched on in 0.3.2's follow-up once the domain was verified live — see the Deploy config note below. It falls back to the request origin when unset, so previews and `wrangler dev` are unaffected either way.

- **The width clamp may now be dropped inside a fixed frame — and only there.** `max-width:100%` on a top-level carrier is field-verified (without it, pictures printed off the right edge of the paper, because the receipt body is ~240px and not `PAPER_PX`'s 263). Inside a `<foreignObject>` the containing block *is* the frame and the tag already states that width, so the declaration can only resolve to the width it already has — a no-op worth up to 23 characters. `buildImageEmbed({framed:true})` is the only way to drop it, `buildTakeover` is the only caller, and a test asserts every carrier still clamps when unframed.

### Internal

- **CI can be re-run by hand** (`workflow_dispatch` on `ci.yml`). A pull request opened by a GitHub App token doesn't trigger Actions, so a PR whose branch was pushed *before* it was opened never got a `Validate` run and there was no way to ask for one.

### Deploy config

- **Both custom domains are declared in `wrangler.jsonc`.** `receipt.uwutoowo.com` was previously configured only in the Cloudflare dashboard and this file carried no `routes` at all. Adding the new short image host means routes now live in config — so **both** are listed, because declaring only the new one invites a deploy to reconcile the route set and drop the domain production actually serves on. Anything that should be reachable has to be in that list from now on.
- `i.uwutoowo.com` is now **live and in use**. The first production deploy created the Custom Domain (no DNS conflict — the pre-existing record was taken over cleanly), and `RW_IMG_HOST` now points minted links at it: **39 characters**, down from 45. Verified end to end against real Cloudflare and KV — `/upload` mints a 12-hex key and the object round-trips 200 `image/png` at all four shapes: `/<key>.png`, `/i/<key>.png`, `/<key>`, and on the short host. Before the deploy that hostname resolved to Cloudflare but was bound to nothing and returned 522, which is why the domain and the var landed as separate changes.

### Measured, not assumed
- **A picture drawn under ~120 CSS px tall does not render inside a lifted takeover** — no image XObject at all, just blank paper where it should be. It is the drawn *height*: a 60×240 draw renders and a 200×67 draw does not, at near-identical areas, with the threshold between 110 and 120. All three live carriers behave the same, and it only happens under the negative top margin. This decided the default: a profile picture is square, so its drawn height is its width, and the previous 80 px default would have printed nothing. The floor is now 120, both picture sliders start there, and a picture that can't clear it is dropped rather than sent as ~90 characters buying blank paper. (It's easy to miss — a portrait test image draws tall enough to clear the threshold however narrow you set it.)
- **The picture could paint over the text at ordinary slider positions.** The picture is emitted last (it has to be — see the `foreignObject` rule below), so SVG document order paints it *over* the lines. Sizing the picture first and clamping the text into what was left let the clamp drag the stack up underneath it: at the default pull with the width slider at maximum, `-100000 BITS` rendered with **zero** ink. Every test passed, because they asserted only that each piece was inside the box — which was true. The text's room is now reserved first, and the tests assert the two are *disjoint*.
- **An over-pulled fake cheer printed a blank white slab.** The blank takeover anchors to the bottom of the covered area, so over-pulling only adds white; the fake cheer anchored to the top and climbed 1:1 with the slider until it left the paper — at pullPt 300 the picture was gone, at 380+ nothing printed. The lift is now capped at the default calibration's worth, so the default is untouched and beyond it the block follows the message down the tape.
- **The `startY` clamp inverted on tall stacks.** With three 48 px lines in a short cover, `maxStart` falls below `minStart` and `Math.max(min, Math.min(y, max))` resolves to `minStart` — letting trailing lines fall outside the viewport, where the SVG clips them: never printed, still paid for in characters. 189 of 2898 reachable slider combinations hit it. Lines that genuinely don't fit are now dropped instead.
- **The `iframe` carrier deletes everything stacked below a takeover.** An `<iframe>` inside the `<foreignObject>` swallows the content following the whole SVG — isolated against an otherwise identical page: `embed` printed the trailing block, `iframe` printed none of it on either PDF page, and a bare `iframe` outside a `foreignObject` printed it fine. Same class as the sibling rule below, one level out. The table now flags it (`framedOk: false`) and the card warns; the pick is still honoured, because silently overriding an explicit choice is its own bug.
- **`<foreignObject>` swallows every SVG sibling that follows it.** It's an HTML integration point: the parser switches to HTML inside and never cleanly returns to SVG context, so a `<text>` emitted *after* one is parsed as HTML and silently never drawn. The markup looked perfect and the print came out with the text simply missing. `buildTakeover` emits the picture **last** for this reason, with a regression test — the cost is that a picture tall enough to reach the text will overlap it, which at least shows up in the preview.

---

## [0.3.1] — 2026-08-06

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
