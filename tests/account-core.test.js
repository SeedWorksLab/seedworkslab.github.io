import assert from "node:assert/strict";
import test from "node:test";

import {
  AccountError,
  DELETE_CONFIRMATION,
  MAX_DISPLAY_NAME_LENGTH,
  MAX_PASSWORD_BYTES,
  MIN_PASSWORD_LENGTH,
  createAccountService,
  emptyOverview,
  formatBytes,
  formatCount,
  formatDate,
  friendlyAuthError,
  isAccountConfigured,
  normalizeDisplayName,
  normalizeEmail,
  normalizeOverview,
  passwordsMatch,
  validateDisplayName,
  validateEmail,
  validatePassword,
} from "../assets/js/account-core.js";

const SESSION = {
  user: {
    id: "user-1",
    email: "User@Example.com",
    created_at: "2026-01-02T10:00:00.000Z",
    last_sign_in_at: "2026-11-01T09:30:00.000Z",
  },
};

function makeClient(options = {}) {
  const calls = {
    exchangeCode: [],
    invoke: [],
    profileUpdate: [],
    reset: [],
    rpc: [],
    signIn: [],
    signOut: [],
    signUp: [],
    updateUser: [],
  };

  const session = options.session === undefined ? SESSION : options.session;

  return {
    calls,
    schema(name) {
      calls.schema = calls.schema || [];
      calls.schema.push(name);
      return this;
    },
    auth: {
      exchangeCodeForSession: async (code) => {
        calls.exchangeCode.push(code);
        return {
          data: { session: options.exchangeSession ?? session },
          error: options.exchangeError ?? null,
        };
      },
      getSession: async () => ({
        data: { session },
        error: options.getSessionError ?? null,
      }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe() {} } },
      }),
      resetPasswordForEmail: async (email, resetOptions) => {
        calls.reset.push({ email, ...resetOptions });
        return { error: options.resetError ?? null };
      },
      signInWithPassword: async (credentials) => {
        calls.signIn.push(credentials);
        return { data: { session }, error: options.signInError ?? null };
      },
      signOut: async (signOutOptions) => {
        calls.signOut.push(signOutOptions);
        return { error: options.signOutError ?? null };
      },
      signUp: async (credentials) => {
        calls.signUp.push(credentials);
        return {
          data: { session: options.signUpSession ?? null, user: { id: "user-1" } },
          error: options.signUpError ?? null,
        };
      },
      updateUser: async (attributes) => {
        calls.updateUser.push(attributes);
        return { error: options.updateUserError ?? null };
      },
    },
    from: (table) => ({
      update: (values) => ({
        eq: (column, value) => ({
          select: () => ({
            maybeSingle: async () => {
              calls.profileUpdate.push({ table, values, column, value });
              return {
                data:
                  options.profileUpdateResponse === undefined
                    ? { display_name: values.display_name }
                    : options.profileUpdateResponse,
                error: options.profileUpdateError ?? null,
              };
            },
          }),
        }),
      }),
    }),
    functions: {
      invoke: async (name, invokeOptions) => {
        calls.invoke.push({ name, ...invokeOptions });
        return {
          data: options.deleteResponse ?? { deleted: true },
          error: options.invokeError ?? null,
        };
      },
    },
    rpc: async (name) => {
      calls.rpc.push(name);
      return { data: options.overview ?? null, error: options.rpcError ?? null };
    },
  };
}

test("account configuration requires HTTPS and a publishable key", () => {
  assert.equal(isAccountConfigured(null), false);
  assert.equal(isAccountConfigured({ supabaseUrl: "", supabasePublishableKey: "" }), false);
  assert.equal(
    isAccountConfigured({
      supabaseUrl: "http://example.supabase.co",
      supabasePublishableKey: "sb_publishable_12345678901234567890",
    }),
    false
  );
  assert.equal(
    isAccountConfigured({
      supabaseUrl: "https://example.supabase.co",
      supabasePublishableKey: "short",
    }),
    false
  );
  assert.equal(
    isAccountConfigured({
      supabaseUrl: "https://example.supabase.co",
      supabasePublishableKey: "sb_publishable_12345678901234567890",
    }),
    true
  );
});

test("email normalization and validation are strict", () => {
  assert.equal(normalizeEmail("  User@Example.COM "), "user@example.com");
  assert.equal(validateEmail(""), "Enter your email address.");
  assert.equal(validateEmail("not-an-email"), "Enter a valid email address.");
  assert.equal(validateEmail("user@example.com"), "");
});

