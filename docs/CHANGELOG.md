# Changelog

All notable changes to Receipt Wrecker are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

**Entries describe the state at that release, not today.** The 0.1.0 notes below say
the app makes no network calls and emits only plain Unicode glyphs. Both were true
then and neither is true now. Everything before 1.0.0 targeted nutty.gg's printer-bot,
not SassyTP's. The design specs and plans older entries mention lived in
`docs/superpowers/`, removed in 1.0.0; git history keeps them. For current behaviour see
the [README](../README.md) and [`public/llms.txt`](../public/llms.txt).

---

## [1.0.0] - 2026-10-10

### The short version

**Rebuilt for SassyTP's printer-bot (2.5.4).** Receipt Wrecker now targets
[SassyTP's printer-bot](https://github.com/SassyTP/printer-bot), which draws every cheer on
a receipt page in headless Edge and prints a screenshot of it. That bot prints a cheer one
of two ways: a cheer of at least the streamer's **High Roller** threshold (default 25 bits)
is read as HTML and its inline styles print; a smaller cheer prints as **plain** text in
quote marks, tags and all. So the app now asks for the streamer's settings, builds big text,
sideways text and glyph-art for High Roller cheers, and automatically builds every block in
its plain form (Han tiling) when the cheer is below the threshold.

Everything built for the previous target, nutty.gg's printer-bot (printed through
wkhtmltopdf), is gone: Giant type, the cheer-gem tuck, Receipt length, the Takeover and
Fake cheer, continuation covers, real-picture carriers, SVG Big Text and the old bench.
Saved work is converted on first load, and the stack as it was is kept once as a preset.

The preview is now drawn by **SassyTP's printer-bot renderer** (MIT), the bot's own receipt
page, built into the app and run in a sandboxed frame with no network access.

### Removed

- **Giant type** (nested borrowed `.title` classes) and everything that served it: the
  borrowed-class table (`PB_CLASSES`, `pbClass`, `classAttr`, `pbPreviewCss`), the Emote
  names layout, the **Print size ruler**, and the **Receipt length** control with its A4
  height model (`heightBudget`, `HEIGHT_RESERVE_PX` and friends).
- **Hide the cheer gem** (the `tuck` setting). It worked by borrowing two of the old bot's
  classes; on this bot it would need a message that starts with a tag, which the app never
  sends.
- **Takeover** and **Fake cheer** (SVG lifted over the old bot's header) and the
  **continuation covers** for multi-part runs. SassyTP's bot prints neither SVG nor anything
  outside its message box.
- **Real-picture carriers**: the carrier table (`EMBEDS`, `buildImageEmbed`) and the **Find
  what still sends** probe. See "Changed" for what a Real picture block does now.
- **SVG Big Text** ("Type", straight and sideways), the rotated span and its CSS-escape trick,
  the binary text tier, and the **Census** (Print test strip).
- `breakRuns`, which reworked art to get past a repetition filter. Removed on principle.
- The hidden single-mode UI left from before the block composer, its builders and its
  duplicate uploader.
- The **100-bit floor** on Bits per cheer.
- Tools for the old bot: `tools/rig.py`, `tools/printerbot.mjs`, `tools/calibrate.py`, and the
  `npm run render` / `npm run printerbot` scripts. The design specs and plans in
  `docs/superpowers/` (git history keeps them).

### Added

- **The streamer's printer-bot settings**: Paper width (80 or 58 mm), High Roller threshold
  (default 25; 0 = off), Bits per inch and Maximum length (both off by default). They decide
  how wide the paper is, whether a cheer prints styled or plain, and how long a High Roller
  message may be. Saved as fields of `rw_controls_v1`; no new storage key. When Bits per inch
  leaves a cheer no room after the Cheer line, the notice above the parts says so, with how
  much receipt the streamer gives per bit.
- **Big text** (High Roller): `<div style="font:700 <px>px/<lh> Arial">` in bold Arial, sized
  from Arial Bold's real advance widths (every printable ASCII and Latin-1 character measured). Layouts *Auto*, *Lines as you typed them*, *Stack the
  letters* and *Each line its own size*; Auto also tries the typed lines with the words wrapped
  to the paper (balanced, every word whole), so a sentence typed on one line prints wrapped
  rather than tiny or as a long column of small letters, and keeps whichever is biggest in one
  cheer. A line too wide at a fixed size is counted by the lines its words really wrap to; sizes *Auto* (biggest in one cheer), *Fill the
  paper's width* or 20 to 400 px; **Upside down**. Line height .8 for capitals-only lines,
  1.15 when anything has a tail (lowercase, Q, comma, semicolon, emoji). Emoji are allowed and
  print as grey dots; invisible characters are left out and the card says so. Every option is
  labelled with what it prints (capitals in cm, cheers).
- **Sideways text** (High Roller): `writing-mode` turns the text so it runs down the tape, as
  big as the paper's width allows; each typed line is a column. *Top to bottom*
  (`vertical-rl` with `text-orientation:sideways`, so Han characters and emoji turn with the
  letters; read by turning the receipt anticlockwise) or *Bottom to top*
  (`sideways-lr`, turn it clockwise; needs Edge 132 or newer on the streamer's PC).
- **Han tiling for plain cheers** ("Design T"): every row exactly as many Han characters as a
  plain line holds (15 on 80 mm, 9 on 58 mm), a light header row so the opening quote mark has
  a line to itself, and the cheer word at the end. Each plain part is its own cheer, and a run
  that needs several spreads its rows evenly over them (no cheer for a lone row).
- **Glyph-art forms for this bot**: Han characters as a centred square grid sized in `vw` so
  one message fits both papers (12 to 30 columns); ASCII and blocks as Courier New rows in a
  `<pre>` (8 to 48 columns); Braille, with its rows sized for its narrow cell so a picture keeps
  its shape (marked as needing a test print).
- **Plain mode, automatically.** Below the threshold every block prints in its plain form
  (text as Han tiling, Glyph-art as a plain Han grid), and a notice above the parts says why
  and how to change it.
- **High Roller test** and **Plain test** buttons, replacing the Census and the ruler: one
  cheer at exactly the threshold (BIG, MMMMM at the width limit, "jog", an upside-down BIG
  and an upward UP) and one cheer one bit under it (HI in a plain Han grid and a row of
  tones), each with a note on how to read the print.
- **The preview is SassyTP's own renderer.** `v/2.5.0/renderer.html` at commit `b9f12b0`
  (version 202610090056) is kept in `public/index.html` as inert text, with SassyTP's MIT
  notice, and loaded into one sandboxed frame per part (`allow-scripts` only, no network:
  its page policy allows nothing to load). Three edits, each marked `RW-EDIT`: the Twitch,
  YouTube and Kick logos are one grey box, the page policy allows no network, and its closing
  script tag is escaped. Under each part: the receipt's length, where and why the bot cuts it,
  and anything the bot's sanitizer would remove.
- **Thermal preview from the bot's page**: the receipt at the printer's dot width (576 / 384),
  dithered with a port of the bot's own C# Ditherer, with **Detailed / Soft / Crisp** (the
  dock's names for Floyd-Steinberg, Atkinson and threshold). Its caption says it is what the
  printer gets give or take fonts and a dot or two of position.
- **Tools**: `tools/forkbench.mjs` (`npm run bench`) renders a message through SassyTP's real
  receipt page at a pinned commit and dithers it the bot's way; `tools/vendor-renderer.mjs`
  writes or `--check`s the vendored renderer block (the "SassyTP shipped a new version"
  routine). `tools/payload.mjs` has new kinds: `big`, `side`, `glyph`, `plain`, `hrprobe`,
  `plainprobe` (and `raw`), and takes `"paper": 58`.
- **Tests**: a tag allow-list test (every builder, both probes, 80 and 58 mm, hostile input:
  only `div`, `pre`, `br` and `style`, never a picture tag in any case); the MANDATORY
  browser contract test, which runs every mode's Copy payload through the vendored renderer
  and checks that nothing is taken out, nothing is cut that the app didn't warn about, and the
  height matches the prediction.

### Changed

- **Bits per cheer** is any whole number from 1. A floor of 100 would have made the control
  say 25 while the message said `Cheer100`.
- **A plain part carries its cheer word last** (`… Cheer24`). The old "token leads" rule
  still holds for High Roller messages, which never start with `<`.
- **Real picture** blocks send nothing. SassyTP's bot only prints pictures from emote
  servers, and this channel's chat filter blocks the picture tag, so the card says the upload
  can't print as a picture and offers **Switch to Glyph-art**. Upload, rotate and
  brightness/contrast stay on the card; the card shows the picture only while it is a Real
  picture, a pasted link through `/px` (the browser never asks the link's own host). New Image
  blocks start as Glyph-art (Han characters, 20 columns). A stack whose only content is a Real
  picture gives no copyable cheer.
- **The repeat number** (two digits after the cheer word) is still off by default and still
  saved in `rw_controls_v1`.
- **Network**: the app now has four `fetch` call sites (two `/px`, two `/upload`), down from
  six. The Thermal preview no longer fetches anything. The Worker (`src/worker.js`) and
  `wrangler.jsonc` are byte-identical.
- **Settings blob**: `rw_controls_v1` now holds `cheer`, `bits`, `hrThreshold`,
  `bitsPerInch`, `maxInches`, `paperMm`, `nonce`, `thermalView` and `thermalDither`. Old fields
  (`tuck`, `covers`, `receiptLen`, the single-mode fields) are ignored and dropped on the next
  save.
- The test harness picks the app's script by its id (`<script id="rw-app">`), because the
  vendored page has a `<script>` of its own.
- **Copy** is a full-size button in each part's header, which stays in view while a tall
  preview scrolls past. A probe's view has a **Back to my stack** button.
- **Presets**: saving under a taken name asks before replacing it; a rename onto a taken name
  is refused; Load, Rename and Delete act on the preset picked even when two share a name; Load
  says whether its uploaded pictures still load.
- **Glyph-art from a picked file**: the file is read in the browser and never uploaded, so the
  card says a reload or a preset won't keep it, and asks for it again when one didn't. A link
  that can't be read says so (and isn't fetched again on every edit). **Rotate** works for
  glyph-art too. Grids that need several cheers are spread evenly over them. The Detail field
  shows the columns the grid really uses.
- A free test counts messages, not bits; with High Roller off the cards say so; number fields
  show the value the app uses once committed; lengths in a part's verdict are in cm.

### Migration of saved work

The first time a saved stack loads in 1.0.0 (and whenever a preset is loaded):

- A **Takeover** or **Fake cheer** becomes ordinary blocks, in order: each text line a Big
  text block (lines as typed, the biggest size that fits one cheer), each picture a Glyph-art
  Image block with the same link. Each new block gets a fresh id. An empty one is dropped.
- A **Giant type** block becomes Big text with its layout (the Emote names layout becomes
  Lines) and its level as a size: level n is round(16 × 1.2ⁿ) px.
- A **Type** block becomes Big text (straight), Big text upside down (180°), or Sideways text
  top to bottom (90°) or bottom to top (270°).
- An Image block loses its carrier pick; everything else, the upload link included, stays.
  A Glyph-art block made from a Takeover picture gets 20 columns.
- A note above the blocks says what changed (including that emote names now print as words
  and the old fonts and italics are gone), on the load that converts the stack, until
  dismissed or the next reload. Loading an older preset converts it the same way and says
  the same in the presets note; the preset itself stays as it was. A Giant block in the
  Emote layout takes the biggest size that fits one cheer: its level sized an emote
  picture, not letters.
- When anything was rewritten, the stack as it was is saved **once** as the preset
  **Before 1.0.0** (or "Before 1.0.0 (2)" if that name is taken), merged into your presets
  after they load, never over one of yours and never over a presets list that can't be read.
  Stored presets themselves are not rewritten; a preset is converted when it is loaded.

### Field note: this channel's chat filter (2026-10-10)

The channel owner reported on 2026-10-10 that the channel's blocked-terms list from the
nutty.gg days is unchanged, and that a paste test whose message carried an `<img` tag (an emote
picture after a styled div) was held by AutoMod. That matches the older record, in which the
list ate `<object`, then `<image`, then `<img` (confirmed 2026-09-15). So no builder emits a
picture tag, there is no emote or inline-picture feature, and uploads print only as
glyph-art. Whether the list blocks anything 1.0.0 does use (`<div`, `<pre`, `<br`, `style=`)
is not known: a free test (Cheer-ready off) answers it before any bits are spent. If a channel
blocks a form, the answer is the plain form, never a reworked message.

### How sure

- **Bench**: every mode was rendered through SassyTP's real receipt page at the pinned commit
  in Chromium (`tools/forkbench.mjs`), at 80 and 58 mm: 38 cases built by the app's own code,
  all rendered with no sanitizer notes, no page-policy violations, no ink touching either edge
  and nothing trimmed. Horizontal text and grids came within 0.21 px of the predicted height;
  sideways text came in 1 to 18 px under the prediction, which is deliberately an upper bound.
  Real Copy payloads from the page (mixed big, sideways and Han-grid parts at 80 mm; ASCII
  grids and an upside-down each-line block at 58 mm; plain and Han tiling) were benched too,
  and the 1-bit prints checked by eye.
- **Preview vs bench**: the in-app preview and the bench agree on height, cut and sanitizer
  notes in every case compared; plain text and 80 mm Han grids match dot for dot; big and
  sideways text differ only in a few edge dots, and header text sits a dot or two lower. In the
  Thermal view, small character grids on 58 mm and Braille can land up to 3 dots off, and the
  caption says their texture is approximate.
- **Tests**: 167 unit tests and 24 browser tests, including the tag allow-list test and the
  contract test against the vendored renderer.
- **Still needs a real print.** No 1.0.0 message has been reported printed on the real rig
  yet. The bench cannot see the rig's fonts (Segoe UI, Arial, the CJK face, Courier New, the
  Braille and emoji faces), the streamer's Edge version, their settings or `theme.css`, or the
  channel's chat filter. The High Roller test and the Plain test are one cheer each; send them
  first. Braille and the blocks tier (thin seams between rows on the bench) most need checking.

---

## [0.12.0] - 2026-10-09

### The short version

**The two digits after the cheer are optional now, and off by default.** Every cheer
used to go out as `Cheer100 07`, with two rotating digits (the nonce) after the token,
and those digits printed on the receipt. A cheer now goes out as plain `Cheer100`.

### Added — Add a repeat number

A checkbox under Cheer-ready, **off by default**. On, it puts the two rotating digits
back (`Cheer100 07`, and inside the corner box when the cheer gem is hidden). All they
do is make each copy different: Twitch won't send the same message twice in a row
within 30 seconds. A refused message just isn't sent and costs no bits, so for
a cheer the digits mostly bought a stray `07` on the tape. Like "Hide the cheer gem",
it is disabled (not unchecked) without Cheer-ready, and it is saved as a field of
`rw_controls_v1`, with no new storage key. Settings saved before this release have no
such field, and they read as **off**: dropping the digits for everyone was the point.

With the digits off, a stack that repeats itself (the same block twice, say) can come
out as two identical parts in a row, and Twitch would refuse the second within 30
seconds. That part now says so ("Same message as part 1 …") instead of letting the run
stop with no word from the app. Only the part right before counts: the parts go out in
order, and a different message in between makes a repeat sendable again.

### Changed

- Without the digits a lead is 3 characters shorter (`Cheer100 ` is 9; tucked, 57 plus
  the 4-character `<br>`), and the reservation shrinks with it, so Giant type can spend
  those 3 characters. Untucked Hanzi and glyph-art bands still reserve their floor of
  14, so turning the digits on or off never re-bands a grid.
- With the default settings, the tucked lead is now the form that rode the real cheer
  on 2026-10-01 (`<span class="switch dialog-nav-button"> Cheer100 </span>`) plus the
  leading non-breaking space; the two-digit form was never sent.
- Copy only advances the repeat counter (`rw_nonce_seq`) while the digits are on.
- `tools/payload.mjs` follows the app's default (no digits); `"nonce":true` adds them.

### How sure

297 unit tests and 18 browser tests pass. The new tests were checked against the bugs
they exist for, and each of these makes them fail: old settings reading as on, no
repeated-part note, the composer ignoring the setting, `leadLength` ignoring it, and
the packer sending the digits anyway. That last one puts a full message at 503
characters, which Twitch rejects outright.

---

## [0.11.0] - 2026-10-02

### The short version

**Fixes a field cut-off in 0.10.0's Giant type.** A stacked Giant cheer
(`HELLO`, `C O C K`) came off the real printer with only its first ~4 lines and the
top of the 5th, cut at roughly A4 length (~29.7 cm). The cause: the app packed up to a
fixed **1400 px (~37 cm)** of content per receipt, because printer-bot lays the page out
at `--page-height 500mm`. But the real printer stops far short of 500 mm — its Windows
driver has a fixed paper **length**, commonly **A4 (297 mm)**, and SumatraPDF prints
`noscale`, which **clips** the overflow instead of shrinking it. So 297–463 mm of
over-A4 content was silently lost.

### Added — Receipt length

A **Receipt length (mm)** control (default **297**, A4). It feeds a per-receipt height
budget, `heightBudget(mm) = floor(mm × 96/25.4 − 351)` CSS px (A4 → **771 px**), which
replaces the old fixed 1400. The `351` px reserve is the header + lead line + footer a
cheer always spends outside the body, **measured on the real engine** (inked page = the
app's per-body height estimate + 351, flat across levels L6–L14). A tall stack now
**splits into several cheers that each fit the page** instead of being cut off; the card
says how many receipts it needs and that each is its own cheer with printer-bot's header
between them. Most 80 mm thermal drivers cut at A4; set the driver to **Roll Paper /
continuous** and raise this to print longer. Persisted as a field of `rw_controls_v1` (no
new storage key).

### Added — the Print size ruler is now a length gauge

For the current Receipt length the ruler's note says which of its numbers 1–13 the app
expects to print in full before the cut. To calibrate, **measure the printed tape** from its
top edge to the cut and set Receipt length to that length in mm — not to a ruler number,
whose position is measured down the giant letters and so leaves out the header and footer
the receipt also spends (and the count is deliberately conservative besides). The ruler
itself still rides the full 500 mm page (it is the gauge, so it may run past a short receipt
on purpose).

### Changed — smaller word gaps in Stack layout (for phrases)

A space in a stacked phrase used to cost a **full giant blank line**. Stack layout can now
render a word gap as a **base-height break** (~23 px, a `<br><br>` between per-word nests)
instead, **measured on the real engine** (`I RAID RAID` at L7: within-word pitch 77 px,
between-word 100 px — a +23 px gap). `fit1` always picks the **fewer-cheer** gap (tie →
blank), so a spaceless word (`HELLO`) stays the one-nest `blank` form at every length. A run
of single-letter words (`C O C K`) also stays `blank` — hence byte-identical to before — at
the A4 default and typical lengths, where per-word nests either still exceed the
500-character budget or do not cut the cheer count; at a **short** Receipt length (e.g.
150 mm) `fit1` shrinks the letters until per-word nests both fit under 500 and save a cheer,
so `small` correctly wins there. A single line taller than the whole receipt is now
**warned** on the card, never silently cut.

### How sure

Verified on printer-bot's real engine (wkhtmltopdf 0.12.6.1, patched Qt, Segoe UI,
203 dpi) via `tools/payload.mjs | tools/printerbot.mjs | tools/rig.py --document`:
`C O C K` → one A4 receipt (295 mm), `HELLO`/`PENIS` → one A4 receipt (288 mm), a 13-letter
word at a fixed L12 → five receipts that each fit A4 (≤ 251 mm), none spilling to a second
page. `tools/payload.mjs` takes an optional `"mm"` to bench other lengths. The one thing
the bench cannot see — the driver's exact paper length and the `noscale` clip — is what the
Receipt length control exists to let each user dial in.

---

## [0.10.0] - 2026-10-02

### The short version

Big letters print again. printer-bot's sanitizer (0.9.0) strips the `style` attribute
but keeps `class`, and the page printer-bot hands its print engine is built by copying
every stylesheet from its settings page into the document, including nutty's shared UI
stylesheet, `global.css`. So any class defined there styles the chat message on paper.
One of them, `.title`, is `font-weight:900; font-size:1.2em; text-transform:uppercase`,
and `em` is relative to the parent, so nesting it multiplies: N nested
`<b class=title>` print at 16px × 1.2^N.

That is **Giant type**, now the default render of a Text block. A five-letter word
stacked one letter per line prints with capitals about **3.8 cm** tall in one 100-bit
cheer, and two or three letters about 5.5 cm. Every markup token is sent literally and
is on the sanitizer's own allow-list: nothing in the markup is disguised from automod, the
sanitizer or Twitch's bits ledger. (The words are another matter: Stack sends a word one
letter per line, so a word filter never sees it whole, as with Hanzi tiling. That is how
it fits the paper, not a feature; see THE RULE in CLAUDE.md.)

