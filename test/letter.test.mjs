// 1.6.0: Letter paper, a second printer. Printer Bot 3.0 prints a cheer on whichever printer its
// rules send it to; here, cheers of `letterBits` bits or more go to a Letter printer (a sheet: 400 CSS
// px printed 7.5 inches wide at 300 dpi, one 10-inch page a receipt), the rest to the roll. Two
// layouts (Scaled like 80 mm, Large message), two print profiles (black and white, color), and in
// color a block may carry a text color and a background color.
import test from "node:test";
import assert from "node:assert/strict";
import { loadCore, eq } from "./_harness.mjs";

const C = loadCore();
const PPI = 400 / 7.5;
const r4 = (x) => Math.round(x * 1e4) / 1e4;

test("the Letter page: 400 CSS px wide (372 for the message), 2250 dots, 53.3 px to the inch, a page of 533 px", () => {
  eq(C.paperSpec("letter"), { mm: "letter", cssWidth: 400, contentW: 372, dots: 2250, pxPerInch: PPI, pagePx: 533, letter: true });
  eq(C.paperSpec(80), { mm: 80, cssWidth: 272, contentW: 244, dots: 576, pxPerInch: 96, pagePx: 0 });
  eq(C.paperSpec(58), { mm: 58, cssWidth: 181, contentW: 153, dots: 384, pxPerInch: 96, pagePx: 0 });
  assert.ok(Math.abs(C.mmPerPx("letter") - 25.4 * 7.5 / 400) < 1e-12, "a Letter CSS px is 0.47625 mm");
  assert.equal(C.mmPerPx(80), 25.4 / 96);
});

test("the Letter printer's settings: from what bits, its layout, its image fit, its print profile", () => {
  const n = (o) => C.normalizeControls(o);
  const d = n({});
  eq([d.letterBits, d.letterLayout, d.letterFit, d.letterProfile], [0, "scaled", "fit", "bw"]);
  eq([n({ letterBits: "500" }).letterBits, n({ letterBits: 7.9 }).letterBits, n({ letterBits: 5e7 }).letterBits], [500, 7, 1000000]);
  for (const junk of [-1, "", "x", null]) assert.equal(n({ letterBits: junk }).letterBits, 0, String(junk));
  eq([n({ letterLayout: "message" }).letterLayout, n({ letterLayout: "big" }).letterLayout], ["message", "scaled"]);
  eq([n({ letterFit: "fill" }).letterFit, n({ letterFit: "stretch" }).letterFit, n({ letterFit: "cover" }).letterFit], ["fill", "stretch", "fit"]);
  eq([n({ letterProfile: "color" }).letterProfile, n({ letterProfile: "colour" }).letterProfile], ["color", "bw"]);
  // The roll's own width stays a roll: Letter is chosen by bits, never as the roll.
  assert.equal(n({ paperMm: "letter" }).paperMm, 80);
});

test("targetPaper: a cheer of the Letter printer's bits or more prints on Letter, any other on the roll", () => {
  const t = (o) => C.targetPaper({ paperMm: 80, letterBits: 500, ...o });
  assert.equal(t({ bits: 500 }), "letter");
  assert.equal(t({ bits: 1000 }), "letter");
  assert.equal(t({ bits: 499 }), 80);
  assert.equal(t({ bits: 499, paperMm: 58 }), 58);
  assert.equal(t({ bits: 5000, letterBits: 0 }), 80);
  // A free test is built for the paper the real cheer would reach.
  assert.equal(t({ bits: 600, cheer: false }), "letter");
});

test("contentLimitPx on Letter: the page leaves 125 px in Scaled like 80 mm and 343 in Large message, under the bot's lengths in inches", () => {
  const L = (o) => { const { leadPx, ...box } = C.contentLimitPx({ bits: 600, letterBits: 500, ...o }); return box; };
  // The header and footer, measured on the bot's own page with its profile picture (Scaled like 80 mm
  // is the roll's header; Large message has a small picture beside the name and the logo below).
  eq(C.LETTER_CHROME_PX, { scaled: 407.8125, message: 189.96875 });
  eq(L({}), { px: 533 - 407.8125, by: "page", fades: true });
  eq(L({ letterLayout: "message" }), { px: 533 - 189.96875, by: "page", fades: true });
  // The streamer's lengths are lengths of paper: 53.3 px to the inch on Letter.
  eq(L({ bitsPerInch: 600 }), { px: Math.floor(PPI), by: "bits", fades: true });        // 1 inch
  eq(L({ maxInches: 2 }), { px: Math.floor(2 * PPI), by: "cap", fades: true });
  eq(L({ maxInches: 40, letterLayout: "message" }), { px: 533 - 189.96875, by: "page", fades: true });
  // A roll keeps its own box, exactly as before.
  eq(L({ bits: 100 }), { px: 1600, by: "ceiling", fades: false });
});

