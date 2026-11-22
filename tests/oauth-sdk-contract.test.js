import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import vm from "node:vm";
import test from "node:test";
import { COCONUT_CLIENT_ID } from "../assets/js/oauth-core.js";

test("the pinned browser SDK supports the consent and grant APIs actually used by the portal", async () => {
  const calls = [];
  const sandbox = {
    URL, URLSearchParams, Headers, Request, Response, AbortController,
    WebSocket: globalThis.WebSocket,
    TextEncoder, TextDecoder, setTimeout, clearTimeout, setInterval, clearInterval,
    crypto: webcrypto, console,
    fetch: async (input, options) => {
      const url = String(input);
      calls.push({ url, options });
      let body = { id: "11111111-1111-4111-8111-111111111111" };
      if (url.includes("/user/oauth/grants")) {
        if (options.method === "DELETE") return new Response(null, { status: 204 });
        body = [{
          client: { id: COCONUT_CLIENT_ID, name: "Coconut Web", uri: "", logo_uri: "" },
          scopes: ["email"], granted_at: "2026-11-22T00:00:00Z",
        }];
      }
      return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
    },
  };
  const source = readFileSync(new URL("../assets/vendor/supabase/supabase-js-2.119.0.js", import.meta.url), "utf8");
  vm.runInNewContext(source, sandbox);
  const client = sandbox.supabase.createClient("https://example.supabase.co", "public-test-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  for (const method of ["getAuthorizationDetails", "approveAuthorization", "denyAuthorization", "listGrants", "revokeGrant"]) {
    assert.equal(typeof client.auth.oauth[method], "function", method);
  }
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${encode({ alg: "HS256" })}.${encode({ exp: Math.floor(Date.now() / 1000) + 3600 })}.${encode("signature")}`;
  assert.equal((await client.auth.setSession({ access_token: token, refresh_token: "test-refresh" })).error, null);
  const grants = await client.auth.oauth.listGrants();
  assert.equal(grants.error, null);
  assert.equal(grants.data[0].client.id, COCONUT_CLIENT_ID);
  assert.equal((await client.auth.oauth.revokeGrant({ clientId: COCONUT_CLIENT_ID })).error, null);
  const revoked = calls.find(({ options }) => options.method === "DELETE");
  assert.equal(new URL(revoked.url).searchParams.get("client_id"), COCONUT_CLIENT_ID);
});
