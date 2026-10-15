# Receipt Wrecker

**Big text, sideways text and pictures for a streamer's receipt printer, sent as a Twitch
cheer.** You type words or pick a picture; Receipt Wrecker builds the chat message that
prints it as big as the paper allows on a printer driven by
[SassyTP's printer-bot](https://github.com/SassyTP/printer-bot).

**Try it live: [receipt.uwutoowo.com](https://receipt.uwutoowo.com/)**

[![CI](https://img.shields.io/github/actions/workflow/status/shamu4life/receipt-wrecker/ci.yml?label=CI)](https://github.com/shamu4life/receipt-wrecker/actions/workflows/ci.yml)
[![Version 1.7.0](https://img.shields.io/badge/version-1.7.0-blue)](docs/CHANGELOG.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Single file](https://img.shields.io/badge/source-one%20HTML%20file-success)
![Zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)
![No build step](https://img.shields.io/badge/build-none-success)
![Vanilla JS](https://img.shields.io/badge/vanilla-JS-f7df1e)

Receipt Wrecker is a single HTML file with no dependencies. You build a stack of blocks
(text and pictures), it packs them into as few chat messages as it can, and you paste each
one into Twitch chat as a cheer. The preview shows each message drawn by the bot's own
receipt code: the newest Printer Bot release, 3.0.1. A streamer still on 3.0.0-beta.7 or
beta.6, or on Printer Bot 2.5.4, prints these messages the same on a receipt printer (2.5.4 draws
a smaller profile picture).

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
block prints in its **plain form**, as plain text: Big text and Sideways text as Han tiling
(your words drawn out of Han characters), a picture as a grid of Han characters, and Han text
as typed as itself. A notice above the preview says why and how to change it.
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
| **Allow High Roller prints** (Printer Bot 3.0) | on | Printer Bot 3.0 has this switch for each printer. Off, that printer prints every cheer as plain text, however many bits, so every block prints in its plain form. Printer Bot 2.5 has no such switch: leave it on. With a Letter printer, this is the roll printer's switch. |
| **Pictures from links** (Printer Bot 3.0) | none | The image sites the streamer switched on in the dock. See [Real picture](#real-picture-from-an-imgur-catbox-or-imgbb-link-since-150). |
| **A Letter printer** (Printer Bot 3.0) | none (0) | The bits a second printer's rule starts at, for a streamer who prints big cheers on Letter paper, with that printer's layout, image fit and print profile. See [Letter paper and colour](#letter-paper-and-colour-since-160). |

With both length settings at 0, a message gets the bot's 1600 px box, about 42 cm, and
anything taller is cut off with no warning. The app splits a tall stack into more cheers so
nothing is cut, and says when a single piece can't fit.

**Bits per cheer** (any whole number from 1) is yours to choose. Each part of a run is a
separate cheer, so a run costs bits × parts; the total is shown under the preview.

Big text, Sideways text and Glyph-art's characters only print in a High Roller cheer, so
picking one of their settings while Bits per cheer is below the threshold raises it to the
threshold. The block's card says what changed and what the stack costs now and before, with
an **Undo**. It asks first instead when that would more than quadruple the amount or go past
500 bits, and it doesn't raise when it can't help: with Cheer-ready off, with High Roller off,
when the streamer's printer has Allow High Roller prints off, or when the streamer's bits per
inch or maximum length would leave nothing to print after the Cheer line at that amount (the
card says why). After an Undo, or if you lower the amount again
yourself, it only offers.

### Letter paper and colour (since 1.6.0)

Printer Bot 3.0 can print on **Letter paper** through an ordinary printer, and the streamer's
rules can send big cheers there and the rest to the roll (a rule like *Twitch: Cheer where
Bits ≥ 500*). Set **Cheers of N bits or more print on Letter paper** to the amount that rule
starts at, and the Letter printer's card as it is in the dock:

- **Letter layout.** *Scaled like 80 mm* prints the roll's receipt on the page, larger: under
  its big profile picture a message gets about 6 cm of the page. *Large message* puts a small
  picture beside the name and gives the message most of the page, about 16 cm. It lays the
  message out from the left, so a Big text or Glyph-art block centres itself there.
- **Image fit** (Large message only): how a picture from a link fills the space the words leave
  it. Fit shows all of it, Fill covers the space and crops the rest, Stretch draws it to the
  space.
- **Print profile.** *Black and white* prints text sharp and shades only pictures. *Colour*
  prints the page as it looks, and lets Big text and Sideways text have a **text colour** and a
  **background colour**, and Glyph-art's characters a colour (the pickers are on their cards).

A cheer of that many bits or more is built for the Letter page: 7.5 inches wide (Big text up to
about 2.7 times as large on paper as on 80 mm, Han tiling 23 characters a row), one page a
cheer, with the streamer's bits per inch and maximum length measured in inches of the page. A
message too tall for the page goes into more cheers, as on the roll. The cards' sizes and the
parts say which paper a cheer prints on, and the preview draws the Letter page. Colours go out
only on a Letter printer in colour; on the roll and in black and white a block keeps its colours
for a cheer that prints them, and sends none. The app takes the Letter printer's Allow High
Roller prints and Allow images as on, their defaults.

---

## Text

A Text block has four renders. Every Layout and Size option in the card is labelled with
what it would print for your text (capital letters' height in cm, how long the message is in
cm, how many cheers), so you can compare before you pick. The message's length leaves out the
bot's header and footer; the line under each part's preview gives the whole receipt.

### Big text (High Roller)

Your words in the font you pick (bold Arial unless you pick another), as big as the paper allows.
`HELLO` with Layout set to Lines:

```text
Cheer100 <div style="\66ont:700 70px/.8 Arial">HELLO</div>
```

- **Layout**: *Auto* (whichever prints biggest at the Size you pick of: your lines as typed,
  the same lines with the words wrapped to the paper, and one letter per line; never a wrap that
  splits a word into one letter a line, which loses the gaps between words), *Lines as you typed them*, *Words
  wrapped to the paper*, *Stack the letters, one per line* (much bigger letters for short
  words), or *Each line its own size* (every line as wide as the paper). A long sentence typed
  on one line comes out wrapped, every Latin word whole (a run of Han, kana or Hangul breaks
  between its characters, [as below](#han-text-as-typed-plain-text-any-cheer)). A short one still stacks when its stacked
  letters come out even slightly bigger, and that can take most of the 42 cm box: "Hello from
  chat" stacks at 102 px over about 42 cm, where *Words wrapped* prints it at 97 px in about
  9 cm. The labels show both, so pick *Words wrapped* for it. To choose the line breaks
  yourself, press Enter between words and pick Lines.
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
Cheer100 <div style="\66ont:700 310px/.8 Arial"><div>H</div><div>E</div><div>L</div><div>L</div><div>O</div></div>
```

Each line its own size:

```text
Cheer100 <div style="\66ont:700 69px/.8 Arial">HAPPY</div><div style="\66ont:700 46px/.8 Arial">BIRTHDAY</div><div style="\66ont:700 108px/.8 Arial">SAM</div>
```

**Font** (since 1.4.0, for Big and Sideways text alike): Arial Bold (the default), Arial Black,
Impact, Comic Sans MS, Georgia, Times New Roman, Courier New, Trebuchet MS, Verdana or Tahoma,
each block its own. Every Windows PC has all ten, so the sizes in the app are the sizes on the
tape: each face's letter widths, ink, cap height and line heights were measured from Microsoft's
own copies of the fonts. `HELLO` in Impact, which draws tall, narrow capitals (Lines layout):

```text
Cheer100 <div style="\66ont:400 105px/.9 Impact">HELLO</div>
```

A phone usually lacks some of these fonts; then the card says the preview draws another font,
and the receipt still prints the one you picked. Each font gets the line heights its own ink
needs (Comic Sans MS's capitals dip below the line, Georgia's 3, 4, 5, 7 and 9 hang below it), so
the same text can take a different number of cheers in another font. A few letters draw a little
past their own space (the hook of a j, the arm of an f), so a line that starts or ends with one is
sized a touch smaller, to keep that ink on the paper.
Emoji are allowed and print as grey dots (the printer has no colour). Invisible
characters from copy-paste (zero-width spaces and the like) are left out, and the card says
so.

### Sideways text (High Roller)

Your words running down the tape, as big as the paper's width allows. Each line you type
becomes a column across the paper:

```text
Cheer100 <div style="writing-mode:vertical-rl;text-orientation:sideways;\66ont:700 150px/.8 Arial;white-space:nowrap;margin:auto;position:relative;left:-2px"><div>HAPPY</div><div>BIRTHDAY</div></div>
```

(Built by the app's own code: `node tools/payload.mjs '{"kind":"side","text":"HAPPY\nBIRTHDAY"}'`.)

**How to read it.** *Top to bottom* (the default): turn the receipt **anticlockwise** (a
quarter turn to the left) and it reads left to right, line 1 on top. *Bottom to top*: turn it
**clockwise**.

The letters sit in the middle of the paper. A column's ink isn't in the middle of its line:
lowercase and punctuation with tails would sit toward the side their tails point to, and
capitals a little toward their tops, so the app moves the block back by that much
(`position:relative;left:…px`), worked out from the font's own measurements. Nothing is cut
off. (A preview on a computer without the font draws a stand-in, which can sit off the middle.)
A few letters draw a little past their own space, like the hook of a j or the arm of an f. When
one of them sits at the bottom end of a column, the app adds that much room below the column
(`padding-bottom:…px`), so the bot's message box doesn't cut it off.

Each line you type is one column, and it never wraps: a sentence on one line prints as one
thin column. When that makes the capitals small, the card says to press Enter between words:
more columns with fewer words each print bigger.

Bottom to top uses `writing-mode: sideways-lr`, which needs Edge 132 or newer on the
streamer's PC. If UP lies flat on the [High Roller test](#test-cheaply-first), their Edge is
older: use Top to bottom. (On an old Edge, Top to bottom's form turned with `rotate:180deg`
would look the same; the app doesn't build that, because the bot runs on a current Edge.)

### Han tiling (plain text, any cheer)

Your words drawn sideways out of Han characters, with no markup at all, so it prints the
same whatever the cheer size. It is also what Big text and Sideways text print as below the
threshold. Read it like sideways text: turn the receipt anticlockwise.

```text
丶丶丶丶丶丶丶丶丶丶丶丶丶丶丶魚龜龜龜龜龜龜龜龜龜龜龜高丶丶鹿鬱鬱鬱鬱鬱鬱鬱鬱鬱鬱鬱鳥丶丶二三三三三面鬱黑三三三三二丶丶丶丶丶丶丶具鬱黑丶丶丶丶丶丶丶丶丶丶丶丶具鬱黑丶丶丶丶丶丶丶丶丶丶丶丶具鬱黑丶丶丶丶丶丶丶馬龍龍龍龍鑫鬱麤龍龍龍龍高丶丶鹿鬱鬱鬱鬱鬱鬱鬱鬱鬱鬱鬱鳥丶丶三十十十十十十十十十十十三丶丶三十十十十十十十十十十十三丶丶鹿鬱鬱鬱鬱鬱鬱鬱鬱鬱鬱鬱鳥丶丶高齒齒齒齒齒齒齒齒齒齒齒鬼丶 Cheer24
```

That is `HI` as a 24-bit cheer (below a threshold of 25). The bot prints plain text 15 Han
characters to a line on 80 mm paper (9 on 58 mm, 23 on a Letter page), so the app makes every row exactly that
long, starts with a light header row (so the opening quote mark gets a line of its own) and
puts the `Cheer24` word at the **end**. Each plain part is its own cheer. Stroke weight is
Bold or Regular. Han tiling needs a CJK font on the streamer's PC; Windows has one.

### Han text as typed (plain text, any cheer)

The Han characters you type or paste, printed as themselves at the receipt's own size: 15 a
row on 80 mm paper (9 on 58 mm, 23 on a Letter page), whatever the cheer size, and up to about 480 a cheer with the
streamer's length settings at 0. Each line you type starts a new row, and the rest of that row
fills with light 丶 cells (a chat message can't carry a line break). Below the threshold a light
first row takes the opening quote mark, as in Han tiling.

Only Han characters go in, because they are the only ones a full Han cell wide in every CJK
font, and the rows are made by the paper's own wrapping. Kana, Hangul, CJK punctuation, Latin
letters, digits and spaces are left out, and the card names them; Big text prints them. Through
the bot's own page, a closing mark like 。 at the start of a row, or an opening one like 「 at
its end, pushed every row after it out of line, and so did Hangul on a Mac, whose Korean font is
narrower than a Han character (Windows draws kana with a condensed font too). The iteration mark
々 stays: it never starts a row, so the character before it moves down with it.

A receiptify mosaic prints as the mosaic once you delete its ending (`Cheer100` and the five
characters after it). On 80 mm paper its 32 rows fit one High Roller cheer and take two plain
ones.

Big text wraps Han too: under *Words wrapped to the paper* (and so under *Auto*), a run of Han,
kana or Hangul breaks between its characters, never before a closing mark like 。 or ” or after
an opening one like 「 or “ (nor on either side of a straight "). A Korean or Japanese word fills
the line it starts on, so it may break across two lines. Latin words never break, full-width
ones like ＧＧ included. A long Han line prints as rows of big
characters in one cheer (up to about 200 characters on 80 mm paper) where it used to stack one
character a line.

---

## Pictures

An Image block takes a picture from a link or a file.

### Glyph-art (High Roller)

The picture as a grid of characters. Pick the characters:

- **Han characters** (default): a square grid of 12 to 30 columns, light 丶 to dark 鬱. Every
  cell is the same width in any CJK font, so rows line up on both paper widths.

  ```text
  Cheer100 <div style=\66ont-size:6.72vw;line-height:1><div>丶丶丶丶丶丶丶丶丶丶丶丶</div><div>丶丶丶丶丶丶丶丶丶丶丶丶</div><div>丶丶三青直二二直青三丶丶</div><div>丶二龍鬱鬱齒齒鬱鬱龍二丶</div><div>丶車鬱鬱鬱鬱鬱鬱鬱鬱車丶</div><div>丶車鬱鬱鬱鬱鬱鬱鬱鬱車丶</div><div>丶三麤鬱鬱鬱鬱鬱鬱麤三丶</div><div>丶丶鬼鬱鬱鬱鬱鬱鬱鬼丶丶</div><div>丶丶二鼎鬱鬱鬱鬱鼠丿丶丶</div><div>丶丶丶二麥鬱鬱麥二丶丶丶</div><div>丶丶丶丶丶革革丶丶丶丶丶</div><div>丶丶丶丶丶丶丶丶丶丶丶丶</div></div>
  ```

- **ASCII letters**, **ASCII full detail** and **Blocks ░▒▓█**: rows in Courier New, 8 to 48
  columns. Light areas are spaces, and they keep their width.

  ```text
  Cheer100 <pre style="\66ont:8.74vw/1.2 'Courier New';margin:0"><div>    cnaweanc    </div><div>  x0BB88B8BB0x  </div><div> eB8eoq88qoe8Be </div><div>cBB80w88B8w08BBc</div><div>cW8mw8B8888wm8Wc</div><div> aB8xxemmexx8Be </div><div>  x0B0weew8B0x  </div><div>    cneeeenc    </div></pre>
  ```

- **Braille**: 2 × 4 dots per character, the finest detail. Nobody has measured the font the
  streamer's PC uses for Braille on this bot yet, so send one cheer to check it before a
  bigger run.

The Han and Courier New grids size their font in `vw` (a share of the receipt's width), so
the same message fits 80 mm and 58 mm paper. Braille is sized in px for the paper width you
picked, so a Braille message made for 80 mm is too wide for 58 mm. Detail (columns), Rotate,
Darkness, Smooth shading (photos) and Invert are on the card. Rows that don't fit one message carry on in the
next cheer, spread evenly over the cheers they need. If the streamer's bits per inch leaves a
cheer less room than one row, the card says the bot cuts every part, and to raise Detail
(smaller rows) or Bits per cheer.

### Below the threshold

In a plain cheer the bot prints text, so a Glyph-art block prints as a plain grid of Han
characters (13 a row on 80 mm, with a light column each side) whatever characters you picked,
and the card says so.

### Real picture: from an Imgur, Catbox or ImgBB link (since 1.5.0)

Printer Bot 3.0 can print a picture from a link: a direct link to a picture on **Imgur**,
**Catbox** or **ImgBB**, in a High Roller cheer, once the streamer has switched that site on in
the bot's dock (*Advanced → Images in messages*; every site starts off) and the printer allows
images (its default). Tick the same sites under **Pictures from links** in the streamer's
settings here.

The easiest way (since 1.7.0): **pick a file on the card**. It goes to Catbox through this site,
and its `https://files.catbox.moe/` link fills the card's Image URL field by itself. The card
says it first, beside the file picker: the picture becomes public to anyone with the link, stays
up until two years after it was last viewed, and can't be deleted. (It has to go through this
site's server: Catbox doesn't let a web page see the link it sends back. The server takes only
JPEG pictures from this page, 20 uploads an hour from one person and 100 from everyone together.)

Or upload the picture to one of those sites yourself and paste its direct link: the address of
the picture itself, ending in `.png`, `.jpg`, `.gif` or `.webp` (Imgur's start
`https://i.imgur.com/`, ImgBB's `https://i.ibb.co/`, Catbox's `https://files.catbox.moe/`).
Anyone with the link can see the picture. The cheer carries the link as text, and the bot
prints the picture in its place:

```text
Cheer100 <div>https://i.imgur.com/AbC1234.png</div>
```

It prints as wide as the paper at most and never larger than it is, up to 4 inches tall, three
pictures to a cheer. The card says how big it prints and how many cheers it takes, and the
preview shows it as the bot draws it. Below the High Roller threshold the bot prints a link as
text, so the block prints the picture as a plain grid of Han characters instead, as Glyph-art
does. The bot waits 2.5 seconds for a picture: a big file that loads slower prints `[image]`.

A link to any other site, or a page of the site rather than the picture, prints nothing, and
the card says why and offers **Switch to Glyph-art**. Rotate and brightness/contrast on the card
change only the picture shown there; the printer prints the linked picture as it is.

---

## The preview

Each part is drawn by **SassyTP's printer-bot renderer** (MIT): the receipt page the bot
itself prints from, built into this app and run in a locked-down frame with no network
access. It is not an imitation of the receipt. Whether a cheer prints High Roller or plain,
where the bot's box cuts it off and any fade come from the bot's own code. The Twitch logo in
the footer is a grey box here.

The line above the parts names the layout the preview draws with: *Printer Bot 3.0.0's layout
v202610140456* (Printer Bot 3.0.1 uses 3.0.0's layout). SassyTP's bot can download a newer layout
to the streamer's dock by itself, so if their dock shows another **Renderer** version under
**Updates**, the preview may not match their printer. The exceptions are 3.0.0-beta.7's
202610122236 (and beta.6's 202610110524), which print this app's messages exactly as 3.0.1 does,
and Printer Bot 2.5.4's 202610090056, which prints them the same with a smaller profile picture.

If a High Roller message reaches a printer below the streamer's real threshold, or one with
**Allow High Roller prints** off, Printer Bot 3.0 prints its words small in quote marks, without
the code (before 3.0 the code itself printed). Set the threshold and that switch in the app as the
streamer has them, and the app builds the plain form for those cheers itself.

The app follows the newest Printer Bot release, beta or stable, as SassyTP ships it. Printer Bot
3.0 can also print one cheer on several printers, each with its own paper and its own Allow High
Roller prints. The app builds for a receipt printer and, since 1.6.0, one Letter printer for
cheers of the bits its rule starts at; it doesn't model more. A cheer for the Letter printer is
drawn on the bot's Letter page, 400 CSS px wide and one page tall, in the layout picked, and the
profile picture's stand-in is drawn by the bot itself there, so the page's cut counts it.

The big circle at the top is where the bot puts the viewer's profile picture. The preview never
asks Twitch for it, so it draws a grey stand-in there, and the receipt's length counts it. (3.0
draws the circle bigger than 2.5.4 did and takes the difference back out of the gaps around the
header and footer, so the receipt is just as long.) Under
each part, the preview says how long the receipt is (about 4.8 cm shorter on 80 mm, 4.0 cm on
58 mm, when the bot finds no profile picture), whether the bot cuts it (and why), and whether
the bot's safety filter would take anything out (it shouldn't, for anything this app builds).

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
still print), so judge those with the thermal view off. A cheer for a Letter printer shows its
page at the printer's 300 dots to the inch, scaled to the column: in black and white the bot
prints text sharp and shades only pictures, and in colour it prints the page as drawn.

---

## Sending it

- **Cheer-ready** (on by default) adds `Cheer<bits>` to each message so it triggers the
  print: at the start of a High Roller message, at the end of a plain part. Turn Cheer-ready off for a
  [free test](#test-cheaply-first).
- **Add a repeat number** (off by default) puts two rotating digits after the cheer word
  (`Cheer100 07`). Twitch won't send the same message twice in a row within 30 seconds (it
  just isn't sent, and no bits are spent); the digits make each copy different. They also
  print, which is why they are off by default. If two parts in a row are identical, the second one says
  so: wait 30 seconds, or turn the digits on.
- **Too much for one cheer** tapes into more. Each part is a separate cheer (500 characters
  at most, Twitch's limit), and the bot prints its header between them. Paste them in order.
- Every block's card says what it prints and which part it ends up in. Each part's header
  counts its characters ("230 / 500 characters").
- If the streamer's length settings leave a cheer no room after its Cheer line, every part
  says it would print nothing else, its Copy is off, and the line under the parts says what to
  change. If they leave room, but less than even the smallest letters need, the card says to
  raise Bits per cheer.
- A part over 500 characters says Twitch would reject it, and the line under the parts says to
  fix it before pasting.
- A Glyph-art picture that isn't in the parts (still loading, a link or file that can't be
  read, an expired upload, or a picked file to pick again after a reload) is named in red above
  them. While one is still loading, nothing can be copied: the parts change when it arrives.

## Test cheaply first

- **Free chat test.** Turn Cheer-ready off and send the message. A message with no cheer
  never reaches the printer, but it does go through the channel's chat filter, so you learn
  whether chat lets this kind of message through before you spend bits. If chat holds it,
  see below. A cheer word standing on its own in your text (`Cheer50`) makes the message a
  real cheer that spends those bits and prints; the app says so in red over the parts.
- **High Roller test** (one cheer at exactly the threshold). If BIG prints big, High Roller
  is on at that amount. It also checks that MMMMM keeps its right edge, that "jog" keeps its
  tails, that the second BIG is upside down and that UP runs up the tape. If it all prints
  small inside quote marks, the threshold is higher than you entered, or (on Printer Bot 3.0)
  the streamer's printer has **Allow High Roller prints** off.
- **Plain test** (one cheer, one bit under the threshold, or 1 bit when High Roller is off or the
  streamer's printer doesn't allow High Roller prints). It should print small, inside quote
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
the chat filter blocks the picture tag (checked again on 2026-10-10), so the app never sends
one: a picture prints as glyph-art, or from an image-site link on Printer Bot 3.0, which is
text. If chat holds a picture link, don't shorten or disguise it: print the picture as
Glyph-art.

---

## Presets, and work saved by older versions

**Presets** save the whole block stack under a name, in this browser. **Export JSON** copies
every preset out, to move it to another browser or keep it safe; **Import JSON** brings it
back, and never replaces anything: a setup whose name is already taken (or repeated in the
file) is added with a number after its name, and the note says which. A setup that is already
saved exactly as it is (the same name and blocks) is left out, so importing what you just
exported adds nothing. Saving under a name that
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
- emote names print as words, and the old fonts and italics are gone (big text starts in bold
  Arial; pick a font on its card);
- the stack as it was is saved once, as a preset called **Before 1.0.0**, so nothing is lost.
  Your own presets are never overwritten. A preset is converted when you load it; the stored
  copy stays as it was, and **Export JSON** keeps it that way. A note above the blocks says
  all this once. If your saved presets can't be read (damaged or hand-edited), the backup isn't
  written over them: the note says so, and the old stack's JSON is in the box under Presets,
  ready to copy.

---

## Privacy: what stays local, and what doesn't

**Stays on your device:** text in every mode; a picture you pick from disk for glyph-art
(decoded in the browser); your settings, block stack and presets (in `localStorage`). The
preview runs with no network access at all. No analytics, no accounts.

**Goes to this project's own Worker** (and, for a file picked on a Real picture card, on to
Catbox):

| What you do | What happens |
|---|---|
| Paste a picture link into an Image block | The picture is fetched through `/px`, because a browser can't read another site's pixels directly. |
| Pick a file on a **Real picture** card | It is redrawn on your device (at most 1600 px on its longer side, a JPEG on white, without the photo's hidden details such as where it was taken) and sent to `/catbox`, which uploads it to **Catbox**. The picture is then **public** to anyone with its link, stays up until two years after it was last viewed, and **can't be deleted**. Its link fills the card's Image URL field. |
| Rotate or adjust brightness/contrast on a Real picture card | The picture is re-fetched through `/px`, adjusted and re-uploaded. |
| Paste an Imgur, Catbox or ImgBB link on a Real picture card | The picture is read through `/px` for its size (and its Han grid below the threshold). The link itself goes into the cheer, so the streamer's Printer Bot fetches the picture from that site. |

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
