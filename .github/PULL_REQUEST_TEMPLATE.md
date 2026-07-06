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
- [ ] No network calls added (`fetch`/XHR stay out; images stay local via `FileReader`)
- [ ] No new `localStorage`/`sessionStorage` beyond `rw_controls_v1` / `rw_nonce_seq` **— or** N/A
- [ ] No HTML/markup injection reintroduced — output stays plain Unicode glyphs
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