test("display names are normalized and bounded", () => {
  assert.equal(normalizeDisplayName("  Ada   Lovelace  "), "Ada Lovelace");
  assert.equal(validateDisplayName(""), "");
  assert.equal(validateDisplayName("   "), "");
  assert.equal(validateDisplayName("a".repeat(MAX_DISPLAY_NAME_LENGTH)), "");
  assert.equal(
    validateDisplayName("a".repeat(MAX_DISPLAY_NAME_LENGTH + 1)),
    `Use no more than ${MAX_DISPLAY_NAME_LENGTH} characters.`
  );
  assert.equal(validateDisplayName("😀".repeat(MAX_DISPLAY_NAME_LENGTH)), "");
  assert.equal(
    validateDisplayName("Ada\u0000"),
    "Use a display name without control characters."
  );
});

test("password policy enforces length, bytes and non-space content", () => {
  assert.equal(validatePassword(""), "Enter a password.");
  assert.equal(
    validatePassword("a".repeat(MIN_PASSWORD_LENGTH - 1)),
    `Use at least ${MIN_PASSWORD_LENGTH} characters.`
  );
  assert.equal(validatePassword("a".repeat(MIN_PASSWORD_LENGTH)), "");
  assert.equal(validatePassword(" ".repeat(MIN_PASSWORD_LENGTH)), "Use a password that is not only spaces.");
  assert.equal(
    validatePassword("é".repeat(MAX_PASSWORD_BYTES / 2 + 1)),
    `Use no more than ${MAX_PASSWORD_BYTES} bytes.`
  );
  assert.equal(passwordsMatch("same", "same"), true);
  assert.equal(passwordsMatch("same", "different"), false);
});

test("friendly errors never leak raw backend messages", () => {
  assert.equal(
    friendlyAuthError(new Error("Invalid login credentials")),
    "Email or password is incorrect."
  );
  assert.equal(
    friendlyAuthError(new Error("Email not confirmed")),
    "Confirm your email address before signing in."
  );
  assert.equal(
    friendlyAuthError(new Error("Rate limit exceeded")),
    "Too many attempts. Wait a moment and try again."
  );
  assert.equal(friendlyAuthError(new Error("unexpected internal detail")), "Something went wrong. Please try again.");
  assert.equal(friendlyAuthError(new AccountError("Custom message")), "Custom message");
});

test("overview normalization handles missing and malformed data", () => {
  assert.deepEqual(normalizeOverview(null), emptyOverview());

  const overview = normalizeOverview({
    profile: { display_name: "  Ada  ", created_at: "2026-01-02T10:00:00.000Z" },
    connections: [
      {
        id: "connection-1",
        app_slug: "coconut",
        app_name: "Coconut",
        device_name: "Pixel",
        linked_at: "2026-01-03T10:00:00.000Z",
        last_seen_at: "2026-11-02T10:00:00.000Z",
      },
      { app_slug: "" },
    ],
    usage: [
      {
        app_slug: "coconut",
        app_name: "Coconut",
        record_count: "42",
        byte_count: "2048",
        updated_at: "2026-11-02T10:00:00.000Z",
      },
      { app_slug: "cherry", record_count: -5, byte_count: "bad" },
    ],
    totals: { record_count: "42", byte_count: "2048" },
  });

  assert.equal(overview.profile.displayName, "Ada");
  assert.equal(overview.connections.length, 1);
  assert.equal(overview.connections[0].deviceName, "Pixel");
  assert.equal(overview.usage.length, 2);
  assert.equal(overview.usage[1].recordCount, 0);
  assert.equal(overview.usage[1].byteCount, 0);
  assert.deepEqual(overview.totals, { recordCount: 42, byteCount: 2048 });
});

test("overview totals fall back to usage rows", () => {
  const overview = normalizeOverview({
    usage: [
      { app_slug: "coconut", record_count: 10, byte_count: 100 },
      { app_slug: "cherry", record_count: 5, byte_count: 200 },
    ],
  });

  assert.deepEqual(overview.totals, { recordCount: 15, byteCount: 300 });
});

