import test from "node:test";
import assert from "node:assert/strict";
import { isPublicHttpUrl } from "../src/worker.js";

// /px fetches whatever URL it is handed, so this guard is the only thing
// standing between the Worker and being an open relay / SSRF gadget.

const ok = (u) => assert.ok(isPublicHttpUrl(u), "should ALLOW " + u);
const no = (u) => assert.equal(isPublicHttpUrl(u), null, "should REJECT " + u);

test("allows ordinary public image URLs", () => {
  ok("https://example.com/cat.png");
  ok("http://example.com/cat.png");
  ok("https://cdn.example.co.uk:8443/a/b/c.jpg?x=1#y");
  ok("https://1.1.1.1/pic.png");            // public IPv4 literal
  ok("https://[2606:4700::1111]/pic.png");  // public IPv6 literal
});

test("rejects non-http schemes", () => {
  no("file:///etc/passwd");
  no("ftp://example.com/cat.png");
  no("data:image/png;base64,AAAA");
  no("javascript:alert(1)");
  no("");
  no(null);
  no("not a url at all");
});

test("rejects loopback and localhost", () => {
  no("http://localhost/x.png");
  no("http://localhost:8787/x.png");
  no("http://foo.localhost/x.png");
  no("http://127.0.0.1/x.png");
  no("http://127.9.9.9/x.png");
  no("http://[::1]/x.png");
  no("http://0.0.0.0/x.png");
});

test("rejects private and link-local IPv4 (incl. cloud metadata)", () => {
  no("http://10.0.0.5/x.png");
  no("http://192.168.1.1/x.png");
  no("http://172.16.0.1/x.png");
  no("http://172.31.255.255/x.png");
  no("http://169.254.169.254/latest/meta-data/");   // the classic SSRF target
  no("http://224.0.0.1/x.png");                     // multicast
});

test("allows the public 172.x space that is NOT in 172.16/12", () => {
  ok("http://172.15.0.1/x.png");
  ok("http://172.32.0.1/x.png");
});

test("rejects internal-looking hostnames", () => {
  no("http://db.internal/x.png");
  no("http://printer.local/x.png");
  no("http://router.home.arpa/x.png");
});

test("rejects private IPv6, but not hostnames that merely start with those letters", () => {
  no("http://[fc00::1]/x.png");     // unique-local
  no("http://[fd12:3456::1]/x.png");
  no("http://[fe80::1]/x.png");     // link-local
  ok("https://fcbarcelona.com/crest.png");   // must not trip the fc/fd v6 test
  ok("https://fedex.com/logo.png");          // must not trip the fe8-b v6 test
});

test("rejects malformed IPv4 octets rather than letting them through", () => {
  no("http://999.1.1.1/x.png");
});

// The WHATWG URL parser normalises these decimal/hex/octal IPv4 forms back to
// dotted-decimal, so the plain IPv4 check already catches them — pin it so a
// future refactor can't reopen the hole.
test("rejects non-dotted IPv4 spellings of loopback", () => {
  no("http://2130706433/x.png");   // 127.0.0.1 as a 32-bit int
  no("http://0x7f.0.0.1/x.png");   // hex first octet
  no("http://0177.0.0.1/x.png");   // octal first octet
});

// SSRF allowlist bypass via IPv4-embedded IPv6. The parser serialises the tail
// to hex (::ffff:169.254.169.254 -> ::ffff:a9fe:a9fe), so the fc/fd/fe8 prefix
// checks miss it — the embedded IPv4 must be range-checked on its own.
test("rejects IPv4-mapped IPv6 pointing at private/metadata addresses", () => {
  no("http://[::ffff:169.254.169.254]/x.png");   // cloud metadata, v4-mapped
  no("http://[::ffff:a9fe:a9fe]/x.png");          // same, already in hex
  no("http://[::ffff:127.0.0.1]/x.png");          // loopback, v4-mapped
  no("http://[::ffff:10.0.0.1]/x.png");           // private
  no("http://[::ffff:192.168.1.1]/x.png");
});

test("rejects deprecated v4-compatible and NAT64 IPv6 to private addresses", () => {
  no("http://[::127.0.0.1]/x.png");        // deprecated ::a.b.c.d
  no("http://[64:ff9b::7f00:1]/x.png");    // NAT64 well-known prefix -> 127.0.0.1
  no("http://[64:ff9b::a9fe:a9fe]/x.png"); // NAT64 -> 169.254.169.254
});

test("still ALLOWS an IPv4-mapped IPv6 that embeds a PUBLIC address", () => {
  ok("http://[::ffff:1.1.1.1]/x.png");     // public 1.1.1.1, v4-mapped
  ok("http://[::ffff:8.8.8.8]/x.png");
});

// ── /px reads nothing out of KV (1.8.1) ──────────────────────────────────────
// Until 1.8.1 /px answered the links /upload made (i.uwutoowo.com/<hex>.png) out of KV, since
// fetching a custom domain of this same Worker loops back into it. /upload and its picture routes
// are gone (the owner's decision), and so is that path: a link shaped like one of those is fetched
// like any other, and an old upload link is simply gone.
import worker from "../src/worker.js";

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]).buffer;
const px = (u, env) =>
  worker.fetch(new Request("https://receipt.uwutoowo.com/px?u=" + encodeURIComponent(u)), env);

test("/px never answers out of KV, not even for a link shaped like an old upload link", async () => {
  for (const u of ["https://i.uwutoowo.com/0123456789ab.png", "https://receipt.uwutoowo.com/0123456789ab.png"]) {
    const reads = [];
    const kv = { getWithMetadata: async (k) => { reads.push(k); return { value: PNG, metadata: { ct: "image/png" } }; } };
    const res = await px(u, { RW_IMG: kv, RW_IMG_HOST: "i.uwutoowo.com" });
    assert.deepEqual(reads, [], u + ": KV must not be read");
    assert.notEqual(res.status, 200, u + ": no picture comes out of KV");
  }
});

// The guard's CONTRACT, stated as a test so the residual is a decision on the record
// rather than something a future reader has to infer from what isn't here.
// isPublicHttpUrl checks the address LITERAL in the URL. A hostname is passed through:
// the Workers runtime never exposes the address it resolved, so there is no
// post-resolution hook, and no way to pin the address between the check and the fetch.
// See the long note above the function for why that is accepted here, and why a
// self-hoster on another runtime should not assume the same.
test("a HOSTNAME is allowed even when it plainly intends to resolve somewhere private", () => {
  ok("http://localtest.me/x.png");                        // real domain, resolves to 127.0.0.1
  ok("http://metadata.google.internal.example.com/x.png");
  // Not an endorsement — an assertion that the boundary sits where the comment says it
  // does. If resolution-time checking is ever added, THESE are the lines that should
  // change, deliberately, rather than a surprise failure turning up somewhere else.
});
