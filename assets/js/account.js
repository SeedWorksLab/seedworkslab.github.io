import { ACCOUNT_CONFIG } from "./account-config.js";
import {
  AccountError,
  DELETE_CONFIRMATION,
  createAccountService,
  emptyOverview,
  formatBytes,
  formatCount,
  formatDate,
  formatDateTime,
  friendlyAuthError,
  isAccountConfigured,
  passwordsMatch,
  validatePassword,
} from "./account-core.js";

const APP_ICONS = {
  banana: "assets/icons/banana-logo.png",
  cherry: "assets/icons/cherry-logo.jpg",
  coconut: "assets/icons/coconut-logo.jpg",
};

const viewNodes = document.querySelectorAll("[data-account-view]");
const flash = document.getElementById("account-flash");
const tabs = document.querySelectorAll("[data-auth-tab]");
const authPanels = document.querySelectorAll("[data-auth-panel]");

let service = null;
let activeSession = null;
let recoveryMode = false;
let recoveryEventSeen = false;
let initialized = false;
let accountDeleted = false;
let overviewRequest = 0;
let renderedUserId = null;

function showView(name) {
  viewNodes.forEach((node) => {
    node.hidden = node.getAttribute("data-account-view") !== name;
  });
}

function setFlash(message, tone = "info") {
  if (!flash) return;
  flash.textContent = message || "";
  flash.setAttribute("data-tone", tone);
  flash.hidden = !message;
}

function showAuthPanel(name) {
  tabs.forEach((tab) => {
    const selected = tab.getAttribute("data-auth-tab") === name;
    tab.setAttribute("aria-selected", selected ? "true" : "false");
    tab.setAttribute("tabindex", selected ? "0" : "-1");
  });

  authPanels.forEach((panel) => {
    panel.hidden = panel.getAttribute("data-auth-panel") !== name;
  });

  const firstField = document.querySelector(
    `[data-auth-panel="${name}"] input:not([type="hidden"])`
  );
  if (firstField && !firstField.closest("[hidden]")) firstField.focus();
}

function setFormBusy(form, busy) {
  form.setAttribute("aria-busy", busy ? "true" : "false");
  form.querySelectorAll("button, input").forEach((control) => {
    control.disabled = busy;
  });
}

function textElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = text;
  return element;
}

function appIcon(appSlug) {
  const source = APP_ICONS[appSlug];
  if (!source) return null;

  const image = document.createElement("img");
  image.src = source;
  image.alt = "";
  image.width = 36;
  image.height = 36;
  image.loading = "lazy";
  image.className = "account-app-icon";
  return image;
}

function renderConnections(connections) {
  const list = document.getElementById("connections-list");
  if (!list) return;
  list.replaceChildren();

  if (connections.length === 0) {
    list.append(
      textElement(
        "p",
        "account-empty",
        "No apps have reported activity yet. Connect an app to see it here."
      )
    );
    return;
  }

  connections.forEach((connection) => {
    const item = document.createElement("li");
    item.className = "account-list-item";

    const main = document.createElement("div");
    main.className = "account-list-main";
    const icon = appIcon(connection.appSlug);
    if (icon) main.append(icon);

    const copy = document.createElement("div");
    copy.append(textElement("h3", "", connection.appName));
    copy.append(textElement("p", "", connection.deviceName || "Unknown device"));
    main.append(copy);

    const meta = document.createElement("div");
    meta.className = "account-list-meta";
    meta.append(textElement("span", "", "Last seen"));
    meta.append(textElement("strong", "", formatDateTime(connection.lastSeenAt)));

    item.append(main, meta);
    list.append(item);
  });
}

function renderUsage(usage, totals) {
  const list = document.getElementById("usage-list");
  const totalRecords = document.getElementById("usage-total-records");
  const totalBytes = document.getElementById("usage-total-size");

  if (totalRecords) totalRecords.textContent = formatCount(totals.recordCount);
  if (totalBytes) totalBytes.textContent = formatBytes(totals.byteCount);
  if (!list) return;

  list.replaceChildren();

  if (usage.length === 0) {
    list.append(
      textElement("p", "account-empty", "No Seed-hosted data has been reported yet.")
    );
    return;
  }

  usage.forEach((item) => {
    const row = document.createElement("li");
    row.className = "account-usage-row";

    const main = document.createElement("div");
    main.className = "account-list-main";
    const icon = appIcon(item.appSlug);
    if (icon) main.append(icon);

    const copy = document.createElement("div");
    copy.append(textElement("h3", "", item.appName));
    copy.append(textElement("p", "", `Updated ${formatDateTime(item.updatedAt)}`));
    main.append(copy);

    const amount = document.createElement("div");
    amount.className = "account-usage-amount";
    amount.append(textElement("strong", "", formatCount(item.recordCount)));
    amount.append(textElement("span", "", `${formatBytes(item.byteCount)} stored`));

    row.append(main, amount);
    list.append(row);
  });
}