How sure: **one real cheer** carrying 15 nested titles, a two-class `<span>` and `</br>`
passed the channel's automod and printed giant stacked letters on 1 Oct 2026. Everything
else (sizes, line heights, page fit, the corner tuck, the in-between sizes) is measured on
printer-bot's engine version (wkhtmltopdf 0.12.6.1 Linux build, patched Qt, Segoe UI
metrics; the rig runs the Windows build), not on paper. It is also **fragile by construction**: it borrows someone else's style, which
can change any day, and when it does the text quietly prints at normal size. So this
release ships a one-cheer **Print size ruler** to check it, keeps Hanzi tiling one click
away as the backup, and records the rule for when to stop (CLAUDE.md, top banner).

### Added

- **Giant type** (`render:"giant"`), the new default for new Text blocks and the
  first-run seed (`HELLO`). Saved blocks keep their render; nothing is migrated.
  - **Layout**: Auto (as typed or stacked, whichever prints bigger in one cheer), Lines
    as you typed them, Stack the letters one per line, and Emote names. **Size**: Auto,
    biggest that fits one cheer (the default); Auto, fill the paper width (may cost more
    cheers); or levels 1 to 18 by hand. Every option in both menus is labelled with what
    it prints for the current text, e.g. `Level 14 · capitals 3.8 cm · 1 cheer` or
    `… · letters cut off`.
  - The fit is on **width, height and characters at once**. Width uses a conservative
    capital-letter table, `round(max(Segoe UI Bold, Arial Bold) × 1.03, 3)`, because an
    earlier Arial-based table let "MMMMM" ink past the body edge on the real engine.
    Height uses the engine's measured line pitch. Characters were the one budget the
    first design forgot: height alone let 26 lines of "ROSES nnn" become a single
    487-character body, 499 with the lead and 543 tucked, which Twitch rejects outright.
    A split prefers the gap between two words and never starts a piece with a blank
    line. (A blank at the top printed 396px of nothing above a "D" on the bench.)
  - In-between sizes: one `setting-description` (×0.9) or `setting-attribute` (×0.8)
    wrapper outside the nest fills the gaps between ×1.2 steps. Its own light weight
    never reaches a letter. These two classes have **never been sent**.
  - The **card** says how tall the capitals print and how many cheers the block really
    costs once the stack is packed. It warns about a line too wide for the paper, a line
    too long for one message, emoji it had to leave out (the engine can't draw them),
    and words Twitch would charge as another cheer (`Kappa50`, `4Head100`, `cheer100`;
    hedged with "if" for a word like `PS5` that is a cheer only if the channel made it
    one). It also
    carries a date stamp ("Confirmed printing big on 1 Oct 2026"), a note that chat sees
    the raw tags and a mod bot may object (send it free first), and "Sized for 80 mm
    printers". The font, weight and I/U/S row is hidden: the style is printer-bot's.
  - **Emote names**: type Twitch emote names and printer-bot's own emote pass swaps
    each one for its picture, which printer-bot's `.emote{height:1em}` scales to the
    giant font-size. A lone emote prints about 4.9 cm square. Every name is padded with
    a space on both sides, because Twitch only recognises an emote that is a word on its
    own. Glued to a tag, the tape prints the NAME in giant capitals instead (measured).
    The preview draws a dashed box labelled with the exact name and never downloads the
    emote. **This form has never been sent.**
  - Hanzi and Type cards get a one-line nudge with a **Switch this block** button,
    because returning users' blocks are not migrated.
  - A multi-part stack with Giant type in it says "Send part 1 first and look at the
    printer. If the letters came out normal-sized, stop."
- **Hide the cheer gem in the corner** (off by default; needs Cheer-ready). It wraps the
  cheer token in `<span class="switch dialog-nav-button">`, two more of printer-bot's
  own classes, which pin it into a clipped box in the receipt's top-right corner. The
  gem shrinks into the corner, "100" and the nonce are cut off, and with Giant type the
  line they took is saved (real engine: message 156 → 133px), except in the emote
  layout, which keeps it so its first row stays centred. The lead becomes a
  non-breaking space plus the span, 60 characters at Cheer100 against 12. The hint
  computes the cost from the two real leads rather than quoting a number. Saved as a
  `tuck` field in `rw_controls_v1`; no new storage key. FIELD: this exact span rode the
  real cheer above. BENCH only: that it clips the gem.
- **Print size ruler**, next to *Print test strip*. One cheer prints the numbers 1 to
  13, each one size bigger than the last: 328 characters, 1275px, one 500mm page. If the
  numbers grow, Giant type works on that printer today. Never tucked.
- **`PB_CLASSES`**, a data table of every printer-bot class we borrow and what it does,
  in the same spirit as the `EMBEDS` carrier table. The giant sizes, the shrink steps,
  the tuck span and the preview's CSS all derive from it, so an incidental rename on
  nutty's side is a one-row edit.
- **`tools/printerbot.mjs`** (`npm run printerbot`). It builds the exact document
  printer-bot prints for a chat message. It reads nutty's live settings page and takes
  the stylesheet list, its order and the receipt template from that page. It runs
  printer-bot's real `SanitizeHTML` in headless Chromium, mirrors the emote and
  cheermote passes, and caches every file with its sha256 and fetch time under
  `.render/`. `--png` renders on the real engine through `rig.py` (APPROXIMATE Chromium
  only when there is no engine); `--ref` reads a pinned commit of `nuttylmao/nutty.gg`
  instead of the live site; `--check` compares `PB_CLASSES` with the live CSS (a
  release-checklist step, not CI). Checked on the field payload: its document matched
  the one printer-bot's own overlay script builds, byte for byte apart from image paths.
  Nothing of nutty's is committed. That repo has no licence.
- **Provenance of printer-bot's files, recorded** (CLAUDE.md banner and "Measuring",
  README "Where printer-bot's code lives"). The source is
  `github.com/nuttylmao/nutty.gg`, whose `CNAME` is `widgets.nutty.gg`, so `main` is the
  live site: verified byte-identical to `main` @ be2972f on 2026-10-02. No licence, so
  never vendored. The sanitizer arrived in 121c351 (2026-08-27); `.title`'s 1.2em has
  stood since 6 Sep 2025 (commit af65fcf; c5e9890 on 13 Sep only re-indented it);
  inlining every stylesheet into the printed page since July 2025 (20a0e59, before the
  0c7b4fc rename); `global.css` has had 8 commits ever. `printerbot.mjs --ref` pins the bench
  to a commit. To get warned of a change: the commits feed for that one stylesheet in
  any feed reader, then `npm run printerbot -- --check`.
