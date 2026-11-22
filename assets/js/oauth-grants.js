import { COCONUT_CLIENT_ID } from "./oauth-core.js";

export function normalizeOAuthGrant(grant) {
  const rawId = grant?.client?.id ?? grant?.client_id;
  if (typeof rawId !== "string"
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawId)) return null;
  const id = rawId.toLowerCase();
  const suppliedName = grant.client?.name ?? grant.client_name;
  const cleanName = typeof suppliedName === "string"
    ? suppliedName.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 80) : "";
  const name = id === COCONUT_CLIENT_ID ? "Coconut" : cleanName || "Authorized application";
  return { id, name, isCoconut: id === COCONUT_CLIENT_ID };
}

export function createGrantView(client) {
  let generation = 0;
  const list = document.getElementById("oauth-grants");

  function clear() {
    generation++;
    list?.replaceChildren();
  }

  function showMessage(message) {
    const item = document.createElement("li");
    item.className = "account-empty";
    item.textContent = message;
    list.replaceChildren(item);
  }

  async function refresh() {
    if (!list) return;
    const current = ++generation;
    showMessage("Loading authorized apps…");
    try {
      const { data, error } = await client.auth.oauth.listGrants();
      if (current !== generation) return;
      if (error || !Array.isArray(data)) throw new Error("Unavailable");
      list.replaceChildren();
      if (!data.length) {
        showMessage("No apps authorized yet. Sign in to Coconut and approve its access to add it here.");
        return;
      }
      const grants = data.map(normalizeOAuthGrant).filter(Boolean);
      if (!grants.length) throw new Error("Invalid grant response");
      for (const grant of grants) {
        const row = document.createElement("li");
        row.className = "account-list-item";
        const main = document.createElement("div");
        main.className = "account-list-main";
        if (grant.isCoconut) {
          const icon = document.createElement("img");
          icon.src = "/assets/icons/coconut-logo.jpg";
          icon.alt = "";
          icon.width = icon.height = 36;
          icon.className = "account-app-icon";
          main.append(icon);
        }
        const copy = document.createElement("div");
        const name = document.createElement("h3");
        name.textContent = grant.name;
        const description = document.createElement("p");
        description.textContent = grant.isCoconut ? "Coconut web · SeedWorks sign-in" : "SeedWorks sign-in";
        copy.append(name, description);
        main.append(copy);
        const revoke = document.createElement("button");
        revoke.type = "button";
        revoke.className = "button button-outlined";
        revoke.textContent = "Revoke access";
        revoke.setAttribute("aria-label", `Revoke ${grant.name} access`);
        revoke.addEventListener("click", async () => {
          if (current !== generation || revoke.disabled) return;
          if (!window.confirm("Revoke this app’s access? It will need authorization again. Existing access tokens may work until they expire.")) return;
          revoke.disabled = true;
          revoke.textContent = "Revoking…";
          try {
            const result = await client.auth.oauth.revokeGrant({ clientId: grant.id });
            if (result.error) throw new Error("Revocation failed");
            await refresh();
          } catch {
            if (current === generation) {
              description.textContent = "Could not revoke access. Try again.";
              revoke.disabled = false;
              revoke.textContent = "Revoke access";
            }
          }
        });
        row.append(main, revoke);
        list.append(row);
      }
    } catch {
      if (current === generation) showMessage("Could not load app authorizations. Reload to try again.");
    }
  }
  return { refresh, clear };
}
