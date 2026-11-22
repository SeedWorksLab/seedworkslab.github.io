import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createGrantView, normalizeOAuthGrant } from "../assets/js/oauth-grants.js";
import { COCONUT_CLIENT_ID } from "../assets/js/oauth-core.js";

function node() {
  return {
    children: [], handlers: {}, attributes: {}, textContent: "",
    setAttribute(key, value) { this.attributes[key] = value; },
    replaceChildren(...items) { this.children = items; },
    append(...items) { this.children.push(...items); },
    addEventListener(key, handler) { this.handlers[key] = handler; },
  };
}

test("OAuth grants use the pinned SDK list/revoke contract and explicit confirmation", async () => {
  const list = node();
  const revoked = [];
  let confirmed = false;
  globalThis.document = { getElementById: () => list, createElement: node };
  globalThis.window = { confirm: () => confirmed };
  const client = { auth: { oauth: {
    async listGrants() { return { data: [{
      client: { id: COCONUT_CLIENT_ID, name: "Coconut Web" },
      scopes: ["email"], granted_at: "2026-11-22T00:00:00Z",
    }] }; },
    async revokeGrant(options) { revoked.push(options); return { error: null }; },
  } } };
  try {
    const view = createGrantView(client);
    await view.refresh();
    assert.equal(list.children.length, 1);
    const main = list.children[0].children[0];
    assert.equal(main.children[1].children[0].textContent, "Coconut");
    assert.equal(main.children[0].src, "/assets/icons/coconut-logo.jpg");
    const button = list.children[0].children[1];
    assert.equal(button.attributes["aria-label"], "Revoke Coconut access");
    await button.handlers.click();
    assert.deepEqual(revoked, []);
    confirmed = true;
    await button.handlers.click();
    assert.deepEqual(revoked, [{ clientId: COCONUT_CLIENT_ID }]);
    view.clear();
    assert.equal(list.children.length, 0);
  } finally {
    delete globalThis.document;
    delete globalThis.window;
  }
});

test("grant normalization reads nested SDK client metadata and supports legacy flat responses", () => {
  assert.deepEqual(normalizeOAuthGrant({ client: { id: COCONUT_CLIENT_ID, name: "Wrong label" } }), {
    id: COCONUT_CLIENT_ID, name: "Coconut", isCoconut: true,
  });
  assert.equal(normalizeOAuthGrant({ client_id: COCONUT_CLIENT_ID }).name, "Coconut");
  const otherId = "11111111-1111-4111-8111-111111111111";
  assert.equal(normalizeOAuthGrant({ client: { id: otherId, name: "Cherry Web" } }).name, "Cherry Web");
  for (const grant of [null, {}, { client: {} }, { client_id: "undefined" }, { client_id: "../bad" }]) {
    assert.equal(normalizeOAuthGrant(grant), null);
  }
});

test("authorized apps have their own card and the redundant Coconut launch link is removed", () => {
  const html = readFileSync(new URL("../account.html", import.meta.url), "utf8");
  const card = html.match(/<section class="account-card account-oauth-card"[\s\S]*?<\/section>/)?.[0];
  assert.ok(card);
  assert.match(card, /<h2 id="oauth-grants-title">Authorized apps<\/h2>/);
  assert.match(card, /<ul id="oauth-grants" class="account-list"/);
  assert.doesNotMatch(html, /Open Coconut on the web/);
  assert.match(html, /id="oauth-continue"/);
});
