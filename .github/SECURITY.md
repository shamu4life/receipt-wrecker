# Security Policy

## Supported versions

Receipt Wrecker is a single static page, shipped from the `main` branch. Only the
latest released version receives security fixes.

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
acknowledge reports within a few days. There is no bug-bounty program, since this
is a hobby project, but credit is gladly given in the advisory if you'd like it.

## What is in scope

- Escaping failures in generated markup. The app deliberately emits a little HTML
  (`div`, `pre` and `br` with a `style` attribute: big text, sideways text,
  glyph-art grids) because SassyTP's printer-bot renders a High Roller cheer's
  message as HTML. Every user-supplied character that lands in that markup must go
  through `escapeHtml` / `escapeAttr` in the pure core. A way to break out of an
  attribute or inject a tag is a bug.
- SSRF against the `/px` image proxy. This is the highest-value target in the
  project. `/px?u=<url>` fetches a remote image on the server's behalf and is
  guarded by `isPublicHttpUrl()` in `src/worker.js`: public http(s) only, no other
  scheme, no loopback / private / link-local / cloud-metadata hosts, IPv6 literals
  and v4-mapped forms checked, and every redirect hop re-validated. **Any bypass of
  that guard is a real vulnerability. Please report it.** `test/proxy.test.mjs`
  covers the known cases.
- Abuse of `POST /upload`. It accepts `image/*` only, caps bodies at 5 MB, and
  stores objects in Cloudflare KV under a random key with a native 15-minute TTL.
  Ways to store non-images, exceed the cap, bypass the TTL, or enumerate other
  people's keys are in scope.
- The image-serving routes. Keys are matched by shape (`imageKeyFor`), which
  shares a namespace with the static site. A path that makes an image route shadow
  or replace a real asset, or that escapes the key pattern, is in scope.
- XSS in the app's own page, via how a payload, a control value or an imported
  preset is rendered.
- Escaping the preview frame. Each part is drawn by SassyTP's receipt page (vendored
  in `public/index.html`) inside an `<iframe sandbox="allow-scripts">` with an opaque
  origin and a no-network page policy, talking to the app only by `postMessage`
  (both ends check `event.source`). A message that reaches the app's page, its
  storage or the network from inside that frame is in scope.
- Canvas/image-handling issues that could hang or crash the tab on a maliciously
  crafted image file (e.g. pathological dimensions causing excessive memory use
  before downscaling).

## What is *not* a vulnerability (by design)

These are documented properties of a client-only static tool, not bugs. Please
don't report them.

- No accounts or sessions. There is no login, no user record and no authentication
  to bypass. Note that there *is* a backend (`src/worker.js`), and it is in scope
  above.
- Uploaded images are readable by anyone with the link. That is the design: an
  unguessable 48-bit key, alive for 15 minutes, so a payload can point a printer at
  it. Guessing one is impractical; being able to read one you were *given* is not a
  bug.
- The only storage is four `localStorage` keys: `rw_controls_v1` (your settings),
  `rw_nonce_seq` (the repeat-number counter), `rw_blocks_v1` (your block stack) and
  `rw_presets_v1` (your presets), each wrapped in `try/catch`. What you type stays in
  your browser; pasting a picture link or uploading a picture sends it to this
  project's Worker, as `README.md` describes.
- The app emitting markup at all. SassyTP's bot prints a High Roller cheer's message
  as HTML through its own allow-list sanitizer; sending styled `div`, `pre` and `br`
  is the point of the tool.
- Glyph-rendering inaccuracies on a given rig are not security issues. If something
  prints wrong on a particular printer (fonts, column count, a tier that comes out
  blank), the app's High Roller test and Plain test exist to diagnose it. File it as
  a normal issue with the printer/environment details.
- AutoMod / blocked-terms holding or dropping a message is a per-channel Twitch
  moderation setting, entirely outside this tool's control.
- No uptime guarantee. The hosted demo is best-effort; availability of
  [receipt.uwutoowo.com](https://receipt.uwutoowo.com/) is not part of this
  policy.

See [`README.md`](../README.md) and [`CLAUDE.md`](../CLAUDE.md) for the full
design rationale.