function renderDisplayName(session, displayName) {
  const email = session?.user?.email || "Unknown email";
  const nameNode = document.getElementById("account-name");
  const nameInput = document.getElementById("display-name");

  if (nameNode) nameNode.textContent = displayName || email;
  if (nameInput) nameInput.value = displayName || "";
}

function renderAccountIdentity(session, overview) {
  const email = session.user?.email || "Unknown email";
  const displayName = overview.profile?.displayName;
  const memberSince = overview.profile?.createdAt || session.user?.created_at;

  const emailNode = document.getElementById("account-email");
  const memberNode = document.getElementById("account-member-since");
  const lastSignInNode = document.getElementById("account-last-sign-in");
  const overviewError = document.getElementById("overview-error");

  if (emailNode) emailNode.textContent = email;
  renderDisplayName(session, displayName);
  if (memberNode) memberNode.textContent = formatDate(memberSince);
  if (lastSignInNode) lastSignInNode.textContent = formatDateTime(session.user?.last_sign_in_at);
  if (overviewError) overviewError.hidden = true;
}

async function renderSignedIn(session) {
  if (!session || !service) return;

  activeSession = session;
  if (recoveryMode) {
    showView("recovery");
    return;
  }

  showView("signed-in");
  const requestId = ++overviewRequest;
  if (renderedUserId !== session.user?.id) {
    renderedUserId = session.user?.id;
    renderAccountIdentity(session, emptyOverview());
    renderConnections([]);
    renderUsage([], emptyOverview().totals);
  }

  try {
    const overview = await service.loadOverview();
    if (requestId !== overviewRequest || activeSession?.user?.id !== session.user?.id) return false;
    renderAccountIdentity(session, overview);
    renderConnections(overview.connections);
    renderUsage(overview.usage, overview.totals);
    return true;
  } catch (error) {
    if (requestId !== overviewRequest || activeSession?.user?.id !== session.user?.id) return false;
    const overviewError = document.getElementById("overview-error");
    if (overviewError) {
      overviewError.textContent =
        error instanceof AccountError
          ? error.message
          : "Could not load connected apps and data usage.";
      overviewError.hidden = false;
    }
    return false;
  }
}

function cleanAuthUrl() {
  const url = new URL(window.location.href);
  if (url.search || url.hash) {
    window.history.replaceState(null, "", url.pathname);
  }
}

async function handleSignIn(form) {
  const email = form.elements.namedItem("email").value;
  const password = form.elements.namedItem("password").value;

  setFormBusy(form, true);
  setFlash("");
  try {
    const session = await service.signIn(email, password);
    form.reset();
    if (session) await renderSignedIn(session);
  } catch (error) {
    setFlash(error instanceof AccountError ? error.message : "Could not sign in.", "error");
  } finally {
    setFormBusy(form, false);
  }
}

async function handleSignUp(form) {
  const email = form.elements.namedItem("email").value;
  const password = form.elements.namedItem("password").value;
  const confirmation = form.elements.namedItem("confirmPassword").value;

  setFlash("");
  if (!passwordsMatch(password, confirmation)) {
    setFlash("The passwords do not match.", "error");
    return;
  }

  setFormBusy(form, true);
  try {
    const result = await service.signUp(email, password, new URL("account.html?flow=signup", window.location.href).toString());
    form.reset();

    if (result.session) {
      await renderSignedIn(result.session);
      setFlash("Account created. You are signed in.", "success");
      return;
    }

    showAuthPanel("signin");
    setFlash("Check your email to confirm the account, then sign in.", "success");
  } catch (error) {
    setFlash(
      error instanceof AccountError ? error.message : "Could not create the account.",
      "error"
    );
  } finally {
    setFormBusy(form, false);
  }
}

async function handleResetRequest(form) {
  const email = form.elements.namedItem("email").value;

  setFormBusy(form, true);
  setFlash("");
  try {
    await service.requestPasswordReset(
      email,
      new URL("account.html?flow=recovery", window.location.href).toString()
    );
    form.reset();
    showAuthPanel("signin");
    setFlash("If that email has an account, a password reset link is on its way.", "success");
  } catch (error) {
    setFlash(
      error instanceof AccountError ? error.message : "Could not send the reset email.",
      "error"
    );
  } finally {
    setFormBusy(form, false);
  }
}

