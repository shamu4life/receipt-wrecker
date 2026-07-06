<!-- No social-preview banner: omitted rather than inventing binary/SVG assets (see cheer-splitter-9k/.github/social-preview*.svg for the pattern used elsewhere). -->

# Receipt Wrecker

**Turn big text or a picture into a paste-ready grid of monospace "block" glyphs** —
for character-limited text boxes, chat copypasta, and anywhere a single line of
Unicode has to stand in for a picture or a poster-sized word.

**▶ Try it live: [receipt.uwutoowo.com](https://receipt.uwutoowo.com/)**

<p align="center">
  <a href="https://github.com/shamu4life/receipt-wrecker/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/shamu4life/receipt-wrecker/ci.yml?label=CI" /></a>
  <a href="docs/CHANGELOG.md"><img alt="Version 0.1.0" src="https://img.shields.io/badge/version-0.1.0-blue" /></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-blue.svg" /></a>
  <img alt="Single file" src="https://img.shields.io/badge/source-one%20HTML%20file-success" />
  <img alt="Zero dependencies" src="https://img.shields.io/badge/dependencies-0-brightgreen" />
  <img alt="No build step" src="https://img.shields.io/badge/build-none-success" />
  <img alt="Vanilla JS" src="https://img.shields.io/badge/vanilla-JS-f7df1e" />
  <a href="https://developers.cloudflare.com/workers/static-assets/"><img alt="Cloudflare Workers" src="https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white" /></a>
</p>

Receipt Wrecker is a **single-file, dependency-free** web tool. Pick a mode:

- **Big Text** — type a word or short phrase; it's rendered as oversized block
  letters, one per line of glyphs.
- **Image** — pick a picture from your device; it's downsampled and quantized into
  a grid of tone glyphs.

Either way you get back **one newline-free line** of monospace glyphs, sized to fit
a character budget, ready to paste anywhere that accepts plain text. It runs
**100% in your browser** — nothing you type or pick is ever uploaded anywhere.

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
| **Blocks `░▒▓█`** (Image mode default) | 4-level tone ramp | Widest compatibility — ships in the default Windows symbol font, common heritage font, tiles reliably. The safe choice. |
| **CJK ramp** | curated Han character density ramp | Higher tonal range for photos; CJK fonts ship by default on Windows, but width/fallback is more rig-dependent. |
| **Braille** | U+2800–28FF (2×4 dot cells) | Highest resolution — packs 8 dots per glyph — at the cost of being the least universally supported and most prone to dot-bleed at small sizes on thermal paper. |
| **Big text (on/off)** | `█` / `░` binary | Big Text mode's default tier — maximum-contrast, near-universally rendered, tolerant of a column of wrap drift. The tier selector overrides it, so you can render big text in CJK or Braille too. |

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

Receipt Wrecker only emits plain Unicode text — no HTML or markup injection. That
was considered and deliberately **cut** (see [`CLAUDE.md`](CLAUDE.md) and the
design spec under `docs/superpowers/specs/`): it depends on undocumented sanitizing
behavior in Twitch's first-party client that can't be relied on, so this tool
sticks to glyph art only.

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
3. **Render** — the grid flattens to a single newline-free string. The "off" cell
   is always a real glyph (never a space) — a run of spaces collapses under HTML's
   default whitespace handling and would shear the grid apart.
4. **Package** — if **Cheer-ready** is on, ` Cheer100 ` plus a visible rotating
   nonce is appended; a live character counter (budget: 490 of Twitch's ~500-char
   cap, leaving headroom) turns red if you go over instead of silently truncating.
5. **Census** — the **Print test strip** button runs the same pipeline over a
   fixed diagnostic string instead of your input, giving you the blind-first-print
   calibration described above.

Everything above happens synchronously in the page; there is no server round-trip
at any step.

---

## Privacy

Everything happens client-side, in the page:

- **No network calls.** No `fetch`/XHR. Your text and any picked image never
  leave your device.
- **No analytics, no servers, no accounts.**
- **Storage:** your control settings (tier, columns, mode, etc.) and a small
  send-counter (used only to advance the visible nonce) are saved to
  `localStorage`, wrapped in `try/catch` so locked-down/sandboxed contexts still
  work. Nothing you type or upload is ever sent anywhere.

Because it's one self-contained file, you can audit it in a single read, save it
offline, and run it with your network unplugged.

---

## Self-hosting

The repo is wired up for **Cloudflare Workers** (Workers Builds), serving the
`public/` directory as
[static assets](https://developers.cloudflare.com/workers/static-assets/) — there is
no Worker script, just files. The config is [`wrangler.jsonc`](wrangler.jsonc):

```jsonc
{
  "name": "receipt-wrecker",
  "assets": { "directory": "./public" }
}
```

Local development and deployment:

```sh
npx wrangler dev      # local preview of public/ with live reload
npx wrangler deploy   # publish to production
```

The production deploy target for this project is **`receipt.uwutoowo.com`**
(configured as a custom domain/route for the Worker in the Cloudflare dashboard or
`wrangler.jsonc` `routes` — a deploy step, not something `npm test` exercises).

Since it's just static files, you can equally host `public/` on any static host
(GitHub Pages, Netlify, an S3 bucket, your own server) — or just open the file.

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
- **No network calls**, and no storage beyond control settings / the nonce counter.
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
