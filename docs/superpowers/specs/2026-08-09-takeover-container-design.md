# Takeover as a container, and text formatting everywhere — design

**Date:** 2026-08-09
**Status:** approved (design); implementation plan to follow
**Branch:** `feat/takeover-container` (stacked on `fix/takeover-coverage`, PR #15)

## Why

Four complaints, all real:

1. **Three fixed lines and one picture is too rigid.** You cannot put two pictures up
   there, or five lines, or a caption under an image.
2. **You cannot have the fake cheer *and* your own content.** Blank and Fake cheer are
   mutually exclusive styles on one selector, so picking one forbids the other.
3. **Takeover lines and text blocks are different kinds of text** with different
   controls, and neither can do bold / italic / underline / strikethrough / font.
4. **Blocks placed after a takeover appear broken.** Measured cause below — it is real,
   and it is not the block model.

## Constraints, measured before designing

All of these were rendered through printer-bot's own binary (wkhtmltopdf 0.12.6
patched-qt, its exact flags and receipt stylesheet). They bound the design.

**Content in the covered area must live inside the one lifted SVG.** There is no layout
flow above the message, so a separate "cover" block with content blocks after it cannot
work. Both escape routes were tested and both fail:

- Giving the cover a negative *bottom* margin so following blocks flow up into it
  **destroys the cover** — the avatar, the bits line and the name all reappear
  (tested at `-330px` and `-293px`).
- Letting a following block lift *itself* moves it about **48px**, against the ~330 it
  would need. `-300px` and `-330px` produce the identical 48px.

This is why the takeover owns its contents, and why the container model below is a UI
change rather than a rendering change.

**A `<foreignObject>` silently deletes every SVG sibling that follows it.** Already
documented in `CLAUDE.md`; it forces the emission-order rule below.

**"Blocks after a takeover are broken" is a budget problem, not a rendering one.**
A fake cheer with a picture on a minted link is **479 characters**. Adding any second
block pushes the stack past Twitch's 500, so it splits into two cheers — **200 bits** —
and **part 2 prints its own receipt with a bare, uncovered header**. Measured:
part 1 = 491 chars with the cover, part 2 = 136 chars with none. That is the bug.

(The `iframe` carrier separately deletes everything after the takeover. Reproduced; it
is already flagged `framedOk:false` and warned about in the UI. Not in scope here.)

**All requested formatting renders.** `font-weight`, `font-style`, `text-decoration`
(both `underline` and `line-through`, as an attribute or via `style`), and
`font-family` — including combinations — all verified on the real engine. Generic
families (`serif`, `monospace`, `cursive`, `fantasy`) always resolve; `Arial Black`,
`Impact`, `Comic Sans MS`, `Georgia`, `Times New Roman`, `Courier New` are core Windows
fonts and so are very likely present on the streamer's box. A missing font falls back
silently rather than failing, so this degrades safely.

## Design

### 1. The Takeover becomes a container

A takeover block holds an **ordered list of items**, each either **text** or **picture**,
added, reordered (↑/↓) and removed inside the card. No fixed slots, no styles.

```
Takeover
  Anchor [top | centre | bottom]    Reach up [====|--] 240pt
  ├ Picture   avatar.png     width [==|--]  align [centre]  nudge [0]
  ├ Text      -100000 BITS   font [Arial Black] size [24]  B I U S  align nudge
  ├ Text      IRS            font [Arial Black] size [19]  B I U S  align nudge
  ├ Text      tax lien       font [serif]       size [13]  B I U S  align nudge
  [+ text]  [+ picture]  [Seed fake donation]
```

**`Seed fake donation`** appends four pre-configured items — picture, amount line, name,
italic note — reproducing today's fake-cheer arrangement. After that they are ordinary
items: editable, deletable, and you can add more. This is what makes "fake cheer plus my
own stuff" work, and it replaces the Blank/Fake-cheer selector entirely.

The seed is **platform-neutral**. It pre-fills the amount line as plain text you
overwrite. The app holds no knowledge of Twitch vs YouTube vs Kick, because the same
printer-bot is used on all three and their amount formats differ.

### 2. Item model

```js
// text item
{ kind: "text", text, size,            // size is a px font-size
  fmt: { font, bold, italic, underline, strike },
  align: "left"|"centre"|"right", nudge }   // nudge is ± px on the item's own baseline

// picture item
{ kind: "pic", url, width, carrier,
  align: "left"|"centre"|"right", nudge }
```

`fmt` is a **shared struct**, used identically by takeover text items and by top-level
text blocks. That is the whole of requirement 3.

The **font list is fixed and engine-verified** — every entry below was rendered through
printer-bot's binary before being offered: `Arial` (default), `Arial Black`, `Impact`,
`Comic Sans MS`, `Georgia`, `Times New Roman` / `serif`, `Courier New` / `monospace`,
`cursive`, `fantasy`. Named families are core Windows fonts; the four generics always
resolve. Nothing else is offered, because an unverified name is a silent fallback that
looks like the control not working.

`size` is deliberately **not** unified: inside a takeover it is a px font-size, at top
level it stays the existing fill-% (the word scales to the paper width). They are
genuinely different quantities and merging them would break Big Text.

