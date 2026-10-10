## Summary

<!-- What does this PR do and why? One to three bullet points. -->

-

## Type of change

<!-- Check all that apply -->

- [ ] Bug fix (visible to users → `PATCH`)
- [ ] New feature or capability (→ `MINOR`)
- [ ] Breaking change: removed/renamed a mode or option, changed message output, or changed a `localStorage` key (→ `MAJOR`)
- [ ] Internal refactor / styling / accessibility (→ `PATCH`)
- [ ] CI / docs only (no version bump)

## Checklist

### Code

- [ ] `npm test` passes (pure-core unit tests)
- [ ] `npm run test:browser` passes (Playwright, the real page, including the MANDATORY contract test against the vendored SassyTP renderer; CI runs it too)
- [ ] `npx wrangler deploy --dry-run` passes
- [ ] Kept single-file: CSS and JS stay inline in `public/index.html`; no separate `.css`/`.js` assets, no dependencies, no bundler, no framework, no CDN, no web fonts
- [ ] No **new** network call; the app's four `fetch` call sites stay limited to our own `/upload` and `/px`, and `/px`'s SSRF guard is untouched
- [ ] No new storage beyond `rw_controls_v1` / `rw_nonce_seq` / `rw_blocks_v1` / `rw_presets_v1` (new state goes in as a field of one of those) (or N/A)
- [ ] Messages still use only `div` and `pre` with only `style`, never a picture tag or a `<br>` in any letter case, never start with `<`, and every user-supplied character in markup goes through `escapeHtml`/`escapeAttr` (`test/tags.test.mjs` covers new builders) (or N/A)
- [ ] Every High Roller mode still has its plain form (Han tiling) behind it, and nothing was added to get a form past a channel's filter: no obfuscated tokens, no swapped-in tag or structure (see THE RULE in `CLAUDE.md`) (or N/A)
- [ ] The vendored renderer block was changed only through `tools/vendor-renderer.mjs`, and `node tools/vendor-renderer.mjs --check` passes (or N/A)
- [ ] Anything about what prints was measured, not argued: the message from `tools/payload.mjs` (or Copy) through `npm run bench` (`tools/forkbench.mjs`, SassyTP's real receipt page) at `--paper 80` and `--paper 58`, and the docs say what is bench evidence and what still needs a real print (or N/A)
- [ ] If `src/worker.js` or `wrangler.jsonc` changed: the owner asked for it, both custom domains are still declared in `routes`, and `npx wrangler deploy --dry-run` passes (or N/A)
- [ ] If merging to `main`: prod-vs-`main` divergence check run first (a push to `main` auto-deploys to production)
- [ ] New pure-core behaviour has a `test/*.test.mjs` case added/updated (or N/A)
- [ ] Tried in a browser (open `public/index.html` or `npx wrangler dev`); describe how in the Summary

### Version & changelog

- [ ] Version bump not required (CI / docs only) **OR**
- [ ] `package.json` `version` updated
- [ ] `docs/CHANGELOG.md` new section added at the top
- [ ] `README.md` version badge updated
- [ ] `public/llms.txt` "Current version" line updated

### Documentation

- [ ] `README.md` updated (modes, settings, privacy as applicable) (or N/A)
- [ ] `CLAUDE.md` updated (the target, architecture, constraints; regenerate the export list if pure-core exports changed) (or N/A)
- [ ] `public/llms.txt` updated if current behaviour changed (it ships with the site) (or N/A)
