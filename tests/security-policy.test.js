import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const pages = [
  "index.html", "about.html", "apps.html", "contact.html", "404.html",
  "account.html", "apps/coconut/index.html", "apps/cherry/index.html",
  "apps/banana/index.html", "apps/grape/index.html",
  "oauth/consent.html",
];

test("all pages have a restrictive CSP; only account and consent can contact Supabase", () => {
  for (const page of pages) {
    const html = readFileSync(new URL(`../${page}`, import.meta.url), "utf8");
    const policy = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/i)?.[1];
    assert.ok(policy, `${page}: CSP is missing`);
    for (const directive of ["script-src 'self'", "object-src 'none'", "base-uri 'self'", "frame-src 'none'"]) {
      assert.ok(policy.includes(directive), `${page}: missing ${directive}`);
    }
    assert.ok(!/script-src[^;]*'unsafe-inline'/.test(policy), `${page}: unsafe inline scripts`);
    if (page !== "account.html" && page !== "oauth/consent.html") {
      assert.ok(!policy.includes("supabase.co"), `${page}: unexpected account API permission`);
    }
  }
});

test("structured metadata is allowed by the page CSP after URL changes", () => {
  for (const page of pages) {
    const html = readFileSync(new URL(`../${page}`, import.meta.url), "utf8");
    const policy = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/i)?.[1];
    for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      const hash = createHash("sha256").update(match[1]).digest("base64");
      assert.ok(policy.includes(`'sha256-${hash}'`), `${page}: metadata hash is stale`);
    }
  }
});

test("the account page protects recovery links and pins the vendored auth script", () => {
  const html = readFileSync(new URL("../account.html", import.meta.url), "utf8");
  assert.match(html, /<meta name="referrer" content="no-referrer">/);
  assert.match(html, /connect-src https:\/\/qslmlcvskctvyngofipe\.supabase\.co;/);
  const vendor = readFileSync(new URL("../assets/vendor/supabase/supabase-js-2.119.0.js", import.meta.url));
  const hash = createHash("sha256").update(vendor).digest("base64");
  assert.ok(html.includes(`integrity="sha256-${hash}"`));
});
