import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const script = readFileSync(new URL("../assets/js/coconut-route-redirect.js", import.meta.url), "utf8");
const origin = "https://seedworkslab.github.io";

function route(url) {
  const redirects = [];
  const restores = [];
  const location = new URL(url, origin);
  const window = {
    location: {
      href: location.href,
      replace(href) { redirects.push(href); },
    },
    history: {
      state: null,
      replaceState(_state, _unused, path) { restores.push(path); },
    },
  };
  runInNewContext(script, { window, URL });
  return { redirects, restores };
}

test("GitHub Pages 404 restores Coconut deep links without intercepting other apps", () => {
  const deep = route("/apps/coconut/web/transaction/123?view=all");
  assert.equal(deep.redirects.length, 1);
  assert.equal(new URL(deep.redirects[0]).searchParams.get("coconut-route"),
    "/apps/coconut/web/transaction/123?view=all");
  assert.equal(route("/apps/cherry/web/transaction/123").redirects.length, 0);
  assert.equal(route("/apps/coconut/web/_expo/static/js/missing.js").redirects.length, 0);
});

test("Coconut restores only safe, same-origin app paths", () => {
  const valid = route("/apps/coconut/web/?coconut-route=%2Fapps%2Fcoconut%2Fweb%2Fshared%2Fexpense");
  assert.equal(valid.restores[0], "/apps/coconut/web/shared/expense");
  const malicious = route("/apps/coconut/web/?coconut-route=https%3A%2F%2Fevil.example%2F");
  assert.equal(malicious.restores.length, 0);
});
