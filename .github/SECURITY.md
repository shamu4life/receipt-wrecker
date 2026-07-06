# Security Policy

## Supported versions

Receipt Wrecker is a single static page, shipped from the `main` branch. Only the
**latest released version** receives security fixes.

| Version | Supported |
|---------|-----------|
| latest (`main`) | ✅ |
| older releases  | ❌ |

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report privately through GitHub's **Report a vulnerability** flow:

1. Go to the repository's **[Security](https://github.com/shamu4life/receipt-wrecker/security)** tab.
2. Click **Report a vulnerability**.
3. Describe the issue, steps to reproduce, and impact.

This opens a private advisory visible only to the maintainers. We aim to
acknowledge reports within a few days. There is no bug-bounty program — this is
a hobby project — but credit is gladly given in the advisory if you'd like it.

## What is in scope

- **XSS / HTML injection** via how the generated glyph payload or any control
  value is rendered into the page (the preview `<pre>`, the character counter,
  etc.). Output should always be set as text, never parsed as markup. Note the
  glyph engine's own tier tables never include `<`, `>`, or `&` by design — a way
  to smuggle one of those characters into rendered output would be a bug.
- **Any code path that makes a network request.** The app is meant to be 100%
  client-side — no `fetch`/XHR, no analytics, no servers, no CDN or external
  resources. Images are read locally via `FileReader` and never uploaded. If you
  find anything that calls out to the network, that's a bug — please report it.
- **Canvas/image-handling issues** that could hang or crash the tab on a
  maliciously crafted image file (e.g. pathological dimensions causing excessive
  memory use before downscaling).

## What is *not* a vulnerability (by design)

These are documented properties of a client-only static tool, not bugs — please
don't report them:

- **No server, no accounts, no stored data.** It's a single static page; there is
  nothing to authenticate against and no backend to attack.
- **The only storage is two `localStorage` keys** — `rw_controls_v1` (your
  control-panel settings) and `rw_nonce_seq` (a send counter used only to advance
  the visible cheer nonce) — both wrapped in `try/catch`. Nothing you type or
  upload is ever persisted or sent anywhere.
- **No HTML/markup injection.** This was deliberately evaluated and cut for the
  glyph payload (see `CLAUDE.md` and the design spec) — the tool only emits plain
  Unicode glyphs, on purpose. This is a design decision, not something to
  "restore."
- **Glyph-rendering inaccuracies on a given receiving font/renderer are not
  security issues.** If a tier renders as tofu on some destination, or the
  column count is off on a particular rig, that's exactly what the **Census**
  ("Print test strip") feature exists to diagnose — please file it as a normal
  issue with the renderer/environment details, not a vulnerability.
- **AutoMod / blocked-terms holding or dropping a message** is a per-channel
  Twitch moderation setting, entirely outside this tool's control.
- **No uptime guarantee.** The hosted demo is best-effort; availability of
  [receipt.uwutoowo.com](https://receipt.uwutoowo.com/) is not part of this
  policy.

See [`README.md`](../README.md) and [`CLAUDE.md`](../CLAUDE.md) for the full
design rationale.