async function handleProfileChange(form) {
  const displayName = form.elements.namedItem("displayName").value;
  const userId = activeSession?.user?.id;

  setFlash("");
  setFormBusy(form, true);
  try {
    const result = await service.updateDisplayName(displayName);
    if (userId !== activeSession?.user?.id) return;
    // A slower overview request must not replace a newly saved username.
    ++overviewRequest;
    renderDisplayName(activeSession, result.displayName);
    setFlash(
      result.displayName ? "Username saved. Connected apps will receive it when they sync." : "Username cleared.",
      "success"
    );
  } catch (error) {
    setFlash(
      error instanceof AccountError ? error.message : "Could not update your username.",
      "error"
    );
  } finally {
    setFormBusy(form, false);
  }
}

async function handlePasswordChange(form) {
  const currentPassword = form.elements.namedItem("currentPassword").value;
  const newPassword = form.elements.namedItem("newPassword").value;
  const confirmation = form.elements.namedItem("confirmPassword").value;

  setFlash("");
  if (!passwordsMatch(newPassword, confirmation)) {
    setFlash("The new passwords do not match.", "error");
    return;
  }

  setFormBusy(form, true);
  try {
    const result = await service.updatePassword(currentPassword, newPassword);
    form.reset();
    setFlash(
      result.otherSessionsSignedOut
        ? "Password updated. Other devices have been signed out."
        : "Password updated.",
      "success"
    );
  } catch (error) {
    setFlash(
      error instanceof AccountError ? error.message : "Could not update the password.",
      "error"
    );
  } finally {
    setFormBusy(form, false);
  }
}

async function handleRecovery(form) {
  const newPassword = form.elements.namedItem("newPassword").value;
  const confirmation = form.elements.namedItem("confirmPassword").value;

  setFlash("");
  const passwordError = validatePassword(newPassword);
  if (passwordError) {
    setFlash(passwordError, "error");
    return;
  }
  if (!passwordsMatch(newPassword, confirmation)) {
    setFlash("The new passwords do not match.", "error");
    return;
  }

  setFormBusy(form, true);
  try {
    await service.completePasswordRecovery(newPassword);
    form.reset();
    recoveryMode = false;
    cleanAuthUrl();
    setFlash("Password set. You are signed in.", "success");
    await renderSignedIn(activeSession);
  } catch (error) {
    setFlash(
      error instanceof AccountError ? error.message : "Could not update the password.",
      "error"
    );
  } finally {
    setFormBusy(form, false);
  }
}

async function handleDelete(form) {
  const confirmation = form.elements.namedItem("confirmation").value.trim();
  const password = form.elements.namedItem("password").value;

  setFlash("");
  if (confirmation !== DELETE_CONFIRMATION) {
    setFlash("Type the confirmation phrase exactly as shown.", "error");
    return;
  }

  setFormBusy(form, true);
  try {
    await service.deleteAccount({
      email: activeSession?.user?.email,
      password,
      confirmation,
    });
    accountDeleted = true;
    ++overviewRequest;
    form.reset();
    showView("deleted");
    setFlash("Your Seed account and its personal hosted data have been deleted.", "success");
  } catch (error) {
    setFlash(
      error instanceof AccountError ? error.message : "Could not delete the account.",
      "error"
    );
  } finally {
    setFormBusy(form, false);
  }
}

function bindPasswordVisibility() {
  document.querySelectorAll("[data-toggle-passwords]").forEach((button) => {
    button.addEventListener("click", () => {
      const form = button.closest("form");
      if (!form) return;

      const show = button.getAttribute("data-visible") !== "true";
      button.setAttribute("data-visible", show ? "true" : "false");
      button.textContent = show ? "Hide passwords" : "Show passwords";

      form.querySelectorAll('input[type="password"], input[data-password-input]').forEach((input) => {
        if (input.dataset.passwordInput === "true") {
          input.type = show ? "text" : "password";
        }
      });
    });
  });
}

function bindForms() {
  document.getElementById("signin-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    handleSignIn(event.currentTarget);
  });

  document.getElementById("signup-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    handleSignUp(event.currentTarget);
  });

  document.getElementById("reset-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    handleResetRequest(event.currentTarget);
  });

  document.getElementById("profile-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    handleProfileChange(event.currentTarget);
  });

  document.getElementById("password-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    handlePasswordChange(event.currentTarget);
  });

  document.getElementById("recovery-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    handleRecovery(event.currentTarget);
  });

  document.getElementById("delete-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    handleDelete(event.currentTarget);
  });
}