test("formatting is stable and bounded", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(1024), "1 KB");
  assert.equal(formatBytes(1536), "1.5 KB");
  assert.equal(formatCount(1234567), "1,234,567");
  assert.equal(formatDate(null), "Unknown");
  assert.equal(formatDate("not-a-date"), "Unknown");
  assert.equal(formatDate("2026-11-02T10:00:00.000Z"), "2 Nov 2026");
});

test("sign in normalizes the email and returns the session", async () => {
  const client = makeClient();
  const service = createAccountService(client);

  const session = await service.signIn(" User@Example.com ", "password");

  assert.equal(session, SESSION);
  assert.deepEqual(client.calls.signIn, [
    { email: "user@example.com", password: "password" },
  ]);
});

test("email link codes are exchanged explicitly", async () => {
  const client = makeClient();
  const service = createAccountService(client);

  const session = await service.exchangeCodeForSession("recovery-code");

  assert.equal(session, SESSION);
  assert.deepEqual(client.calls.exchangeCode, ["recovery-code"]);
});

test("invalid email link codes produce a safe error", async () => {
  const client = makeClient({ exchangeError: new Error("invalid token") });
  const service = createAccountService(client);

  await assert.rejects(
    service.exchangeCodeForSession("bad-code"),
    /That link has expired. Request a new email./
  );
});

test("sign up reports when email confirmation is required", async () => {
  const client = makeClient({ signUpSession: null });
  const service = createAccountService(client);

  const result = await service.signUp("User@Example.com", "a".repeat(12), "https://site/account.html");

  assert.deepEqual(result, { session: null, needsEmailConfirmation: true });
  assert.deepEqual(client.calls.signUp, [
    {
      email: "user@example.com",
      password: "a".repeat(12),
      options: { emailRedirectTo: "https://site/account.html" },
    },
  ]);
});

test("sign up returns the session when confirmation is disabled", async () => {
  const client = makeClient({ signUpSession: SESSION });
  const service = createAccountService(client);

  const result = await service.signUp("user@example.com", "a".repeat(12), "https://site/account.html");

  assert.equal(result.session, SESSION);
  assert.equal(result.needsEmailConfirmation, false);
});

test("password reset always uses the supplied redirect", async () => {
  const client = makeClient();
  const service = createAccountService(client);

  await service.requestPasswordReset(" User@Example.com ", "https://site/account.html?flow=recovery");

  assert.deepEqual(client.calls.reset, [
    {
      email: "user@example.com",
      redirectTo: "https://site/account.html?flow=recovery",
    },
  ]);
});

test("username updates the account-wide profile", async () => {
  const client = makeClient();
  const service = createAccountService(client);

  const result = await service.updateDisplayName("  Ada   Lovelace  ");

  assert.deepEqual(result, { displayName: "Ada Lovelace" });
  assert.deepEqual(client.calls.schema, ["public"]);
  assert.deepEqual(client.calls.profileUpdate, [
    {
      table: "seed_profiles",
      values: { display_name: "Ada Lovelace" },
      column: "id",
      value: "user-1",
    },
  ]);
});

test("clearing the username stores null in the account profile", async () => {
  const client = makeClient();
  const service = createAccountService(client);

  const result = await service.updateDisplayName("   ");

  assert.deepEqual(result, { displayName: null });
  assert.deepEqual(client.calls.profileUpdate, [
    {
      table: "seed_profiles",
      values: { display_name: null },
      column: "id",
      value: "user-1",
    },
  ]);
});

test("invalid display names are rejected before writing", async () => {
  const client = makeClient();
  const service = createAccountService(client);

  await assert.rejects(
    service.updateDisplayName("a".repeat(MAX_DISPLAY_NAME_LENGTH + 1)),
    /Use no more than 80 characters/
  );
  assert.equal(client.calls.profileUpdate.length, 0);
});

test("display name write failures use a safe error", async () => {
  const client = makeClient({ profileUpdateError: new Error("database detail") });
  const service = createAccountService(client);

  await assert.rejects(
    service.updateDisplayName("Ada"),
    /Could not update your username/
  );
});

test("password changes reauthenticate and sign out other devices", async () => {
  const client = makeClient();
  const service = createAccountService(client);

  const result = await service.updatePassword("current-password", "a".repeat(12));

  assert.deepEqual(result, { otherSessionsSignedOut: true });
  assert.deepEqual(client.calls.signIn, [
    { email: "user@example.com", password: "current-password" },
  ]);
  assert.deepEqual(client.calls.updateUser, [{ password: "a".repeat(12) }]);
  assert.deepEqual(client.calls.signOut, [{ scope: "others" }]);
});

