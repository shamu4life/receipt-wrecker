// /resolve (album & page image links): the Worker route that looks up the first picture of an
// Imgur/Catbox/ImgBB album or page, a faithful port of Printer Bot 3.2.0-beta.7's action
// (PbImgur / PbCatbox / PbImgbb). The upstream sites are stubbed; no test hits them for real.
import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/worker.js";

const ORIGIN = "https://receipt.uwutoowo.com";

// Stub globalThis.fetch to answer a map of { urlSubstring: { status?, body?, ct? } }. Records the
// upstream URLs asked for, in order. A url with no match throws (an unexpected fetch fails the test).
function withUpstream(map, fn) {
  const asked = [];
  const saved = globalThis.fetch;
  globalThis.fetch = async (u) => {
    const url = String(u);
    asked.push(url);
    for (const key of Object.keys(map)) {
      if (url.includes(key)) {
        const r = map[key];
        return new Response(r.body == null ? "" : r.body, { status: r.status || 200,
          headers: { "content-type": r.ct || "text/html" } });
      }
    }
    throw new Error("unexpected fetch: " + url);
  };
  return Promise.resolve(fn(asked)).finally(() => { globalThis.fetch = saved; });
}

async function resolve(qs) {
  const req = new Request(ORIGIN + "/resolve?" + qs);
  const res = await worker.fetch(req, {});
  return { status: res.status, body: await res.json() };
}

// ── Imgur ──
test("imgur album: hit.json names the first picture", async () => {
  await withUpstream({ "/ajaxalbums/getimages/aB3dE/hit.json": { ct: "application/json",
      body: JSON.stringify({ data: { images: [{ hash: "QWer12", ext: ".png" }, { hash: "x", ext: ".jpg" }] } }) } },
    async (asked) => {
      const r = await resolve("site=imgur&id=aB3dE");
      assert.deepEqual(r.body, { picture: "QWer12.png" });
      assert.equal(asked[0], "https://imgur.com/ajaxalbums/getimages/aB3dE/hit.json");
    });
});

test("imgur album: a video first item stays text (no table entry)", async () => {
  await withUpstream({ "/hit.json": { ct: "application/json",
      body: JSON.stringify({ data: { images: [{ hash: "QWer12", ext: ".mp4" }] } }) } }, async () => {
    const r = await resolve("site=imgur&id=aB3dE");
    assert.deepEqual(r.body, { stay: true });
  });
});

test("imgur album: no list, falls back to the page's og:image", async () => {
  await withUpstream({
    "/hit.json": { status: 404 },
    "/a/aB3dE": { body: '<meta property="og:image" content="https://i.imgur.com/QWer12.jpeg?x=1">' },
  }, async (asked) => {
    const r = await resolve("site=imgur&id=aB3dE");
    assert.deepEqual(r.body, { picture: "QWer12.jpeg" });
    assert.equal(asked[1], "https://imgur.com/a/aB3dE");
  });
});

test("imgur album: og:video on the page stays text", async () => {
  await withUpstream({ "/hit.json": { status: 404 },
    "/a/aB3dE": { body: '<meta property="og:video" content="https://i.imgur.com/x.mp4">' } }, async () => {
    assert.deepEqual((await resolve("site=imgur&id=aB3dE")).body, { stay: true });
  });
});

test("imgur album: nothing found anywhere prints [image]", async () => {
  await withUpstream({ "/hit.json": { status: 500 }, "/a/aB3dE": { body: "<html>no og</html>" } }, async () => {
    assert.deepEqual((await resolve("site=imgur&id=aB3dE")).body, { picture: "" });
  });
});

// ── Catbox ──
test("catbox collection: the first file in the imagelist", async () => {
  await withUpstream({ "/c/abc123": { body:
      '<div class="imagelist"><a href="https://files.catbox.moe/ab_cd-1.png">x</a>' +
      '<a href="https://files.catbox.moe/second.jpg">y</a></div>' } }, async (asked) => {
    const r = await resolve("site=catbox&id=abc123");
    assert.deepEqual(r.body, { picture: "ab_cd-1.png" });
    assert.equal(asked[0], "https://catbox.moe/c/abc123");
  });
});

test("catbox collection: imagecontainer fallback when there is no imagelist", async () => {
  await withUpstream({ "/c/abc123": { body:
      '<div class="imagecontainer"><img src="https://files.catbox.moe/pic9.webp"></div>' } }, async () => {
    assert.deepEqual((await resolve("site=catbox&id=abc123")).body, { picture: "pic9.webp" });
  });
});

test("catbox collection: a non-picture first file stays text", async () => {
  await withUpstream({ "/c/abc123": { body:
      '<div class="imagelist"><a href="https://files.catbox.moe/clip.mp4">x</a></div>' } }, async () => {
    assert.deepEqual((await resolve("site=catbox&id=abc123")).body, { stay: true });
  });
});

test("catbox collection: no file on the page prints [image]", async () => {
  await withUpstream({ "/c/abc123": { body: "<div>empty</div>" } }, async () => {
    assert.deepEqual((await resolve("site=catbox&id=abc123")).body, { picture: "" });
  });
});

