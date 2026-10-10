# Receipt Wrecker

**Big text, sideways text and pictures for a streamer's receipt printer, sent as a Twitch
cheer.** You type words or pick a picture; Receipt Wrecker builds the chat message that
prints it as big as the paper allows on a printer driven by
[SassyTP's printer-bot](https://github.com/SassyTP/printer-bot).

**Try it live: [receipt.uwutoowo.com](https://receipt.uwutoowo.com/)**

[![CI](https://img.shields.io/github/actions/workflow/status/shamu4life/receipt-wrecker/ci.yml?label=CI)](https://github.com/shamu4life/receipt-wrecker/actions/workflows/ci.yml)
[![Version 1.0.0](https://img.shields.io/badge/version-1.0.0-blue)](docs/CHANGELOG.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Single file](https://img.shields.io/badge/source-one%20HTML%20file-success)
![Zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)
![No build step](https://img.shields.io/badge/build-none-success)
![Vanilla JS](https://img.shields.io/badge/vanilla-JS-f7df1e)

Receipt Wrecker is a single HTML file with no dependencies. You build a stack of blocks
(text and pictures), it packs them into as few chat messages as it can, and you paste each
one into Twitch chat as a cheer. The preview shows each message drawn by the bot's own
receipt code.

> **1.0.0 (2026-10-10): rebuilt for SassyTP's printer-bot.** Earlier versions targeted a
> different printer bot (nutty.gg's). Everything made for that one is gone, and saved work
> is converted when you open the app. See the [changelog](docs/CHANGELOG.md).

---

## Quick start

1. Open **[receipt.uwutoowo.com](https://receipt.uwutoowo.com/)** (or download
   [`public/index.html`](public/index.html) and open it; that file is the whole app).
2. Under **The streamer's printer-bot settings**, enter what the streamer uses, or leave
   SassyTP's defaults (80 mm paper, High Roller threshold 25).
3. Type into the **Text** block. It starts as Big text with `HELLO`.
4. Press **Copy** on each part and paste it into the **official Twitch web or mobile
   chat** as a cheer. Only the first-party client actually cheers. (If the browser won't let
   the app copy, as in some in-app browsers, the button doesn't say Copied: the part shows its
   text, selected, to copy by hand.)

New to a streamer's printer? Send the two one-cheer tests first (see
[Test cheaply first](#test-cheaply-first)).

---

## Two kinds of cheer: High Roller and plain

SassyTP's printer-bot draws every cheer on a receipt page in Edge, takes a screenshot and
prints it. What it does with your message depends on the cheer's size:

- **High Roller**: a cheer of at least the streamer's **High Roller threshold** (25 bits by
  default). The bot reads the message as HTML, keeps the styling its safety filter allows,
  and prints it. Big text, sideways text and glyph-art all need this.
- **Plain**: any smaller cheer. The bot prints the message as small text inside quote marks,
  tags and all.

Receipt Wrecker builds for whichever one your cheer will get. Below the threshold every
block prints in its **plain form**, Han tiling (your words or picture drawn out of Han
characters, as plain text), and a notice above the preview says why and how to change it.
A streamer can also set the threshold to 0, which turns High Roller off: then every cheer
prints plain.

## The streamer's settings, and why the app asks

A viewer can't see these from chat. Ask the streamer, or leave the defaults (SassyTP's own).

| Setting | Default | Why it matters |
|---|---|---|
| **Paper width** | 80 mm | The printable width is 244 px on 80 mm paper and 153 px on 58 mm. Something sized for 80 mm is cut off on 58 mm. |
| **High Roller threshold** | 25 bits | Decides whether your cheer prints styled (High Roller) or as plain text. 0 = High Roller off. |
| **Bits per inch** | 0 (off) | When set, a High Roller cheer gets one inch of tape per that many bits, and the bot fades out the rest. |
| **Maximum length** | 0 (off) | When set (up to 40 inches), it caps how long a High Roller message prints. |

With both length settings at 0, a message gets the bot's 1600 px box, about 42 cm, and
anything taller is cut off with no warning. The app splits a tall stack into more cheers so
nothing is cut, and says when a single piece can't fit.

**Bits per cheer** (any whole number from 1) is yours to choose. Each part of a run is a
separate cheer, so a run costs bits × parts; the total is shown under the preview.

---

## Text

A Text block has three renders. Every Layout and Size option in the card is labelled with
what it would print for your text (capital letters' height in cm, how long the message is in
cm, how many cheers), so you can compare before you pick. The message's length leaves out the
bot's header and footer; the line under each part's preview gives the whole receipt.

### Big text (High Roller)

Your words in bold Arial, as big as the paper allows. `HELLO` with Layout set to Lines:

```text
Cheer100 <div style="font:700 70px/.8 Arial">HELLO</div>
```

- **Layout**: *Auto* (the biggest in one cheer of: your lines as typed, the same lines with
  the words wrapped to the paper, and one letter per line), *Lines as you typed them*, *Words
  wrapped to the paper*, *Stack the letters, one per line* (much bigger letters for short
  words), or *Each line its own size* (every line as wide as the paper). A sentence typed on
  one line comes out wrapped, every word whole; to choose the line breaks yourself, press
  Enter between words and pick Lines. Auto goes for the biggest letters even when a stack
  takes far more tape than the wrapped words: the labels show both, and *Words wrapped* is one
  pick away.
- **Size**: *Auto* (the biggest that fits one cheer, the default), *Fill the paper's width*
  (may cost more cheers) or a fixed size from 20 to 400 px. In *Each line its own size* a
  fixed size is a cap ("up to 400 px"), and its label gives the capitals each line really
  gets. When a stacked word is too tall for one receipt at the size picked, it breaks across
  cheers with the bot's header in between, and the card names the word.
- **Upside down** turns the letters round, so the tape reads the right way up when it is
  turned over.

`HELLO` on Auto prints stacked, one letter per line, with capitals about 5.9 cm tall on 80 mm
paper:

```text
Cheer100 <div style="font:700 310px/.8 Arial">H<br>E<br>L<br>L<br>O</div>
```

Each line its own size:

```text
Cheer100 <div style="font:700 69px/.8 Arial">HAPPY</div><div style="font:700 46px/.8 Arial">BIRTHDAY</div><div style="font:700 108px/.8 Arial">SAM</div>
```

The font is fixed: the streamer's Windows has Arial, so the sizes in the app are the sizes on
the tape. Emoji are allowed and print as grey dots (the printer has no colour). Invisible
characters from copy-paste (zero-width spaces and the like) are left out, and the card says
so.

### Sideways text (High Roller)

Your words running down the tape, as big as the paper's width allows. Each line you type
becomes a column across the paper:

```text
Cheer100 <div style="writing-mode:vertical-rl;text-orientation:sideways;font:700 150px/.8 Arial;white-space:nowrap;margin:auto">HAPPY<br>BIRTHDAY</div>
```

**How to read it.** *Top to bottom* (the default): turn the receipt **anticlockwise** (a
quarter turn to the left) and it reads left to right, line 1 on top. *Bottom to top*: turn it
**clockwise**.

The letters sit in the middle of the paper. Capitals are centred as they are; lowercase and
punctuation with tails take more line height and would sit toward the side their tails point
to, so the app moves the block back by that much (`position:relative;left:…px`). Nothing is cut
off.

Each line you type is one column, and it never wraps: a sentence on one line prints as one
thin column. When that makes the capitals small, the card says to press Enter between words:
more columns with fewer words each print bigger.

Bottom to top uses `writing-mode: sideways-lr`, which needs Edge 132 or newer on the
streamer's PC. If UP lies flat on the [High Roller test](#test-cheaply-first), their Edge is
older: use Top to bottom. (On an old Edge, Top to bottom's form turned with `rotate:180deg`
would look the same; the app doesn't build that, because the bot runs on a current Edge.)

### Han tiling (plain text, any cheer)

Your words drawn sideways out of Han characters, with no markup at all, so it prints the
same whatever the cheer size. It is also what every Text block prints as below the
threshold. Read it like sideways text: turn the receipt anticlockwise.

```text
丶丶丶丶丶丶丶丶丶丶丶丶丶丶丶魚龜龜龜龜龜龜龜龜龜龜龜高丶丶鹿鬱鬱鬱鬱鬱鬱鬱鬱鬱鬱鬱鳥丶丶二三三三三面鬱黑三三三三二丶丶丶丶丶丶丶具鬱黑丶丶丶丶丶丶丶丶丶丶丶丶具鬱黑丶丶丶丶丶丶丶丶丶丶丶丶具鬱黑丶丶丶丶丶丶丶馬龍龍龍龍鑫鬱麤龍龍龍龍高丶丶鹿鬱鬱鬱鬱鬱鬱鬱鬱鬱鬱鬱鳥丶丶三十十十十十十十十十十十三丶丶三十十十十十十十十十十十三丶丶鹿鬱鬱鬱鬱鬱鬱鬱鬱鬱鬱鬱鳥丶丶高齒齒齒齒齒齒齒齒齒齒齒鬼丶 Cheer24
```

That is `HI` as a 24-bit cheer (below a threshold of 25). The bot prints plain text 15 Han
characters to a line on 80 mm paper (9 on 58 mm), so the app makes every row exactly that
long, starts with a light header row (so the opening quote mark gets a line of its own) and
puts the `Cheer24` word at the **end**. Each plain part is its own cheer. Stroke weight is
Bold or Regular. Han tiling needs a CJK font on the streamer's PC; Windows has one.

---

## Pictures

An Image block takes a picture from a link or a file.

### Glyph-art (High Roller)

The picture as a grid of characters. Pick the characters:

- **Han characters** (default): a square grid of 12 to 30 columns, light 丶 to dark 鬱. Every
  cell is the same width in any CJK font, so rows line up on both paper widths.

  ```text
  Cheer100 <div style=font-size:6.72vw;line-height:1>丶丶丶丶丶丶丶丶丶丶丶丶<br>丶丶丶丶丶丶丶丶丶丶丶丶<br>丶丶三青直二二直青三丶丶<br>丶二龍鬱鬱齒齒鬱鬱龍二丶<br>丶車鬱鬱鬱鬱鬱鬱鬱鬱車丶<br>丶車鬱鬱鬱鬱鬱鬱鬱鬱車丶<br>丶三麤鬱鬱鬱鬱鬱鬱麤三丶<br>丶丶鬼鬱鬱鬱鬱鬱鬱鬼丶丶<br>丶丶二鼎鬱鬱鬱鬱鼠丿丶丶<br>丶丶丶二麥鬱鬱麥二丶丶丶<br>丶丶丶丶丶革革丶丶丶丶丶<br>丶丶丶丶丶丶丶丶丶丶丶丶</div>
  ```

- **ASCII letters**, **ASCII full detail** and **Blocks ░▒▓█**: rows in Courier New, 8 to 48
  columns. Light areas are spaces, and they keep their width.

  ```text
  Cheer100 <pre style="font:8.74vw/1.2 'Courier New';margin:0">    cnaweanc    <br>  x0BB88B8BB0x  <br> eB8eoq88qoe8Be <br>cBB80w88B8w08BBc<br>cW8mw8B8888wm8Wc<br> aB8xxemmexx8Be <br>  x0B0weew8B0x  <br>    cneeeenc    </pre>
  ```

- **Braille**: 2 × 4 dots per character, the finest detail. Nobody has measured the font the
  streamer's PC uses for Braille on this bot yet, so send one cheer to check it before a
  bigger run.

The Han and Courier New grids size their font in `vw` (a share of the receipt's width), so
the same message fits 80 mm and 58 mm paper. Braille is sized in px for the paper width you
picked, so a Braille message made for 80 mm is too wide for 58 mm. Detail (columns), Rotate,
Contrast, Dither and Invert are on the card. Rows that don't fit one message carry on in the
next cheer, spread evenly over the cheers they need. If the streamer's bits per inch leaves a
cheer less room than one row, the card says the bot cuts every part, and to raise Detail
(smaller rows) or Bits per cheer.

### Below the threshold

In a plain cheer the bot prints text, so a Glyph-art block prints as a plain grid of Han
characters (13 a row on 80 mm, with a light column each side) whatever characters you picked,
and the card says so.

### Real picture: can't print on this bot

SassyTP's bot only prints pictures from emote servers, and this channel's chat filter blocks
the picture tag, so an upload can't print as a picture. The Real picture kind is still there
(you can upload, see, rotate and adjust a picture), but it sends nothing, and its card offers
**Switch to Glyph-art**, which prints it as characters.

---

## The preview

Each part is drawn by **SassyTP's printer-bot renderer** (MIT): the receipt page the bot
itself prints from, built into this app and run in a locked-down frame with no network
access. It is not an imitation of the receipt. Whether a cheer prints High Roller or plain,
where the bot's box cuts it off and any fade come from the bot's own code. The Twitch logo in
the footer is a grey box here.

Under each part, the preview says how long the receipt is (plus about 4.8 cm on 80 mm, 4.0 cm
on 58 mm, when the bot finds the viewer's profile picture: the preview never asks for it),
whether the bot cuts it (and why), and whether the bot's safety filter would take anything out
(it shouldn't, for anything this app builds).

A long stack can be 80 parts or more. Each part's preview is drawn when it scrolls near the
screen, one at a time, so the page stays quick; Copy and each part's notes are there at once.

**Thermal preview** shows the receipt the way the printer gets it: the bot's page at the
printer's dot width (576 dots on 80 mm, 384 on 58 mm), turned to black and white with the
same dither the bot uses. Pick the one the streamer's dock is set to: **Detailed** (the
bot's default), **Soft** or **Crisp**. It is what the printer gets, give or take fonts and a
dot or two: this computer's fonts may differ from the streamer's, and the header and some big
or sideways lines land a dot or two off where the bot puts them. Small character grids on
58 mm, and Braille, are the exception: their thin strokes and texture can come out
differently there than on the print (in Crisp a stroke can vanish in the thermal view and
still print), so judge those with the thermal view off.

---

## Sending it

- **Cheer-ready** (on by default) adds `Cheer<bits>` to each message so it triggers the
  print: at the start of a High Roller message, at the end of a plain part. Turn Cheer-ready off for a
  [free test](#test-cheaply-first).
- **Add a repeat number** (off by default) puts two rotating digits after the cheer word
  (`Cheer100 07`). Twitch won't send the same message twice in a row within 30 seconds (it
  just isn't sent, and no bits are spent); the digits make each copy different. They also
  print, which is why this is off. If two parts in a row are identical, the second one says
  so: wait 30 seconds, or turn the digits on.
- **Too much for one cheer** tapes into more. Each part is a separate cheer (500 characters
  at most, Twitch's limit), and the bot prints its header between them. Paste them in order.
- Every block's card says what it prints and which part it ends up in. Each part's header
  counts its characters ("230 / 500 characters").
- If the streamer's length settings leave a cheer no room after its Cheer line, every part
  says it would print nothing else, its Copy is off, and the line under the parts says what to
  change.

## Test cheaply first

- **Free chat test.** Turn Cheer-ready off and send the message. A message with no cheer
  never reaches the printer, but it does go through the channel's chat filter, so you learn
  whether chat lets this kind of message through before you spend bits. If chat holds it,
  see below.
- **High Roller test** (one cheer at exactly the threshold). If BIG prints big, High Roller
  is on at that amount. It also checks that MMMMM keeps its right edge, that "jog" keeps its
  tails, that the second BIG is upside down and that UP runs up the tape. If it all prints
  small inside quote marks, the threshold is higher than you entered.
- **Plain test** (one cheer, one bit under the threshold). It should print small, inside quote
  marks: a light first line, HI in Han characters, a row of tones, then the cheer word. Every
  line should hold 15 characters on 80 mm (9 on 58 mm), with the edges of HI lined up.

Pressing either test scrolls to it and puts the keyboard on its Copy button; **Back to my
stack** does the same for your stack.

## Held or blocked by chat?

That is the channel's moderation saying no, so don't rework the message to get it past: no
respacing, no swapped tags, no look-alike characters. If a channel blocks the big-text
markup, Han tiling, which is plain text, is the fallback. If chat held the message for its
words, don't send those words again in another form, Han tiling included: that is the
moderators saying no to the words. On the channel this was built for,
the chat filter blocks the picture tag (checked again on 2026-10-10), which is why pictures
print only as glyph-art.

---

## Presets, and work saved by older versions

**Presets** save the whole block stack under a name, in this browser. **Export JSON** copies
every preset out, to move it to another browser or keep it safe; **Import JSON** brings it
back, and never replaces anything: a setup whose name is already taken (or repeated in the
file) is added with a number after its name, and the note says which. Saving under a name that
is already taken asks before replacing it, and so does **Load** when the blocks on screen are
not saved in any preset. An uploaded picture's link dies after 15 minutes, so a preset that
used one loads with that block flagged: pick the file again or paste a fresh link. A glyph-art
picture picked from a file is read in the browser and never uploaded, so neither a preset nor
a reload keeps it: the block asks for the file again.

Work saved by an older version is converted the first time you open 1.0.0:

- a Takeover or Fake cheer becomes ordinary blocks: each line a Big text block, each picture
  a Glyph-art block;
- old Giant type and Type blocks become Big text or Sideways text (the nearest match:
  upside-down text stays upside down, sideways stays sideways);
- emote names print as words, and the old fonts and italics are gone (big text is always
  bold Arial);
- the stack as it was is saved once, as a preset called **Before 1.0.0**, so nothing is lost.
  Your own presets are never overwritten. A preset is converted when you load it; the stored
  copy stays as it was, and **Export JSON** keeps it that way. A note above the blocks says
  all this once.

---

## Privacy: what stays local, and what doesn't

**Stays on your device:** text in every mode; a picture you pick from disk for glyph-art
(decoded in the browser); your settings, block stack and presets (in `localStorage`). The
preview runs with no network access at all. No analytics, no accounts, no third parties.

**Goes to this project's own Worker** (and nowhere else):

| What you do | What happens |
|---|---|
| Paste a picture link into an Image block | The picture is fetched through `/px`, because a browser can't read another site's pixels directly. |
| Pick a file on a **Real picture** card | It is shrunk to a PNG and uploaded to `/upload`, kept in Cloudflare KV and deleted after **15 minutes**. |
| Rotate or adjust brightness/contrast on a Real picture card | The picture is re-fetched through `/px`, adjusted and re-uploaded. |

Pasting a link and dragging a slider send data without a separate button, so "I never clicked
upload" is not the same as "nothing left the device".

Storage is four `localStorage` keys, all optional: `rw_controls_v1` (settings),
`rw_nonce_seq` (the repeat-number counter), `rw_blocks_v1` (your stack) and `rw_presets_v1`
(presets).

---

## Self-hosting

The repo is set up for **Cloudflare Workers**. [`src/worker.js`](src/worker.js) serves
`public/` as [static assets](https://developers.cloudflare.com/workers/static-assets/) and
handles `POST /upload`, the image links and the `/px` proxy. The config is
[`wrangler.jsonc`](wrangler.jsonc): two custom domains in `routes` (both must stay listed),
an `RW_IMG_HOST` var (a short host for upload links; leave it out until that host answers)
and the `RW_IMG` KV namespace. A fork needs its own KV namespace and domains, or none.

```sh
npx wrangler dev      # local preview with the Worker
npx wrangler deploy   # publish
```

`public/` also works on any static host, or opened straight from disk. Without the Worker you
lose only the picture-link fetch, uploads and the adjustment bake; text and pictures picked
from disk work fully.

---

## Project layout

| Path | Role |
|---|---|
| [`public/index.html`](public/index.html) | **The entire app**: inline CSS and one vanilla-JS script, plus SassyTP's receipt page (MIT) kept as inert text for the preview. |
| [`public/`](public) | The deployed site (also `llms.txt`, `robots.txt`, `sitemap.xml`). |
| [`src/worker.js`](src/worker.js), [`wrangler.jsonc`](wrangler.jsonc) | The Worker and its config. |
| [`test/`](test) | Unit tests (`npm test`, Node's built-in runner, nothing to install). |
| [`test-browser/`](test-browser) | Browser tests of the real page (`npm run test:browser`). |
| [`tools/`](tools) | The bench, for contributors. Dev-only, never shipped. |
| [`docs/CHANGELOG.md`](docs/CHANGELOG.md) | Release notes. |
| [`CLAUDE.md`](CLAUDE.md) | The detailed guide to the code, the target and the rules. |

### The bench (for contributors)

"Does it print?" is answered by measuring:

- **`tools/forkbench.mjs`** (`npm run bench`) renders a message through SassyTP's real
  receipt page (pinned to one commit, fetched and checked by sha256, cached in the ignored
  `.render/` folder) in Playwright's Chromium, at 80 or 58 mm, and writes the screenshot, the
  1-bit dithered version and a JSON report.
- **`tools/payload.mjs`** builds a message with the app's own code, so the bench measures what
  the app really sends.
- **`tools/vendor-renderer.mjs`** updates (or `--check`s) the copy of SassyTP's receipt page
  inside `public/index.html` when SassyTP ships a new version.

```sh
node tools/payload.mjs '{"kind":"big","text":"HELLO"}' \
  | node tools/forkbench.mjs --paper 80 --bits 100 --threshold 25
```

The bench needs Playwright's Chromium (`npx playwright install chromium`). It can't see the
streamer's fonts, Edge version, settings or theme, or the channel's chat filter: that is what
the two test cheers are for. Details are in [CLAUDE.md](CLAUDE.md).

---

## Contributing

The whole app is [`public/index.html`](public/index.html). Edit it and reload. See
[CONTRIBUTING](.github/CONTRIBUTING.md) and [CLAUDE.md](CLAUDE.md); in short: stay
single-file, add no dependencies or network calls, keep to the four storage keys, escape
everything a user types, and develop on a branch (a push to `main` deploys to production).

```sh
npm test                       # unit tests, nothing to install
npm run test:browser           # the real page in headless Chromium
npx wrangler deploy --dry-run  # validates config and assets
```

---

## Support

Receipt Wrecker is free, open source, and has no ads or tracking. If it saves you some time,
you can say thanks: [**Buy me a coffee**](https://www.buymeacoffee.com/shamu4life). (The
**Sponsor** button at the top of the repo goes to the same page.)

## License

Released under the [MIT License](LICENSE). The preview's receipt page is SassyTP's
printer-bot renderer, Copyright (c) 2026 SassyTP, also MIT; its notice is kept in
`public/index.html`.