- **`tools/rig.py`**: `--document FILE|-` renders a complete document untouched;
  `--fonts DIR` adds your own copy of Segoe UI (the rig's font) through fontconfig and
  never downloads one; `--embedded-css` reproduces pre-0.10.0 numbers. Its JSON gains
  `pages` (with a WARNING and `pages_ink` past one page), `css` (which stylesheet, its
  sha256 and when it was fetched) and `fonts_in_pdf` (with a WARNING when Segoe UI is
  missing).
- **`tools/payload.mjs`**: `{"kind":"giant",…}` and `{"kind":"ruler"}`, built through
  `buildGiantBodies` / `packStackBodies` exactly as the app builds them.
- Tests: `test/giant.test.mjs`, and browser cases for Giant type, the tuck, the 240px
  preview, the Thermal preview, the emote layout's no-fetch rule and un-migrated saved
  blocks. One browser case is **mandatory**: it runs Copy's real payload through a
  clean-room sanitizer written from printer-bot's documented behaviour, and checks the
  printed font-size to 0.01px.

### Changed

- **Render select**: "Giant type — big bold capitals (prints)", "Hanzi tiling —
  backup if Giant type prints small", and "Type (crisp) — no longer prints" shown only
  on a block that already is one.
- **The cheer lead has one builder**, `buildLead`. The packer's per-part overhead used
  to be `token.length + 4`, a second description of the lead that agreed with it only
  until the tuck: tucked, it would have reserved 12 characters for a 60-character lead
  and let two 230-character bodies share a 524-character part.
- **The Hanzi and glyph-art band slack** was a hardcoded 14 (the 12-character lead plus
  2). It is now `bandReserve`, `max(14, 500 - budget)`, which stays 14, so every untucked
  payload is **byte-identical** to 0.9.1. It grows only with the real lead (64 tucked),
  because the packer never splits a band and an over-length band is a rejected cheer.
- **Cheer-ready's hint** now says it *starts* each message (it always did) and explains
  the free test: a message with no cheer never reaches the printer but still passes the
  chat filters.
- `rig.py`'s default page uses printer-bot's real stylesheets once `printerbot.mjs` has
  cached them, and otherwise its hand-copied subset **plus** the `PB_CLASSES` rules. It
  finds wkhtmltopdf in `~/.local/opt/usr/local/bin` too (the Linux `.deb` unpacked with
  `dpkg -x`), and its version check accepts that build's `0.12.6.1 (with patched qt)`,
  which the old substring test rejected. It exits 3 when there is no wkhtmltopdf at all.
- The preview avatar follows printer-bot's own rule, 90% of the body (216px), instead of
  a fixed 15em. A side effect: the (non-printing) takeover overlay previews 24px higher.

### Fixed

- **The receipt preview was 28px wider than the paper.** Its content box was 268px
  (an 80mm box with 1em padding). The tape's body is 240px (a 72mm page minus printer-bot's
  1em margins), so a line could sit whole in the preview and come off the tape cut or
  wrapped. `.rcpt` is now 72mm in both the page CSS and the Thermal preview's copy, and
  the frame is an outline rather than a border, because a border inside `border-box` left
  238px and made the two previews disagree by 2px.
- **The lead was drawn as text.** `renderParts` appended it as a text node, so a tucked
  lead would have shown literal `<span class=…>` on the preview receipt. It is now
  rendered as markup. It is only ever our own constants, digits and a non-breaking space.
- **The bench could not see a second page.** `rig.py` rasterized page 1 only, so a
  message that ran past the 500mm page looked like a clean print. Giant type's real
  failure mode is exactly that: on the bench with Segoe UI, the field payload itself
  (15 levels, five stacked letters) prints "S" and the footer as a second page. That is
  why Auto gives five stacked letters 14 levels, not 15.
- **The bench rendered giant type at 16px**, because its CSS was a subset of the receipt
  template's rules with nothing from `global.css` in it.
- A browser test, "the cover surcharge line never says a range of one", had quietly
  stopped testing anything. Under Giant type its text no longer split the stack, and the
  assertions sat behind an `if`. It now pins its block to Hanzi and fails if the stack
  stops splitting.
- Docs: CLAUDE.md's export list was one short (`anyCarrierLive`), and it pointed at an
  `npm run calibrate` script that 0.9.0 removed from `package.json`.
- **A part after a takeover could still go out over 500 characters** (present at 0.9.1).
  The continuation cover's 106 characters were reserved, but a single body always gets a
  part of its own, so one too big for the room left beside the cover (a full Hanzi band:
  598; a 464-character giant body: 582) had the cover prepended anyway and Twitch
  rejected the whole message. Such a part now goes out without its cover: a missing
  cover costs looks, an over-length part costs the cheer, and takeovers no longer print.
- Found in review before release:
  - **Invisible characters became giant blank lines.** Copy-paste brings in zero-width
    spaces, joiners, direction marks, soft hyphens, BOMs and control codes. Giant type
    kept them, and the stack layout made each one a line of its own ("HI\u200BYOU" lost a
    whole size to make room for it). They are dropped now, and the card says
    "Invisible characters … were left out" instead of a puzzling "Emoji … left out"
    with no emoji named. CR and U+2028/2029 count as line breaks. A second pass extended
    the list to the whole BMP Default_Ignorable set: the first missed U+3164, the HANGUL
    FILLER people paste on Twitch as an "invisible character" ("HI\u3164YOU" still lost a
    size and printed a blank giant line on the real engine), the other Hangul fillers,
    U+034F, the Mongolian selectors and U+FFF0-FFFB. A braille blank (U+2800) becomes a
    space instead: it is a deliberate blank, not debris.
  - **The cm sizes on the card read up to ~1.8% high** (0.8% from `PX_PER_MM` alone, the
    rest from not rounding the font-size to whole px), enough to show 12 of the 51 sizes
    0.1 cm too big (GG/WP said 2.6 cm and printed 2.54). They now round the font-size to
    whole px as the engine does and use 25.4/96 mm per px and Segoe UI's exact cap
    height (1434/2048). Every measured size is within 0.01 cm. `PX_PER_MM` is unchanged.
  - **Emote names with the gem hidden printed the first row off-centre.** Stripping the
    emote body's line break put its padded first line right after the hidden gem's
    non-breaking space, where the pad space no longer collapses: a 27px skew between
    rows on the real engine. The emote layout now keeps its line break (one, never two),
    and both rows land where they do untucked.
  - **The documented bench pipe failed.** `payload.mjs … | printerbot.mjs --out -` threw
    EAGAIN whenever the writer was slower than printerbot's startup. stdin is now read as
    a stream to EOF.
  - The unit test that keeps `rig.py`'s hand-copied `PB_CSS` in step with `PB_CLASSES`
    now reads the two CSS constants rig.py actually renders with (not the whole file,
    where a rule in a comment would pass) and checks both directions.
  - **The cheer counts were chunk counts.** The chunker breaks a stack at a word gap
    and drops the blank edge line, which often lets the packer put both halves back into
    one part. "HELLO WORLD" at Level 10 is two chunks and one part, yet the Size select
    said "2 cheers" above a note saying "fits 1 cheer", and Auto settled for L10×0.9
    (1.65 cm) when full L10 (1.83 cm) is one cheer (12 of 60 common phrases undershot).
    Every label, Auto's lines-vs-stack choice and "biggest that fits one cheer" now count
    cheers with the packer's own test (`fit.cheers`); the words are then separated by the
    small gap between bodies rather than a giant blank line.
  - **Auto could choose a size that cannot send.** A single line too long for one message
    counted as a valid one-cheer fit, and a shrink step carries one tag more than the
    plain step below it: 240 × "A" as one emote picked a 549-character L14×0.9 while L12
    sends in 478. Such a step now ranks below every step that sends, in both Auto sizes.
  - **A block of only emoji could cost a cheer.** It builds an empty body, and next to an
    over-tall neighbour the packer gave it a part of its own: "Cheer100 03 ", 100 bits for
    a receipt with only the gem (after a takeover with the gem hidden, the lead plus a
    cover the sanitizer strips). A body that prints nothing now never opens or closes a
    part, and its card no longer says which part "its text" is in.
  - **"Send part 1 first and look"** was said even when part 1 had no giant type (a
    Hanzi block first). The note now names the first part that carries giant type.
  - **Cheer-shaped words**: `4Head100` (a digit-led global cheermote) was never flagged,
    and `PS5`, `MP3` or `TOP10` were flatly called a charged cheer, with advice to delete
    them. Digit-led prefixes are caught now, and a word whose prefix is not a global
    cheermote gets "If “PS5” is a cheer name on this channel…" instead.
  - **Emote names with `<` or `>`** (Twitch's `<3`) are sent escaped, so Twitch never
    recognises them and they print as text; the preview showed an emote placeholder. It
    now shows text, and the emote hint says so.
  - **A long text at a manual size froze the composer**: every body carried its own copy
    of the block-wide overflow lists, quadratic in the text (an 8,800-character Level 18
    stack took 1-2 s per keystroke). They are shared now (~80 ms).
  - **The Thermal preview was ~3% coarse**: 560 dots across the 72mm box is 2.06 dots per
    CSS px against the engine's 2.119. It is 576 now (72mm × 8 dots/mm).
  - **Bench tools.** `printerbot.mjs`: a 404 from nutty's site no longer falls back to the
    cached copy (printer-bot gets the same 404 and inlines an empty stylesheet), and under
    `--check` it is a check failure, not "retry"; `--check` now refuses (exit 2) any of
    nutty's files that came from the cache, not only the stylesheets, reports `live` from
    where the files came from, and adds a computed-cascade probe that catches an override
    of any selector or `!important` (the per-rule comparison passed both); its verdict is
    now the last line of stderr, as the README says; `--ref` resolves exact branch and tag
    names only (a bare `head` used to resolve to a contributor's pull request) and peels
    annotated tags; an unreachable image exits 2 with the provenance instead of a stack
    trace; and only a fully live run rewrites `printed.css`. `rig.py`: the CSS
    provenance carries the cache's origin and warns when it was pinned or partly stale,
    and a case name may no longer point outside `.render/`, where the stale-page cleanup
    deleted other files.

### Known

- **Never sent, so first in line for a free probe** (Cheer-ready off): the two shrink
  classes, which Auto uses whenever an in-between size is the best fit; the padded emote
  form; and the app's exact tucked lead (a leading non-breaking space and the two-digit
  nonce inside the span). The span directly followed by giant text with no line break
  between already rode the field cheer, without those two.
- **It can stop working without warning.** If nutty renames `.title` by accident, the
  class table gets a one-row update after a probe. If nutty removes or scopes the
  stylesheet on purpose, or a channel's mods block the form, that is a no. Use Hanzi,
  and never a disguised variant.
- Sized for **80 mm** rolls only. On 58 mm the letters would be cut off.
- Emotes are assumed square; a wide BTTV/7TV/FFZ emote is wider than the fit allows.
  The real engine centres a padded emote line half a space left of centre (0.138em); the
  preview does not show this.
- The preview draws with the viewer's fonts. Most viewers have no Segoe UI, so letter
  widths in the preview differ from the tape. Heights follow the tape, via a preview-only
  1.33 line height.
- Chat shows the raw tags, the same one repeated up to 18 times per line, which some
  channels' mod bots treat as spam.

## [0.9.1] - 2026-09-15

### Fixed

- **Hanzi tiling printed slanted, because the column box was being calibrated off the wrong ruler.** A Hanzi body is plain text with no line break in it: a row only becomes a row because the paper wraps it. So Detail (columns) is the *wrap width*, and it has to equal how many Han characters the printer really fits on a line. Han glyphs are **full-width** — twice the advance of an ASCII digit — but the Census test strip's ruler is a run of digits, and both hints told you to read the printer's column count off it and type that in. Do that and the grid comes out about twice as wide as the paper, every row starts part-way through the previous one, and the whole image shears diagonally.
  - The default is now **15**, the full-width count for the target RP332 — the same width the sibling `receiptify` builds its art grid on, which is also where this tier's ramp came from.
  - Both hints now say to count Han characters and that the ruler reports roughly double, and the block card explains that this setting is the wrap width rather than a quality dial.
  - Narrower rows also fit *more* per message, so this costs nothing: **32 rows per receipt at 15 columns against 24 at the old 20**, about a quarter fewer cheers for the same artwork.

- **The Hanzi stroke weight was hardcoded to 900, and the Size slider offered travel that did nothing.** Both are now honest controls.
  - **Stroke weight** is a new Regular/Bold choice on the Hanzi block, defaulting to Bold, which is what the old hardcoded `900` was really producing. It is two positions rather than a 100-900 slider because **measured in Chromium through this exact code path, 600, 700 and 900 rasterize a byte-identical grid** (mean ramp index 17.86 of 40 for all three) while 400 comes back markedly lighter (12.74). Arial has no face above bold, so everything at or above it clamps to the same one — the same effect `CLAUDE.md` already recorded for the print engine, which nobody had connected to this path. A nine-position slider would be inert across most of its travel. At low column counts Bold thickens until the holes in letters like A, O and R fill in; Regular keeps them open.
  - **Size** now stops at 85% on a Hanzi block instead of showing a 25-100% track whose bottom two thirds collapsed to the same output. The 85% floor is deliberate and stays — below it the letters no longer fill the paper width and too few columns are left to read them, which an earlier round recorded as "the #1 cause of 'mine looks worse than receiptify'". Switching the block back to a vector render hands the full 25-100% range back.

## [0.9.0] - 2026-09-15

### The short version

printer-bot added an HTML **sanitizer**, confirmed live on 2026-09-15, and it strips
almost everything this tool relied on. The message is no longer rendered as raw HTML:
it now passes through an allow-list (tags `img`/`span`/`b`/`i`/`br`/`em`/`strong`,
attributes `src`/`class` only, and an `<img>` only if its class is `emote` or `bits`).
This release pivots the app to the paths that survive.

### Changed

- **Pictures now ride `<img class="emote">` (or `<img class="bits">`).** The sanitizer
  deletes every other carrier — `<embed>`, `<input type=image>`, `<iframe>`, `<object>`
  and a classless `<img>` are all stripped — so those are now marked blocked and the
  default carrier is `imgemote`. Only `src` and `class` survive the sanitizer, so the
  carrier states no width/height/style; a picture's size now comes from the uploaded
  PNG's own pixels (and printer-bot's emote/bits CSS), not from markup. Saved image and
  takeover blocks migrate off the dead carriers automatically (`EMBED_V` 3 → 4).