test("password changes reject reuse of the current password", async () => {
  const client = makeClient();
  const service = createAccountService(client);

  await assert.rejects(
    service.updatePassword("current-password", "current-password"),
    /Choose a password you have not used/
  );
  assert.equal(client.calls.signIn.length, 0);
});

test("password recovery updates without asking for the old password", async () => {
  const client = makeClient();
  const service = createAccountService(client);

  const result = await service.completePasswordRecovery("a".repeat(12));

  assert.deepEqual(result, { otherSessionsSignedOut: true });
  assert.deepEqual(client.calls.updateUser, [{ password: "a".repeat(12) }]);
  assert.deepEqual(client.calls.signIn, []);
});

test("account deletion requires the exact phrase and reauthenticates", async () => {
  const client = makeClient();
  const service = createAccountService(client);

  await assert.rejects(
    service.deleteAccount({
      email: "user@example.com",
      password: "password",
      confirmation: "delete",
    }),
    /Type the confirmation phrase/
  );
  assert.equal(client.calls.signIn.length, 0);
  assert.equal(client.calls.invoke.length, 0);

  const deleted = await service.deleteAccount({
    email: "user@example.com",
    password: "password",
    confirmation: DELETE_CONFIRMATION,
  });

  assert.equal(deleted, true);
  assert.deepEqual(client.calls.signIn, [
    { email: "user@example.com", password: "password" },
  ]);
  assert.deepEqual(client.calls.invoke, [
    {
      name: "delete-account",
      body: { confirmation: DELETE_CONFIRMATION },
    },
  ]);
  assert.deepEqual(client.calls.signOut, [{ scope: "local" }]);
});

test("account deletion stops when reauthentication fails", async () => {
  const client = makeClient({ signInError: new Error("Invalid login credentials") });
  const service = createAccountService(client);

  await assert.rejects(
    service.deleteAccount({
      email: "user@example.com",
      password: "wrong-password",
      confirmation: DELETE_CONFIRMATION,
    }),
    /Password is incorrect/
  );
  assert.equal(client.calls.invoke.length, 0);
});

test("account deletion fails closed if the server does not confirm", async () => {
  const client = makeClient({ deleteResponse: { deleted: false } });
  const service = createAccountService(client);

  await assert.rejects(
    service.deleteAccount({
      email: "user@example.com",
      password: "password",
      confirmation: DELETE_CONFIRMATION,
    }),
    /did not confirm deletion/
  );
  assert.deepEqual(client.calls.signOut, []);
});

test("overview loading uses the protected RPC and returns the shared profile", async () => {
  const client = makeClient({
    overview: {
      profile: { display_name: "Ada Lovelace" },
      connections: [{ app_slug: "coconut", app_name: "Coconut" }],
      usage: [{ app_slug: "coconut", record_count: 4, byte_count: 1024 }],
      totals: { record_count: 4, byte_count: 1024 },
    },
  });
  const service = createAccountService(client);

  const overview = await service.loadOverview();

  assert.deepEqual(client.calls.rpc, ["seed_account_overview"]);
  assert.deepEqual(client.calls.schema, ["public"]);
  assert.equal(overview.profile.displayName, "Ada Lovelace");
  assert.equal(overview.connections.length, 1);
  assert.deepEqual(overview.totals, { recordCount: 4, byteCount: 1024 });
});

test("overview loads without a Coconut settings row", async () => {
  const client = makeClient({ overview: { profile: { display_name: null }, usage: [] } });
  assert.equal((await createAccountService(client).loadOverview()).profile.displayName, null);
  assert.deepEqual(client.calls.schema, ["public"]);
});

test("username update fails when the profile row is missing", async () => {
  const client = makeClient({ profileUpdateResponse: null });
  await assert.rejects(
    createAccountService(client).updateDisplayName("Ada"),
    /Could not find your account profile/
  );
});

test("overview loading reports a safe error", async () => {
  const client = makeClient({ rpcError: new Error("database detail") });
  const service = createAccountService(client);

  await assert.rejects(
    service.loadOverview(),
    /Could not load connected apps and data usage/
  );
});

test("sign out is local to this device", async () => {
  const client = makeClient();
  const service = createAccountService(client);

  await service.signOut();

  assert.deepEqual(client.calls.signOut, [{ scope: "local" }]);
});
