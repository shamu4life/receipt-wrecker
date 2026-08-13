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

- Escaping failures in generated markup. The app deliberately emits HTML/SVG
  (big type, real pictures, Takeovers) because the destination renders a chat
  message as HTML. Every user-supplied value that lands in that markup, whether it
  is line text, a name or a picture URL, must go through `escapeHtml` /
  `escapeAttr` in the pure core. A way to break out of an attribute or inject a tag
  is a bug.
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
- XSS in the app's own page, via how a payload or control value is rendered into
  the preview.
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
- The only storage is three `localStorage` keys: `rw_controls_v1` (your
  control-panel settings), `rw_blocks_v1` (your block stack) and `rw_nonce_seq` (a
  send counter used only to advance the visible cheer nonce), each wrapped in
  `try/catch`. Nothing you type or upload is ever persisted or sent anywhere.
- No HTML/markup injection. This was deliberately evaluated and cut for the glyph
  payload (see `CLAUDE.md` and the design spec): the tool only emits plain Unicode
  glyphs, on purpose. This is a design decision, not something to "restore."
- Glyph-rendering inaccuracies on a given receiving font/renderer are not
  security issues. If a tier renders as tofu on some destination, or the column
  count is off on a particular rig, that is exactly what the Census ("Print test
  strip") feature exists to diagnose. File it as a normal issue with the
  renderer/environment details, not as a vulnerability.
- AutoMod / blocked-terms holding or dropping a message is a per-channel Twitch
  moderation setting, entirely outside this tool's control.
- No uptime guarantee. The hosted demo is best-effort; availability of
  [receipt.uwutoowo.com](https://receipt.uwutoowo.com/) is not part of this
  policy.

See [`README.md`](../README.md) and [`CLAUDE.md`](../CLAUDE.md) for the full
design rationale.
