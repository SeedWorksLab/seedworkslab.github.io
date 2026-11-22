import assert from "node:assert/strict";
import test from "node:test";
import { COCONUT_CALLBACK, COCONUT_CLIENT_ID } from "../assets/js/oauth-core.js";

// Actual hosted Supabase authorize responses use opaque 32-character IDs.
const id = "0123456789abcdef0123456789abcdef";
const callback = `${COCONUT_CALLBACK}?code=once&state=${"s".repeat(43)}`;
let sequence = 0;
const flush = () => new Promise((resolve) => setImmediate(resolve));

async function page({
  signedIn = true, details, origin = "https://seedworkslab.de", ready = true,
  query = `?authorization_id=${id}`, boundaryError = null,
} = {}) {
  const nodes = new Map();
  const redirects = [];
  const calls = [];
  let userId = "user-1";
  const client = {
    async rpc(name) {
      assert.equal(name, "seed_oauth_sso_ready");
      return { data: ready, error: boundaryError };
    },
    auth: {
      async getUser() { return { data: { user: signedIn ? { id: userId, email: "ada@example.com" } : null } }; },
      onAuthStateChange() {},
      oauth: {
        async getAuthorizationDetails(value) {
          calls.push(["details", value]);
          return { data: details || {
            authorization_id: id, user: { id: "user-1" },
            client: { id: COCONUT_CLIENT_ID }, redirect_uri: COCONUT_CALLBACK, scope: "email",
          } };
        },
        async approveAuthorization(value, options) {
          calls.push(["approve", value, options]);
          return { data: { redirect_url: callback } };
        },
        async denyAuthorization() { return { data: { redirect_url: callback.replace("code=once", "error=access_denied") } }; },
      },
    },
  };
  globalThis.document = {
    getElementById(key) {
      if (!nodes.has(key)) nodes.set(key, {
        hidden: true, disabled: false, textContent: "", handlers: {},
        addEventListener(name, handler) { this.handlers[name] = handler; },
      });
      return nodes.get(key);
    },
  };
  globalThis.window = {
    location: {
      href: `${origin}/oauth/consent.html${query}`,
      replace: (url) => redirects.push(url),
    },
    addEventListener() {},
    supabase: { createClient: () => client },
  };
  window.top = window.self = window;
  await import(`../assets/js/oauth-consent.js?case=${++sequence}`);
  await flush();
  return { nodes, redirects, calls, switchUser: () => { userId = "other-user"; } };
}

test("signed-out authorization leads to a fixed central sign-in URL, without approving", async () => {
  const result = await page({ signedIn: false });
  assert.equal(result.nodes.get("oauth-login").href, `/account.html?authorization_id=${id}`);
  assert.equal(result.nodes.get("oauth-request").hidden, true);
  assert.equal(result.calls.length, 0);
});

test("consent is explicit, disables repeated decisions and rechecks identity", async () => {
  const result = await page();
  assert.equal(result.redirects.length, 0);
  assert.equal(result.nodes.get("oauth-request").hidden, false);
  result.nodes.get("oauth-approve").handlers.click();
  result.nodes.get("oauth-approve").handlers.click();
  await flush();
  assert.equal(result.calls.filter(([name]) => name === "approve").length, 1);
  assert.deepEqual(result.calls.find(([name]) => name === "approve")[2], { skipBrowserRedirect: true });
  assert.deepEqual(result.redirects, [callback]);

  const switched = await page();
  switched.switchUser();
  switched.nodes.get("oauth-approve").handlers.click();
  await flush();
  assert.equal(switched.redirects.length, 0);
  assert.equal(switched.nodes.get("oauth-request").hidden, true);
});

test("prior consent can return only to the exact registered callback", async () => {
  const valid = await page({ details: { redirect_url: callback } });
  assert.deepEqual(valid.redirects, [callback]);
  const invalid = await page({ details: { redirect_url: "https://evil.example/?code=once" } });
  assert.equal(invalid.redirects.length, 0);
  assert.equal(invalid.nodes.get("oauth-request").hidden, true);
});

test("lookalike hosting origins fail closed", async () => {
  const invalid = await page({ origin: "https://seedworkslab.de.evil.example" });
  assert.equal(invalid.calls.length, 0);
  assert.equal(invalid.nodes.get("oauth-request").hidden, true);
});

test("consent fails closed before approving if backend isolation is not ready", async () => {
  const invalid = await page({ ready: false });
  assert.equal(invalid.calls.length, 0);
  assert.equal(invalid.redirects.length, 0);
  assert.equal(invalid.nodes.get("oauth-request").hidden, true);
  assert.match(invalid.nodes.get("oauth-status").textContent, /server-side security checks are not ready/);
  assert.doesNotMatch(invalid.nodes.get("oauth-status").textContent, /expired/);
});

test("missing backend migration gives a safe, actionable error without exposing server details", async () => {
  const invalid = await page({
    boundaryError: { code: "PGRST202", message: "private server detail" },
  });
  assert.equal(invalid.calls.length, 0);
  assert.match(invalid.nodes.get("oauth-status").textContent, /SSO migration and API request guard/);
  assert.doesNotMatch(invalid.nodes.get("oauth-status").textContent, /private server detail/);
});

test("missing, duplicate and path-injection authorization IDs cannot start consent", async () => {
  for (const query of [
    "", `?authorization_id=${id}&authorization_id=${id}`,
    `?authorization_id=${encodeURIComponent("../" + id)}`,
  ]) {
    const invalid = await page({ query });
    assert.equal(invalid.calls.length, 0);
    assert.equal(invalid.redirects.length, 0);
    assert.equal(invalid.nodes.get("oauth-request").hidden, true);
  }
});

test.after(() => {
  delete globalThis.document;
  delete globalThis.window;
});