- **The glyph backbone is now Hanzi/CJK.** A new Image block defaults to the **CJK**
  tier and a new Text block defaults to **Hanzi tiling** — the only forms that survive
  the sanitizer. Hanzi tiling is pure text; CJK picture rows are `<br>`-separated
  uniform-width glyphs, so they still line up without the stripped monospace styling.
- **The dropdowns tell the truth now.** ASCII glyph tiers are labelled *sheared by the
  sanitizer* (their space-preserving monospace `<span>` styling is stripped, so the
  spaces collapse and the grid shears). Big Text's "Type" render (all orientations,
  including Giant sideways) is labelled *stripped by the sanitizer, won't print*.

### Known non-printing (kept, not removed)

- **Takeover and fake cheer no longer print.** They are an opaque `<svg><rect>` lifted
  over the header with a negative margin, and the sanitizer strips `<svg>` and all
  styling; there is no allowed tag that draws a filled box or applies a margin, so this
  cannot be rebuilt to survive. The composer flags these blocks as non-printing. The
  code is kept in case the sanitizer is rolled back.

### Field result: real pictures cannot be sent at all

The probe above was run the same day, free (non-cheer, so it never reaches the printer
but still passes the terms filter), with a control carrying the same link and no tag.
**`<img` is still blocked by automod.** Both the `emote` and `bits` forms were eaten;
the control went through, so the tag is what is blocked, not the link or the host.

That closes the picture. Two gates, empty intersection:

- The **sanitizer** keeps exactly one image-capable tag, `<img>`, and only with an
  `emote`/`bits` class. Of the seven tags it allows, only `<img>` can load an image —
  `src` on a `<span>`/`<b>`/`<i>`/`<em>`/`<strong>`/`<br>` does nothing.
- **Automod blocks `<img`.**

So every `EMBEDS` entry is now `blocked: true`, `anyCarrierLive()` returns false, and
`field` records which gate killed each one (`blocked` = automod, `stripped` = the
sanitizer). The img-class pair still leads the table because it is sanitizer-legal and
only chat-blocked — it is what to re-probe first if the terms list is ever pruned. The
Image block's real-picture mode now warns plainly instead of offering a carrier that
would silently spend bits on blank paper, and points at glyph-art.

Glyph-art is unaffected: it is plain text and clears both gates untouched.

**Not doing:** obfuscating the tag to get past the filter. The terms list has eaten
`<object`, then `<image`, then `<img`, and printer-bot separately added a sanitizer
admitting only Twitch's own emotes. Two parties have said no to arbitrary images.

## [0.8.2] - 2026-08-15

### Fixed

- **Big Text and sideways text have been printing clipped and off-centre, and the bench could not see it.** `PAPER_PX` was 263 CSS px, on the reading that the paper is an 80mm roll with 70mm printable. What we can actually draw into is neither: printer-bot prints a (roll - 8)mm page and its own body carries a 1em margin each side, so the usable width is 72 - 2*4.23 = 63.5mm, or **240 px**. Measured with an SVG that draws its own left, centre and right markers: at 263 the right marker never prints at all, and the centre lands 22 dots (2.8mm) right of the page centre, because an SVG too wide for its body is pinned left rather than centred. At 240 all three markers print and the centre lands on 287 against a page centre of 288. `BIG_FIT_PX` moves 250 -> 228 with it, the same fraction of the paper as before.
  - Real pictures were never affected. They carry `max-width:100%`, which works on an `<img>`; the text modes had no such guard, which is why only they were losing an edge.
  - **There is no clamp to reach for here, and that is why this went unnoticed.** CLAUDE.md said to prefer one over another hardcoded number. All three adaptive forms were then tried on the engine and all three fail: `max-width:100%` is ignored on an SVG, adding `height:auto` collapses it to nothing, and a `viewBox` (with or without a percentage width) collapses it too. QtWebKit 534.34 honours an explicit pixel width and nothing else, so the number simply has to be right. A narrower roll needs it edited by hand.
  - Five golden-value assertions moved. Every figure in them is the old one times 228/250 and the markup shape is untouched, which is what those pins exist to prove.

- **The bench was rendering the wrong paper.** `tools/rig.py` had `paper_mm=72` as a function default that `main()` never passed, so every measurement ever taken with it used a 64mm page: 8mm, or 62 dots, narrower than the rig. That makes it pessimistic, reporting clipping for payloads that really fit. It is now `--paper MM`, defaulting to 80, and every result reports the `paper_mm` it was measured on, because a number recorded without its paper is how this hid.

### Added

- **`tools/calibrate.py` (`npm run calibrate`), to settle how the printer turns grey into burnt dots.** Nothing in this repo could observe that step: wkhtmltopdf and pdftoppm emit continuous tone, and a 256-level ramp comes back with all 256 levels, so the quantisation happens downstream in the rasteriser, the driver or the head. The repo had been carrying two contradictory guesses about it — the Thermal preview does Atkinson error diffusion, `rig.py`'s `ink()` hard-thresholds at 128 — with evidence for neither. The strip prints five bands: continuous-tone patches as the actual probe, the same levels pre-dithered with Atkinson, Floyd-Steinberg and ordered Bayer as references, and a dot ruler. Whichever reference matches the probe's texture is the answer; a probe that comes back flat with no texture at all means a plain threshold.
  - The test is only meaningful at 1:1, so the tool measures rather than assumes. 1 CSS px is **2.119** device dots, so a 498-dot image is pixel-exact at **235** CSS px and nowhere else (234 gives 496, 236 gives 500, 240 gives 509 and also exceeds the 508-dot body). Drawn at any other width the pre-dithered bands are resampled into grey mush that proves nothing. `--check` renders the strip through the bench and refuses to bless it unless the width came back exact and the ruler band has no soft pixels.
  - Widths here are measured off 1px black columns at the image's own edges, not off ink extent: ink extent underreports, because an edge pixel may legitimately be white. Getting that wrong is what first produced a draw width of 236.

### Changed

- `ink()`'s hard threshold is documented as what it is, an ink-count proxy for comparing two payloads, rather than "what the thermal head does". The field says photos print halftoned rather than posterized, so error diffusion of some kind is at work downstream and this threshold is not it.

## [0.8.1] - 2026-08-12

### Changed

- **A pass over every word a person reads**, in the app and in the documentation, to strip the patterns that make text read as machine-written. 786 em and en dashes are gone, along with the curly quotes, and a lot of padding went with them: rule-of-three lists that only had two real items, "not just X but Y" constructions, bolded phrases that were bolded out of habit, participle clauses bolted on to sentences that had already finished, and headings in Title Case. Sentence lengths vary now, which the old copy did not.
- What was deliberately left alone: **source-code comments in `public/index.html`**, which are an engineering record rather than copy anyone reads on the site; the Contributor Covenant, which other people rely on being the unmodified standard text; and two quotations of the literal string `"Parts 2-2"` in the entries below, because rewriting a quoted bug would falsify the record of what it said.
- The tier is now called **ASCII letters** everywhere. The dropdown said one thing and the hint directly beneath it said another.
- The changelog-format template in `CONTRIBUTING.md` prescribed a heading style this file had stopped using, and told contributors to start every bullet with an em dash.

### Fixed

- Rewriting the copy broke a browser test and silently disarmed another, which is the risk in touching strings that tests assert on. One assertion still expected curly quotes and failed outright. The worse one was quiet: the guard against the `"Parts 2-2"` bug matched an en dash, and with every en dash replaced it could never fire again, so the exact bug it was written for could have come back as `"Parts 2 to 2"` with the suite still green. It now matches both spellings.
- Two warnings lost the emphasis that was doing the work: the note that typing an image URL or dragging an adjustment slider sends data without a click, and the reason `input type=image` is not the default carrier. Both are field-measured consequences and both are bold again.

---

## [0.8.0] - 2026-08-12

Four things that make the project easier to keep honest, rather than four features.

### Added

- The print-engine bench is now a committed tool, `tools/rig.py`. Nearly every "does this print?" claim in `CLAUDE.md` was measured with a harness that lived only in gitignored scratch, with the wkhtmltopdf path hardcoded to a throwaway folder. When the folder went away the bench silently stopped working. That is how a figure that could no longer be re-run ended up wrong in the 0.5.0 changelog. It now reproduces printer-bot's page, its CSS and every one of its print flags, renders at 203dpi hard-thresholded to 1 bit, and reports ink count, ink bbox and the image XObjects in the PDF. The binary is resolved at run time and its version is checked, because the distro QtWebKit 5.212 build renders differently and would mislead anyone who reached for it.
  - `tools/payload.mjs` builds the page's content from the app's own pure core, so the bench measures what the app really sends rather than markup someone hand-wrote to match what they expected. `npm run render` / `npm run payload`.

- Browser smoke tests, `npm run test:browser`. Eight Playwright cases over the real page. Every one of them is a bug that actually shipped because the browser glue was only ever checked by hand: the stack that vanished on reload, the cost line that said "Parts 2–2", the preset flows. Mutation-verified: restore the persistence bug and two go red. These stay out of `npm test`, which is zero-install; CI runs both.

### Fixed

- A takeover picture is no longer assumed square. Nothing asked a picture item its shape, though the Image block has had `probeBlockAspect` for ages. Measured on the real engine with a 120×240 portrait: the square slot clipped it and only the top stub printed, 16,962 ink against 53,001 once the slot matches what the carrier actually draws. With two pictures the shared frame doesn't clip, so instead of being cut short it overran and painted over the text beneath.
  - Height now resolves three ways, in this order: an explicit height wins (that is what the 0.4.2 migration wrote, and pinning it is what keeps those bytes identical), then a probed aspect, then square as before. The probe is keyed to the URL it measured, unlike `probeBlockAspect`, whose guard never re-probes after the picture is swapped.
  - One consequence to know about: a tall picture now reserves its true height, so fewer fit, and the extra is dropped with the card's existing note rather than printing clipped or on top of your text.

- The escaping chokepoint has tests. `escapeHtml`/`escapeAttr` had none, despite being the single point every user string passes through on its way into markup that a stranger's machine parses twice. The new cases assert both the helpers and the call sites: a line trying to close its own `<text>`, a URL trying to open a new attribute, looped over every entry in `EMBEDS`. Mutation-verified: stop escaping `<` and seven tests fail.

- README told three lies: "no server round-trip at any step" (its own privacy table disagrees), 45-character uploaded links (they are 39), and three `localStorage` keys (presets made it four).

### Changed

