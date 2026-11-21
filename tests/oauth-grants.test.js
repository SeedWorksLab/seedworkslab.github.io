import assert from "node:assert/strict";
import test from "node:test";
import { createGrantView } from "../assets/js/oauth-grants.js";
import { COCONUT_CLIENT_ID } from "../assets/js/oauth-core.js";

function node() {
  return {
    children: [], handlers: {}, textContent: "",
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
    async listGrants() { return { data: [{ client_id: COCONUT_CLIENT_ID }] }; },
    async revokeGrant(options) { revoked.push(options); return { error: null }; },
  } } };
  try {
    const view = createGrantView(client);
    await view.refresh();
    assert.equal(list.children.length, 1);
    const button = list.children[0].children[1];
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
