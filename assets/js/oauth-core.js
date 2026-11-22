export const COCONUT_CLIENT_ID = "978d0b67-d40a-4cd2-a686-b0e4f9ab4d22";
export const COCONUT_CALLBACK = "https://coconut.seedworkslab.de/auth/callback";

export function authorizationId(value) {
  // Supabase issues opaque IDs (currently 32 characters), not necessarily
  // UUIDs. Only bound/path-safe syntax is checked here; Auth verifies validity,
  // ownership and expiry before any authorization decision.
  return typeof value === "string"
    && /^[A-Za-z0-9_-]{32,128}$/.test(value)
    ? value : null;
}

export function validateConsent(details, id, userId) {
  if (!details || details.authorization_id !== id
    || details.client?.id !== COCONUT_CLIENT_ID
    || details.redirect_uri !== COCONUT_CALLBACK
    || details.user?.id !== userId
    || details.scope !== "email") {
    throw new Error("This authorization request is not approved for SeedWorks.");
  }
  return { name: "Coconut", permission: "Your email address and your Coconut cloud data" };
}

export function validateOAuthRedirect(value) {
  const url = new URL(value);
  if (url.origin + url.pathname !== COCONUT_CALLBACK || url.username || url.password || url.hash
    || [...url.searchParams.keys()].some((key) => !["code", "state", "error", "error_description", "error_uri"].includes(key)
      || url.searchParams.getAll(key).length !== 1)
    || !/^[A-Za-z0-9_-]{43}$/.test(url.searchParams.get("state") || "")
    || (!!url.searchParams.get("code") === !!url.searchParams.get("error"))) {
    throw new Error("The authorization response has an unexpected destination.");
  }
  return url.href;
}
