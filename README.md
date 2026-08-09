<!-- No social-preview banner: omitted rather than inventing binary/SVG assets (see cheer-splitter-9k/.github/social-preview*.svg for the pattern used elsewhere). -->

# Receipt Wrecker

**Turn big text or a picture into a paste-ready grid of monospace "block" glyphs** —
for character-limited text boxes, chat copypasta, and anywhere a single line of
Unicode has to stand in for a picture or a poster-sized word.

**▶ Try it live: [receipt.uwutoowo.com](https://receipt.uwutoowo.com/)**

<p align="center">
  <a href="https://github.com/shamu4life/receipt-wrecker/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/shamu4life/receipt-wrecker/ci.yml?label=CI" /></a>
  <a href="docs/CHANGELOG.md"><img alt="Version 0.3.3" src="https://img.shields.io/badge/version-0.3.3-blue" /></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-blue.svg" /></a>
  <img alt="Single file" src="https://img.shields.io/badge/source-one%20HTML%20file-success" />
  <img alt="Zero dependencies" src="https://img.shields.io/badge/dependencies-0-brightgreen" />
  <img alt="No build step" src="https://img.shields.io/badge/build-none-success" />
  <img alt="Vanilla JS" src="https://img.shields.io/badge/vanilla-JS-f7df1e" />
  <a href="https://developers.cloudflare.com/workers/static-assets/"><img alt="Cloudflare Workers" src="https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white" /></a>
</p>

Receipt Wrecker is a **single-file, dependency-free** web tool. You build a
**stack of blocks** and it packs them into as few chat messages as possible:

- **Text** — a word or phrase as oversized type, straight or sideways, or tiled
  out of Hanzi as a markup-free fallback.
- **Image** — a real picture (printed as an actual image) or glyph-art (the
  picture tiled into monospace characters, which nothing can filter).
- **Takeover** — paints over printer-bot's own header so the tape reads as your
  artwork. Two styles: your own lines, or a **fake cheer** laid out like a real one.

The output is **one newline-free line per message**, sized to Twitch's 500-character
limit. The glyph engine runs entirely in your browser; the optional image upload and
proxy go to this project's own Worker — see [Privacy](#privacy--what-stays-local-and-what-doesnt).

> Its headline use: a friend runs [nutty.gg's **printer-bot**](https://nutty.gg/)
> (via Streamer.bot) on a thermal **receipt printer**, which prints chat messages
> sent as a Twitch `Cheer100`. Pasting Receipt Wrecker's output into chat makes the
> printer spit out oversized text or a recognizable picture. That's one
> application — the tool itself is a neutral glyph-art generator, like its
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

Then: choose **Big Text** or **Image** → set the **tier** and **columns** → copy the
preview → paste it wherever a single line of text is accepted.

---

## Tiers & the Census (read this before you paste into someone else's chat)

The glyph "font" you get on the other end depends entirely on what's installed on
the **receiving** renderer — for the printer-bot use case, an old embedded
Windows browser engine with no control over `font-family`. Receipt Wrecker can't
know that in advance, so it offers a **tier** selector, ranked by how likely each
one is to render correctly almost anywhere:

| Tier | Glyphs | Notes |
|---|---|---|
| **ASCII — letters** (glyph-art default) | ` icvoxnsaewmq08BWM` | Plain letters, so there is no font to be missing. The safest thing to send, and the default for a reason. |
| **ASCII — full detail** | ` .:-=+*oaewm8%#B@M` | Denser ramp, more tonal steps, same no-font-needed property. |
| **Hanzi** | curated Han density ramp | Higher tonal range, and field-confirmed to print on the RP332. Width/fallback is more rig-dependent than ASCII. |
| **Blocks `░▒▓█`** | 4-level tone ramp | Looks ideal and often **prints blank** on the real machine — the app's own selector says so. Kept because it renders fine in other destinations. |
| **Braille** | U+2800–28FF (2×4 dot cells) | Highest resolution — 8 dots per glyph — and the least universally supported. Marked experimental. |
| **Big text (on/off)** | `█` / `░` binary | Used by big type: maximum contrast, tolerant of a column of wrap drift. |

Both ASCII ramps use a **literal space** as their lightest cell. That's safe because
every glyph body ships inside `white-space:pre`, so runs of spaces can't collapse.

**"Print a test strip" (Census).** Because the tool can't see the destination
renderer, there's a dedicated **Print test strip** button that emits a single
diagnostic payload — a short, labeled sample of every tier plus a numbered ruler.
Send that once on the target rig (as your first, calibration paste) and look at
what actually rendered:

- Which tiers came out **solid** vs. **tofu** (boxes/blank) on that renderer.
- The **true column count** per line, read straight off the ruler.

Set the tier and column-width controls to match what you saw, and every later
paste is pinned to that rig. This turns "will this render?" from a guess into a
measured fact, with a single throwaway print — no access to the other side
required.

---

## Cheer-ready output & the AutoMod caveat

For the Twitch-cheer use case there's a **Cheer-ready** toggle (on by default):
it appends a space-delimited `Cheer100` token plus a small visible rotating nonce
to the payload, so Twitch registers the message as a cheer and a duplicate-message
filter doesn't eat a re-send. Turn it off to get the raw glyph block only — for
other destinations, or when you're composing with a chunking tool like
[`cheer-splitter-9k`](https://github.com/shamu4life/cheer-splitter-9k) that will
add its own prefix.

**Honest caveat:** a channel's **AutoMod / blocked-terms list** can hold or drop a
message before it ever reaches chat. That's a per-channel moderation setting on
Twitch's side — entirely out of this tool's control, and no client-side change can
work around it. If a paste doesn't show up, check the channel's AutoMod settings
before assuming the tool is broken.

---

## Takeover — make the tape your artwork, not a receipt

printer-bot draws its own header above your message: the avatar, a `<N> BITS` line,
and the cheerer's name. A **Takeover** block paints over it — an opaque panel lifted
up with a negative margin, with your own lines (and optionally a picture) where the
header used to be. Anything below it in the stack still prints as normal underneath.

- **Reach up (pt)** is the one thing that needs calibrating. The header is taller or
  shorter depending on the streamer's avatar, so 240pt is a starting point, not a
  constant: too little leaves a strip of the old header showing; too much lifts the
  block past the top of the paper, where the printer draws nothing — and the picture
  goes first, because it sits highest. One print settles it. The preview clips at the
  paper edge, so anything that vanishes there won't print either.
- The optional picture rides through the same **carrier tag** table as a normal
  image block, so it benefits from whatever tag currently survives chat.
- Budget: a three-line takeover is ~350 chars, and a takeover **plus** a full picture
  payload still fits one 100-bit cheer (458 of 500).

### Two styles

**Blank** gives you three free lines and an optional picture, bottom-anchored to the
area it paints over.

**Fake cheer** arranges the same overlay the way printer-bot arranges a real one —
picture on top, then the bits figure, then the name, then an italic message. Type the
figure only; ` BITS` is appended for you. It's free text rather than a number, because
`-100000` and `∞` are the jokes people actually want.

- The layout follows the hand-built payload this was reverse-engineered from — picture
  up top, then 24/900, 19/700, 13/italic — with two corrections the print engine forced.
  The picture is reserved **square** (a profile picture is square, and the carrier tags
  state only a width, so reserving 1.4× left a slab of white under it), and it is at
  least **120 px**: measured, a picture drawn shorter than that renders *nothing at all*
  inside the lifted overlay. The old 80 px default printed blank paper where the picture
  should be. A picture that can't clear the floor is dropped rather than sent as ~90
  characters buying nothing.
- Text and picture are both **clamped into the painted panel**, and are laid out so they
  can never overlap. That ordering matters: the picture has to be emitted last (see the
  `foreignObject` note in the changelog), so it paints *over* the lines — and sizing it
  first once left `-100000 BITS` rendering with zero ink at ordinary slider positions.
- Over-pulling is safe. Reach past your rig's real header and the block follows the
  message down the tape instead of sailing off the top of the roll.
- **Budget, measured — and the margin is genuinely thin.** The three lines alone come to
  ~357 chars with the cheer wrapper. *With* a picture on an uploaded link it's **491 of
  500**. That fits one 100-bit cheer, and a realistic name still fits: `IRS` gives 491,
  `shamu4life` gives 498. A very long name (`the_actual_streamer`, 507) still doesn't.
  **Going over does not cost a second cheer** — a
  takeover is one SVG and can't be split, so Twitch rejects the message and nothing
  prints at all. Watch the counter; it turns red before you send. **Upload for a 15-min
  link** on an Image block mints the shortest link there is.

The tape isn't a record of anything — Twitch's bits ledger is server-side, and the
cheer that triggers the print carries your real name in chat where the whole room sees
it. The paper is the gag; everyone watching knows it's lying, which is the joke.

---

## Carrier tags — how a real picture gets there, and what to do when it stops

Glyph art is just text, so nothing can really stop it. A **real picture** is
different: printer-bot drops the chat message into its page as markup, so the photo
rides on an HTML tag pointing at a URL. Which tag that is has turned into a moving
target — a channel's blocked-terms list took `<object` first, then `<image` (the
SVG form), then `<img` as well, and each block silently kills *every* picture the
tool makes.

So the tag is a setting, not a hardcode. Each **Carrier tag** on an Image block
builds the same picture out of a different token. The verdicts below were first
**measured** — every form rendered through the exact binary printer-bot ships
(wkhtmltopdf 0.12.6 "with patched qt" = Qt 4.8.7 / WebKit 534.34) with its exact
print flags — and then **field-tested**: a full probe round cheered at the real
channel and printed on the real machine. Where the two disagreed, the tape won.

| Carrier | Payload | What came off the tape |
|---|---|---|
| `embed tag` | ~45 chars + URL | **Default — printed perfectly on the real machine.** Its one limitation is real but *known and detectable*: the URL must end in `.png`/`.jpg`/etc., because the engine picks its image renderer from the extension. Given a bare link it prints blank, so the app warns you before you send. |
| `input type=image` | ~45 chars + URL | **Needs no file extension**, so it's the fallback when a link has no `.png` on the end. Spells "image" as an attribute *value*, not a tag name. **But it printed too wide in the field and the bench can't reproduce why** — likely native form-control chrome on Windows — so it isn't the default until someone re-probes it on the real rig. |
| `iframe` | ~90 chars + URL | **Prints** — but a subframe gets no shrink-to-fit, so a picture bigger than the box is **cropped**, losing its right and bottom. Fine for a small picture; uploads (re-encoded up to 720px) will crop. |
| `img tag` | ~30 chars + URL | **Blocked (Aug 2026).** Shortest payload and it renders fine on the engine — it just never reaches chat any more. |
| `SVG image` | ~120 chars + URL | **Blocked (Aug 2026).** Still renders correctly, so worth re-probing if a list is ever pruned. |
| `object tag` | ~60 chars + URL | **Blocked (earlier).** Same extension requirement as `embed`. |

**The default is whatever last printed correctly on the real machine** — not
whatever measures best on a bench. `embed` leads because it came off the tape
clean; `input` sits second despite being more forgiving about URLs, because it
printed too wide once and that hasn't been explained. A bench result never
overrides the tape.

**Everything live clamps to the paper.** The box the app asks for (263px = 70mm) is
wider than the receipt body actually is: printer-bot renders at `paperWidth - 8`mm
and its template sets `body { margin: 1em }`, leaving ~240px on an 80mm roll. That
overrun is what made a field print come out too wide. Every live carrier now carries
`max-width:100%`, so it adapts — narrower paper shrinks to fit, wider paper still
gets the full width — rather than betting on another hardcoded number.

**Why there's no "CSS background" option**, even though a `<div>` wearing the photo
as its backdrop would be the one surface with no tag name to block: printer-bot's
print step passes `--no-background`, which drops every element background from the
print. Measured dead — twice over, since the `background:url(x) 0 0/100%` slash
shorthand is separately invalid in that WebKit vintage. Don't re-add it without
re-measuring.

When pictures stop printing, hit **Find what still sends** under the preview. It
builds the same picture with every carrier, one cheer each, labelled `A`–`F`. Send
them **one at a time** (a single blocked term kills the whole message, so they
can't share a cheer) and read the tape:

- **a letter with a picture under it** → that carrier works; pick it on the block
- **a letter on its own** → the message sent, but the printer ignored that tag
- **a letter that never shows up** → chat blocked it

**Honest caveat:** none of this is guaranteed, and it isn't a fix for moderation —
a mod can block the next tag the same afternoon. The durable answer is
**glyph-art**: it's plain text with no markup at all, so there's no tag to block.
It's lower fidelity than the real photo, and it always prints.

---

## How it works / first-print Census

1. **Rasterize** — Big Text mode draws your word(s) onto an off-screen `<canvas>`,
   scaled to fill the target width; Image mode draws your picked image onto a
   canvas at the sampled resolution. Either way you get a luminance grid.
2. **Quantize** — each cell's luminance maps to a glyph using the active tier:
   the tone-ramp tiers (with a **Threshold** vs. **Floyd–Steinberg dither**
   toggle, plus contrast/invert) or the binary on/off tier; Big Text mode
   defaults to binary and Image mode defaults to the Blocks tone ramp, but the
   tier selector overrides either default; the Braille tier instead packs a
   finer 2×4 dot grid per cell.
3. **Render** — the grid flattens to a single newline-free string, wrapped in
   `white-space:pre` so runs of spaces can't collapse and shear the grid apart.
   That wrapper is what lets the ASCII tiers use a plain space as their lightest
   cell.
4. **Package** — if **Cheer-ready** is on, the payload is *prefixed* with
   `Cheer<N>` plus a visible rotating nonce (leading, so they survive any
   trailing-strip and the message never starts with `<`); a live character counter
   (budget: 500, Twitch's per-message
   cap, leaving headroom) turns red if you go over instead of silently truncating.
5. **Census** — the **Print test strip** button runs the same pipeline over a
   fixed diagnostic string instead of your input, giving you the blind-first-print
   calibration described above.

Everything above happens synchronously in the page; there is no server round-trip
at any step.

---

## Short image links (why the URL shape is a product decision)

Every character of an uploaded picture's URL is **payload**. It gets pasted into a
Twitch message with a hard 500-character cap, next to markup that's already most of
the budget — so the link's length decides whether a payload costs 100 bits or 200.

`POST /upload` mints `https://<host>/<12 hex>.png` — **45 characters** on
`receipt.uwutoowo.com`. It used to be `/i/<32 hex>.png`, which was 67, and those 22
characters were the whole difference between a fake cheer fitting one cheer and
needing two.

| what changed | why it's safe |
|---|---|
| key `32 hex` → `12 hex` | 48 bits against a **15-minute** TTL. Guessing one needs ~3×10¹¹ requests/second to expect a single hit — 128 bits was margin that was never load-bearing. |
| path `/i/<key>` → `/<key>` | Matched by shape (`^[0-9a-f]{8,64}` + optional image extension), so it can't shadow `/robots.txt`, `/llms.txt`, `/sitemap.xml` or the app itself. Tested. |
| `.png` suffix kept | Load-bearing twice: `embed`/`object` pick their renderer from the extension, and wkhtmltopdf escalates a failed subresource with an *unknown* extension to a **fatal** error — exit 1, whole print job dead. Since these links expire in 15 minutes, cheering a stale one is the ordinary case. |

Links minted in either older shape still resolve, so nothing breaks mid-cheer.

**A shorter image host buys 6 more characters.** Point a hostname at this Worker
(`i.uwutoowo.com/*`) and set the `RW_IMG_HOST` var; `/upload` then mints 39-character
links. It's unset by default and falls back to whatever origin served the request, so
preview deployments and `wrangler dev` keep working — **only set it once that host
actually routes here**, since a link to a host that doesn't resolve prints a blank
space where the picture should be.

---

## Privacy — what stays local, and what doesn't

Earlier versions of this file claimed the app makes no network calls at all. That
is no longer true, and the honest breakdown matters more than the slogan:

**Stays on your device:**

- **Big Text** in every style — nothing is sent.
- **A picture you pick from disk for glyph-art** — decoded locally in a canvas.
- **No analytics, no accounts, no third parties.** Every request below goes to this
  project's own Cloudflare Worker and nowhere else.

**Goes to the Worker:**

| what you do | what happens |
|---|---|
| Click **Upload** (Image block or Takeover card) | The file is shrunk to a PNG and `POST`ed to `/upload`, stored in Cloudflare KV, and auto-deleted after **15 minutes**. |
| **Paste an image URL** into a glyph-art block | That URL is fetched through `/px` so the browser can read its pixels — a canvas can't read cross-origin bytes directly. |
| **Drag brightness / contrast**, or rotate a real picture | The image is re-fetched through `/px`, baked on a canvas, and re-uploaded. |
| Turn on **Thermal preview** with a pasted URL | Same `/px` fetch, to inline the picture so the preview can dither it. |

Two of those fire without a dedicated button — typing a URL, and dragging a
slider — so "I never clicked upload" is not the same as "nothing left the device".

**Storage:** three `localStorage` keys — control settings (`rw_controls_v1`), the
nonce counter (`rw_nonce_seq`), and your block stack (`rw_blocks_v1`) — all wrapped
in `try/catch` so locked-down contexts still work.

The app is still one auditable file, and it still runs offline if you only use Big
Text and locally-picked pictures.

---

## Self-hosting

The repo is wired up for **Cloudflare Workers** (Workers Builds). There **is** a
Worker script — [`src/worker.js`](src/worker.js) — which serves `public/` as
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
source of truth for them — listing only one invites a deploy to reconcile the route
set and drop the other. `RW_IMG_HOST` is what makes uploaded links 39 characters
instead of 45; it falls back to the request origin when unset, so leave it out until
that host actually answers, or every picture prints blank.

Local development and deployment:

```sh
npx wrangler dev      # local preview of public/ with live reload
npx wrangler deploy   # publish to production
```

The production deploy target for this project is **`receipt.uwutoowo.com`**
(configured as a custom domain/route for the Worker in the Cloudflare dashboard or
`wrangler.jsonc` `routes` — a deploy step, not something `npm test` exercises).

You can host `public/` on any static host (GitHub Pages, Netlify, S3, your own
server) or just open the file — **the glyph and markup generators are entirely
client-side and work with no backend at all.** You only lose the optional extras the
Worker provides: uploading a file to get a short link, pasting a *cross-origin*
image URL for glyph-art, and the image adjustment bake.

---

## Project layout

| Path | Role |
|---|---|
| [`public/`](public) | **The deployed site.** Cloudflare serves *only* this directory. |
| [`public/index.html`](public/index.html) | **The entire app** — inline CSS + vanilla JS, no assets. |
| [`wrangler.jsonc`](wrangler.jsonc) | Cloudflare Workers config (serves `public/`). |
| [`test/`](test) | Node `node:test` suite — extracts the inline script and unit-tests the pure glyph engine. |
| [`README.md`](README.md) | This file. |
| [`CLAUDE.md`](CLAUDE.md) | Guidance for AI assistants and contributors. |
| [`LICENSE`](LICENSE) | MIT. |

**Tech facts:** pure static; one HTML file with inline CSS and a single vanilla-JS
IIFE (`"use strict"`). No build step, no framework, no dependencies, no external
resources — system font stacks only (no web fonts, no CDN, no external images).
Browser APIs used: Canvas 2D (rasterizing text/images), Clipboard (with
`execCommand` fallback), and `localStorage` (control settings + nonce counter
only).

---

## Contributing

The whole app is **[`public/index.html`](public/index.html)** — edit that one file
and reload the browser. There is no build step and nothing to install beyond the
`wrangler` devDependency used for local preview and the deploy dry-run.

A few house rules keep the project what it is (see also [CLAUDE.md](CLAUDE.md)):

- **Stay single-file.** Keep CSS and JS inline; don't add dependencies, bundlers, or
  external resources.
- **No new network calls** — the app's `fetch` stays limited to our own `/upload`
  and `/px` — and no storage beyond the three documented `localStorage` keys.
- **Match the idiom:** vanilla JS, IIFE-wrapped, `"use strict"`, ES5-ish style.
- **Branch + PR.** Develop on a feature branch and open a PR — avoid pushing
  straight to `main` (it deploys to production).

Run the tests before sending a change:

```sh
npm test                       # Node's built-in test runner — zero deps to install
npx wrangler deploy --dry-run  # validates config + assets
```

---

## Support

Receipt Wrecker is free, open source, and has no ads or tracking. If it saves you
some time, you can say thanks:

[**☕ Buy me a coffee →**](https://www.buymeacoffee.com/shamu4life)

(There's also a **Sponsor** button at the top of the repo, wired to the same page.)

---

## License

Released under the [MIT License](LICENSE).
