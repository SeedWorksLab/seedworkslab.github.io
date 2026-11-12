export const DELETE_CONFIRMATION = "DELETE MY SEED ACCOUNT";
export const MAX_DISPLAY_NAME_LENGTH = 80;
export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_BYTES = 72;

export class AccountError extends Error {
  constructor(message) {
    super(message);
    this.name = "AccountError";
  }
}

export function isAccountConfigured(config) {
  if (!config || typeof config.supabasePublishableKey !== "string") return false;
  if (config.supabasePublishableKey.trim().length < 20) return false;

  try {
    const url = new URL(config.supabaseUrl);
    return url.protocol === "https:" && url.hostname.length > 0;
  } catch (error) {
    return false;
  }
}

export function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function validateEmail(value) {
  const email = normalizeEmail(value);
  if (email.length === 0) return "Enter your email address.";
  if (email.length > 254) return "Use an email address shorter than 255 characters.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Enter a valid email address.";
  return "";
}

export function normalizeDisplayName(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function validateDisplayName(value) {
  const displayName = normalizeDisplayName(value);
  if (/[\u0000-\u001f\u007f-\u009f]/.test(displayName)) {
    return "Use a display name without control characters.";
  }
  if ([...displayName].length > MAX_DISPLAY_NAME_LENGTH) {
    return `Use no more than ${MAX_DISPLAY_NAME_LENGTH} characters.`;
  }
  return "";
}

export function validatePassword(value) {
  const password = String(value ?? "");
  if (password.length === 0) return "Enter a password.";
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (new TextEncoder().encode(password).length > MAX_PASSWORD_BYTES) {
    return `Use no more than ${MAX_PASSWORD_BYTES} bytes.`;
  }
  if (password.trim().length === 0) return "Use a password that is not only spaces.";
  return "";
}

export function passwordsMatch(password, confirmation) {
  return String(password ?? "") === String(confirmation ?? "");
}

export function friendlyAuthError(error, fallback = "Something went wrong. Please try again.") {
  if (error instanceof AccountError) return error.message;

  const message = typeof error?.message === "string" ? error.message.toLowerCase() : "";

  if (message.includes("invalid login credentials")) {
    return "Email or password is incorrect.";
  }
  if (message.includes("email not confirmed")) {
    return "Confirm your email address before signing in.";
  }
  if (message.includes("user already registered")) {
    return "An account with this email already exists. Try signing in instead.";
  }
  if (message.includes("password should be at least")) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (message.includes("same password")) {
    return "Choose a password you have not used for this account.";
  }
  if (message.includes("rate limit") || message.includes("too many requests")) {
    return "Too many attempts. Wait a moment and try again.";
  }
  if (message.includes("expired") || message.includes("invalid token")) {
    return "That link has expired. Request a new email.";
  }
  if (message.includes("network") || message.includes("fetch")) {
    return "Could not reach the account service. Check your connection and try again.";
  }
  if (message.includes("jwt") || message.includes("session")) {
    return "Your session has expired. Sign in again.";
  }

  return fallback;
}

function toCount(value) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.trunc(number) : 0;
}