### 3. Layout

Items stack top to bottom in the covered area, using the existing leading rule —
`max(prev.size, next.size) × 1.35` — via the shared `takeoverOffsets`. A picture
contributes its drawn height plus the existing gap.

- **Anchor** (block-level): `top`, `centre` or `bottom` within the covered area. This
  preserves both of today's behaviours — the fake cheer wants `top` because it mimics the
  bot's header; a bare three-liner reads better at `bottom`.
  `top` **keeps today's lift cap**: the stack starts at
  `max(6, pullPx − CHEER_MAX_LIFT_PX)`, so at or below the default pull it sits 6px down
  (preserving the reference layout exactly) and beyond it the block follows the message
  down the tape instead of riding off the top of the roll. Without this, `top` would not
  be byte-identical to today's fake cheer at above-default pulls.
- **Align** (per item): text maps to `text-anchor` `start`/`middle`/`end` with x at
  `4`, `W/2`, `W−4`. A picture sets x to `4`, `(W−width)/2` or `W−width−4` respectively.
- **Nudge** (per item): ± px added to that item's placed y. Items after it are **not**
  re-flowed — a nudge moves one thing, which is the point.

Overflow keeps today's rule: items that do not fit inside the covered area are **dropped
rather than emitted invisibly**, and the drop note says which and why. An item is never
emitted outside the painted box, because that prints on top of the header the block
exists to cover.

### 4. Emission order is not stack order

**All `<text>` elements are emitted before all `<foreignObject>` pictures**, whatever
order the items appear in. This is forced by the parser rule above. Layout is computed
independently of emission, so the visual result matches the stack — with one consequence:
a picture nudged onto text paints *over* it. That is visible in the preview and is
accepted rather than prevented.

### 5. Continuation covers

When a stack whose first part contains a takeover splits across cheers, every part after
the first gets a **plain cover prepended** — a white rect at the same `pullPt`, about 106
characters — so every receipt in the run has its header painted and the sequence reads as
one continuous piece.

This is the **one change to `packStackBodies`**: per-part overhead is no longer constant,
because parts after the first carry the cover. The packer must account for that when
deciding boundaries or it will overfill them.

On by default, with a **stack-level** toggle (next to the Cheer/Bits controls, not on the
takeover card — it governs the whole run, not one block) to reclaim the 106 chars/part.

### 6. Budget feedback

The takeover card shows its own character cost. When a split is coming, the card says so
and why. Part headers already show `chars / 500` and the total bits; adding an item makes
its price immediately visible.

### 7. Migration

Existing takeover blocks convert once, stamped `tkV`:

- **Blank** → picture (if set) plus each non-empty line with its current size; anchor
  `bottom`.
- **Fake cheer** → avatar, amount, name, note with today's sizes and weights
  (24/900, 19/700, 13/italic); anchor `top`.

A test pins that a migrated block emits **byte-identical markup** to what it emits today —
the same standard used for the composer migration. `pullPt` and `pullV` carry over
untouched.

**One deliberate behaviour change:** `CHEER_SUFFIX` is removed and `" BITS"` is baked into
the amount item's text at migration. The line becomes ordinary free text, so it can hold
`$50.00`, `1,000 Kicks` or `¥500`. Typing a bare number no longer appends ` BITS`; the
seed inserts a full string instead. This is what makes the block usable off Twitch.

The `Cheer100` token stays exactly as it is — it is the real chat trigger, already
Twitch-only and already switched off by the existing Cheer checkbox.

## Non-goals

Free x/y canvas; inline markup (`*bold*`); per-item colour; drag-to-reorder (↑/↓ stays);
per-item rotation. Also **not** removing `CHEER_MIN_PIC_PX` — see below.

## Known risk carried forward

`CHEER_MIN_PIC_PX = 120` could not be reproduced: the documented failing case (200×67 in a
lifted takeover) printed, as did every other combination tried, with and without the width
clamp. If the floor is wrong it is forcing portraits into 120px squares and spending
budget for nothing. **It is left in place** — it contradicts an earlier engine measurement
whose conditions are unknown, and it deserves one real print before the guard comes out.
The design must not depend on removing it; pictures keep true aspect via the existing
probe, clamped to the floor as today.

## Suggested phasing

Three independently shippable steps, each leaving the app working:

1. **Formatting** — the shared `fmt` struct, the font list, and B/I/U/S on today's
   takeover lines and top-level text blocks. No model change, immediately useful.
2. **Container** — items, seed, anchor, align, nudge, migration. The big one.
3. **Continuation covers** — the `packStackBodies` change and the stack-level toggle.
   This is the fix for "blocks after a takeover are broken" and is separable from 1 and 2.

## Testing

**Pure core:** item layout offsets; align and nudge maths; the three anchor modes;
overflow dropping; formatting attribute emission (all five, and combinations); the
all-text-before-all-pictures rule; migration byte-equivalence; continuation-cover
insertion and its effect on packing; budget accounting.

**Real engine:** representative stacks (seeded fake donation plus extra items, two
pictures, every formatting option), and a deliberate multi-part split confirming every
receipt's header is covered.

**Browser:** the card UI — add, reorder, remove, seed — and zero console errors.