test("stackContext on Letter: the paper, the room after the Cheer line, centring in Large message, color in the color profile", () => {
  const base = { cheer: true, bits: 600, hrThreshold: 25, letterBits: 500 };
  const s = C.stackContext(base);
  eq([s.paperMm, s.contentW, s.paper.cssWidth], ["letter", 372, 400]);
  assert.equal(r4(s.room), r4(533 - 407.8125 - 21.6));
  eq([s.center, s.color], [false, false]);
  const m = C.stackContext({ ...base, letterLayout: "message", letterProfile: "color" });
  eq([m.center, m.color], [true, true]);
  // Below the threshold the page is the limit too: the bot cuts a plain message at its end.
  const p = C.stackContext({ ...base, hrThreshold: 1000 });
  eq([p.mode, p.limit.by, r4(p.limit.px)], ["plain", "page", r4(533 - 407.8125)]);
  // The roll is untouched: no centring, no color, the 1600 box.
  const roll = C.stackContext({ ...base, bits: 100, letterProfile: "color", letterLayout: "message" });
  eq([roll.paperMm, roll.center, roll.color, roll.limit.px], [80, false, false, 1600]);
});

test("Han tiling on Letter: 23 cells a row, a plain header of 22 (the quote mark and 23 cells are wider than 372 px)", () => {
  assert.equal(C.hanziCols(C.paperSpec("letter").contentW), 23);
  assert.equal(C.designTHeader("letter", "plain"), 22);
  assert.equal(C.designTHeader("letter", "raw"), 23);
  assert.equal(C.designTPictureCols("letter"), 21);
});

test("colorOf: a color is #rrggbb, lower case, or none", () => {
  eq(["#C00000", "#00ff7f", "#abc", "red", "#12345", "#1234567", null, "", "#gggggg"].map(C.colorOf),
     ["#c00000", "#00ff7f", "", "", "", "", "", "", ""]);
});

