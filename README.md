<!-- No social-preview banner: omitted rather than inventing binary/SVG assets (see cheer-splitter-9k/.github/social-preview*.svg for the pattern used elsewhere). -->

# Receipt Wrecker

**Turn big text or a picture into a paste-ready grid of monospace "block" glyphs.**
For character-limited text boxes, chat copypasta, and anywhere a single line of
Unicode has to stand in for a picture or a poster-sized word.

**▶ Try it live: [receipt.uwutoowo.com](https://receipt.uwutoowo.com/)**

<p align="center">
  <a href="https://github.com/shamu4life/receipt-wrecker/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/shamu4life/receipt-wrecker/ci.yml?label=CI" /></a>
  <a href="docs/CHANGELOG.md"><img alt="Version 0.12.0" src="https://img.shields.io/badge/version-0.12.0-blue" /></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-blue.svg" /></a>
  <img alt="Single file" src="https://img.shields.io/badge/source-one%20HTML%20file-success" />
  <img alt="Zero dependencies" src="https://img.shields.io/badge/dependencies-0-brightgreen" />
  <img alt="No build step" src="https://img.shields.io/badge/build-none-success" />
  <img alt="Vanilla JS" src="https://img.shields.io/badge/vanilla-JS-f7df1e" />
  <a href="https://developers.cloudflare.com/workers/static-assets/"><img alt="Cloudflare Workers" src="https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white" /></a>
</p>

> **Giant type (0.10.0): big letters print again.** printer-bot's sanitizer strips
> styling, but it keeps the `class` attribute, and the page it prints carries nutty's
> whole shared stylesheet. One class in it, `title`, makes text 1.2× bigger, and
> nesting it multiplies. So a Text block now prints **real bold capitals** — about
> **2 cm tall** for a five-letter word, up to **5 cm** for two or three letters, in one
> cheer on a default A4 receipt, and bigger on a longer one. It borrows someone else's
> style, so it can stop working any day without warning: the **Print size ruler**
> checks it for the price of one cheer, and Hanzi tiling is one click away as the
> backup. [How and why it works](#giant-type-how-and-why-it-works).

> **0.11.0 fixes a field cut-off.** A tall Giant stack used to be cut off at the
> printer's real paper length (often A4), losing everything past ~29.7 cm. It is now
> packed to a **Receipt length** you set (default A4), splitting a tall stack across
> receipts that each fit. [Receipt length](#receipt-length).

> **0.12.0: the two digits after the cheer are optional, and off by default.** A cheer
> used to go out as `Cheer100 07`, and the `07` printed on the receipt. Now it is just
> `Cheer100`. Turn on **Add a repeat number** if you want the digits back.
> [Add a repeat number](#add-a-repeat-number-optional).

> **⚠ printer-bot added an HTML sanitizer (2026-09-15), and it changed what prints.**
> The chat message is no longer rendered as raw HTML — it passes through an allow-list
> that keeps only a few tags and the `src`/`class` attributes. What that means in
> practice: **Hanzi tiling (text) and CJK glyph-art (pictures) are the reliable paths
> now**, because they are plain text and nothing can filter them. *(For text this was
> overtaken on 2026-10-01 by Giant type, above, which rides the `class` attribute the
> sanitizer keeps. Hanzi is its backup now. For pictures it still stands.)*
>
> **Arbitrary pictures cannot be sent at all.** The sanitizer allows only an `<img>` tag,
> and the channel's automod blocks `<img` — field-confirmed the same day, with a control,
> so the two gates leave nothing in between. **Big Text "Type"/sideways, ASCII glyph-art,
> the Takeover and the fake cheer no longer print either**, and the app flags all of
> them rather than letting you spend bits on blank paper. Full detail in the
> [changelog](docs/CHANGELOG.md#090---2026-09-15). *(Amended 0.10.0: a Twitch emote the
> sender may use is the exception. printer-bot draws it itself, and Giant type's Emote
> names layout prints it giant. See [Emote names](#emote-names-needs-one-test-print).)*

Receipt Wrecker is a single-file, dependency-free web tool. You build a stack of
blocks and it packs them into as few chat messages as possible:

- **Text** blocks print in **Giant type** by default: real bold capitals, sized to
  the biggest that fits across the paper and inside one cheer, as typed or stacked one
  letter per line. A Text block can instead tile its words out of **Hanzi**, a
  markup-free grid of Han glyphs that survives the sanitizer and prints on the target
  RP332. That is the backup if Giant type ever comes out normal-sized. (The older
  oversized "Type" render, straight or sideways, is stripped by the sanitizer and no
  longer prints. It only appears on blocks that already use it.)
- **Image** blocks make **glyph-art** — the picture tiled into characters, which
  nothing can filter. The **real picture** mode is currently non-functional: the only
  carrier the sanitizer allows is `<img class="emote">`, and automod blocks `<img`, so
  the block warns instead of sending.
- **Takeover** / **fake cheer** paint over printer-bot's own header. These are an SVG
  trick the sanitizer now strips, so they no longer print; the blocks stay in the app,
  flagged, in case the sanitizer is rolled back.
- **Presets** save the whole stack under a name and export it as JSON, so a setup
  survives the next stream and the next browser.

The output is one newline-free line per message, sized to Twitch's 500-character
limit. The glyph engine runs entirely in your browser. The optional image upload and
proxy go to this project's own Worker (see
[Privacy](#privacy-what-stays-local-and-what-doesnt)).

> Its headline use: a friend runs [nutty.gg's **printer-bot**](https://nutty.gg/)
> (via Streamer.bot) on a thermal **receipt printer**, which prints chat messages
> sent as a Twitch `Cheer100`. Pasting Receipt Wrecker's output into chat makes the
> printer spit out oversized text or a recognizable picture. That's one
> application. The tool itself is a neutral glyph-art generator, like its
> siblings [`cheer-splitter-9k`](https://github.com/shamu4life/cheer-splitter-9k)
> (chunking) and `transliterate-me` (phonetic transliteration).

---

## Quick start

No install, no build, no account. Pick whichever is easiest:

- **Use it now:** open the live app at
  **[receipt.uwutoowo.com](https://receipt.uwutoowo.com/)**.
- **Just open it.** Download [`public/index.html`](public/index.html) and open it in
  any browser. That's the whole app, in one file.
- **Run it locally** with the Cloudflare CLI (live-reload preview of `public/`):

  ```sh
  npx wrangler dev
  ```

- **Deploy your own** copy to Cloudflare Workers (see [Self-hosting](#self-hosting)):

  ```sh
  npx wrangler deploy
  ```

Then: type into the **Text** block (it starts as Giant type, showing `HELLO`) and watch
the receipt preview → press **Copy** on each part → paste it into chat. Add **Image**
blocks for glyph-art, and set the **tier** and **columns** there. Before your first real
cheer on a new printer, send the **Print size ruler** once (see below).

---

## Giant type: how and why it works

**Giant type** prints your text as huge bold capitals. A five-letter word stacked one
letter per line comes out with capitals about **2 cm** tall on a default **A4 (297 mm)**
receipt, for one 100-bit cheer — and bigger on a longer one (raise **Receipt length**). It
is the default render of a Text block.

### Why it works, step by step

You don't need to read code to follow this. Each step is one fact about how
printer-bot turns a chat message into paper.

1. **printer-bot cleans your message, but keeps one useful thing.** Before printing, it
   runs the message through a filter (a "sanitizer") that throws away almost all
   formatting. It keeps a handful of plain tags, like `<b>` for bold, and exactly one
   attribute that matters here: `class`. A class is a label that means "style me the
   way the stylesheet says things called *this* should look".
2. **The printed page brings a stylesheet that already defines labels.** printer-bot
   doesn't print your message on a bare page. It builds a little web page for the
   receipt (its code calls this step `GetRenderedHTML`), and into that page it copies
   every stylesheet from its own settings screen. One of them is `global.css`, the
   shared stylesheet nutty uses for all of their widgets. So any label defined there
   works on your message too.
3. **One of those labels is a heading style.** In `global.css`, `title` means "bold,
   in capitals, and **1.2 times the size of whatever it sits inside**". On printer-bot's
   settings screen it is what makes headings stand out.
4. **A title inside a title multiplies.** "1.2 times the size of whatever it sits
   inside" compounds. One title is 1.2 × the normal 16-pixel text. A title inside a
   title is 1.2 × 1.2 = 1.44 ×. Fourteen of them nested is 1.2 multiplied by itself 14
   times, about 12.8 ×, which is **205 pixels**. In general, N nested titles print at
   16 × 1.2^N pixels.
5. **The app does the arithmetic.** It knows how wide every capital letter is, how tall
   every line comes out on printer-bot's engine, and how many characters a Twitch
   message may hold (500). It picks the biggest nesting that fits across the paper and
   inside one cheer. If your text is too long for one cheer at any size, it uses as few
   cheers as possible, and the card says how many before you copy. What it sends is
   plain text: the cheer, `<b class=title>` repeated, your words, and the matching
   closing tags.

Here is the whole payload for `HELLO`, with the 14 repeated tags shortened:

```
Cheer100 <br><b class=title>…14 times…H<br>E<br>L<br>L<br>O</b>…14 times…<br>
```

That is 304 of the 500 characters. **Nothing in the markup is disguised.** Every tag is
one the sanitizer openly allows, written out plainly. (Your words are another matter: a
stacked word goes out one letter per line, as above, so a channel's word filter never
sees it whole. That is how the letters fit the paper, not a way around a channel's
rules; see "If it stops working".) Twitch still sees an ordinary cheer and
charges it, the receipt's header still prints your name and the bits, and chat sees
exactly what you sent. (Chat shows the raw tags, the same one repeated. If a channel's
mod bot removes repeated text, send it once with **Cheer-ready** off first: that is free,
and it shows whether the message gets through.)

### What you control

- **Layout.** **Auto** (the default) tries your text as typed and stacked, and picks
  whichever prints bigger in one cheer. **Lines as you typed them** keeps your line
  breaks. **Stack the letters, one per line** is what makes a short word huge. **Emote
  names** is described below.
- **Size.** **Auto: biggest that fits one cheer** is the default and the one to use.
  **Auto: fill the paper width** goes as big as the paper allows, even if that costs
  more cheers. Then every size by hand. Each option in both menus is labelled with what
  it would actually print for your text, for example `Level 14 · capitals 3.8 cm · 1
  cheer`, or `… · letters cut off` when a size is too wide for the paper.
- **Receipt length (mm).** How long one receipt prints before the printer cuts it. See
  [Receipt length](#receipt-length) below. It decides how big Auto can go in one cheer and
  where a tall stack splits into several.
- The card under the text says how tall the capitals will print and how many cheers the
  block really costs once the stack is packed. It also warns when a line is too wide, when
  a line is **taller than one receipt** (so its bottom would be cut off), when emoji were
  left out, and when a word would be charged as another cheer.

Rough sizes. Capitals are about 70% of the type size, and a level is one more nested
title. Auto also uses in-between sizes (0.9 × and 0.8 × a level), so real picks land
between these rows. The last column is what **Auto** gives each example **on the default
A4 (297 mm) receipt**, in one cheer; a longer Receipt length lets Auto go bigger (or a
tall stack fit in fewer cheers).

| levels | type size | capitals | what Auto gives, on A4 |
|---|---|---|---|
| 5 | 40 px | ≈ 0.7 cm | `HAPPY BIRTHDAY`, stacked |
| 8 | 69 px | ≈ 1.3 cm | an eight-letter word, stacked |
| 11 | 119 px | ≈ 2.0 cm | a five-letter word, stacked (`HELLO`) |
| 14 | 205 px | ≈ 3.4 cm | three letters (`LOL`) |
| 16 | 296 px | ≈ 4.9 cm | two letters (`GG`) |

From about 15 levels up, wide capitals like M and W no longer fit across the paper.
Auto knows each letter's width and never picks a size that cuts one off. A size you pick
by hand says so in its label.

### Receipt length

printer-bot lays every receipt out on a 500 mm-tall page, but **the real printer cuts the
tape at its Windows driver's paper length** — commonly **A4 (297 mm)** for an 80 mm roll.
Anything past that is clipped, not shrunk. Before 0.11.0 a tall Giant stack was packed up
to ~37 cm into one cheer, so on an A4 driver it printed the first few lines and then
**stopped mid-letter**. That is the field bug 0.11.0 fixes.

So Receipt Wrecker now packs each cheer to fit the **Receipt length** you set (default
**297 mm**). A stack too tall for one receipt is split across several — each is its own
cheer, with printer-bot's header between them — so **no content is lost**; the card says
how many it needs. A single giant line taller than the whole receipt is warned, never
silently cut.

To get longer receipts, set your printer's driver to **Roll Paper / continuous** (the
RP332 and most 80 mm printers can, but often ship set to a fixed size like A4), then raise
Receipt length. To find your real length, send the **Print size ruler** once, then
**measure the printed tape** from its top edge to the cut and enter that length (in mm) as
Receipt length. (The ruler's note also says which of its numbers 1–13 the app expects to
print at the current setting, as a sanity check — but set the length from the measured
tape, not from a number: a ruler number marks its distance down the giant letters, which
leaves out the header and footer the receipt also spends, so it is not the paper length.)

### Things it can't do

- **Fonts, weight and italics.** The style comes from printer-bot (bold Segoe UI on a
  Windows rig), so the formatting row is hidden for Giant type. On purpose, there will
  never be an italic or "other tag" variant: see [the rule](#if-it-stops-working).
- **Lowercase.** Everything prints in capitals. Your text is sent as you typed it, and
  the printer capitalises it.
- **Emoji.** The printer's engine can't draw them (they come out as empty boxes, and at
  this size a very large one), so they are left out, and the card says which. Invisible
  characters that copy-paste brings along (zero-width spaces, control codes, the Hangul
  filler people paste on Twitch as an "invisible character") are left out too, and the
  card says so rather than calling them emoji: each one would otherwise cost a whole
  blank giant line in a stack. A braille blank (`⠀`) counts as an ordinary space.
- **Narrow rolls.** It is sized for **80 mm** printers. On a 58 mm roll the letters
  would be cut off.
- **Words that look like cheers.** `Kappa50`, `4Head100` or `cheer100` on its own in
  your text is a second cheer to Twitch, and it charges for it. The card warns you. A
  word that only looks like one (`PS5`, `TOP10`) is a cheer only if the channel made it
  one, so for those the card says "if".

### Emote names (needs one test print)

Pick **Layout → Emote names** and type Twitch emote names, separated by spaces, with
their exact capitals (`Kappa`, not `kappa`). printer-bot swaps each name it recognises
for the emote's picture, and printer-bot's own style makes an emote exactly as tall as
the text around it. So a giant-sized emote prints giant: a single emote comes out about
4.9 cm square. Some caveats:

- Only emotes you are allowed to use in that chat get swapped. A channel's sub emotes
  need a sub. Anything else prints as the name, in giant capitals.
- BTTV, 7TV and FFZ emotes may not work. The picture is a small image blown up, so
  expect chunky pixels.
- The app separates every name with spaces on both sides, because Twitch only
  recognises an emote that is a word on its own. The preview draws each emote as a
  dashed box labelled with the name. It never downloads the emote.
- Emotes with `<` or `>` in the name, like `<3`, can't be sent this way: those
  characters have to be sent escaped, so Twitch never sees the emote's name and the
  printer prints the characters instead. The preview shows them as text.
- **This exact form has never been sent.** Try one cheer before a bigger run, or send it
  free first (Cheer-ready off): if Twitch chat shows the emote picture, Twitch recognised
  it.

### How sure are we?

- **Seen on real paper:** one real cheer carrying 15 nested titles and a stacked
  `P E N I S` went through the channel's automod and printed giant letters, on 1 Oct 2026.
- **Measured on printer-bot's own print engine, not on paper:** every size, every line
  height, the cheer-gem tuck, the in-between sizes, emote sizes, and when a message
  runs past one 500 mm page. (These came from the same wkhtmltopdf version printer-bot
  uses, 0.12.6 with patched Qt, in its Linux build with Segoe UI installed, fed the exact
  page printer-bot builds. Font rendering on the Windows rig can differ slightly.)
- **Never sent:** the two "in-between size" styles Auto sometimes uses
  (`setting-description` and `setting-attribute`, ×0.9 and ×0.8), the emote form, and
  the app's exact hidden-gem cheer (a leading space before the corner box, plus the two
  repeat digits inside it if you turn those on). The corner box itself, directly followed
  by giant text, rode the real cheer above.

### If it stops working

Giant type borrows a style from someone else's page. Its author can change or remove it
on any day, and if that happens **nothing errors**: your text just prints at normal size,
and the cheer is still spent. So:

- **Before your first real run on a printer**, send the **Print size ruler** (the button
  next to *Print test strip*). It is one cheer that prints the numbers 1 to 13, each a
  size bigger than the last. If the numbers grow, Giant type works on that printer
  today, and you can see every size on real paper.
- **On a run of several cheers**, send up to the first part with Giant type in it (the
  note under the parts names it; usually part 1) and look at the printer. If the letters
  came out normal-sized, stop.
- **If it has stopped**, switch the block's Render to **Hanzi tiling**, which needs no
  borrowed style at all.
- **If a channel's mods block it**, that is their call. The app will never offer a
  disguised or "alternative spelling" version to get past them, and nobody should
  write one. The same goes for your words: Stack (which Auto picks for short words)
  puts one letter per line, so a channel's word filter never sees the word, just as with
  Hanzi tiling. That is a side effect of fitting the paper, not a way to post what a
  channel has banned, and the free Cheer-ready-off test only shows whether the tags get
  through, not whether the words are welcome.

### Where printer-bot's code lives, and how to get warned

printer-bot's pages are published straight from nutty's public GitHub repository,
[`nuttylmao/nutty.gg`](https://github.com/nuttylmao/nutty.gg). The `widgets.nutty.gg`
address is that repository's own website, so whatever is on its `main` branch is what
every streamer's printer-bot loads. (Checked on 2 Oct 2026: the live files were
identical, byte for byte, to `main` at commit `be2972f`.) That makes its history
readable, and the history is reassuring:

- the `title` style, at 1.2×, has been in the shared stylesheet since 6 Sep 2025
  (commit `af65fcf`);
- copying every stylesheet into the printed page goes back to July 2025 (commit
  `20a0e59`);
- the sanitizer arrived on 27 Aug 2026 (commit `121c351`; this project noticed it on
  15 Sep), which is the change that stopped the old Type and Takeover modes printing;
- the shared stylesheet has changed only **eight times** in its life.

Stable, but not a promise. **To be told when it changes**, add this address to any
feed reader (Feedly, Inoreader, Thunderbird and the like):

<https://github.com/nuttylmao/nutty.gg/commits/main/.common/styles/global.css.atom>

It lists every change to that one stylesheet and nothing else, so a new entry is news.
When one shows up, send the **Print size ruler** before your next real run (or, if you
have the repo checked out, run `npm run printerbot -- --check`: its last line says
"check passed" or "check FAILED", i.e. whether every style Giant type borrows is still
there and still makes the letters the size the app expects).

That repository has **no licence**, which means all rights are reserved. So this
project never copies any of nutty's files; the bench below fetches them when it runs
and keeps them out of git.

---

## Tiers & the Census (read this before you paste into someone else's chat)

The glyph "font" you get on the other end depends entirely on what's installed on
the receiving renderer. For the printer-bot use case that is an old embedded
Windows browser engine with no control over `font-family`. Receipt Wrecker can't
know what's installed there, so it offers a tier selector, ranked by how likely
each one is to render correctly almost anywhere:

| Tier | Glyphs | Notes |
|---|---|---|
| **Hanzi** (the default now) | curated Han density ramp | The only tier that survives the sanitizer intact: Han glyphs are uniform-width and the ramp holds no spaces, so the grid keeps its shape with no styling at all. Field-confirmed to print on the RP332. |
| **ASCII letters** | ` icvoxnsaewmq08BWM` | Plain letters, so there is no font to be missing — but it leans on spaces, and see the note below. Was the default before the sanitizer. |
| **ASCII full detail** | ` .:-=+*oaewm8%#B@M` | Denser ramp, more tonal steps, same no-font-needed property, same space problem. |
| **Blocks `░▒▓█`** | 4-level tone ramp | Looks ideal and often **prints blank** on the real machine. The app's own selector says so. Kept because it renders fine in other destinations. |
| **Braille** | U+2800-28FF (2×4 dot cells) | Highest resolution at 8 dots per glyph, and the least universally supported. Marked experimental. |
| **Big text (on/off)** | `█` / `░` binary | Used by big type: maximum contrast, tolerant of a column of wrap drift. |

Both ASCII ramps use a literal space as their lightest cell, and **that no longer
survives**. It used to be safe because every glyph body shipped inside
`white-space:pre` — but the sanitizer strips `style`, so runs of spaces collapse and
the grid shears. Han glyphs need no such wrapper: they are uniform-width and the ramp
contains no space at all, which is why Hanzi is the default now.

Because the tool can't see the destination renderer, there's a dedicated **Print
test strip** button (the Census). It emits one diagnostic payload: a short, labeled
sample of every tier plus a numbered ruler. Send that once on the target rig, as
your first calibration paste, and look at what actually rendered:

- Which tiers came out solid and which came out tofu (boxes or blank) on that
  renderer.
- The true column count per line, read straight off the ruler. **That number is in
  ASCII digits, which are half-width.** A Han glyph is twice as wide, so the Hanzi
  column box wants roughly **half** the ruler's count — about 15 on the target rig.
  Typing the ruler's number straight in is what makes a Hanzi print come out slanted,
  because the grid ends up about twice as wide as the paper can wrap.

One row on the strip, `QUAD ▖▚▙▜█`, is a probe rather than a setting: there is no
quadrant tier to select. It's on the strip because it's the cheap way to find out whether
a tier between Blocks (4 tone levels, often blank on the RP332) and Braille (8 dots, least
supported anywhere) would be worth building for your rig. If QUAD prints where Blocks
tofus, that's the evidence for adding one. Don't go looking for it in the selector.

Set the tier and column-width controls to match what you saw, and every later
paste is pinned to that rig. This turns "will this render?" from a guess into a
measured fact, with a single throwaway print and no access to the other side.

---

## Cheer-ready output & the AutoMod caveat

For the Twitch-cheer use case there's a **Cheer-ready** toggle (on by default). Every
message then **starts with** a `Cheer100` token (`Cheer<your bits>` if you set more), so
Twitch registers the message as a cheer. The token goes first so it survives
anything that trims a long message, and so the message never starts with `<`, which
some sends are dropped for. Turn it off to get the blocks only, for three reasons:

- other destinations;
- composing with a chunking tool like
  [`cheer-splitter-9k`](https://github.com/shamu4life/cheer-splitter-9k) that adds its
  own prefix;
- a **free test**. A message with no cheer never reaches the printer, but it does go
  through the channel's chat filters, so sending it shows whether the channel lets that
  text through before you spend bits on it.

### Add a repeat number (optional)

Twitch won't send the same message twice in a row within 30 seconds. A refused message
just isn't sent, and no bits are spent. **Add a repeat number** (off
by default since 0.12.0, needs Cheer-ready) puts two rotating digits after the token
(`Cheer100 07`), so every copy is different and you can send the same art again
straight away. The digits print on the receipt, which is why it is off. With it off,
wait 30 seconds before sending the same thing again.

A stack that repeats itself (the same block twice, say) can produce two identical
parts in a row. With the repeat number off, the second of them says so on its part, so a
run doesn't quietly stop halfway.

### Hide the cheer gem (optional)

printer-bot turns your `Cheer100` into a small cheer gem plus "100" (and the repeat
digits, if you turned those on), and that takes a line of its own above your art.
**Hide the cheer gem in the corner** (off by default, needs Cheer-ready) wraps the
token in a box that printer-bot's own stylesheet pins to the receipt's top-right corner
and clips. The gem is squeezed into a tiny corner box, "100" (and any repeat digits)
are cut off, and with Giant type the line they used is saved for your art.
printer-bot's header still prints the bits and your name, and Twitch still sees, shows
and charges an ordinary cheer.

- It costs **48 of the 500 characters**, whatever the amount.
  The hint under the checkbox computes it. A cheer that starts with Giant type gets 4
  back. Any other block gets a line break in front of it instead, so a Hanzi grid still
  starts on a clean line.
- It was made for Giant type. With other blocks it hides the gem, but the line stays.
  The **Emote names** layout keeps that line on purpose: every emote line starts with a
  space (Twitch needs it), and right after the hidden gem that space would print and
  push the first row of emotes sideways, out of line with the rest.
- How sure: the corner box rode the one real cheer that printed giant letters, so chat
  and the sanitizer accept it. That it clips the gem into the corner is measured on
  printer-bot's print engine, not yet seen on paper. If printer-bot ever changes that
  style, the gem just prints normally and nothing else breaks.

One caveat: a channel's AutoMod or blocked-terms list can hold or drop a message
before it ever reaches chat. That's a per-channel moderation setting on Twitch's
side, entirely out of this tool's control, and no client-side change can work
around it. If a paste doesn't show up, check the channel's AutoMod settings
before assuming the tool is broken.

---

## Big Text formatting, and why the font matters more sideways

*This section is about the old **Type** render (straight or sideways), which the
sanitizer stopped from printing in September 2026. It is kept as a record, and for any
destination that still renders markup. **Giant type has no formatting row**: its weight
and font come from printer-bot's own style (bold Segoe UI on a Windows rig), so the
card hides the font, weight and I/U/S controls and says so.*

A **Text** block rendered as Big Text (straight or sideways) carries the same
formatting row as a takeover line: the nine-font select, a weight select, and
**I / U / S**. One set per block, since a Text block is a single run of type rather
than three slots. The row disappears when you switch the block to Hanzi: that
render is tiled glyphs, not type, and there is nothing to format.

- The weight select here has an extra **Default** entry the takeover card doesn't.
  It isn't the same as Normal: an unset weight resolves to the heavier baseline
  sideways Big Text has always rendered at, so "Default" is the only option that can
  state an untouched block's real state without lying about it. Picking it removes the
  weight rather than writing one.
- **A missing font shears letters off a sideways strip.** The app sizes the strip by
  measuring the text *in your browser*, and the printer draws it *on the streamer's
  machine*. If the font you picked isn't installed there, their machine substitutes
  another, the strip is the wrong length for the type that actually gets drawn, and
  the last letters run off the end. Default (Arial) is the safe pick for sideways, and
  the card says so when you choose anything else on a rotated block. Straight-on is
  not immune, only quieter. Big Text is sized from a browser measurement there too,
  and it is drawn into a fixed-width box that clips instead of wrapping, so a
  substituted wider face amputates glyphs at the paper edge instead of merely looking
  different. Measured on the printer's own engine: even after the ink-bound fit
  landed, an upright "L" in Script still inked 19.3px past the edge (see the
  changelog). The fit measures ink correctly. What is left over is that the browser
  measuring the line and the engine printing it resolve a generic family like
  `cursive` or `fantasy` to two different typefaces, so no measurement taken on one
  can size the other. (Script and Papyrus name real faces now, see below, which
  narrows that gap without closing it.)
- **No font in the menu is a bare generic that duplicates another entry any more, and
  that was a bug worth the name.** `Script` used to be plain `cursive` and `Fantasy`
  plain `fantasy`. A generic resolves on the *streamer's* machine, and the owner
  printed them: Script came out as Comic Sans MS and Fantasy came out as Impact, the
  standard Windows mappings, so both were duplicates of fonts already in the list and
  a nine-font menu was really seven. Neither could be caught from a Mac, which maps
  the same two generics somewhere else entirely. They now name a face that exists on
  Windows with the generic kept behind it as a fallback (`Segoe Script,cursive`,
  `Papyrus,fantasy`), so the entry can never be worse than the bare generic was, and
  the Fantasy slot is labelled Papyrus for the face it actually asks for. It costs
  characters: Script went from +22 to +35 and Papyrus from +22 to +30.
- More generally the preview can't settle this for you: it renders with *your* fonts
  and the tape comes out of *theirs*. Serif and Monospace are still generics. Windows
  maps them to Times New Roman and Courier New, and neither duplicates anything else
  in the list, but "something" is still chosen separately by your browser and by their
  printer, so those two are the likeliest to measure as one typeface and print as
  another. The named families are standard on Windows. One test print is the real answer.

---

## Takeover: make the tape your artwork, not a receipt

*A takeover is an SVG, and since printer-bot's sanitizer arrived (September 2026) it no
longer prints, because the sanitizer removes SVG. The block stays in the app, flagged,
in case that changes. This section is the record of how it worked.*

printer-bot draws its own header above your message: the avatar, a `<N> BITS` line,
and the cheerer's name. A **Takeover** block paints over it. The block is an opaque
panel lifted up with a negative margin, and your own lines (and optionally a picture)
sit where the header used to be. Anything below it in the stack still prints as normal
underneath.

- **Reach up (pt)** is the one thing that needs calibrating. The header is taller or
  shorter depending on the streamer's avatar, so 240pt is a starting point, not a
  constant: too little leaves a strip of the old header showing; too much lifts the
  block past the top of the paper, where the printer draws nothing. The picture goes
  first, because it sits highest. One print settles it. The preview clips at the
  paper edge, so anything that vanishes there won't print either.
  240 is not a guess: it is the value the owner settled on after looking at real prints
  from the rig this tool was written for.
- **The text gets its room first; a picture takes what is left.** Wind the pull down and
  the panel gets shorter than what is in it, so a picture is shrunk into whatever the
  lines have not claimed, and dropped outright once that falls under the ~120px it needs
  to print at all. Your lines survive. The picture is what gives way. A takeover that
  ends up with nothing left in it is not sent, rather than spending a cheer on a blank
  white slab.
- Pictures ride through the same **carrier tag** table as a normal image block, so they
  benefit from whatever tag currently survives chat.
- **You can put more than one picture up there.** They stack with the same gap the
  header uses, and each one has its own width, alignment and nudge, so two avatars side
  by side is an arrangement rather than a trick. It is not free: two pictures with the
  short minted links are ~441 characters before any text, so a fake donation's three
  lines will not fit beside them.
- **Every line has its own formatting row**, in both styles: a font select with nine
  choices (Default/Arial, Arial Black, Impact, Comic Sans MS, Georgia, Serif,
  Monospace, Script, Papyrus), a weight select (Normal / Bold / Black), and
  I / U / S toggles for italic, underline and strikethrough. Untouched, the three
  lines keep the original hand-built look (900/700/400 weight, only the third line
  italic), so an existing saved block sends byte-identical markup. The controls only
  add what you actually change.
  - **Formatting costs characters, and they come out of the same 500.** A font swap on
    one line is +21, an underline +28, both decorations together +41. On a fake cheer
    *with* a picture, which already sits at 491, that means one font swap is enough to
    get the message rejected (512). Without the picture you start at 357 and have room.
    The counter turns red before you send.
  - On the **Default (Arial)** font, Bold and Black print identically. Measured on
    the real engine: byte-for-byte identical rasters at both 24px and 58px. Both are
    clearly heavier than Normal, but they're one bold, not two. For a genuinely heavier
    look pick the **Arial Black** *font*, which is a different typeface rather than a
    synthesised weight.
- Budget: a three-line takeover is ~350 chars, and a takeover plus a full picture
  payload still fits one 100-bit cheer (458 of 500).

### An item list, and a seed for the usual arrangement

A takeover holds an ordered list of items: text or picture, any number, in any order.
Each carries its own font, size, formatting, alignment and nudge; the block carries one
anchor (top / centre / bottom) and the reach up calibration. There is no style selector
any more. The two old styles were both item lists, and having them be mutually exclusive
meant you could not have a fake cheer *and* your own lines.

**Seed fake donation** fills an empty takeover with the four-item arrangement
printer-bot's own header uses: picture on top, then the amount, then the name, then an
italic message. After seeding they are ordinary items, so you can edit them, reorder
them, delete them and add more around them. Type the amount in full: the app does not
append ` BITS` for you, because the same printer-bot runs on YouTube and Kick and
their headers say neither "BITS" nor anything like it. It's free text rather than a number,
so `-100000 BITS`, `$50.00`, `1,000 Kicks` and `∞` all work.

- The seed reproduces the hand-built payload this was reverse-engineered from: picture
  up top, then three lines sized 24/19/13, each with the formatting row described above.
  Those sizes are a starting point now rather than a rule; the items are yours to change.
  Formatting doesn't touch the picture's own sizing, which the print engine forced two
  corrections onto. The picture is reserved square (a profile picture is square, and the
  carrier tags state only a width, so reserving 1.4× left a slab of white under it), and
  it is at least 120 px: measured, a picture drawn shorter than that renders *nothing at
  all* inside the lifted overlay. The old 80 px default printed blank paper where the
  picture should be. A picture that can't clear the floor is dropped rather than sent as
  ~90 characters buying nothing.
- Text and picture are both **clamped into the painted panel**, and are laid out so they
  can never overlap. That ordering matters: the picture has to be emitted last (see the
  `foreignObject` note in the changelog), so it paints *over* the lines. Sizing it first
  once left `-100000 BITS` rendering with zero ink at ordinary slider positions.
- Over-pulling is safe. Reach past your rig's real header and the block follows the
  message down the tape instead of sailing off the top of the roll.
- **Budget, measured, and the margin is genuinely thin.** The three lines alone come to
  ~357 chars with the cheer wrapper. *With* a picture on an uploaded link it's 491 of
  500. That fits one 100-bit cheer, and a realistic name still fits: `IRS` gives 491,
  `shamu4life` gives 498. A very long name (`the_actual_streamer`, 507) still doesn't.
  Going over does not cost a second cheer. A takeover is one SVG and can't be split, so
  Twitch rejects the message and nothing prints at all. Watch the counter; it turns red
  before you send. **Upload for a 15-min link** on an Image block mints the shortest
  link there is.

### Continuation covers: why the second receipt used to look wrong

A takeover paints over printer-bot's header on the receipt it rides on, and no other.
So a stack too big for one cheer used to come off the tape as one piece of artwork
followed by a stack of ordinary receipts, each with the bot's header back on it. That
was the whole of "blocks after a takeover are broken".

Every part after the first now repaints the header with a plain continuation cover: the
same white box at the same reach, built by the same code as the takeover it continues,
so the two can't drift apart. It costs 106 characters per extra part, and there's a
stack-level toggle next to the bits control to spend them on content instead.

The characters are *reserved* rather than merely prepended, and that distinction is the
feature. Twitch rejects an over-length message rather than truncating it, so a cover
added without making room for it would push every later part over 500 and the tail of
your run would never send.

### Presets: a setup that survives the stream

**Presets** save the whole block stack under a name: save, load, rename, delete. Because
`localStorage` is per-browser and per-device, you can also **export the lot as JSON** and
paste it into another browser's Import box. A setup you can't move is one cache clear
from gone.

One caveat, designed for rather than ignored: an uploaded picture's link dies after 15
minutes. A preset that used one loads with that block flagged in red (*this picture's
link has expired, re-upload it*), because a message that sends, spends your bits and
prints blank paper is the worst thing this app can do. Only links this app minted are
checked; a pasted third-party URL has no such clock and is left alone.

The tape isn't a record of anything. Twitch's bits ledger is server-side, and the
cheer that triggers the print carries your real name in chat where the whole room sees
it. The paper is the gag; everyone watching knows it's lying, which is the joke.

---

## Carrier tags: how a real picture gets there, and what to do when it stops

*Since September 2026 none of these carriers can be sent: the sanitizer keeps only
`<img class="emote">` or `<img class="bits">`, and the channel's automod blocks `<img`
(see the banner at the top). The table below is the record from before that, and the
list to re-check if either filter ever changes. Glyph-art is the picture path now.*

Glyph art is just text, so nothing can really stop it. A **real picture** is
different: printer-bot drops the chat message into its page as markup, so the photo
rides on an HTML tag pointing at a URL. Which tag that is has turned into a moving
target. A channel's blocked-terms list took `<object` first, then `<image` (the
SVG form), then `<img` as well, and each block silently kills *every* picture the
tool makes.

So the tag is a setting, not a hardcode. Each **Carrier tag** on an Image block
builds the same picture out of a different token. The verdicts below were measured
first: every form rendered through the exact binary printer-bot ships (wkhtmltopdf
0.12.6 "with patched qt" = Qt 4.8.7 / WebKit 534.34), with its exact print flags.
Then they were field-tested, in a full probe round cheered at the real channel and
printed on the real machine. Where the two disagreed, the tape won.

| Carrier | Payload | What came off the tape |
|---|---|---|
| `embed tag` | ~45 chars + URL | **Default. Printed perfectly on the real machine.** Its one limitation is real but *known and detectable*: the URL must end in `.png`/`.jpg`/etc., because the engine picks its image renderer from the extension. Given a bare link it prints blank, so the app warns you before you send. |
| `input type=image` | ~45 chars + URL | **Needs no file extension**, so it's the fallback when a link has no `.png` on the end. Spells "image" as an attribute *value*, not a tag name. **But it printed too wide in the field and the bench can't reproduce why** (likely native form-control chrome on Windows), so it isn't the default until someone re-probes it on the real rig. |
| `iframe` | ~90 chars + URL | **Prints**, but a subframe gets no shrink-to-fit, so a picture bigger than the box is cropped and loses its right and bottom. Fine for a small picture; uploads (re-encoded up to 720px) will crop. |
| `img tag` | ~30 chars + URL | **Blocked (Aug 2026).** Shortest payload, and it renders fine on the engine. It just never reaches chat any more. |
| `SVG image` | ~120 chars + URL | **Blocked (Aug 2026).** Still renders correctly, so worth re-probing if a list is ever pruned. |
| `object tag` | ~60 chars + URL | **Blocked (earlier).** Same extension requirement as `embed`. |

**The default is whatever last printed correctly on the real machine**, not
whatever measures best on a bench. `embed` leads because it came off the tape
clean. `input` sits second despite being more forgiving about URLs, because it
printed too wide once and that hasn't been explained. A bench result never
overrides the tape.

**Everything live clamps to the paper.** The box the app asks for (263px = 70mm) is
wider than the receipt body actually is: printer-bot renders at `paperWidth - 8`mm
and its template sets `body { margin: 1em }`, leaving ~240px on an 80mm roll. That
overrun is what made a field print come out too wide. Every live carrier now carries
`max-width:100%`, so it adapts to the real width instead of betting on another
hardcoded number: narrower paper shrinks to fit, wider paper still gets the full width.

**Why there's no "CSS background" option**, even though a `<div>` wearing the photo
as its backdrop would be the one surface with no tag name to block: printer-bot's
print step passes `--no-background`, which drops every element background from the
print. Measured dead, twice over, since the `background:url(x) 0 0/100%` slash
shorthand is separately invalid in that WebKit vintage. Don't re-add it without
re-measuring.

When pictures stop printing, hit **Find what still sends** under the preview. It
builds the same picture with every carrier, one cheer each, labelled `A` through
`F`. Send them one at a time (a single blocked term kills the whole message, so they
can't share a cheer) and read the tape:

- **a letter with a picture under it** → that carrier works; pick it on the block
- **a letter on its own** → the message sent, but the printer ignored that tag
- **a letter that never shows up** → chat blocked it

Caveat: none of this is guaranteed, and it isn't a fix for moderation. A mod can
block the next tag the same afternoon. The durable answer is glyph-art: plain text
with no markup at all, so there's no tag to block. It's lower fidelity than the real
photo, and it always prints.

---

## How it works / first-print Census

This describes the glyph-art pipeline (Hanzi tiling and Image glyph-art). Giant type
skips steps 1 to 3: it sends your text as text, wrapped in nested titles, and the
printer draws the letters. See [Giant type](#giant-type-how-and-why-it-works).

1. **Rasterize.** Big Text mode draws your word(s) onto an off-screen `<canvas>`,
   scaled to fill the target width; Image mode draws your picked image onto a
   canvas at the sampled resolution. Either way you get a luminance grid.
2. **Quantize.** Each cell's luminance maps to a glyph using the active tier:
   the tone-ramp tiers (with a Threshold vs. Floyd-Steinberg dither toggle, plus
   contrast/invert) or the binary on/off tier. Big Text mode defaults to binary
   and Image mode defaults to the Blocks tone ramp, but the tier selector
   overrides either default. The Braille tier instead packs a finer 2×4 dot grid
   per cell.
3. **Render.** The grid flattens to a single newline-free string, wrapped in
   `white-space:pre` so runs of spaces can't collapse and shear the grid apart.
   That wrapper is what lets the ASCII tiers use a plain space as their lightest
   cell.
4. **Package.** If **Cheer-ready** is on, the payload is *prefixed* with
   `Cheer<N>` (plus a visible rotating two-digit repeat number, if you turned that on),
   leading so that it survives any trailing-strip and the message never starts with `<`. (With **Hide the cheer gem**
   on, a non-breaking space leads and the token sits in the corner box right after it,
   so the message still never starts with `<`.) A live character counter
   (budget: 500, Twitch's per-message cap, leaving headroom) turns red if you go
   over instead of silently truncating.
5. **Census.** The **Print test strip** button runs the same pipeline over a
   fixed diagnostic string instead of your input. That is the blind-first-print
   calibration described above. Its Giant type counterpart is the **Print size
   ruler**: one cheer, the numbers 1 to 13 at every size.

The glyph pipeline itself runs synchronously in the page. That is not the same as
"nothing is sent": pasting an image URL fetches it through our `/px` proxy, dragging
a brightness or contrast slider re-uploads a baked PNG, and the uploaders POST your file.
Big Text and a picture you pick from disk for glyph-art never leave the device. See
[Privacy](#privacy-what-stays-local-and-what-doesnt) for the honest version.

---

## Short image links (why the URL shape is a product decision)

Every character of an uploaded picture's URL is payload. It gets pasted into a
Twitch message with a hard 500-character cap, next to markup that's already most of
the budget, so the link's length decides whether a payload costs 100 bits or 200.

`POST /upload` mints `https://<host>/<12 hex>.png`, which is 39 characters on the
short image host `i.uwutoowo.com`. That host is what `vars.RW_IMG_HOST` points at and
what the Worker really serves. It was 45 on `receipt.uwutoowo.com` before that host
existed, and 67 as `/i/<32 hex>.png` before that. Those 28 characters were the whole
difference between a fake cheer fitting one cheer and needing two. The var falls back
to the request origin when unset, so previews and `wrangler dev` still work.

| what changed | why it's safe |
|---|---|
| key `32 hex` → `12 hex` | 48 bits against a **15-minute** TTL. Guessing one needs ~3×10¹¹ requests/second to expect a single hit. 128 bits was margin that was never load-bearing. |
| path `/i/<key>` → `/<key>` | Matched by shape (`^[0-9a-f]{8,64}` + optional image extension), so it can't shadow `/robots.txt`, `/llms.txt`, `/sitemap.xml` or the app itself. Tested. |
| `.png` suffix kept | Load-bearing twice: `embed`/`object` pick their renderer from the extension, and wkhtmltopdf escalates a failed subresource with an *unknown* extension to a fatal error: exit 1, whole print job dead. Since these links expire in 15 minutes, cheering a stale one is the ordinary case. |

Links minted in either older shape still resolve, so nothing breaks mid-cheer.

**A shorter image host buys 6 more characters.** Point a hostname at this Worker
(`i.uwutoowo.com/*`) and set the `RW_IMG_HOST` var; `/upload` then mints 39-character
links. It's unset by default and falls back to whatever origin served the request, so
preview deployments and `wrangler dev` keep working. **Only set it once that host
actually routes here**, since a link to a host that doesn't resolve prints a blank
space where the picture should be.

---

## Privacy: what stays local, and what doesn't

Earlier versions of this file claimed the app makes no network calls at all. That
is no longer true, and the honest breakdown matters more than the slogan:

**Stays on your device:**

- **Big Text** in every style, Giant type included. Nothing is sent. The Emote layout's
  preview draws a labelled box for each emote and never downloads the emote.
- **A picture you pick from disk for glyph-art**, decoded locally in a canvas.
- No analytics, no accounts, no third parties. Every request below goes to this
  project's own Cloudflare Worker and nowhere else.

**Goes to the Worker:**

| what you do | what happens |
|---|---|
| Click **Upload** (Image block or Takeover card) | The file is shrunk to a PNG and `POST`ed to `/upload`, stored in Cloudflare KV, and auto-deleted after **15 minutes**. |
| **Paste an image URL** into a glyph-art block | That URL is fetched through `/px` so the browser can read its pixels, because a canvas can't read cross-origin bytes directly. |
| **Drag brightness / contrast**, or rotate a real picture | The image is re-fetched through `/px`, baked on a canvas, and re-uploaded. |
| Turn on **Thermal preview** with a pasted URL | Same `/px` fetch, to inline the picture so the preview can dither it. |

Two of those fire without a dedicated button (typing a URL, and dragging a slider),
so "I never clicked upload" is not the same as "nothing left the device".

**Storage:** four `localStorage` keys, all wrapped in `try/catch` so locked-down
contexts still work: control settings (`rw_controls_v1`, which also holds the "Hide the
cheer gem" and "Add a repeat number" choices), the repeat-number counter (`rw_nonce_seq`,
which only moves while that option is on), your block stack (`rw_blocks_v1`) and your
saved presets (`rw_presets_v1`).

The app is still one auditable file, and it still runs offline if you only use Big
Text and locally-picked pictures.

---

## Self-hosting

The repo is wired up for **Cloudflare Workers** (Workers Builds). There is a
Worker script, [`src/worker.js`](src/worker.js), which serves `public/` as
[static assets](https://developers.cloudflare.com/workers/static-assets/) *and*
handles `POST /upload`, the image-serving routes, and the `/px` image proxy. The
config is [`wrangler.jsonc`](wrangler.jsonc):

```jsonc
{
  "name": "receipt-wrecker",
  "main": "src/worker.js",
  "routes": [
    { "pattern": "receipt.uwutoowo.com", "custom_domain": true },
    { "pattern": "i.uwutoowo.com",       "custom_domain": true }
  ],
  "vars": { "RW_IMG_HOST": "i.uwutoowo.com" },
  "assets": { "directory": "./public", "binding": "ASSETS" },
  "kv_namespaces": [{ "binding": "RW_IMG", "id": "…" }]
}
```

**Both domains must stay in `routes`.** Once routes live in config, config is the
source of truth for them, and listing only one invites a deploy to reconcile the route
set and drop the other. `RW_IMG_HOST` is what makes uploaded links 39 characters
instead of 45. It falls back to the request origin when unset, so leave it out until
that host actually answers, or every picture prints blank.

Local development and deployment:

```sh
npx wrangler dev      # local preview of public/ with live reload
npx wrangler deploy   # publish to production
```

The production deploy target for this project is **`receipt.uwutoowo.com`**
(configured as a custom domain/route for the Worker in the Cloudflare dashboard or
`wrangler.jsonc` `routes`, which is a deploy step and not something `npm test`
exercises).

You can host `public/` on any static host (GitHub Pages, Netlify, S3, your own
server) or just open the file. **The glyph and markup generators are entirely
client-side and work with no backend at all.** You only lose the optional extras the
Worker provides: uploading a file to get a short link, pasting a *cross-origin*
image URL for glyph-art, and the image adjustment bake.

---

## Project layout

| Path | Role |
|---|---|
| [`public/`](public) | **The deployed site.** Cloudflare serves *only* this directory. |
| [`public/index.html`](public/index.html) | **The entire app.** Inline CSS + vanilla JS, no assets. |
| [`src/worker.js`](src/worker.js) | The Cloudflare Worker: serves `public/`, plus `/upload`, the short image links and the `/px` proxy. |
| [`wrangler.jsonc`](wrangler.jsonc) | Cloudflare Workers config (serves `public/`). |
| [`test/`](test) | Node `node:test` suite. Extracts the inline script and unit-tests the pure glyph engine. |
| [`test-browser/`](test-browser) | Playwright tests that drive the real page in headless Chromium (`npm run test:browser`). |
| [`tools/`](tools) | The print bench, for contributors: see [below](#the-print-bench-for-contributors). Dev-only, never shipped. |
| [`docs/`](docs) | The changelog and the design specs each feature was built from. |
| [`README.md`](README.md) | This file. |
| [`CLAUDE.md`](CLAUDE.md) | Guidance for AI assistants and contributors. |
| [`LICENSE`](LICENSE) | MIT. |

**Tech facts:** pure static; one HTML file with inline CSS and a single vanilla-JS
IIFE (`"use strict"`). No build step, no framework, no dependencies, no external
resources: system font stacks only, with no web fonts, no CDN and no external images.
Browser APIs used: Canvas 2D (rasterizing text/images), Clipboard (with
`execCommand` fallback), and `localStorage` (the four keys listed under
[Privacy](#privacy-what-stays-local-and-what-doesnt)). The only network calls go to
this project's own Worker, and only for the picture flows described there.

### The print bench (for contributors)

"Does it print?" is answered by measuring, not by arguing, and the tools for it live in
[`tools/`](tools). They are dev-only: nothing here ships, and nothing of nutty's, and no
font, is ever committed. Everything they fetch or render goes to the gitignored
`.render/` folder.

- **`tools/payload.mjs`** builds a payload with the app's own code, so the bench measures
  what the app really sends rather than markup someone typed by hand.
- **`tools/printerbot.mjs`** (`npm run printerbot`, new in 0.10.0) builds the *exact* page
  printer-bot would print for a chat message. It fetches printer-bot's live settings page
  and the stylesheets and sanitizer it uses, caches them with a checksum and the time
  they were fetched, runs printer-bot's real sanitizer, and repeats its emote and cheer
  steps. `--png FILE` renders the result on the real engine through `rig.py`, and
  `--check` compares the class rules Giant type relies on against the live stylesheet:
  run it before a release. `--ref SHA|BRANCH` reads printer-bot's files from
  [the repository](https://github.com/nuttylmao/nutty.gg) at one commit instead of the
  live site and records which, so a measurement can be re-run on exactly the
  stylesheet it was taken on. It replays commits from `121c351` (27 Aug 2026, the
  sanitizer) onward; earlier ones are refused, because it runs printer-bot's own
  sanitizer. It needs
  Playwright's Chromium (`npx playwright install chromium`) and the network, or a cache
  from an earlier run (`--offline`).
- **`tools/rig.py`** (`npm run render`) renders a page with the same print engine and
  settings printer-bot uses (wkhtmltopdf 0.12.6 with patched Qt) and reports how much ink
  landed where, how many pages it took, which stylesheet it used, and which fonts were
  embedded. `--document` renders a complete page from `printerbot.mjs` untouched.
  `--fonts DIR` points it at **your own** copy of Segoe UI, the font the real rig prints
  in. Without it the numbers are for a substitute font and can differ by a whole page.
- **`tools/calibrate.py`** (`python3 tools/calibrate.py`) builds the one-print test for
  how the printer turns grey into dots.

```sh
node tools/payload.mjs '{"kind":"giant","text":"HELLO"}' \
  | node tools/printerbot.mjs --out - \
  | python3 tools/rig.py hello --document - --fonts ~/my-segoe-ui
```

The details (every flag, what the bench can and can't see, and the measurements it has
settled) are in [CLAUDE.md](CLAUDE.md), under "Measuring against the real engine".

---

## Contributing

The whole app is **[`public/index.html`](public/index.html)**. Edit that one file
and reload the browser. There is no build step and nothing to install beyond the
`wrangler` devDependency used for local preview and the deploy dry-run.

A few house rules keep the project what it is (see also [CLAUDE.md](CLAUDE.md)):

- **Stay single-file.** Keep CSS and JS inline; don't add dependencies, bundlers, or
  external resources.
- **No new network calls.** The app's `fetch` stays limited to our own `/upload`
  and `/px`, and there is no storage beyond the four documented `localStorage` keys.
- **Match the idiom:** vanilla JS, IIFE-wrapped, `"use strict"`, ES5-ish style.
- **Branch + PR.** Develop on a feature branch and open a PR. Avoid pushing
  straight to `main`, which deploys to production.

Run the tests before sending a change:

```sh
npm test                       # Node's built-in test runner; zero deps to install
npm run test:browser           # the real page in headless Chromium (npx playwright install chromium, once)
npx wrangler deploy --dry-run  # validates config + assets
```

Before a release, also run `npm run printerbot -- --check`. It compares the printer-bot
styles Giant type borrows against the live stylesheet. It needs the network, so it is a
checklist step, not part of CI.

---

## Support

Receipt Wrecker is free, open source, and has no ads or tracking. If it saves you
some time, you can say thanks:

[**☕ Buy me a coffee →**](https://www.buymeacoffee.com/shamu4life)

(There's also a **Sponsor** button at the top of the repo, wired to the same page.)

---

## License

Released under the [MIT License](LICENSE).