- The SSRF residual is now a decision on the record. `isPublicHttpUrl` checks the address *literal*; a hostname resolving somewhere private is not caught, because the Workers runtime never hands the script the address it resolved. A DoH pre-flight would raise the bar without closing it: rebinding is precisely a second answer. What bounds the risk is that the fetch leaves Cloudflare's edge rather than a network the operator controls, and the response is gated to `image/*` under 5 MB. Self-hosters on another runtime are now told explicitly that the first half of that does not hold for them. A test states the boundary so moving it has to be deliberate.
- The Census `QUAD` row probes a quadrant tier that does not exist. It stays, because it is the cheap way to learn whether a tier between Blocks and Braille is worth building for a rig, but it is now labelled as a probe in the code and the README, so nobody reads it off the tape and goes hunting the selector.
- Fourteen git tags and GitHub releases, where there were none. Each is derived mechanically from the first commit whose `package.json` carried that version, not placed by hand.

---

## [0.7.2] - 2026-08-11

### Fixed

- The takeover card's cost line read "Parts 2–2 each spend 106 more…" on a two-part run, which is what a range reads as when there is only one of them. It now says "Part 2 spends 106 more…" and keeps the range only when there really is one.

---

## [0.7.1] - 2026-08-11

### Fixed

- `/px` could never fetch our own uploaded pictures, so 0.7.0's preview fix only worked locally. `i.uwutoowo.com` is a custom domain on *this* Worker, so `fetch()`-ing it asks Cloudflare to route a request from the Worker back into the same Worker. It does not loop politely. It times out, and the edge answers 522, which the proxy dutifully reported as `upstream said 522`. Measured on production against a live 15-minute link that had returned 200 to `curl` a second earlier. This is why the Thermal preview still drew a blank hole on the deployed 0.7.0 even though the carrier fix was in the shipped bytes; glyph-art decoding of a pasted minted link and the image-adjust bake went through the same door.
  - `/px` now answers our own minted links straight out of KV, which is strictly better than a working fetch would have been: one hop fewer, and the bytes are already ours. A hex-shaped path we no longer hold returns 404 "that link has expired" rather than 502. The host is ours, so nobody else could answer for it.
  - The host gate is load-bearing, and a test pins it. `imageKeyFor` matches by path *shape* alone, so without the gate any third-party URL that happened to look like `/<hex>.png` (an ordinary CDN filename) would have been answered out of our KV and reported as an expired link of ours. Mutation-verified: remove the gate and that test is the one that fails.
  - End-to-end on a real Worker: our host with a live key → 200 `image/png`; our host with an absent key → 404; a third-party URL of the same shape → proxied, not KV. In the browser, a takeover picture through the new path rasterizes at 26,434 ink against 3,312 for the blank hole.

---

## [0.7.0] - 2026-08-11

The four *phases* shipped in 0.6.0, but the design doc has requirements outside the phasing list. An audit of all 63 of them against the shipped code found four gaps, three of them things the owner would hit. This closes them.

### Added

- The takeover card shows what it costs, live (spec §6). A takeover is the most expensive block there is and the only one that cannot be split. It is one SVG, so going over 500 does not buy a second cheer; it means Twitch rejects the message and nothing prints. The card now reads its own character count, how many cheers the stack needs and which part this block landed in, that part's `chars / 500`, and (only on the takeover actually in part 1, and only with covers on) what the continuation covers add to the parts after it. Over budget turns it red. Measured while building: 342 characters alone, 773 / 500 in the red state.
  - Two bits of plumbing make it honest rather than approximate. Bodies are stamped with the block they came from, since the packer decides which part a block lands in and a card had no other way to find itself in the result. Cards also register a callback that `refresh()` runs *after* the parts are recomputed, so the note describes the real packing instead of guessing from its own length.

- The takeover's font control carries the accuracy note (spec §9) that the identical Big Text control has carried since 0.4.0. The preview renders with your fonts; the print renders with the streamer's, and `Serif` / `Monospace` are generics whose face that machine picks. The wording matches the Big Text note on purpose, because two texts saying the same thing differently is how one of them goes stale.

### Fixed

- The thermal preview showed a blank hole where a takeover's picture will really print. `thermalize()` rasterizes by serializing the receipt into an SVG `<foreignObject>` and loading it as an `<img>`, a sandbox that fetches no external subresource, which is why `inlineImages` swaps every picture for a `data:` URI first. It only ever rewrote `img, image`, and a takeover's picture is none of those: it rides `<embed>`, `<input type=image>` or `<iframe>`, whichever the blocked-terms list has left us. So the owner ticked "like the real printer", saw no picture, and could reasonably have re-tuned the pull or swapped carriers chasing a defect that existed only in the preview. That is exactly the gamble §9 exists to prevent.
  - Fixed by swapping each carrier for an `<img>` of the same width in the preview clone only. The payload is untouched, and the engine draws these tags as an image anyway, so it is a faithful stand-in rather than an approximation. Measured on the same picture and the same 560-dot raster: production 3,312 ink pixels (the blank hole) against 26,434 with the fix, and removing the picture from the fixed build returns 3,443. Reproducible in both directions.

- The expired-link flag never cleared, so it told you to do something and then ignored you for doing it. 0.6.0 only ever *set* the mark: re-uploading the picture minted a live URL and left the red "this picture's link has expired" note on the card for the rest of the session, clearing only on a page reload. An alarm about the app's worst failure mode that will not go away is one the user learns to ignore, which costs more than never having shown it. The probe now re-derives the whole answer (clear, re-probe every minted link, re-mark from the results, repaint once and only if the flagged set actually changed) and it hangs off `saveBlocks`, the one place every block mutation passes through, rather than off the three or four places a picture URL can change. That list is precisely what a later edit forgets to update. Verified: the flag appears on a dead minted link, and clears when the link is fixed.

### Not changed, and why

Ticking Thermal preview appeared not to take effect during testing. It does: `thermalView` has a `change` listener that calls `refresh()`, and the first attempt simply lost the race with a cold `/px` fetch of an image the browser had not cached yet. Confirmed by toggling it twice with nothing else touched: 0 canvases, then 1. No code changed for something that was not broken.

### Verification

209 tests pass. Everything above is browser glue, which the null-DOM harness never executes, so all of it was measured in a real browser against `wrangler dev` with a genuine 15-minute uploaded link, including the production-versus-branch ink comparison for the preview fix.

---

## [0.6.0] - 2026-08-11

Phases 3 and 4 of the takeover design, the last two. With these the four-phase plan is complete.

### Added

- Continuation covers. A takeover paints over printer-bot's header on the receipt it rides on and no other, so a stack too big for one cheer came off the tape as one piece of artwork followed by a stack of ordinary receipts with the bot's header back on them. That was the whole of "blocks after a takeover are broken". Every part after the first now repaints the header with a plain cover: the same white box at the same reach, built by `buildTakeover` rather than as a hardcoded string, so the cover and the takeover it continues cannot drift apart. 106 characters per extra part, with a stack-level toggle beside the bits control to spend them on content instead.
  - The characters are reserved rather than merely prepended, and that reservation is the actual feature. Twitch *rejects* an over-length message rather than truncating it, so a cover added without making room for it pushes every later part past 500 and the tail of the run silently never sends. Per-part overhead therefore stopped being a constant, which is why this had to happen inside the packer rather than in a wrapper around it. Mutation-verified: delete the reservation and part 2 lands at 598 characters, and the new test names that number rather than just going red.
  - Only a takeover in part 1 continues. One that lands in part 3 covers part 3 itself, and parts 1 and 2 never had a painted header to carry on from. The preview draws the cover, for the same reason it draws the lead.

- Presets. Save the whole block stack under a name (save, load, rename, two-press delete) and export the lot as JSON to move it to another browser, because `localStorage` is per-device and a setup you can't move is one cache clear from gone. Loading runs the same migration pipeline a saved stack takes, so a preset exported from an older build converts exactly like one, and block ids are re-keyed so they can't collide with the live counter. Import validates rather than trusts: bad JSON, JSON with no presets, and JSON shaped like presets but carrying no block list each say what is wrong instead of half-loading a stack.
  - Expired links are flagged rather than printed. An uploaded picture dies on a 15-minute KV TTL, and a preset that used one would otherwise send, spend your bits and print blank paper, which is the worst thing this app can do. The block is marked in red until it's fixed. Only links this app minted are checked (all three generations, matched by shape); a pasted third-party URL has no such clock and is deliberately left alone, because flagging one that still works teaches the user to ignore the flag. The probe is an `<img>` load, which is ground truth, needs no CORS grant and adds no seventh `fetch` call site. Do not "tidy" it into one. A stack restored from `localStorage` gets the same check, since it has the same problem.
  - `rw_presets_v1` is a fourth `localStorage` key, added by explicit request (spec §8).

### Fixed

- Two documentation errors that would have misled the next person, including me. `CLAUDE.md` said the carrier probe is labelled `A`…`G`; `EMBEDS` has six entries and `buildEmbedProbe` derives its letters from the table's length, so it emits A to F. The 0.5.0 entry below stated 16,599 ink pixels for the broken two-`foreignObject` case. The code comment, the test comment and `CLAUDE.md` all independently record 31,792, written while the measurement was running, and that figure has been restored here. The surviving `.render/` artifacts don't map to that experiment, so it could not be re-derived; the corroborated number wins over the one transcribed later.
- README and `public/llms.txt` still documented the Blank / Fake-cheer selector that 0.5.0 deleted. Both now describe the item list, the seed, the covers and the presets.
- `CLAUDE.md`'s exported-symbol list has been regenerated (72 names) instead of drifting further, and its own storage rule updated to four keys.

### Verification

209 tests pass. The browser glue, which the null-DOM harness never executes, was exercised by hand in a real browser: the preset save / export / wipe / import round trip; the expired flag firing against a genuinely dead minted link and *not* firing on a dead third-party one; the cover toggle moving parts 2 and 3 between 348 and 454 characters with every part under 500; and part 2's first element being the lifted bare `<rect>`.

### Still owner-only

The free offline blocked-terms probe now has more to carry: 0.5.0's `position:relative` / `position:absolute` and the two comma-list font values, and nothing new in 0.6.0, since covers and presets add no payload token that wasn't already shipping. Everything else in the field list is unchanged.

---

## [0.5.0] - 2026-08-10

### Added

- The Takeover is a container now. The Blank / Fake-cheer selector is gone. One Takeover block holds an ordered list of items (text or picture, any number, any order) that you add, reorder and delete, each with its own font, size, formatting, alignment and nudge, under one block-level Anchor (top / centre / bottom) and the existing Reach up. This is the fix for the original complaint: three fixed lines plus one picture, with the two styles mutually exclusive, meant you could not have a fake cheer *and* your own lines.
  - `Seed fake donation` fills an empty takeover with the four-item arrangement (picture, amount, name, italic note), reproducing exactly what the old Fake cheer style emitted. After seeding they are ordinary items: editable, deletable, reorderable, and you can add more around them. The seed is platform-neutral and pre-fills the amount as plain text, because the same printer-bot runs on YouTube and Kick and their amount formats differ. `CHEER_SUFFIX` is gone, and the `" BITS"` is baked in once by the seed rather than appended at render.
  - Everything you have saved converts and prints the same. Migration was held to byte-identity against 0.4.2's *actual bytes* rather than a re-derivation: the goldens were generated by checking out `247bb4a` and running that build's own renderer. Verified across a 1,242-cell sweep and four real saved-block shapes.

- Two or more pictures actually print. They did not, and the way they failed is worth recording. Pictures were emitted as consecutive `<foreignObject>` siblings, and this engine's documented rule is that a `<foreignObject>` swallows every SVG sibling that *follows* it, a second `<foreignObject>` being one of them. Measured at 203dpi/1-bit: two pictures laid down 31,792 ink pixels, the first picture's own count to the pixel, with the second one's image XObject sitting unused in the PDF. Reproduced with two URLs, the same URL twice, and every live carrier. The preview drew all of them, the drop note stayed silent because `takeoverReport` counts frames in the markup, and each dead picture still cost 134 characters of a 500-character budget.
  - The fix is one frame spanning the cover with the pictures absolutely positioned inside it; two pictures then print as two pictures. The `position:relative` wrapper is load-bearing and pinned by a test: WebKit 534.34 does not make a `<foreignObject>` a containing block, so without it the whole stack resolves against the page and prints off the takeover's coordinates. Deleting that one declaration used to pass the entire suite.
  - The single-picture markup is byte-identical to before, because the 479/491 flagship budget and the migration goldens both rest on it.

### Fixed

- Room-first is back. The item engine let a picture win and dropped text; 0.4.2 reserved the text's room and shrank the picture. Measured at 120px width: pull 140 drew 2 of 3 lines, 120 drew 1 of 3, 100 drew none but kept the avatar, and 60 sent a blank 105-character slab that still counted as content. All of those now draw all three lines, and the shrunk picture matches 0.4.2's own size through the whole ramp (129/143/156/169/183/196/209/223/236). A takeover that would draw nothing no longer counts as content.

- `Script` and `Fantasy` were duplicates of fonts already in the menu. Field-confirmed on the real printer: Script came out as Comic Sans MS and Fantasy as Impact, the standard Windows mappings of the bare CSS generics `cursive` and `fantasy`. A nine-font menu was really seven, and no bench on macOS could have caught it, because macOS maps those two generics somewhere else entirely. They now name faces that exist on Windows with the generic kept behind as a fallback (`Segoe Script,cursive`, `Papyrus,fantasy`), so neither can be worse than it was. Script costs +35 characters instead of +22, Papyrus +30; the card hint says 20 to 35. `Serif` and `Monospace` stay bare deliberately, because Windows maps them to Times New Roman and Courier New, which duplicate nothing.

