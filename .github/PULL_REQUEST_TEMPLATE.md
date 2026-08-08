## Summary

<!-- What does this PR do and why? One to three bullet points. -->

-

## Type of change

<!-- Check all that apply -->

- [ ] Bug fix (visible to users → `PATCH`)
- [ ] New feature or capability (→ `MINOR`)
- [ ] Breaking change — removed/renamed a tier/mode/option, changed payload output, or changed a `localStorage` key (→ `MAJOR`)
- [ ] Internal refactor / styling / accessibility (→ `PATCH`)
- [ ] CI / docs only (no version bump)

## Checklist

### Code

- [ ] `npm test` passes (pure glyph-engine unit tests)
- [ ] `npx wrangler deploy --dry-run` passes
- [ ] Kept single-file — CSS and JS stay inline in `public/index.html`; no separate `.css`/`.js` assets, no dependencies, no bundler, no framework, no CDN, no web fonts
- [ ] No **new** network call added — the app's `fetch` calls stay limited to our own `/upload` and `/px`, and `/px`'s SSRF guard is untouched
- [ ] No new `localStorage`/`sessionStorage` beyond `rw_controls_v1` / `rw_nonce_seq` / `rw_blocks_v1` **— or** N/A
- [ ] If `src/worker.js` or `wrangler.jsonc` changed: both custom domains are still declared in `routes`, and `npx wrangler deploy --dry-run` passes
- [ ] If merging to `main`: prod-vs-`main` divergence check run first (a push to `main` auto-deploys to production)
- [ ] Every markup mode still has a markup-free fallback behind it (Hanzi tiling for text, glyph-art for pictures), and anything user-supplied that lands in markup goes through `escapeHtml`/`escapeAttr`
- [ ] A real picture's carrier tag still comes from `EMBEDS` via `buildImageEmbed()` — no tag hardcoded at a call site
- [ ] New pure-core behavior has a `test/*.test.mjs` case added/updated **— or** N/A
- [ ] Smoke-tested in a browser (open `public/index.html` or `npx wrangler dev`) — describe how in the Summary

### Version & changelog

- [ ] Version bump not required (CI / docs only) **OR**
- [ ] `package.json` `version` updated
- [ ] `docs/CHANGELOG.md` new section added at the top
- [ ] `README.md` version badge updated

### Documentation

- [ ] `README.md` updated (Tiers / How it works / Privacy as applicable) **— or** N/A
- [ ] `CLAUDE.md` updated (glyph pipeline, Global Constraints, or hard constraints as applicable) **— or** N/A
