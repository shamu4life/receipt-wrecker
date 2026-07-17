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