### Known limits

- A non-square picture in a two-or-more-picture takeover overflows its slot and can print over the text. Single pictures are cropped by their own frame; the shared frame's boxes are shrink-to-fit and do not clip, and nothing probes a takeover picture's real aspect, so height defaults to width. Clipping every box costs +28 characters each, which takes a bare two-picture takeover to 511 and over the limit. Left as-is because the preview is bit-faithful to this failure: it draws the identical erased text and turns the counter red, so it cannot be shipped blind.
- Two pictures never fit alongside a full seeded fake donation at any pull, because `CHEER_MAX_LIFT_PX` caps the room whatever the slider says. The drop note explains it. "Multi-picture takeovers work" means two, without a full text stack.
- The new payload literals (`position:relative` / `position:absolute` in an attribute, and the two comma-list font values) have *not* been through the free offline blocked-terms paste probe. The 2026-08-10 probe cleared the bare generics and the decoration forms; these are newer. Worth a round before this rides on stream.

---

## [0.4.2] - 2026-08-10

### Changed

- The takeover's default pull is 240pt, set by tuning on the actual rig. 0.4.1 had reverted it to 220 on the strength of a hand-built payload that printed flawlessly at that value; the owner has since looked at real prints and settled on 240. Tuning on the machine outranks a single earlier print under conditions nobody recorded, and it certainly outranks a render.

  For anyone reading this later and wondering why the number keeps moving: it was 220, then 240 on bench evidence (the message's `Cheer100 <nonce> ` lead takes a line and pushes a lifted takeover down, so 220 left ~18px of avatar showing on the engine), then 220 again because a bench harness using a 300px avatar rendered at the 15em maximum proves nothing about a rig whose avatar may be smaller, and now 240 from tuning. Each step used better evidence than the last. The lead-line measurement was always real and remains why the preview renders the lead; it just never got to pick the number.

  The migration is now one rule instead of a chain of undos. A block still sitting on *any* default this app has shipped is following the default, so it moves to the current one; a block on any other value was dragged deliberately and is left alone. That does move a block someone hand-set to 220 or 240, because a hand-set value equal to a former default is indistinguishable from a followed one. With the whole history spanning about a day, landing on the tuned value is the better failure.

  One thing worth knowing before touching this again: `CHEER_MAX_LIFT_PX` is derived from the default and caps how far a fake cheer may lift. Raising the default raises that ceiling, and the fake cheer's picture is anchored to the panel top. So if a picture ever prints cut off at the top of the roll, this is the cause, and a lower pull on that block is the cure. Blank takeovers are unaffected, since their text is bottom-anchored and extra pull only paints more white.

  The tests around this were rewritten rather than re-pinned. Three previous versions asserted a specific pull or a specific rig header, and all three had to be rewritten within a day, because they were asserting facts about someone's printer that the suite cannot see. They now pin the invariants the code owes regardless of the number: the default is reachable on the slider, and the lift cap stays derived from it.

---

## [0.4.1] - 2026-08-10

### Fixed

- The takeover's default pull is back to 220pt, reverting the 240 that shipped hours earlier in 0.4.0. The bench evidence behind 240 was real and the conclusion was still wrong, which is worth recording rather than quietly undoing.

  What the bench measured, correctly: every message carries a lead (`Cheer100 <nonce> `) that occupies a line and pushes a lifted takeover down, so 220 left ~18px of the streamer's avatar showing on a render. What the bench got wrong was the avatar. The harness used a 300px source, which the bot's `max-height:15em` renders at 240px, the largest header that can exist. The real rig's is about 20px shorter.

  The evidence that settles it is field, not bench: a hand-built reference payload at `margin-top:-220pt`, sent as a real cheer with its picture at `y=5`, printed flawlessly on the actual machine, picture included. For that picture's top edge to land on paper the rig's header must be between 288 and 293 CSS px.

  And over-pulling is not free on the cheer path, which is the part that made this a regression rather than a harmless margin. `CHEER_MAX_LIFT_PX` is derived from the default, and it is the ceiling that stops an over-pulled fake cheer climbing off the roll, so raising the default silently raised that ceiling too. At 240 the fake cheer's picture, which is anchored to the top of the panel, lost roughly 24px off the top of the paper on a rig where 220 places it 3px on.

  A `pullV` 2 migration reverses what the 240 migration wrote. It cannot tell a block auto-moved to 240 from one deliberately set to 240 during those few hours and moves both, which is the right trade when 240 is known to amputate the picture here. Any other value is left alone.

  The test that pinned a 235pt floor is now a ceiling: the default must not exceed what the field confirmed, and raising it again needs a print rather than a render.

---

## [0.4.0] - 2026-08-09

### Added

- Type formatting (font, weight, italic, underline, strikethrough) on every surface the printer draws as *type*. That is both takeover styles (three lines each, independently) and the Text block in both straight and sideways Big Text. Not the Text block's Hanzi render: that prints tiled glyphs rather than type, and the card hides the formatting row when you switch to it. Nine fonts (Default/Arial, Arial Black, Impact, Comic Sans MS, Georgia, Serif, Monospace, Script, Fantasy), a weight select, and I / U / S toggles. Formatting travels as one `fmt` object per line. Two of the three surfaces (the takeovers and straight-on Big Text, both SVG) turn it into markup through one emitter (`fmtAttrs`), so those two cannot drift on what "both decorations" means or on which defaults are omitted. The sideways strip is a deliberate exception rather than an oversight: it is a rotated HTML `<span>`, where SVG presentation attributes don't apply at all, so `rotatedSpan` assembles a CSS `font` shorthand itself and shares only `fmtDecoration` (the underline/strike vocabulary) with the other two. Unlike `fmtAttrs` it always states a weight, at Big Text's own 800 baseline, because absent-means-800 is that path's contract.
  - Nothing you already saved changes. `fmtAttrs` omits every default: no font attribute for Arial, no `font-weight` at 400, nothing for a decoration you didn't set. An untouched line is byte-identical to what 0.3.3 emitted, and a test asserts that rather than trusting it. The three takeover slots keep their original hand-built look (900 / 700 / 400-italic) as *slot defaults* applied at the call site, not as attributes on the wire.

- Verified on the real engine, not in the preview. Every claim below was rendered through wkhtmltopdf 0.12.6 (patched Qt / WebKit 534.34, the binary printer-bot ships), rasterised at 203 dpi and hard-thresholded to 1 bit, which is what the RP332 head actually lays down. Fragments were built by calling the app's own `buildTakeover` / `buildBigTextSvg` / `rotateBodies` / `fmtAttrs`, not by hand-writing markup. Full method and rasters in [`docs/superpowers/plans/2026-08-09-phase1-verification.md`](superpowers/plans/2026-08-09-phase1-verification.md).
  - The shared `<g>` inherits its decoration, which is why a multi-line caption is affordable. `buildBigTextSvg` puts `fmtAttrs` once on the wrapping `<g>` rather than on each `<text>`. That was an unproven form (the takeover path attributes each `<text>`, which was already known to work), and it was chosen for the character budget: a `text-decoration="underline line-through"` is 41 characters, so repeating it on a four-line caption is 164 characters of a 500-character message spent saying the same thing four times. Measured: underline +6396 ink, strike +4793, both +11189 against the same-size baseline, and a two-line caption carried the decoration on both lines from one `<g>`. The optimisation is real and it holds. All nine fonts are legible and visibly distinct at 24px and 58px, with the honest caveat that Georgia, Serif and Fantasy read as one family of serifs next to each other on tiny 1-bit thermal type.
  - Bold and Black are pixel-identical on the Default font. Not "close": `PIL.ImageChops.difference(...).getbbox()` returns `None` at both 24px and 58px, meaning zero differing pixels between weight 700 and weight 900. Both are clearly heavier than no weight at all (+1838 ink at 24px, +6189 at 58px, the same delta for each), so the control works; it's the *distinction* that doesn't exist here. The likely cause is ordinary CSS weight matching, where this render host's Arial substitute offers one bold face and both values round to it. No code change, because there is no markup bug: the two weights reach the wire byte-for-byte differently, and a font that ships more steps may well separate them. The real escape hatch for a heavier look is the separate Arial Black *font* entry, a distinct typeface rather than a synthesised weight, and that one is visibly different.
  - `text-decoration:` on the rotated HTML `<span>` (a CSS declaration, a different renderer path from the SVG attribute) also renders: +10852 ink, and the lines run the length of the strip perpendicular to the baseline, since the decoration rotates with the text. Italic renders with a small *negative* ink delta (−48 / −174), since it reshapes glyphs rather than thickening strokes; less ink is the expected outcome rather than a failure.

- Formatting is payload, and on a fake cheer there is no room for it. These attributes are characters in the message, on top of a message that already sits at 491 of Twitch's 500 with a picture attached. Measured on the shipped builder, uploaded short link, default pull:

  | change | cost | fake cheer + picture |
  |---|---|---|
  | untouched | none | 491 |
  | one line → Impact | +21 | 512 (rejected) |
  | one line → underline | +28 | 519 (rejected) |
  | all three lines → Impact | +63 | 554 (rejected) |

  A fake cheer *without* a picture starts at 357 and has room: all three lines in Impact is 420, all three underlined is 441, both together is 504 and over again. So on a fake cheer, formatting and a picture are alternatives, and even without the picture, "everything on every line" does not fit. Twitch rejects an over-length message rather than truncating or splitting it, and a takeover is one SVG that cannot be split regardless, so going over prints nothing at all. The counter turns red before you send. Watch it, because the attribute that pushed you over is invisible on the tape.

- Sideways Big Text warns about the font, because that is where the loss is loudest. A sideways strip is sized by measuring the text in your browser, and the printer draws it on the streamer's machine. Measuring one font while another gets drawn makes the box the wrong length and shears the last letters off. So `bigFontFor` is now the single owner of "which font is this text in", read by `measureRun` and by every renderer, and the card says so out loud when you pick a non-default font on a rotated block. The card only warns on a rotated block, but straight-on is *not* immune: it is sized from a browser measurement too and clips at the paper edge rather than wrapping (see the shear fix below, and the README's font note). Widening that warning is a candidate for the next release, not something 0.4.0 does. Big Text's weight select also offers a Default entry the takeover card does not. Absent weight resolves to the 800 baseline sideways text has always rendered at, so a select that could only say 400/700/900 had no way to state an untouched block's real state without lying about it. Choosing Default deletes the key rather than writing a number.

### Fixed

