import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const origin = "https://seedworkslab.de";

function publicFiles(directory = root) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith(".") || entry.name === "tests") return [];
    const url = new URL(entry.name, directory);
    return entry.isDirectory() ? publicFiles(new URL(`${entry.name}/`, directory)) : [url];
  });
}

test("the deployed site uses the custom domain, including generated app bundles", () => {
  assert.equal(readFileSync(new URL("CNAME", root), "utf8").trim(), "seedworkslab.de");
  assert.ok(existsSync(new URL(".nojekyll", root)));
  for (const file of publicFiles()) {
    if (!/\.(html|js|xml|txt)$/.test(file.pathname)) continue;
    const text = readFileSync(file, "utf8");
    assert.ok(!text.includes("seedworkslab.github.io"), `${file.pathname}: old public domain`);
  }
});

test("page styles, scripts and images resolve to deployed files on the new origin", () => {
  for (const file of publicFiles().filter((url) => url.pathname.endsWith(".html"))) {
    const html = readFileSync(file, "utf8");
    const relativePath = file.href.slice(root.href.length);
    const pageUrl = new URL(relativePath, origin);
    for (const tag of html.matchAll(/<(?:script|link|img)\b[^>]*>/gi)) {
      const reference = tag[0].match(/\b(?:src|href)="([^"]+)"/)?.[1];
      if (!reference) continue;
      const resolved = new URL(reference, pageUrl);
      if (resolved.origin !== origin) continue;
      const local = new URL(`.${resolved.pathname}`, root);
      assert.ok(existsSync(local), `${relativePath}: missing ${resolved.pathname}`);
    }
  }
});

test("search metadata points at the canonical origin", () => {
  const sitemap = readFileSync(new URL("sitemap.xml", root), "utf8");
  for (const match of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    assert.equal(new URL(match[1]).origin, origin);
  }
  const robots = readFileSync(new URL("robots.txt", root), "utf8");
  assert.ok(robots.includes(`Sitemap: ${origin}/sitemap.xml`));
  for (const path of ["index.html", ...["coconut", "cherry", "banana", "grape"].map(
    (slug) => `apps/${slug}/index.html`
  )]) {
    const html = readFileSync(new URL(path, root), "utf8");
    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
    assert.ok(canonical, `${path}: missing canonical URL`);
    assert.equal(new URL(canonical).origin, origin);
  }
});
