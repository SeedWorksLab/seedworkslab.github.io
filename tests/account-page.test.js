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
    removeAttribute(name) { delete this.attributes[name]; },
    getContext() { return { clearRect() {} }; },
    classList: { remove() {} },
    close() {},
    addEventListener() {},
  };
}

test("signed-in account page renders profile and usage, and continues an opaque-ID OAuth request", async () => {
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
    addEventListener() {},
    location: { href: "https://seedworkslab.de/account.html?authorization_id=0123456789abcdef0123456789abcdef" },
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
              if (rpcName === "seed_get_profile_picture") {
                return { data: "data:image/png;base64,AAAA", error: null };
              }
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
    assert.equal(nodes.get("account-picture").src, "data:image/png;base64,AAAA");
    assert.equal(nodes.get("account-picture").hidden, false);
    assert.equal(nodes.get("account-picture-fallback").hidden, true);
    assert.equal(nodes.get("oauth-continue").hidden, false);
    assert.equal(nodes.get("oauth-continue").href,
      "/oauth/consent.html?authorization_id=0123456789abcdef0123456789abcdef");

    authCallback("SIGNED_OUT", null);
    assert.equal(nodes.get("account-picture").hidden, true);
    assert.equal(nodes.get("account-picture-fallback").hidden, false);
    assert.equal(views.find((node) => node.getAttribute("data-account-view") === "signed-in").hidden, true);
  } finally {
    delete globalThis.document;
    delete globalThis.window;
  }
});

test("a recovery query parameter and same-user refresh cannot change the account view", async () => {
  const nodes = new Map();
  const views = ["loading", "unavailable", "signed-out", "signed-in", "recovery", "deleted"]
    .map((name) => Object.assign(element(), { attributes: { "data-account-view": name } }));
  const session = { user: { id: "user-1", email: "ada@example.com" } };
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
    addEventListener() {},
    location: { href: "https://seedworkslab.de/account.html?flow=recovery" },
    history: { replaceState() {} },
    supabase: { createClient: () => ({
      auth: {
        onAuthStateChange(callback) { authCallback = callback; },
        async getSession() { return { data: { session }, error: null }; },
      },
      schema: () => ({ rpc: async () => ({ data: { profile: { display_name: "Ada" } }, error: null }) }),
    }) },
  };

  try {
    await import(`../assets/js/account.js?test=${Date.now()}-recovery`);
    await new Promise((resolve) => setImmediate(resolve));
    const view = (name) => views.find((node) => node.getAttribute("data-account-view") === name);
    assert.equal(view("signed-in").hidden, false);
    assert.equal(view("recovery").hidden, true);
    authCallback("TOKEN_REFRESHED", session);
    assert.equal(view("signed-in").hidden, false);
    authCallback("SIGNED_IN", session);
    assert.equal(view("signed-in").hidden, false);
    authCallback("SIGNED_IN", { user: { id: "other-user", email: "other@example.com" } });
    authCallback("SIGNED_OUT", null);
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(view("signed-out").hidden, false);
    assert.equal(view("signed-in").hidden, true);
  } finally {
    delete globalThis.document;
    delete globalThis.window;
  }
});

for (const previouslyLoaded of [false, true]) {
  for (const refreshDuringRequest of [false, true]) {
    test(`overview recovers after token refresh (existing data: ${previouslyLoaded}, refresh in flight: ${refreshDuringRequest})`, async () => {
      const nodes = new Map();
      const session = { access_token: "old-token", user: { id: "user-1", email: "ada@example.com" } };
      const refreshedSession = { ...session, access_token: "new-token" };
      let authCallback;
      let requests = 0;
      let failRequest;
      const failure = new Promise((resolve) => { failRequest = resolve; });
      const overview = {
        profile: { display_name: "Ada" },
        connections: [{ app_slug: "coconut", app_name: "Coconut" }],
        usage: [{ app_slug: "coconut", app_name: "Coconut", record_count: 7, byte_count: 1024 }],
      };
      globalThis.document = {
        querySelectorAll() { return []; },
        querySelector() { return null; },
        createElement: element,
        getElementById(id) {
          if (!nodes.has(id)) {
            const node = element();
            node.listeners = {};
            node.addEventListener = (name, callback) => { node.listeners[name] = callback; };
            nodes.set(id, node);
          }
          return nodes.get(id);
        },
      };
      let insideAuthCallback = false;
      globalThis.window = {
        addEventListener() {},
        location: { href: "https://seedworkslab.de/account.html" },
        history: { replaceState() {} },
        supabase: { createClient: () => ({
          auth: {
            onAuthStateChange(callback) { authCallback = callback; },
            async getSession() { return { data: { session } }; },
          },
          schema: () => ({
            async rpc(name) {
              assert.equal(insideAuthCallback, false, "API calls must be deferred outside the auth lock");
              if (name === "seed_get_profile_picture") return { data: null };
              requests++;
              if (requests === (previouslyLoaded ? 2 : 1)) return failure;
              return { data: overview };
            },
          }),
        }) },
      };
      const emit = (event, value) => {
        insideAuthCallback = true;
        try { authCallback(event, value); } finally { insideAuthCallback = false; }
      };
      const settle = () => new Promise((resolve) => setTimeout(resolve, 10));
      try {
        await import(`../assets/js/account.js?retry=${previouslyLoaded}-${refreshDuringRequest}`);
        await settle();
        let manualRefresh;
        if (previouslyLoaded) {
          const button = nodes.get("account-refresh");
          manualRefresh = button.listeners.click({ currentTarget: button });
          await settle();
        }
        if (refreshDuringRequest) {
          emit("TOKEN_REFRESHED", refreshedSession);
          await settle();
        }
        failRequest({ error: { message: "JWT is not valid" } });
        if (!refreshDuringRequest) {
          await settle();
          assert.equal(nodes.get("overview-error").hidden, false);
          assert.equal(nodes.get("overview-error").textContent, "Could not load connected apps and data usage.");
          if (previouslyLoaded) {
            assert.equal(nodes.get("account-name").textContent, "Ada");
            assert.equal(nodes.get("usage-total-records").textContent, "7");
            assert.equal(nodes.get("connections-list").children[0].className, "account-list-item");
          }
          emit("TOKEN_REFRESHED", refreshedSession);
          emit("SIGNED_IN", refreshedSession);
        }
        await manualRefresh;
        await settle();
        assert.equal(requests, previouslyLoaded ? 3 : 2, "retry exactly once");
        assert.equal(nodes.get("account-name").textContent, "Ada");
        assert.equal(nodes.get("display-name").value, "Ada");
        assert.equal(nodes.get("usage-total-records").textContent, "7");
        assert.equal(nodes.get("connections-list").children[0].className, "account-list-item");
        assert.equal(nodes.get("overview-error").hidden, true);
        emit("TOKEN_REFRESHED", refreshedSession);
        emit("SIGNED_IN", refreshedSession);
        await settle();
        assert.equal(requests, previouslyLoaded ? 3 : 2, "healthy refreshes do not reload the form");
      } finally {
        delete globalThis.document;
        delete globalThis.window;
      }
    });
  }
}
