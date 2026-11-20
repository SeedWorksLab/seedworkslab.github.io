import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

for (const slug of ["coconut", "banana", "cherry", "grape"]) {
  test(`${slug} has a compact updates section connected to its own release feed`, () => {
    const page = read(`apps/${slug}/index.html`);
    assert.match(page, /id="updates" role="region" aria-labelledby="updates-title"/);
    assert.match(page, /id="updates-title">What changed/);
    assert.match(page, /id="release-list".*tabindex="0"/);
    assert.match(page, /Expand a version to read its changes/);
    assert.match(page, /src="\/assets\/js\/app-page.js"/);
  });
}

test("Grape has a dedicated release page and appears in both app indexes", () => {
  const page = read("apps/grape/index.html");
  assert.match(page, /data-app-repo="Grape"/);
  assert.match(page, /data-app-download="apk"/);
  assert.match(page, /id="release-list"/);
  assert.match(page, /id="readme-content"/);
  assert.match(page, /grape-logo\.jpg/);
  for (const path of ["index.html", "apps.html", "sitemap.xml"]) {
    assert.match(read(path), /\/apps\/grape\//);
  }
  assert.match(read("assets/js/app-page.js"), /"Grape"/);
});
