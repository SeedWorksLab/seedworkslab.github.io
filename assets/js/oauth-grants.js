import { COCONUT_CLIENT_ID } from "./oauth-core.js";

export function createGrantView(client) {
  let generation = 0;
  const list = document.getElementById("oauth-grants");

  function clear() {
    generation++;
    list?.replaceChildren();
  }

  async function refresh() {
    if (!list) return;
    const current = ++generation;
    list.textContent = "Loading authorized apps…";
    try {
      const { data, error } = await client.auth.oauth.listGrants();
      if (current !== generation) return;
      if (error || !Array.isArray(data)) throw new Error("Unavailable");
      list.replaceChildren();
      if (!data.length) {
        list.textContent = "No apps authorized yet. Sign in to Coconut and approve its access to add it here.";
        return;
      }
      for (const grant of data) {
        const row = document.createElement("p");
        const name = document.createElement("span");
        name.textContent = grant.client_id === COCONUT_CLIENT_ID ? "Coconut " : "Other authorized application ";
        const revoke = document.createElement("button");
        revoke.type = "button";
        revoke.className = "button button-outlined";
        revoke.textContent = "Revoke access";
        revoke.addEventListener("click", async () => {
          if (!window.confirm("Revoke this app’s access? It will need authorization again. Existing access tokens may work until they expire.")) return;
          revoke.disabled = true;
          try {
            const result = await client.auth.oauth.revokeGrant({ clientId: grant.client_id });
            if (result.error) throw new Error("Revocation failed");
            await refresh();
          } catch {
            if (current === generation) {
              name.textContent = "Could not revoke access. Try again. ";
              revoke.disabled = false;
            }
          }
        });
        row.append(name, revoke);
        list.append(row);
      }
    } catch {
      if (current === generation) list.textContent = "Could not load app authorizations. Reload to try again.";
    }
  }
  return { refresh, clear };
}