- The takeover printed a crescent of the streamer's avatar above the artwork, which is the feature visibly not working: you paint over the bot's header and the top of it survives anyway. The cause was not the overlay's geometry, which is correct. It was that the calibration was measured against a preview that rendered something the app never sends.

  Every real message carries a lead (`Cheer100 <nonce> `, or the nbsp guard when not cheering) *before* the first body. That lead is content: it takes a line in the bot's `#receipt-content`, which pushes a lifted takeover down by that line's height, so a fixed lift no longer reaches the top of the header. The preview dropped the block bodies into the receipt slot with no lead at all, so it showed the covered case, and the shortfall only ever appeared on paper, after the bits were spent.

  Measured on the real engine (wkhtmltopdf 0.12.6 patched-qt, printer-bot's exact flags and stylesheet, full-size avatar), rendering the payload the app actually sends:

  | what was rendered | header left showing |
  |---|---|
  | bare SVG (*what the old preview showed*) | 1.9px |
  | `Cheer100 00 ` + SVG (*what is sent*) | 17.9px |
  | cheermote image + nonce + SVG (*what Twitch delivers*) | 21.8px |

  Three changes, because fixing only the number would leave the next calibration just as wrong:
  - The preview renders the lead. `packStackBodies` now publishes the `lead` it built, and the payload is literally `lead + bodies`: one string, so the two cannot be assembled differently again. A test pins that identity.
  - The default pull is 240pt rather than 220. Re-measured with the lead present: 235pt clears the text form, 240pt clears both with margin. Blocks saved on the old default are migrated forward once (`pullV`); a pull you actually dragged is left alone, because that one was calibrated against paper, which was always telling the truth.
  - `CHEER_MAX_LIFT_PX` is derived from the default instead of being a literal `293`. Those two agreed only by coincidence, and moving the default would silently have started capping *below* it, shifting the reference layout for everyone. Its test was pinned to the same literal and is now derived too, so it asserts the behaviour rather than a number.

- The preview clips at the paper edge, like the printer does. `.rcpt` had no `overflow`, so an over-pulled takeover kept showing content that lands above the top of the page, where wkhtmltopdf simply doesn't draw it. The picture is what disappears first, because it sits highest in the block. Measured at 400pt: the overlay overhangs the paper by 199px, all of which the preview used to show and the tape never printed.

- Big Text had letters sheared off at the paper edge. `buildBigTextSvg` sizes a line by dividing the paper width by what the line measures, but it measured `measureText().width`, the advance, and the advance is not a bound on the ink. The loudest case is italic: for a font with no italic face (Impact, Arial Black) the browser *synthesises* the oblique, skewing the outline and leaving the advance untouched. Measured in the same canvas the app uses, "HI" in Impact reports the identical 84.33px advance upright and italic while the ink's right edge moves 80.18 → 99.94. SVG has no overflow, so everything past the viewport is simply not drawn. And `text-anchor="middle"` centres the *advance* box, so the sheared ink is not even centred in the space it was given.

  Rendered through the real engine (wkhtmltopdf 0.12.6, 203 dpi, 1-bit), the payload the app itself emits for a headline "HI"/Impact/italic, against the same glyphs drawn into a deliberately oversized viewport so nothing could clip:

  | | ink right edge, SVG user px | verdict (viewport = 263) |
  |---|---|---|
  | upright (the control) | 248.8 | fits |
  | italic, before | 314.2 (clipped to 263.5) | 51px of the "I" never printed |
  | italic, after | 254.6 (unclipped: 255.0) | fits, 8px clear |

  It is not only italic, which is what the first cut of this fix assumed. Sweeping all nine fonts against ten strings with real canvas metrics at the weight the app measures with, an advance-based fit puts ink outside the viewport in 64 of 180 cases, and six of those are *upright*: Script "L" (ink right edge 271.9), Script "Wj" (273.2), Script "gyp" (left −11.4), Fantasy "L" (274.4), Fantasy "gyp" (−3.3), Comic Sans "L" (264.2). A swash or a descender that overhangs its own advance box amputates exactly like a synthesised skew does. On the engine, upright "L"/Script emitted font-size 391 and inked to user x 318.3: 55px of the letter gone.

  So the fit measures ink bounds (`actualBoundingBox*`, the same metrics the rotated path has always used) on every measurement, italic or not, takes twice the larger half-extent about the anchor rather than the raw span, and never returns less than the advance. Ink that already fits inside the advance box returns the advance verbatim, which is every non-overflowing upright case, so unformatted Big Text is byte-identical and a test pins the exact string. A missing bounding box (older engine, or the null-DOM test harness) falls back to the advance rather than to `NaN`. Across the same 180-case sweep, the shipped fit clips in 0.

  One more thing the raster showed: the engine synthesises its own oblique and shears 3.9% harder than the measuring browser reported, at both sizes tried, and the fake-bold stroke spends another `S/64` a side. Ink bounds alone still left ~2px outside. An 8% pad closes it, the same shape of correction `runLength` already makes, deliberately not sharing its constant, since that one answers a different question.

  What the pad costs, stated plainly: it is applied to every ink measurement that overhangs, and there is no exemption for a font that ships a *real* italic face. Georgia ships one, and its ink still exceeds its advance on 6 of the 10 strings swept ("HI": 136.38 advance against 149.07 of ink), so Georgia italic "HELLO" now prints 8% smaller and "HI" 15% smaller than the same unreleased code measured earlier in this cycle, before this fix landed. That is not smaller than anything a 0.3.3 user ever printed, since font and italic on Big Text are new this release (`a5f0cce`) and 0.3.3 could not select either. It is a deliberate trade on `runLength`'s rule: erring long adds invisible blank tape, erring short shears a letter off, so over-measuring is the direction to be wrong in. A real italic face is not by itself evidence that the advance bounds the ink; only the measurement is, and there are strings on which Georgia's does (573.24 advance against 571.00 of ink on "WRECKED", unchanged). It is also not only Georgia and not only italic: once the fix stopped gating the pad on `italic` (the "for every face" change above), any upright face whose ink exceeds its advance pays it too. See the cliff below.

  The pad is a step at a zero-width boundary rather than a ramp, and that step is most of its cost. `bigFitBasis` is `if (ink <= adv) return adv; return ink * BIG_INK_PAD`: cross from "ink exactly matches advance" to "ink exceeds it by a hair" and the multiplier jumps from 1.0 to ~1.08 in that one step, so a typeface can lose most of the pad's 8% for an overhang too small to matter on paper. Swept across the same 180 cases upright: 23 change size, and only 6 of those were actually clipping. The other 17 shrink for nothing a printer would notice. The starkest is Arial Black upright "WOW", which overhangs its advance by 0.10px (279.88 against 279.98 of ink, 0.036%) and loses 6.7% of its type size (font-size 89 → 83). Also upright: Arial Black "WRECKED" (45 → 41), Comic Sans "L" (454 → 420), Georgia "WOW" (81 → 74). The behaviour stays as shipped, and the note on `BIG_INK_PAD` says why a proportional curve isn't the fix, but a reader should know the cost isn't confined to the italic Georgia example above.

  Not every measured case goes the amputated direction, either. On the real engine, `fantasy` "L" printed inside the box before this fix, 262.5 against a 263 viewport, and prints at 243.1 after: about 20px of paper given away rather than taken. The cause is the same font-substitution gap the README warns about, just running the other way here. The `fantasy` face Chrome measured for the pad's ink calculation is wider than the face wkhtmltopdf actually drew, so the pad over-corrects for a shear that, on this string, the print engine didn't produce as large as measured. Every other illustration in this entry shows amputation; this one shows over-correction, and both are real outcomes of the same fix.

  Still not fully fixed for the generic families, and it can't be from here. Re-probed on the engine, upright "L"/Script improved from 318.3 to 282.8 against the 263 viewport: better by 36px, still 19px amputated. The residue is not the fit, it is font *substitution*. `cursive` and `fantasy` name no actual typeface, so the browser that measures and the engine that prints resolve them to different faces with different outlines, and no measurement taken on one can size the other. That is the same hazard the sideways strip has always warned about; it applies straight-on too (see the README note), and a named family present on both machines is the only real answer.

### Known, not fixed

- A takeover's picture cannot print on a rig whose header is shorter than the block. The picture is anchored to the top of the lifted panel, so if *Reach up* overstates the real header, the picture is lifted off the paper and clipped. Turning the pull *down* instead shrinks the panel until the picture is dropped from the markup for being under the 120px floor. Swept the full 60 to 400pt range against a short header: it never printed once, while still costing ~90 characters every time. There is no way to fix this in the app, because the rig's true header height is exactly what it cannot measure; it only knows what you tell it via the pull. What *is* fixed is that both the preview and the card now show and say so, instead of the loss being invisible until the tape came out. Calibrate with a blank takeover first; the picture follows.

---

## [0.3.3] - 2026-08-08

### Added
- Upload a picture directly on a Takeover block, in both styles. Previously the only uploader lived on an Image block, so putting a picture on a takeover meant creating a block you didn't want, uploading there, copying the link, pasting it across, and deleting the block. The card's own hint said as much, which is a fair sign it was a papercut.
  - It matters most exactly where it was missing: the picture is the headline of a Fake cheer, and that payload sits at ~491 of Twitch's 500. A pasted Discord/imgur URL is routinely long enough on its own to push it over, and over the cap Twitch rejects the message outright rather than splitting it. Uploading mints a 39-character link, which is the only shape that reliably fits.
  - The shrink-and-POST core is now shared (`uploadPngForUrl`) rather than welded to the Image block's `block.url`, so both callers mint links the same way. The Image block's own upload path is unchanged in behaviour.
  - After an upload the URL field repaints with the minted link, so the control shows what's actually being used instead of sitting blank while the preview changes.

---

## [0.3.2] - 2026-08-08

### Added
- Takeover blocks. A third block type that paints over printer-bot's own header (the avatar, the bits line and the name it draws) so the tape comes out as your artwork rather than a receipt with a message stapled underneath. It's an opaque SVG lifted over the header with a negative top margin; anything below it in the stack still prints as normal. Three optional lines with independent sizes, an optional picture, and one Reach up (pt) calibration slider, since the bot's header height depends on the streamer's avatar and can't be a constant.
  - The picture rides in a `<foreignObject>` through the ordinary carrier tag table, so it inherits the blocked-tag data instead of hardcoding SVG's `<image` (blocked since Aug 2026). Measured working through both the `embed` and `input` carriers.
  - Measured: a three-line takeover is 350 chars, and a takeover plus a full real-picture payload plus the cheer wrapper is 458, which is one cheer rather than two. A test locks that in, since it's the difference between the gag costing 100 or 200 bits.
  - The preview is WYSIWYG: it renders the same receipt chrome, so the overlay covers the preview's header exactly as it covers the real one.

- Fake cheer, a second style on the same block. It arranges the overlay the way printer-bot arranges a real cheer (picture on top, then the bits figure, then the name, then an italic message), reproducing the hand-built payload this feature was reverse-engineered from, the one that printed correctly on a real rig (80 px picture, baselines 24/900, 19/700, 13/italic). Type the figure only; ` BITS` is appended. It stays free text rather than a number, because `-100000` and `∞` are the jokes people actually want and coercion kills them.
  - It composes `buildTakeover` instead of emitting its own markup, so the escaping, the carrier table and the `foreignObject`-last rule are inherited rather than re-implemented. One place to get them right.
  - The two styles keep separate text fields, so flipping the selector to compare them and flipping back doesn't eat what you typed. The three size sliders are shared, being the same three visual slots either way.
  - It fits one cheer with a picture: 100 bits rather than 200. It didn't at first. On the old 67-char link shape a three-line fake cheer plus a picture measured 540 against Twitch's 500. Two changes in this release brought it to 497, the uploaded-link shape (below) and dropping the body-width clamp inside the fixed `foreignObject` where it's a provable no-op, and the short image host took it to 491 once that landed. The margin is real but thin: at 491, `IRS` fits and so does `shamu4life` (498), but a very long name still doesn't. The card names the number and the counter turns red before you send.
  - *(Two corrections to earlier drafts of this entry, both recorded rather than scrubbed. It first claimed 520, measured against a 12-character key placeholder while the uploader actually minted 32; the real figure was 540, worse than stated. It then said an over-length fake cheer "splits into a second cheer, 200 bits". It does not: `packStackBodies` treats the first body of a part as fitting whatever its length, and a takeover is a single SVG that cannot be split regardless, so going over means Twitch rejects the message and nothing prints. That is a materially different consequence, and the hint said the wrong one.)*
  - Text and picture are both clamped into the painted panel. A short *Reach up* or an oversized picture used to be able to push a baseline past the white box, which prints *on top of* the header the block exists to cover, i.e. looks exactly like the feature not working. Caught by a test written for the edges rather than by the happy path.

### Corrected

- The "no sender template" scope note from this release's first draft was wrong, and is gone. It refused a name + picture + bits arrangement on the grounds that it produced "a tape indistinguishable from a record of a payment nobody made." That reasoning treated *looks like a receipt* as *functions as a financial record*, and those aren't the same thing. Twitch's bits ledger is server-side and authoritative, nobody reconciles it against thermal paper, and the printer is a gag the streamer runs for laughs: the cheer that triggers a print carries the sender's real name in chat, in front of the whole room. The paper being obviously untrue in a room that can see the truth is the joke rather than a forgery.

### Changed

- Uploaded-image links are much shorter, because the URL is payload. `POST /upload` now mints `https://<host>/<12 hex>.png`, 45 characters, down from `/i/<32 hex>.png`'s 67. Those 22 characters are the difference between a fake cheer costing 100 bits or 200.
  - The key drops from 16 random bytes to 6 (128 bits to 48). The security model is "unguessable link, alive for 15 minutes": 2.8×10¹⁴ keys against a 900-second window needs ~3×10¹¹ requests/second to expect one hit. The other 80 bits were 20 characters of payload spent on margin that was never load-bearing.
  - Images now serve from the root as well as `/i/`, matched by shape rather than by host: `^[0-9a-f]{8,64}` plus an optional image extension. `test/imgpath.test.mjs` asserts it can't shadow `/robots.txt`, `/llms.txt`, `/sitemap.xml`, `/upload`, `/px` or the app itself, which is the risk that sharing a namespace with the static site buys.
  - Links minted in either older shape still resolve, so nothing 404s mid-cheer.
  - The `.png` suffix stays. It's load-bearing twice over: `embed`/`object` pick their renderer from the extension, and wkhtmltopdf escalates a failed subresource with an *unknown* extension to a fatal, whole-job error. These links expire in 15 minutes, so cheering a stale one is the ordinary case rather than the edge case.
  - New `RW_IMG_HOST` var points minted links at a short image host. It shipped unset in this release and was switched on in 0.3.2's follow-up once the domain was verified live (see the Deploy config note below). It falls back to the request origin when unset, so previews and `wrangler dev` are unaffected either way.

- The width clamp may now be dropped inside a fixed frame, and only there. `max-width:100%` on a top-level carrier is field-verified (without it, pictures printed off the right edge of the paper, because the receipt body is ~240px and not `PAPER_PX`'s 263). Inside a `<foreignObject>` the containing block *is* the frame and the tag already states that width, so the declaration can only resolve to the width it already has: a no-op worth up to 23 characters. `buildImageEmbed({framed:true})` is the only way to drop it, `buildTakeover` is the only caller, and a test asserts every carrier still clamps when unframed.

### Internal

- CI can be re-run by hand (`workflow_dispatch` on `ci.yml`). A pull request opened by a GitHub App token doesn't trigger Actions, so a PR whose branch was pushed *before* it was opened never got a `Validate` run and there was no way to ask for one.

### Deploy config

- Both custom domains are declared in `wrangler.jsonc`. `receipt.uwutoowo.com` was previously configured only in the Cloudflare dashboard and this file carried no `routes` at all. Adding the new short image host means routes now live in config, so both are listed, because declaring only the new one invites a deploy to reconcile the route set and drop the domain production actually serves on. Anything that should be reachable has to be in that list from now on.
- `i.uwutoowo.com` is now live and in use. The first production deploy created the Custom Domain (no DNS conflict; the pre-existing record was taken over cleanly), and `RW_IMG_HOST` now points minted links at it: 39 characters, down from 45. Verified end to end against real Cloudflare and KV. `/upload` mints a 12-hex key and the object round-trips 200 `image/png` at all four shapes: `/<key>.png`, `/i/<key>.png`, `/<key>`, and on the short host. Before the deploy that hostname resolved to Cloudflare but was bound to nothing and returned 522, which is why the domain and the var landed as separate changes.

### Measured, not assumed
- A picture drawn under ~120 CSS px tall does not render inside a lifted takeover. There is no image XObject at all, just blank paper where it should be. It is the drawn *height*: a 60×240 draw renders and a 200×67 draw does not, at near-identical areas, with the threshold between 110 and 120. All three live carriers behave the same, and it only happens under the negative top margin. This decided the default: a profile picture is square, so its drawn height is its width, and the previous 80 px default would have printed nothing. The floor is now 120, both picture sliders start there, and a picture that can't clear it is dropped rather than sent as ~90 characters buying blank paper. (It's easy to miss, because a portrait test image draws tall enough to clear the threshold however narrow you set it.)
- The picture could paint over the text at ordinary slider positions. The picture is emitted last (it has to be; see the `foreignObject` rule below), so SVG document order paints it *over* the lines. Sizing the picture first and clamping the text into what was left let the clamp drag the stack up underneath it: at the default pull with the width slider at maximum, `-100000 BITS` rendered with zero ink. Every test passed, because they asserted only that each piece was inside the box, which was true. The text's room is now reserved first, and the tests assert the two are *disjoint*.
- An over-pulled fake cheer printed a blank white slab. The blank takeover anchors to the bottom of the covered area, so over-pulling only adds white; the fake cheer anchored to the top and climbed 1:1 with the slider until it left the paper: at pullPt 300 the picture was gone, at 380+ nothing printed. The lift is now capped at the default calibration's worth, so the default is untouched and beyond it the block follows the message down the tape.
- The `startY` clamp inverted on tall stacks. With three 48 px lines in a short cover, `maxStart` falls below `minStart` and `Math.max(min, Math.min(y, max))` resolves to `minStart`, letting trailing lines fall outside the viewport, where the SVG clips them: never printed, still paid for in characters. 189 of 2898 reachable slider combinations hit it. Lines that genuinely don't fit are now dropped instead.
- The `iframe` carrier deletes everything stacked below a takeover. An `<iframe>` inside the `<foreignObject>` swallows the content following the whole SVG. Isolated against an otherwise identical page: `embed` printed the trailing block, `iframe` printed none of it on either PDF page, and a bare `iframe` outside a `foreignObject` printed it fine. Same class as the sibling rule below, one level out. The table now flags it (`framedOk: false`) and the card warns; the pick is still honoured, because silently overriding an explicit choice is its own bug.
- `<foreignObject>` swallows every SVG sibling that follows it. It's an HTML integration point: the parser switches to HTML inside and never cleanly returns to SVG context, so a `<text>` emitted *after* one is parsed as HTML and silently never drawn. The markup looked perfect and the print came out with the text simply missing. `buildTakeover` emits the picture last for this reason, with a regression test. The cost is that a picture tall enough to reach the text will overlap it, which at least shows up in the preview.

---

## [0.3.1] - 2026-08-06

First field results from a real probe round, cheered at the live channel and printed on the real machine. Two of the six carriers came back clean, one came back too wide, and the default came back not at all.

### Fixed
- The default carrier was blocked. The list took `<img` in the same round that killed the SVG form, so 0.3.0's default never reached chat and every real-picture payload was dead on arrival. `img` is now flagged blocked and the default moves to `embed`, the carrier that printed perfectly on the real machine. `input type=image` is more forgiving about URLs and sits second, but it printed *too wide* in the field and the bench can't reproduce why (best guess: Qt themes form controls per-platform, so Windows may draw native chrome the Linux build doesn't), so it doesn't lead until someone re-probes it there. Each entry now records its real-rig verdict in a `field` property, and a test enforces that only a carrier marked `"prints"` can be the default. Saved blocks still pointing at `img` migrate on next load (`EMBED_V` 2 → 3).
- Pictures printed too wide. The box the app asks for (263 px = 70 mm) is wider than the receipt body: printer-bot renders at `paperWidth - 8` mm with `body { margin: 1em }`, leaving ~240 px on an 80 mm roll. Measured, every carrier drew to the paper edge and lost its right margin. Every live carrier now carries `max-width:100%`, which adapts to whatever the body really is instead of betting on another hardcoded number. Verified on the engine at a true 240×180 with the aspect intact.
- `embed` no longer states a height. With one, the width clamp left the stated height in place and stretched the picture ~8%; without it the engine takes the height from the image. Shorter payload, correct aspect.

### Added
- A warning before a blank print. `embed` and `object` pick their image renderer from the URL's file extension and fail *silently* without one: the message sends, the tape prints, and there's just no picture. Picking one of those with an extensionless link now shows a warning naming the fix. (`urlHasImageExt` strips the query string first, so a CDN link ending `.png?ex=…` still counts.)
- Each carrier now declares the literal `token` a blocked-terms list would have to match, and tests assert every entry emits its own token and that no two share one. Otherwise a single blocked term would take out two supposed "alternatives" at once.

### Fixed (UI)
- Two hint blocks were overlapping the controls above them. `.hint` carried a negative top margin that only makes sense directly under a `<label>` (it cancels the label's bottom margin); applied after a `<select>` or a button row it dragged the text up into them. It's now an adjacent-sibling rule, `label + .hint` snugs up and everything else gets normal spacing, so the carrier-tag hint and the *Find what still sends* explanation no longer collide with the select and the buttons. Same for `.over-note`.

### Notes
- The probe now says how many letters are worth sending. Live carriers lead the list, so a normal round is the first three; the rest are already known blocked and only worth a re-test if a mod prunes the list. At 100 bits a cheer that's 300 bits saved per round.
- The probe's letters are positional, so they shifted with the reordering: A is now `embed`, B `input`, C `iframe`, D `img`, E `SVG image`, F `object`.
- `iframe` printed cleanly in the field, but the crop caveat stands. It has no shrink-to-fit, so it only looks right for a picture already smaller than the box, and `/upload` re-encodes up to 720 px.

---

## [0.3.0] - 2026-08-06

### Fixed
- Real pictures print again. The channel's blocked-terms list added `<image`, which killed the SVG form every real-image payload was built on (`<object`, the form before it, was already blocked). Picture payloads now default to a plain `img` tag.

- Expired upload links no longer kill the whole print. `/upload` now returns a link ending in `.png`. wkhtmltopdf only treats a failed subresource as a soft error when its extension is in a hardcoded list (`css/js/svg/png/jpg/jpeg/gif`); anything else, including a bare `/i/<hex>`, is escalated to a fatal page error, exit code 1, print job dead. `--load-error-handling ignore`, which printer-bot does pass, does *not* suppress it. Since these links expire after 15 minutes, cheering a stale one was the ordinary case. `handleServe` strips the suffix, so links minted earlier still resolve.

### Added
- Carrier tags. The tag that carries a real picture is now a per-block setting with six interchangeable surfaces, each building the same picture out of a different token: `img` (default), `input type=image`, `embed`, `iframe`, plus the two blocked forms (`SVG image`, `object`) kept for A/B in case a list gets pruned. Recovering from the next block is a dropdown change rather than a release.
- Find what still sends, a second diagnostic button beside *Print test strip*. It builds the same picture with every carrier, one labelled cheer each (`A` to `F`), to be sent one at a time: a letter that prints *with a picture under it* names the carrier to pick, a bare letter means the tag didn't render, and a missing letter means chat blocked it.
- Saved Image blocks still pointing at a blocked carrier are migrated to the working default once, stamped so a deliberate re-pick of a blocked tag still survives a reload.

### Measured, not assumed
Every carrier was rendered through the exact binary printer-bot ships (wkhtmltopdf 0.12.6 "with patched qt" = Qt 4.8.7 / WebKit 534.34) with its exact print flags, against its real receipt stylesheet. What that settled:

- `img` and `input type=image` render correctly, including with an extensionless URL; `embed` and `object` draw *nothing* without a file extension. That, rather than an `object`-vs-`img` difference, is what the old "renders at native size, ignores the width" note was really describing.
- `iframe` renders but crops: a subframe gets no shrink-to-fit, so the picture is drawn at natural pixel size and clipped. Labelled accordingly rather than presented as a clean fallback.
- A CSS background carrier was built, measured dead, and cut before release. It looks like the ideal answer to a tag blocklist (no tag name to block), but printer-bot passes `--no-background`, which drops every element background from the print, and the `background:url(x) 0 0/100%` slash shorthand is separately invalid in that WebKit vintage. A comment in `EMBEDS` records this so it isn't re-added on the same reasoning.
- `SVG image` still renders fine; it is purely a blocked-terms casualty. (An `svg { height: auto }` rule collapses it to nothing, but that's Receipt Wrecker's own preview CSS rather than the printer's.)

### Changed
- All real-image markup is built in one pure-core function (`buildImageEmbed`), unit-tested for escaping, sizing, and payload budget. The legacy tabbed-UI path routes through it too, so no code path emits a blocked tag any more.
- `escapeHtml` / `escapeAttr` moved into the pure core, shared with the embed builders and unit-tested there.

### Known, not fixed
- The print box is ~23 px wider than the receipt body. `PAPER_PX` is 263 (70 mm), but printer-bot renders at `paperWidth - 8` mm and its template sets `body { margin: 1em }`, so on an 80 mm roll the usable width is 272 − 32 = 240 px. Measured: every carrier draws from x=16 to the page edge at x=271, losing ~7 px off the right and the entire right margin. This affects big type and sideways type too, which share `PAPER_PX` and are field-verified at the current value, and the real number depends on the streamer's configured paper width, so it is reported rather than silently changed. Dropping Print width to ~62 mm fits exactly today.

---

## [0.2.0] - 2026-07-17

### Added
- GitHub link: a "GitHub" link (octocat mark + label) at the top of the app, in a header bar beside the title, linking to the source repo. Inline SVG only; no external resources.
- Crawler policy: static files served from `public/` at the site root that explicitly welcome AI/LLM crawlers. A permissive `robots.txt` that `Allow`s named AI agents (GPTBot, ClaudeBot, Google-Extended, CCBot, PerplexityBot, and others), an [llmstxt.org](https://llmstxt.org)-style `llms.txt` summarizing the tool for LLM agents, and a minimal `sitemap.xml`.

### Notes
- No runtime dependencies, external resources, or Worker routes were added. Cloudflare already serves `public/` as static assets, so the new files are reachable at `/robots.txt`, `/llms.txt`, and `/sitemap.xml`. The single-file app and all payload/glyph constraints are unchanged.

---

## [0.1.0] - 2026-07-05

### Added
- Tiers: four glyph tiers to choose from. Blocks `░▒▓█` (Image mode's default, widest-compatibility 4-level tone ramp), CJK ramp (a curated Han-character density ramp for richer tone on photos), Braille (2×4 dot packing for the highest spatial resolution), and Big text (on/off), a maximum-contrast binary tier that's Big Text mode's default. That last one gives crisp letters, and the tier selector can override it to render big text in CJK or Braille too.
- Big Text mode: type a word or short phrase and get it rendered as oversized block letters, with a Sideways (rotate 90°) orientation option.
- Image mode: pick a picture from your device (nothing is uploaded) and get it downsampled and quantized into a grid of tone glyphs, with a Threshold vs. Floyd-Steinberg dither toggle plus contrast and invert controls.
- Census: a Print test strip button emits a fixed diagnostic payload of labeled samples of every tier plus a numbered ruler, for a one-print, blind-first-paste calibration of which tiers render and the true column count on a given destination renderer.
- Cheer-ready output: an on-by-default toggle that appends a space-delimited `Cheer100` token plus a small visible rotating nonce, so the payload registers as a Twitch cheer and survives a duplicate-message filter. Turn it off for a raw glyph-only payload.
- Budget: a live character counter against a 490-character budget (headroom under Twitch's ~500-char single-message cap). Going over is flagged, never silently truncated.
- Output: every payload is a single newline-free line with a Copy button (Clipboard API with an `execCommand` fallback) and a collapsible-free live preview.
- Persistence: control-panel settings (mode, tier, columns, toggles, text) are remembered between visits via `localStorage`, wrapped in `try/catch` so locked-down contexts still work.
- Privacy: runs fully client-side, with no network calls, no analytics, no accounts and no uploads. Text and images never leave the device.

### Notes
- This is the initial release. HTML/markup injection was evaluated and deliberately *not* implemented; see `CLAUDE.md` and the design spec for the reasoning. A channel's AutoMod/blocked-terms list can still hold or drop a cheer message, which is outside this tool's control.
- This baseline release also adds the contributor docs, CI, and unit tests.