function bindNavigation() {
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => showAuthPanel(tab.getAttribute("data-auth-tab")));
    tab.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const next = event.key === "ArrowRight" ? "signup" : "signin";
      showAuthPanel(next);
      document.querySelector(`[data-auth-tab="${next}"]`)?.focus();
    });
  });

  document.getElementById("show-reset")?.addEventListener("click", () => {
    setFlash("");
    showAuthPanel("reset");
  });

  document.getElementById("reset-back")?.addEventListener("click", () => {
    setFlash("");
    showAuthPanel("signin");
  });

  document.getElementById("account-signout")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    setFlash("");
    try {
      await service.signOut();
      setFlash("Signed out of this device.", "success");
    } catch (error) {
      setFlash(error instanceof AccountError ? error.message : "Could not sign out.", "error");
    } finally {
      button.disabled = false;
    }
  });

  document.getElementById("account-refresh")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    setFlash("");
    try {
      const loaded = activeSession && await renderSignedIn(activeSession);
      if (loaded) setFlash("Account details refreshed.", "success");
    } catch (error) {
      setFlash(
        error instanceof AccountError ? error.message : "Could not refresh account details.",
        "error"
      );
    } finally {
      button.disabled = false;
    }
  });

  document.getElementById("recovery-signout")?.addEventListener("click", async () => {
    try {
      await service.signOut();
    } catch (error) {
      setFlash(error instanceof AccountError ? error.message : "Could not sign out.", "error");
    }
  });
}

function readUrlState() {
  const url = new URL(window.location.href);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));

  return {
    code: url.searchParams.get("code") || hash.get("code"),
    flow: url.searchParams.get("flow") || hash.get("type"),
    error: url.searchParams.get("error_description") || hash.get("error_description"),
  };
}

async function initialize() {
  if (!isAccountConfigured(ACCOUNT_CONFIG)) {
    showView("unavailable");
    return;
  }

  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    showView("unavailable");
    setFlash("The account library could not be loaded. Refresh the page and try again.", "error");
    return;
  }

  const urlState = readUrlState();

  const client = window.supabase.createClient(
    ACCOUNT_CONFIG.supabaseUrl,
    ACCOUNT_CONFIG.supabasePublishableKey,
    {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: "pkce",
        persistSession: true,
        storageKey: "seedworks-account-auth",
      },
    }
  );

  service = createAccountService(client, {
    deleteFunction: ACCOUNT_CONFIG.deleteFunction,
  });

  bindPasswordVisibility();
  bindForms();
  bindNavigation();

  client.auth.onAuthStateChange((event, session) => {
    if (accountDeleted) return;

    if (event === "PASSWORD_RECOVERY") {
      if (!initialized) {
        recoveryEventSeen = true;
        return;
      }
      recoveryMode = true;
      activeSession = session;
      showView("recovery");
      return;
    }

    if (!initialized) return;

    if (event === "SIGNED_OUT") {
      ++overviewRequest;
      activeSession = null;
      renderedUserId = null;
      recoveryMode = false;
      showView("signed-out");
      showAuthPanel("signin");
      return;
    }

    if (session && session.user?.id !== activeSession?.user?.id) {
      renderSignedIn(session).catch(() => {
        setFlash("Could not load your account.", "error");
      });
      return;
    }

    ++overviewRequest;
    activeSession = null;
    renderedUserId = null;
    showView("signed-out");
  });

  try {
    let session = await service.getSession();

    if (urlState.error) {
      activeSession = session;
      initialized = true;
      cleanAuthUrl();
      if (session) await renderSignedIn(session);
      else showView("signed-out");
      setFlash("That email link is invalid or has expired. Request a new one.", "error");
      return;
    }

    if (urlState.code) {
      try {
        const exchanged = await service.exchangeCodeForSession(urlState.code);
        if (exchanged) session = exchanged;
      } catch (error) {
        recoveryMode = false;
        activeSession = session;
        initialized = true;
        cleanAuthUrl();
        if (session) await renderSignedIn(session);
        else showView("signed-out");
        setFlash(
          error instanceof AccountError
            ? error.message
            : "That email link is invalid or has expired. Request a new one.",
          "error"
        );
        return;
      }
    }

    recoveryMode = urlState.flow === "recovery" || recoveryEventSeen;
    activeSession = session;
    initialized = true;

    if (session) {
      if (recoveryMode) showView("recovery");
      else {
        await renderSignedIn(session);
        if (urlState.flow === "signup") {
          setFlash("Email confirmed. You are signed in.", "success");
        }
      }
      cleanAuthUrl();
      return;
    }

    showView("signed-out");
    if (recoveryMode) {
      setFlash("That password reset link is invalid or has expired. Request a new one.", "error");
    }
    cleanAuthUrl();
  } catch (error) {
    initialized = true;
    showView("signed-out");
    setFlash(
      error instanceof AccountError ? error.message : "Could not start the account service.",
      "error"
    );
    cleanAuthUrl();
  }
}

initialize().catch((error) => {
  showView("unavailable");
  setFlash(friendlyAuthError(error, "Could not start the account service."), "error");
});