test("builders: centring and colors are style declarations of the block's own div, counted in its characters", () => {
  const o = { layout: "lines", size: "fit1", contentW: 372 };
  const plain = C.buildBigBodies("HELLO", o)[0], styled = C.buildBigBodies("HELLO", { ...o, center: true, color: "#C00000", bg: "#ffff00" })[0];
  assert.match(styled.html, /^<div style="\\66ont:700 \d+px\/\.8 Arial;text-align:center;color:#c00000;background-color:#ffff00">HELLO<\/div>$/);
  assert.equal(styled.chars - plain.chars, ";text-align:center;color:#c00000;background-color:#ffff00".length);
  const flip = C.buildBigBodies("HELLO", { ...o, flip: true, color: "#c00000" })[0];
  assert.match(flip.html, /;rotate:180deg;color:#c00000">/);
  const side = C.buildSideBodies("HELLO", { contentW: 372, color: "#0000ff", bg: "#eeeeee" })[0];
  assert.match(side.html, /;white-space:nowrap;margin:auto[^"]*;color:#0000ff;background-color:#eeeeee">/);
  // A grid: centred and colored, the characters only (no background, by the owner's pick).
  const grid = Array.from({ length: 4 }, () => Array.from({ length: 16 }, () => "鬱"));
  const g = C.buildGlyphBodies("cjk", grid, { paperMm: "letter", center: true, color: "#c00000", bg: "#ffff00" })[0];
  assert.match(g.html, /^<div style=\\66ont-size:[\d.]+vw;line-height:1;text-align:center;color:#c00000><div>/);
  const mono = C.buildGlyphBodies("ascii", Array.from({ length: 3 }, () => Array.from({ length: 10 }, () => "@")), { paperMm: "letter", center: true, color: "#00aa00" })[0];
  assert.match(mono.html, /^<pre style="\\66ont:[\d.]+vw\/1\.2 'Courier New';margin:0;text-align:center;color:#00aa00">/);
  // No color: byte for byte what the builders sent before.
  assert.equal(C.buildBigBodies("HELLO", { ...o, color: "", bg: "nope" })[0].html, plain.html);
});

test("picture links on Letter: 4 inches is 213 px, and a picture can shrink to three quarters of an inch before anything is cut", () => {
  const p = C.picturePrint(1000, 2000, 372, PPI);
  eq([r4(p.w), p.h], [r4(1000 * 213 / 2000), 213]);
  const link = C.pictureLink("https://i.imgur.com/AbC1234.png");
  const [b] = C.buildPictureBodies(link, 1000, 2000, { contentW: 372, heightPx: 300, pxPerInch: PPI, shrinks: true });
  assert.equal(r4(b.heightPx), r4(Math.round(0.75 * PPI) + 12.8));
  eq([r4(b.picture.w), b.picture.h, b.picture.shrinks, b.picture.tall], [r4(1000 * 213 / 2000), 213, true, false]);
});

test("previewEvent on Letter: the options 3.0.1's OptionsFor sends a Letter printer", () => {
  const ev = (o) => C.previewEvent({ payload: "x", bits: 600, cheer: true, hrThreshold: 25, letterBits: 500, ...o }).options;
  const s = ev({});
  eq([s.pxPerInch, s.pageHeightPx, "layout" in s, "imageFit" in s], [PPI, 533, false, false]);
  const m = ev({ letterLayout: "message", letterFit: "fill" });
  eq([m.layout, m.imageFit], ["message", "fill"]);
  const roll = ev({ bits: 100 });
  eq([roll.pxPerInch, "pageHeightPx" in roll], [96, false]);
});

test("letterDither: Letter in black and white shades only the pictures; letters and lines stay sharp (the bot's AddRowsMasked)", () => {
  // A 6 x 4 grey page at a scale of 1, one picture area over its left half.
  const w = 6, h = 4, rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = 100; rgba[i * 4 + 3] = 255; }
  const bits = C.letterDither(rgba, w, h, w, "floyd", [[0, 0, 1, 4]], 1);
  // Outside the picture (padded by 2 dots: columns 0..2 are picture) a grey of 100 is black: a plain < 128 threshold.
  for (let y = 0; y < h; y++) for (let x = 3; x < w; x++) assert.equal(bits[y * w + x], 1, "x " + x + " y " + y);
  // Inside, the shading leaves some dots white.
  assert.ok(bits.some((v, i) => i % w < 3 && v === 0));
  // Crisp (threshold) shades nothing anywhere.
  assert.ok(C.letterDither(rgba, w, h, w, "threshold", [[0, 0, 1, 4]], 1).every((v) => v === 1));
  // With no picture areas nothing is shaded: the page is a threshold.
  assert.ok(C.letterDither(rgba, w, h, w, "floyd", [], 1).every((v) => v === 1));
});

test("sizes in words follow the paper: a Letter CSS px is 0.476 mm, so capitals and lengths read larger than on a roll", () => {
  const big = (paperMm, contentW) => C.buildBigBodies("HELLO", { layout: "lines", size: 100, contentW, paperMm })[0].big;
  assert.equal(big(80, 244).capCm.toFixed(1), "1.9");
  assert.equal(big("letter", 372).capCm.toFixed(1), "3.4");
  assert.equal(C.bigCapCm(100, "arial", "letter").toFixed(1), "3.4");
  assert.equal(C.bigCapCm(100, "arial").toFixed(1), "1.9");
  // A sideways run: its capitals across the paper and its length down it.
  const side = C.buildSideBodies("HELLO", { size: 100, contentW: 372, paperMm: "letter" });
  assert.match(C.sideReport(side, { cheers: 1, bits: 600, paperMm: "letter" }), /^Capitals ≈ 3\.4 cm across the paper, /);
  // The page, in words: what it leaves the message (125 px, about 6.0 cm), where the bot fades it.
  const lim = C.contentLimitPx({ bits: 600, letterBits: 500 });
  const tall = C.buildBigBodies("I", { layout: "lines", size: 400, contentW: 372, heightPx: lim.px - 21.6, paperMm: "letter" });
  assert.match(C.bigReport(tall, { cheers: 1, bits: 600, limit: lim, paperMm: "letter" }),
    /what the Letter page leaves the message \(about 6\.0 cm\), where the bot fades it out/);
});

test("the Letter printer prints High Roller (its Allow High Roller prints is taken as on): the app's switch is the roll printer's", () => {
  const o = { cheer: true, hrThreshold: 25, allowHighRoller: false, letterBits: 500 };
  assert.equal(C.printMode({ ...o, bits: 600 }), "raw");
  assert.equal(C.printMode({ ...o, bits: 100 }), "plain");
  assert.equal(C.stackContext({ ...o, bits: 600 }).mode, "raw");
  assert.equal(C.previewEvent({ ...o, bits: 600, payload: "x" }).options.allowHighRoller, true);
  assert.equal(C.previewEvent({ ...o, bits: 100, payload: "x" }).options.allowHighRoller, false);
  // Below the threshold on Letter, the notice blames the threshold, not the roll printer's switch.
  const n = C.modeNotice({ ...o, hrThreshold: 1000, bits: 600 });
  assert.match(n, /below the streamer's High Roller threshold/);
  assert.doesNotMatch(n, /Allow High Roller prints/);
  // A raise to a threshold the Letter printer takes is a raise, whatever the roll printer's switch says.
  eq(C.bitsRaiseFor({ ...o, hrThreshold: 500, bits: 300 }), { action: "raise", from: 300, to: 500, letter: true });
  assert.equal(C.bitsRaiseFor({ ...o, hrThreshold: 400, bits: 300 }), null);
  // A raise that moves the cheer to the Letter printer says so.
  assert.match(C.raiseNote({ action: "raise", from: 300, to: 500, letter: true }, "Big text"), /prints on the Letter printer/);
  assert.doesNotMatch(C.raiseNote({ action: "raise", from: 20, to: 25 }, "Big text"), /Letter/);
});

test("the High Roller test on Letter: sized for the page, boxed by it, centred in Large message, and it says it prints on the Letter printer", () => {
  const P = (o) => C.buildHighRollerProbe({ hrThreshold: 600, letterBits: 500, paperMm: 80, ...o });
  const s = P({});
  const mPx = Math.floor(C.bigFitPx(372, 5) / C.bigLineEm("MMMMM"));
  assert.equal(s.paperMm, "letter");
  assert.match(s.note, /^One 600-bit cheer, exactly the threshold, which prints on the Letter printer\./);
  // Scaled like 80 mm leaves the message about 2 inches (103.6 px after the Cheer line): BIG (48 px) and the
  // upside-down BIG fit; UP (56.6 px) misses by a pixel, and jog and MMMMM are left out too.
  eq(s.left, ["MMMMM", "jog", "UP"]);
  assert.match(s.note, /The Letter page leaves the message only about 6\.0 cm, so the test leaves out /);
  const m = P({ letterLayout: "message" });
  eq(m.left, []);
  assert.ok(m.bodies[0].html.includes(">MMMMM<") && m.bodies[0].html.includes(mPx + "px/.8"), "MMMMM is sized to the Letter width");
  // Large message lays the message out from the left: the big shapes centre themselves; UP already does.
  assert.equal((m.bodies[0].html.match(/;text-align:center/g) || []).length, 4);
  assert.equal(P({ letterLayout: "scaled" }).bodies[0].html.includes("text-align"), false);
  // On the roll nothing changes.
  const roll = C.buildHighRollerProbe({ hrThreshold: 25, letterBits: 500, paperMm: 80 });
  assert.equal(roll.paperMm, 80);
  assert.match(roll.note, /^One 25-bit cheer, exactly the threshold\. If BIG/);
  // A box that leaves nothing after the repeat number's line on Letter says it in Letter millimetres.
  const tiny = P({ bitsPerInch: 100000 });
  assert.equal(tiny.works, false);
  assert.match(tiny.note, /gets about 0\.0 cm of receipt, and the repeat number's line fills it/);
  const small = P({ bitsPerInch: 1000 });   // 600 / 1000 inch = 32 px on Letter: 10.4 px after the repeat number's line
  assert.match(small.note, /only about 5 mm is left, too short for even the test's smallest shape \(BIG, 23 mm tall\)/);
});

test("the Plain test on Letter: 23 cells a row, one cheer; a page too short for HI sends the row of tones alone", () => {
  const P = (o) => C.buildPlainProbe({ hrThreshold: 1000, letterBits: 500, paperMm: 80, ...o });
  // Scaled like 80 mm: 125 px is five lines, a header, three rows and the tail: no room for HI's seven.
  const s = P({});
  eq([s.bits, s.paperMm, s.bodies.length, s.bodies[0].hanzi.cols, s.bodies[0].hanzi.rows], [999, "letter", 1, 23, 1]);
  assert.match(s.note, /which prints on the Letter printer/);
  assert.doesNotMatch(s.note, /HI in Han characters/);
  assert.match(s.note, /a light first line, a row of tones and a light last line/);
  assert.match(s.note, /Check that the row holds 23 characters/);
  assert.match(s.note, /leaves room for only 3 rows, so HI is left out/);
  // A printer set to Large message prints this cheer, below the threshold, Scaled like 80 mm
  // (Printer Bot 3.0.5), so the test is the same. Before 3.0.5 it got the large page, with HI.
  assert.equal(P({ letterLayout: "message" }).note, s.note);
  // On the roll nothing changes.
  const roll = C.buildPlainProbe({ hrThreshold: 25, letterBits: 500, paperMm: 80 });
  eq([roll.paperMm, roll.bodies.length, roll.bodies[0].hanzi.cols, roll.bodies[0].hanzi.rows], [80, 1, 15, 9]);
});

test("the notices measure the Letter page in its own millimetres", () => {
  // 600 bits at 1,500 bits per inch: 0.4 inch, 21 px on Letter (10 mm; on a roll's scale it would read 6 mm),
  // and the Cheer line fills it.
  const n = C.modeNotice({ cheer: true, bits: 600, hrThreshold: 25, letterBits: 500, bitsPerInch: 1500 });
  assert.match(n, /gives a 600-bit cheer about 10 mm of receipt/);
});

test("the Plain test with the roll printer's switch off is still 1 bit on the roll, and says the switch is the roll's", () => {
  const p = C.buildPlainProbe({ hrThreshold: 1000, letterBits: 500, paperMm: 80, allowHighRoller: false });
  eq([p.bits, p.paperMm, p.mode], [1, 80, "plain"]);
  assert.match(p.note, /The streamer's roll printer has Allow High Roller prints off, so every cheer on the roll prints plain/);
  const solo = C.buildPlainProbe({ hrThreshold: 1000, paperMm: 80, allowHighRoller: false });
  assert.match(solo.note, /The streamer's printer has Allow High Roller prints off, so every cheer prints plain/);
});

test("the verdict under a Letter preview: centimetres of the Letter page, and what the profile picture takes from the page", () => {
  const v = (o, d) => C.previewVerdict({ result: { ok: true, height: 533, standIn: true, security: [] }, ...d }, { paperMm: "letter", bits: 600, ...o })
    .map((x) => x.text).join(" | ");
  // 533 px at 53.3 px to the inch is 10 inches, 25.4 cm. Without a picture the Scaled like 80 mm header is 182 px
  // (8.7 cm) shorter; the Large message header 47.9 px (2.3 cm).
  assert.match(v({}), /^About 25\.4 cm of receipt \(533 px\), header and footer included\. The circle is a stand-in for the viewer's profile picture; when the bot finds none, the header is about 8\.7 cm shorter, room a long message can use\./);
  assert.match(v({ letterLayout: "message" }), /the header is about 2\.3 cm shorter, room a long message can use/);
  assert.equal(C.avatarExtraPx("letter", "scaled"), 182);
  assert.equal(Math.round(C.avatarExtraPx("letter", "message") * 1000) / 1000, 47.922);
  // A cut by the box itself is said in Letter centimetres too.
  assert.match(v({}, { measure: { contentPx: 100, fullPx: 200 } }), /cuts this message off at 4\.8 cm, with no fade\. The whole message is 9\.5 cm\./);
  // The roll is unchanged.
  const roll = C.previewVerdict({ result: { ok: true, height: 451, standIn: true, security: [] } }, { paperMm: 80, bits: 100 })[0].text;
  assert.equal(roll, "About 11.9 cm of receipt (451 px), header and footer included. The circle is a stand-in for the viewer's profile picture; when the bot finds none, the receipt is about 4.8 cm shorter.");
});

test("blockLook: a block is centred in Large message and keeps its colors only on Letter in the color profile", () => {
  const ctx = (o) => C.stackContext({ cheer: true, bits: 600, hrThreshold: 25, letterBits: 500, ...o });
  const block = { color: "#C00000", bg: "#FFFF00" };
  eq(C.blockLook(block, ctx({ letterLayout: "message", letterProfile: "color" })), { center: true, color: "#c00000", bg: "#ffff00" });
  eq(C.blockLook(block, ctx({ letterProfile: "color" })), { center: false, color: "#c00000", bg: "#ffff00" });
  // Black and white, or the roll: no colors go out, whatever the block holds.
  eq(C.blockLook(block, ctx({ letterLayout: "message" })), { center: true, color: "", bg: "" });
  eq(C.blockLook(block, ctx({ bits: 100, letterProfile: "color" })), { center: false, color: "", bg: "" });
  // Junk in the fields (an old preset, a hand-edited JSON) is no color.
  eq(C.blockLook({ color: "red", bg: "url(x)" }, ctx({ letterProfile: "color" })), { center: false, color: "", bg: "" });
  eq(C.blockLook(null, null), { center: false, color: "", bg: "" });
});

test("review: the box in words at the paper's own scale, wherever it is said (the cards' and the parts' notes)", () => {
  const page = C.contentLimitPx({ bits: 600, letterBits: 500 });
  assert.match(C.boxWords(page, "letter"), /^what the Letter page leaves the message \(about 6\.0 cm\), where the bot fades it out$/);
  // 600 bits at 600 bits per inch: 1 inch, 53 px on Letter: 2.5 cm (on a roll's scale it read 1.4 cm).
  const inch = C.contentLimitPx({ bits: 600, letterBits: 500, bitsPerInch: 600 });
  assert.match(C.boxWords(inch, "letter"), /about 2\.5 cm, from the streamer’s bits-per-inch setting/);
  assert.match(C.tallWords("", page, 0, "letter"), /is taller than what the Letter page leaves the message \(about 6\.0 cm\)/);
  // The roll is as before, with or without its paper named.
  const roll = C.contentLimitPx({ bits: 100, bitsPerInch: 100 });
  assert.equal(C.boxWords(roll, 80), C.boxWords(roll));
  assert.match(C.boxWords(roll), /about 2\.5 cm/);
});

test("review: in Large message the bot's box fills the page, so a cut it reports is real only when the message itself is taller than the box", () => {
  const v = (partsPx) => C.previewVerdict({ result: { ok: true, height: 533, standIn: true, security: [],
                                                       trimmed: { limitIn: 3, fullIn: 6.43, by: "bits" } },
                                             measure: { contentPx: 160, fullPx: 343, partsPx } },
                                           { paperMm: "letter", letterLayout: "message", bits: 600 }).map((x) => x.text).join(" | ");
  // The message (100 px) sits above the fade at the box's end: nothing of it is cut.
  assert.doesNotMatch(v(100), /cuts this message/);
  // Taller than the box: cut, and the whole message is the message's own length, not the page's free space.
  assert.match(v(200), /The bot cuts this message at 7\.6 cm, all that 600 bits buy at the streamer's bits-per-inch setting\. The whole message is 9\.5 cm, so its end fades out\./);
  // Scaled like 80 mm and the roll are as before: the bot's own report.
  const s = C.previewVerdict({ result: { ok: true, height: 533, standIn: true, security: [], trimmed: { limitIn: 3, fullIn: 4, by: "bits" } },
                               measure: { contentPx: 160, fullPx: 213, partsPx: 213 } }, { paperMm: "letter", letterLayout: "scaled", bits: 600, warned: true });
  assert.match(s.map((x) => x.text).join(" | "), /The whole message is 10\.2 cm/);
});

test("review: a cheer word that carries a part's bits to the Letter printer says so under the part", () => {
  const ex = { sure: ["Cheer50"], maybe: [], bits: 50 };
  const lines = C.extraCheerLines({ cheer: true, bits: 450, extra: ex, letterBits: 500, paperMm: 80 }).map((x) => x.text);
  assert.ok(lines.some((t) => /Twitch sends a 500-bit cheer, which the streamer's Letter printer takes: this part was built for the roll/.test(t)), lines.join(" | "));
  // Already on Letter, or no Letter printer: nothing more to say.
  for (const o of [{ bits: 600, paperMm: "letter" }, { bits: 450, letterBits: 0, paperMm: 80 }]) {
    assert.ok(!C.extraCheerLines({ cheer: true, extra: ex, letterBits: 500, ...o }).some((x) => /Letter printer takes/.test(x.text)));
  }
});

test("review: with a Letter printer, the notices name the roll printer as the one whose Allow High Roller prints is off", () => {
  const o = { cheer: true, bits: 100, hrThreshold: 25, allowHighRoller: false };
  assert.match(C.modeNotice({ ...o, letterBits: 500 }), /^The streamer's roll printer has Allow High Roller prints off/);
  assert.match(C.modeNotice(o), /^The streamer's printer has Allow High Roller prints off/);
  assert.match(C.modeNotice({ ...o, cheer: false, letterBits: 500 }), /The streamer's roll printer has Allow High Roller prints off, so a real cheer prints/);
  assert.match(C.buildHighRollerProbe({ hrThreshold: 25, letterBits: 500, allowHighRoller: false }).note, /^The streamer's roll printer has Allow High Roller prints off/);
});
