import assert from "node:assert/strict";
import test from "node:test";

function element() {
  return {
    hidden: false,
    disabled: false,
    textContent: "",
    value: "",
    children: [],
    attributes: {},
    append(...items) { this.children.push(...items); },
    replaceChildren(...items) { this.children = items; },
    setAttribute(name, value) { this.attributes[name] = value; },
    getAttribute(name) { return this.attributes[name]; },
    addEventListener() {},
  };
}

test("signed-in account page renders normalized profile, connections and usage", async () => {
  const nodes = new Map();
  const views = ["loading", "unavailable", "signed-out", "signed-in", "recovery", "deleted"]
    .map((name) => Object.assign(element(), { attributes: { "data-account-view": name } }));
  const user = { id: "user-1", email: "ada@example.com", created_at: "2026-01-01" };
  const session = { user };
  let authCallback;
  globalThis.document = {
    querySelectorAll(selector) { return selector === "[data-account-view]" ? views : []; },
    querySelector() { return null; },
    getElementById(id) {
      if (!nodes.has(id)) nodes.set(id, element());
      return nodes.get(id);
    },
    createElement: element,
  };
  globalThis.window = {
    location: { href: "https://seedworkslab.github.io/account.html" },
    history: { replaceState() {} },
    supabase: {
      createClient: () => ({
        auth: {
          onAuthStateChange(callback) { authCallback = callback; },
          async getSession() { return { data: { session }, error: null }; },
        },
        schema(name) {
          assert.equal(name, "public");
          return {
            async rpc(rpcName) {
              assert.equal(rpcName, "seed_account_overview");
              return {
                data: {
                  profile: { display_name: "Ada", created_at: "2026-01-01" },
                  connections: [{ app_slug: "cherry", app_name: "Cherry", device_name: "Phone" }],
                  usage: [{ app_slug: "cherry", app_name: "Cherry", record_count: 7, byte_count: 1024 }],
                  totals: { record_count: 7, byte_count: 1024 },
                },
                error: null,
              };
            },
          };
        },
      }),
    },
  };

  try {
    await import(`../assets/js/account.js?test=${Date.now()}`);
    // initialize() starts asynchronously at module evaluation time.
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(nodes.get("account-name").textContent, "Ada");
    assert.equal(nodes.get("display-name").value, "Ada");
    assert.equal(nodes.get("connections-list").children.length, 1);
    assert.equal(nodes.get("usage-list").children.length, 1);
    assert.equal(nodes.get("usage-total-records").textContent, "7");
    assert.equal(nodes.get("usage-total-size").textContent, "1 KB");
    assert.equal(nodes.get("overview-error").hidden, true);

    authCallback("SIGNED_OUT", null);
    assert.equal(views.find((node) => node.getAttribute("data-account-view") === "signed-in").hidden, true);
  } finally {
    delete globalThis.document;
    delete globalThis.window;
  }
});
