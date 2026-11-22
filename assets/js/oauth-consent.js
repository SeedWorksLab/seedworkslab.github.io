import { ACCOUNT_CONFIG } from "./account-config.js";
import { authorizationId, validateConsent, validateOAuthRedirect } from "./oauth-core.js";

const status = document.getElementById("oauth-status");
const request = document.getElementById("oauth-request");
const login = document.getElementById("oauth-login");
const approve = document.getElementById("oauth-approve");
const deny = document.getElementById("oauth-deny");
let client;
let id;
let userId;
let busy = false;

function fail(error) {
  request.hidden = true;
  login.hidden = true;
  status.textContent = error?.code === "seedworks_backend_not_ready"
    ? "SeedWorks sign-in is temporarily unavailable because its server-side security checks are not ready. The site administrator must check the SSO migration and API request guard. Return to Coconut and try again after this is resolved."
    : "This sign-in request could not be verified or has expired. Return to Coconut and start sign-in again.";
}

async function details() {
  const verified = await client.auth.getUser();
  if (verified.error || !verified.data.user || verified.data.user.id !== userId) {
    throw new Error("Account changed.");
  }
  const result = await client.auth.oauth.getAuthorizationDetails(id);
  if (result.error || !result.data) throw new Error("Invalid authorization.");
  return result.data;
}

async function decide(allow) {
  if (busy) return;
  busy = true;
  approve.disabled = true;
  deny.disabled = true;
  try {
    const current = await details();
    if ("redirect_url" in current) {
      window.location.replace(validateOAuthRedirect(current.redirect_url));
      return;
    }
    validateConsent(current, id, userId);
    const result = allow
      ? await client.auth.oauth.approveAuthorization(id, { skipBrowserRedirect: true })
      : await client.auth.oauth.denyAuthorization(id, { skipBrowserRedirect: true });
    if (result.error || !result.data) throw new Error("Authorization failed.");
    window.location.replace(validateOAuthRedirect(result.data.redirect_url));
  } catch {
    fail();
  }
}

async function initialize() {
  const url = new URL(window.location.href);
  id = authorizationId(url.searchParams.get("authorization_id"));
  if (url.origin !== "https://seedworkslab.de" || window.top !== window.self || !id
    || url.searchParams.getAll("authorization_id").length !== 1 || url.hash
    || !window.supabase?.createClient) throw new Error("Invalid request.");
  client = window.supabase.createClient(ACCOUNT_CONFIG.supabaseUrl, ACCOUNT_CONFIG.supabasePublishableKey, {
    auth: {
      storageKey: ACCOUNT_CONFIG.authStorageKey, persistSession: true,
      autoRefreshToken: true, detectSessionInUrl: false, flowType: "pkce",
    },
  });
  const verified = await client.auth.getUser();
  if (verified.error || !verified.data.user) {
    status.textContent = "Sign in centrally to continue to Coconut.";
    login.href = `/account.html?authorization_id=${encodeURIComponent(id)}`;
    login.hidden = false;
    return;
  }
  userId = verified.data.user.id;
  const boundary = await client.rpc("seed_oauth_sso_ready");
  if (boundary.error || boundary.data !== true) {
    throw Object.assign(new Error("Backend client isolation is not ready."), { code: "seedworks_backend_not_ready" });
  }
  const current = await details();
  if ("redirect_url" in current) {
    window.location.replace(validateOAuthRedirect(current.redirect_url));
    return;
  }
  const display = validateConsent(current, id, userId);
  document.getElementById("oauth-app").textContent = display.name;
  document.getElementById("oauth-identity").textContent = `Signed in as ${verified.data.user.email || "your SeedWorks account"}.`;
  document.getElementById("oauth-permission").textContent = `Access requested: ${display.permission}.`;
  status.textContent = "Authorize this app to continue.";
  request.hidden = false;
  approve.addEventListener("click", () => void decide(true));
  deny.addEventListener("click", () => void decide(false));
  client.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT" || (session && session.user.id !== userId)) fail();
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) window.location.reload();
  });
}

initialize().catch(fail);
