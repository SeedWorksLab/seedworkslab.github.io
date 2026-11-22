import assert from "node:assert/strict";
import test from "node:test";
import { authorizationId, COCONUT_CLIENT_ID, COCONUT_CALLBACK, validateConsent, validateOAuthRedirect } from "../assets/js/oauth-core.js";

const id = "11111111-1111-4111-8111-111111111111";
const state = "s".repeat(43);
const consent = {
  authorization_id: id, client: { id: COCONUT_CLIENT_ID },
  redirect_uri: COCONUT_CALLBACK, user: { id: "user-1" }, scope: "email",
};

test("authorization IDs cannot inject a return URL", () => {
  assert.equal(authorizationId(id), id);
  for (const value of [
    null, "", "//evil.example", `${id}&redirect=evil`, "<script>",
    "a".repeat(31), "a".repeat(129), "../" + "a".repeat(32),
    "a".repeat(32) + "/extra", "a".repeat(32) + "%2Fextra",
    "a".repeat(32) + "?redirect=evil", "a".repeat(32) + "#fragment",
  ]) {
    assert.equal(authorizationId(value), null);
  }
});

test("authorization IDs accept Supabase's opaque format, not just UUIDs", () => {
  for (const value of [
    "0123456789abcdef0123456789abcdef",
    "aB3_dE6-gH9_jK2-mN5_pQ8-rS1_uV4-",
    "a".repeat(128),
  ]) assert.equal(authorizationId(value), value);
  const opaque = "0123456789abcdef0123456789abcdef";
  assert.equal(validateConsent({ ...consent, authorization_id: opaque }, opaque, "user-1").name, "Coconut");
});

test("consent requires the registered app, callback, signed-in user and exact scopes", () => {
  assert.equal(validateConsent(consent, id, "user-1").name, "Coconut");
  for (const change of [
    { authorization_id: "other" }, { client: { id: "other" } },
    { redirect_uri: `${COCONUT_CALLBACK}/` }, { user: { id: "other" } },
    { scope: "email profile" }, { scope: "" },
  ]) assert.throws(() => validateConsent({ ...consent, ...change }, id, "user-1"));
});

test("redirect validation accepts only code or error responses to Coconut with state", () => {
  const callback = `${COCONUT_CALLBACK}?code=one-time-code&state=${state}`;
  assert.equal(validateOAuthRedirect(callback), callback);
  assert.ok(validateOAuthRedirect(`${COCONUT_CALLBACK}?error=access_denied&state=${state}`));
  for (const url of [
    `https://evil.example/auth/callback?code=x&state=${state}`,
    `https://coconut.seedworkslab.de.evil.example/auth/callback?code=x&state=${state}`,
    `${COCONUT_CALLBACK}/other?code=x&state=${state}`,
    `${callback}#access_token=secret`,
    `${callback}&code=second`,
    `${callback}&access_token=secret`,
    `${callback}&error=access_denied`,
    `${COCONUT_CALLBACK}?code=x`,
    `https://attacker@coconut.seedworkslab.de/auth/callback?code=x&state=${state}`,
  ]) assert.throws(() => validateOAuthRedirect(url), url);
});
