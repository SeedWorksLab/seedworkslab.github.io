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
  for (const value of [null, "", "//evil.example", `${id}&redirect=evil`, "<script>"]) {
    assert.equal(authorizationId(value), null);
  }
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