function asIsoString(value) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asText(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function normalizeOverview(payload) {
  const data = payload && typeof payload === "object" ? payload : {};
  const profileSource = data.profile && typeof data.profile === "object" ? data.profile : null;

  const connections = Array.isArray(data.connections)
    ? data.connections
        .filter((item) => item && typeof item === "object" && asText(item.app_slug))
        .map((item) => ({
          id: asText(item.id),
          appSlug: asText(item.app_slug),
          appName: asText(item.app_name) || asText(item.app_slug),
          deviceName: asText(item.device_name),
          linkedAt: asIsoString(item.linked_at),
          lastSeenAt: asIsoString(item.last_seen_at),
        }))
    : [];

  const usage = Array.isArray(data.usage)
    ? data.usage
        .filter((item) => item && typeof item === "object" && asText(item.app_slug))
        .map((item) => ({
          appSlug: asText(item.app_slug),
          appName: asText(item.app_name) || asText(item.app_slug),
          recordCount: toCount(item.record_count),
          byteCount: toCount(item.byte_count),
          updatedAt: asIsoString(item.updated_at),
        }))
    : [];

  const totalSource = data.totals && typeof data.totals === "object" ? data.totals : null;
  const totals = totalSource
    ? {
        recordCount: toCount(totalSource.record_count),
        byteCount: toCount(totalSource.byte_count),
      }
    : {
        recordCount: usage.reduce((sum, item) => sum + item.recordCount, 0),
        byteCount: usage.reduce((sum, item) => sum + item.byteCount, 0),
      };

  return {
    profile: profileSource
      ? {
          displayName: asText(profileSource.display_name),
          createdAt: asIsoString(profileSource.created_at),
        }
      : null,
    connections,
    usage,
    totals,
  };
}

export function emptyOverview() {
  return normalizeOverview(null);
}

export function formatBytes(value) {
  const bytes = toCount(value);
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const amount = bytes / 1024 ** exponent;
  const formatted = new Intl.NumberFormat("en-GB", {
    maximumFractionDigits: exponent === 0 ? 0 : 1,
  }).format(amount);

  return `${formatted} ${units[exponent]}`;
}

export function formatCount(value) {
  return new Intl.NumberFormat("en-GB").format(toCount(value));
}

export function formatDate(value) {
  if (!value) return "Unknown";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatDateTime(value) {
  if (!value) return "Unknown";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function createAccountService(client, options = {}) {
  if (!client || !client.auth) {
    throw new AccountError("The account service is unavailable.");
  }

  const deleteFunction = options.deleteFunction || "delete-account";

  function reauthMessage(error, fallback) {
    const message = friendlyAuthError(error, fallback);
    return message === "Email or password is incorrect." ? fallback : message;
  }

  async function sessionOrThrow() {
    const { data, error } = await client.auth.getSession();
    if (error) throw new AccountError(friendlyAuthError(error, "Could not read your session."));
    if (!data?.session) throw new AccountError("Your session has expired. Sign in again.");
    return data.session;
  }

  return {
    async getSession() {
      const { data, error } = await client.auth.getSession();
      if (error) throw new AccountError(friendlyAuthError(error, "Could not read your session."));
      return data.session ?? null;
    },

    async exchangeCodeForSession(code) {
      const { data, error } = await client.auth.exchangeCodeForSession(code);
      if (error) {
        throw new AccountError(
          friendlyAuthError(error, "That email link is invalid or has expired.")
        );
      }
      return data.session ?? null;
    },

    onAuthStateChange(callback) {
      return client.auth.onAuthStateChange((event, session) => callback(event, session));
    },

    async signIn(email, password) {
      const emailError = validateEmail(email);
      if (emailError) throw new AccountError(emailError);
      if (!password) throw new AccountError("Enter your password.");

      const { data, error } = await client.auth.signInWithPassword({
        email: normalizeEmail(email),
        password,
      });

      if (error) throw new AccountError(friendlyAuthError(error, "Could not sign in."));
      return data.session;
    },

    async signUp(email, password, redirectTo) {
      const emailError = validateEmail(email);
      if (emailError) throw new AccountError(emailError);
      const passwordError = validatePassword(password);
      if (passwordError) throw new AccountError(passwordError);

      const { data, error } = await client.auth.signUp({
        email: normalizeEmail(email),
        password,
        options: redirectTo ? { emailRedirectTo: redirectTo } : undefined,
      });

      if (error) throw new AccountError(friendlyAuthError(error, "Could not create the account."));

      return {
        session: data.session ?? null,
        needsEmailConfirmation: !data.session,
      };
    },

    async requestPasswordReset(email, redirectTo) {
      const emailError = validateEmail(email);
      if (emailError) throw new AccountError(emailError);

      const { error } = await client.auth.resetPasswordForEmail(normalizeEmail(email), {
        redirectTo,
      });

      if (error) {
        throw new AccountError(friendlyAuthError(error, "Could not send the reset email."));
      }
    },

    async updatePassword(currentPassword, newPassword) {
      if (!currentPassword) throw new AccountError("Enter your current password.");
      const passwordError = validatePassword(newPassword);
      if (passwordError) throw new AccountError(passwordError);
      if (passwordsMatch(currentPassword, newPassword)) {
        throw new AccountError("Choose a password you have not used for this account.");
      }

      const session = await sessionOrThrow();
      const email = normalizeEmail(session.user?.email);
      if (!email) throw new AccountError("Your account has no email address.");

      const { error: reauthError } = await client.auth.signInWithPassword({
        email,
        password: currentPassword,
      });
      if (reauthError) {
        throw new AccountError(reauthMessage(reauthError, "Current password is incorrect."));
      }

      const { error: updateError } = await client.auth.updateUser({ password: newPassword });
      if (updateError) {
        throw new AccountError(friendlyAuthError(updateError, "Could not update the password."));
      }

      let otherSessionsSignedOut = false;
      try {
        const { error } = await client.auth.signOut({ scope: "others" });
        otherSessionsSignedOut = !error;
      } catch (error) {
        otherSessionsSignedOut = false;
      }

      return { otherSessionsSignedOut };
    },

    async updateDisplayName(displayName) {
      const normalizedName = normalizeDisplayName(displayName);
      const displayNameError = validateDisplayName(normalizedName);
      if (displayNameError) throw new AccountError(displayNameError);

      const session = await sessionOrThrow();
      const userId = session.user?.id;
      if (!userId) throw new AccountError("Your session has expired. Sign in again.");

      const { data, error } = await client
        .from("seed_profiles")
        .update({ display_name: normalizedName || null })
        .eq("id", userId)
        .select("display_name")
        .maybeSingle();

      if (error) {
        throw new AccountError(
          friendlyAuthError(error, "Could not update your display name.")
        );
      }
      if (!data) {
        throw new AccountError("Could not update your display name. Refresh and try again.");
      }

      return { displayName: normalizeDisplayName(data.display_name) };
    },

    async completePasswordRecovery(newPassword) {
      const passwordError = validatePassword(newPassword);
      if (passwordError) throw new AccountError(passwordError);

      const { error } = await client.auth.updateUser({ password: newPassword });
      if (error) {
        throw new AccountError(friendlyAuthError(error, "Could not update the password."));
      }

      let otherSessionsSignedOut = false;
      try {
        const { error: signOutError } = await client.auth.signOut({ scope: "others" });
        otherSessionsSignedOut = !signOutError;
      } catch (error) {
        otherSessionsSignedOut = false;
      }

      return { otherSessionsSignedOut };
    },

    async signOut() {
      const { error } = await client.auth.signOut({ scope: "local" });
      if (error) throw new AccountError(friendlyAuthError(error, "Could not sign out."));
    },

    async loadOverview() {
      const { data, error } = await client.rpc("seed_account_overview");
      if (error) {
        throw new AccountError(
          friendlyAuthError(error, "Could not load connected apps and data usage.")
        );
      }
      return normalizeOverview(data);
    },

    async deleteAccount({ email, password, confirmation }) {
      if (confirmation !== DELETE_CONFIRMATION) {
        throw new AccountError("Type the confirmation phrase exactly as shown.");
      }
      if (!password) throw new AccountError("Enter your password to confirm deletion.");

      const session = await sessionOrThrow();
      const accountEmail = normalizeEmail(session.user?.email || email);
      if (!accountEmail) throw new AccountError("Your account has no email address.");

      const { error: reauthError } = await client.auth.signInWithPassword({
        email: accountEmail,
        password,
      });
      if (reauthError) {
        throw new AccountError(reauthMessage(reauthError, "Password is incorrect."));
      }

      const { data, error } = await client.functions.invoke(deleteFunction, {
        body: { confirmation: DELETE_CONFIRMATION },
      });

      if (error) {
        throw new AccountError(
          friendlyAuthError(error, "Could not delete the account. Contact support if this persists.")
        );
      }
      if (data?.deleted !== true) {
        throw new AccountError("The account service did not confirm deletion.");
      }

      try {
        await client.auth.signOut({ scope: "local" });
      } catch (error) {
        /* The server account is already gone; a stale local session is harmless. */
      }

      return true;
    },
  };
}
