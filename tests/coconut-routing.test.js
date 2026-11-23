import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../", import.meta.url);

test("the legacy Coconut web build and its route-restoration script are absent", () => {
  assert.equal(existsSync(new URL("apps/coconut/web", root)), false);
  assert.equal(existsSync(new URL("assets/js/coconut-route-redirect.js", root)), false);
  const notFound = readFileSync(new URL("404.html", root), "utf8");
  assert.ok(!notFound.includes("coconut-route"));
  assert.ok(!notFound.includes("http-equiv=\"refresh\""));
});

test("public website files do not link to or restore the deleted Coconut app", () => {
  function inspect(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name === "tests") continue;
      const file = new URL(entry.name, directory);
      if (entry.isDirectory()) {
        inspect(new URL(`${entry.name}/`, directory));
      } else if (/\.(html|js|xml)$/.test(entry.name)) {
        const text = readFileSync(file, "utf8");
        assert.ok(!text.includes("/apps/coconut/web"), `${file.pathname}: legacy app path`);
        assert.ok(!text.includes("coconut-route"), `${file.pathname}: legacy route handler`);
      }
    }
  }
  inspect(root);
});

test("the Coconut product page links to the dedicated app domain", () => {
  const page = readFileSync(new URL("apps/coconut/index.html", root), "utf8");
  assert.match(page, /href="https:\/\/coconut\.seedworkslab\.de\/">Use Coconut on the web<\/a>/);
  assert.match(page, /rel="canonical" href="https:\/\/seedworkslab\.de\/apps\/coconut\/"/);
});