// ── ImgBB ──
test("imgbb album: the first image list-item's data-object original", async () => {
  const obj = encodeURIComponent(JSON.stringify({ image: { url: "https://i.ibb.co/aB3dE/my-pic.png" } }));
  await withUpstream({ "/album/Qw12": { body:
      "<div class=\"list-item\" data-type=\"image\" data-object='" + obj + "'></div>" } }, async (asked) => {
    const r = await resolve("site=imgbb&kind=album&id=Qw12");
    assert.deepEqual(r.body, { picture: "aB3dE/my-pic.png" });
    assert.equal(asked[0], "https://ibb.co/album/Qw12");
  });
});

test("imgbb album: ?sort is passed through (not date_desc)", async () => {
  await withUpstream({ "/album/Qw12?sort=date_asc": { body:
      '<meta property="og:image" content="https://i.ibb.co/aB3dE/p.jpg">' } }, async (asked) => {
    const r = await resolve("site=imgbb&kind=album&id=Qw12&sort=date_asc");
    assert.deepEqual(r.body, { picture: "aB3dE/p.jpg" });
    assert.equal(asked[0], "https://ibb.co/album/Qw12?sort=date_asc");
  });
});

test("imgbb album: date_desc and junk sort are dropped", async () => {
  await withUpstream({ "/album/Qw12": { body:
      '<meta property="og:image" content="https://i.ibb.co/aB3dE/p.jpg">' } }, async (asked) => {
    await resolve("site=imgbb&kind=album&id=Qw12&sort=date_desc");
    assert.equal(asked[0], "https://ibb.co/album/Qw12", "date_desc dropped");
  });
  await withUpstream({ "/album/Qw12": { body:
      '<meta property="og:image" content="https://i.ibb.co/aB3dE/p.jpg">' } }, async (asked) => {
    await resolve("site=imgbb&kind=album&id=Qw12&sort=notasort");
    assert.equal(asked[0], "https://ibb.co/album/Qw12", "junk dropped");
  });
});

test("imgbb page: og:image, then the image_src link as a fallback", async () => {
  await withUpstream({ "/Qw12aB": { body:
      '<meta property="og:image" content="https://i.ibb.co/aB3dE/page-pic.gif">' } }, async (asked) => {
    const r = await resolve("site=imgbb&kind=page&id=Qw12aB");
    assert.deepEqual(r.body, { picture: "aB3dE/page-pic.gif" });
    assert.equal(asked[0], "https://ibb.co/Qw12aB");
  });
  await withUpstream({ "/Qw12aB": { body:
      '<link rel="image_src" href="https://i.ibb.co/aB3dE/src.webp">' } }, async () => {
    assert.deepEqual((await resolve("site=imgbb&kind=page&id=Qw12aB")).body, { picture: "aB3dE/src.webp" });
  });
});

test("imgbb: a name that isn't of the expected shape becomes 'image'", async () => {
  await withUpstream({ "/Qw12aB": { body:
      '<meta property="og:image" content="https://i.ibb.co/aB3dE/a!b.png">' } }, async () => {
    // "a!b" has a character outside the name shape, so PictureOf uses "image"; the i.ibb.co URL is valid.
    assert.deepEqual((await resolve("site=imgbb&kind=page&id=Qw12aB")).body, { picture: "aB3dE/image.png" });
  });
});

test("imgbb page: no picture prints [image]", async () => {
  await withUpstream({ "/Qw12aB": { body: "<html>nothing</html>" } }, async () => {
    assert.deepEqual((await resolve("site=imgbb&kind=page&id=Qw12aB")).body, { picture: "" });
  });
});

// ── guards ──
test("a malformed id never reaches an upstream fetch", async () => {
  // No upstream map: any fetch throws, so a 400 proves none was made.
  for (const qs of ["site=imgur&id=ab", "site=imgur&id=toolongid", "site=imgur&id=abcde",       // lowercase-only: no capital/digit
                    "site=catbox&id=ABC123", "site=catbox&id=abc12",
                    "site=imgbb&kind=album&id=xy", "site=imgbb&kind=page&id=abcdef",             // lowercase-only
                    "site=nope&id=abc123", "site=imgbb&id=Qw12", "site=imgbb&kind=other&id=Qw12"]) {
    const r = await resolve(qs);
    assert.equal(r.status, 400, qs);
  }
});

test("a redirect or a non-200 is not followed and prints [image]", async () => {
  await withUpstream({ "/hit.json": { status: 302 }, "/a/aB3dE": { status: 403 } }, async () => {
    assert.deepEqual((await resolve("site=imgur&id=aB3dE")).body, { picture: "" });
  });
});

test("an oversized answer is refused (byte cap)", async () => {
  const huge = "x".repeat(600 * 1024);     // over the 512 KB page cap
  await withUpstream({ "/hit.json": { status: 404 }, "/a/aB3dE": { body: huge } }, async () => {
    assert.deepEqual((await resolve("site=imgur&id=aB3dE")).body, { picture: "" });
  });
});
