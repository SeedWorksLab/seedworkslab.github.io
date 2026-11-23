import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { chooseLanguage, currentLocale, LANGUAGE_KEY, LANGUAGES, translate } from "../assets/js/i18n-core.js";
import { MESSAGES } from "../assets/js/translations.js";
import { formatCount, formatDate } from "../assets/js/account-core.js";

const root = new URL("../", import.meta.url);
const pages = [
  "index.html", "about.html", "apps.html", "contact.html", "account.html", "404.html",
  "oauth/consent.html", ...["banana", "cherry", "coconut", "grape"].map((app) => `apps/${app}/index.html`),
];

test("language choice prefers the saved setting, then supported browser languages, then English", () => {
  assert.equal(chooseLanguage("hu", ["de-DE"]), "hu");
  assert.equal(chooseLanguage("de-DE", ["en"]), "de");
  assert.equal(chooseLanguage(null, ["fr-FR", "hu-HU", "en-US"]), "hu");
  assert.equal(chooseLanguage("invalid", ["fr"]), "en");
  assert.equal(chooseLanguage(null), "en");
});

test("catalogue has complete Hungarian/German pairs and preserves substitution values and whitespace", () => {
  for (const [source, values] of Object.entries(MESSAGES)) {
    assert.equal(values.length, 2, source);
    for (const value of values) {
      assert.ok(typeof value === "string" && value.trim(), source);
      assert.equal(value.includes("{value}"), source.includes("{value}"), source);
    }
  }
  assert.equal(translate("  Sign in\n", "hu"), "  Bejelentkezés\n");
  assert.equal(translate("Sign in", "de"), "Anmelden");
  assert.equal(translate("Published 2026. nov. 23.", "hu"), "Megjelent: 2026. nov. 23.");
  assert.equal(translate("Revoke <img src=x> access", "de"), "Zugriff für <img src=x> widerrufen");
  assert.equal(translate("DELETE MY SEED ACCOUNT", "hu"), "DELETE MY SEED ACCOUNT");
  assert.equal(translate("Unrecognised source", "en"), "Unrecognised source");
  assert.equal(translate("Sign in", "xx"), "Sign in");
});

test("every website page has a labeled top-bar selector and local language scripts", () => {
  for (const page of pages) {
    const html = readFileSync(new URL(page, root), "utf8");
    const header = html.match(/<header\b[\s\S]*?<\/header>/)?.[0];
    assert.ok(header?.includes("data-language-select"), page);
    assert.match(header, /<label class="language-picker">/);
    assert.match(header, /<span class="visually-hidden">Language<\/span>/);
    for (const language of LANGUAGES) assert.ok(header.includes(`value="${language}"`), page);
    assert.ok(html.includes('src="/assets/js/language-init.js"'), page);
    assert.ok(html.includes('type="module" src="/assets/js/i18n.js"'), page);
  }
});

test("all authored static text, metadata and accessibility labels have translations", () => {
  const unchanged = new Set([
    "0 B", "AGPL-3.0", "Android", "Banana", "Cherry", "Coconut", "Grape",
    "Banana README", "Cherry README", "Coconut README", "Grape README",
    "DELETE MY SEED ACCOUNT", "Deutsch", "English", "Magyar", "Electron", "Expo",
    "Expo Router", "Expo SDK", "Expo SQLite", "GitHub", "GitHub Releases", "Jest",
    "Linux", "Material Design 3", "React Native", "React Native Paper", "SeedWorks",
    "TypeScript", "TypeScript strict", "react-native-web",
  ]);
  const decode = (text) => text.replace(/&amp;/g, "&").replace(/&copy;/g, "©").replace(/&larr;/g, "←").replace(/&hellip;/g, "…")
    .replace(/&(?:nbsp|#160);/g, " ").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  for (const page of pages) {
    const html = readFileSync(new URL(page, root), "utf8")
      .replace(/<(script|style|svg)\b[^>]*>[\s\S]*?<\/\1>/g, "").replace(/<!--[\s\S]*?-->/g, "");
    const texts = [...html.matchAll(/>([^<]+)</g)].map((match) => decode(match[1]));
    for (const tag of html.matchAll(/<[^>]+>/g)) {
      for (const match of tag[0].matchAll(/(?:aria-label|title|placeholder|alt)="([^"]+)"/g)) {
        texts.push(decode(match[1]));
      }
      if (/<meta /.test(tag[0]) && /(?:name="description"|property="og:(?:title|description)")/.test(tag[0])) {
        texts.push(decode(tag[0].match(/content="([^"]+)"/)?.[1] || ""));
      }
    }
    for (const text of texts) {
      const source = text.replace(/\s+/g, " ").trim();
      if (!/[a-zA-Z]/.test(source) || unchanged.has(source)) continue;
      for (const language of ["hu", "de"]) {
        assert.ok(Object.hasOwn(MESSAGES, source) || translate(source, language) !== source,
          `${page}: missing ${language}: ${source}`);
      }
    }
  }
});

test("date and number formatting follows the selected document language", () => {
  const previous = globalThis.document;
  try {
    for (const [language, locale] of [["en", "en-GB"], ["hu", "hu-HU"], ["de", "de-DE"]]) {
      globalThis.document = { documentElement: { lang: language } };
      assert.equal(currentLocale(), locale);
      assert.equal(formatCount(12345), new Intl.NumberFormat(locale).format(12345));
      assert.equal(formatDate("2026-11-23T12:00:00Z"),
        new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" })
          .format(new Date("2026-11-23T12:00:00Z")));
    }
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
});

test("pre-paint language initialization works even when storage is blocked", () => {
  const code = readFileSync(new URL("assets/js/language-init.js", root), "utf8");
  const document = { documentElement: {} };
  runInNewContext(code, {
    document, navigator: { languages: ["fr", "de-AT"] },
    localStorage: { getItem() { throw new Error("blocked"); } },
  });
  assert.equal(document.documentElement.lang, "de");
});

test("catalogue is a self-contained module with no external translation service", () => {
  for (const name of readdirSync(new URL("assets/js/", root)).filter((name) => /^(?:i18n|language|translations)/.test(name))) {
    const source = readFileSync(new URL(`assets/js/${name}`, root), "utf8");
    assert.ok(!/fetch\(|innerHTML|https?:\/\//.test(source), name);
  }
});

test("live language changes translate async UI but preserve inputs, user content and original English", () => {
  class Element {
    constructor(tag, text) {
      this.nodeType = 1;
      this.tag = tag;
      this.attributes = {};
      this.childNodes = [];
      this.listeners = {};
      if (text) this.appendText(text);
    }
    appendText(value) {
      const node = { nodeType: 3, nodeValue: value, parentElement: this };
      this.childNodes.push(node);
      return node;
    }
    hasAttribute(key) { return Object.hasOwn(this.attributes, key); }
    getAttribute(key) { return this.attributes[key]; }
    setAttribute(key, value) { this.attributes[key] = value; }
    addEventListener(key, callback) { this.listeners[key] = callback; }
    closest() {
      if (["script", "style", "svg", "code", "pre"].includes(this.tag)
        || this.attributes.translate === "no" || this.hasAttribute("data-no-translate")) return this;
      return this.parentElement?.closest() || null;
    }
    matches() { return false; }
    append(element) { element.parentElement = this; this.childNodes.push(element); return element; }
  }
  const html = new Element("html");
  html.lang = "en";
  const button = html.append(new Element("button", "Sign in"));
  const input = html.append(new Element("input"));
  input.value = "my private password";
  input.setAttribute("placeholder", "Optional");
  const user = html.append(new Element("p", "Home"));
  user.setAttribute("translate", "no");
  const code = html.append(new Element("code", "DELETE MY SEED ACCOUNT"));
  const select = html.append(new Element("select"));
  const storage = new Map();
  const events = [];
  const listeners = {};
  let observe;
  const window = {
    dispatchEvent(event) { events.push(event); },
    addEventListener(name, callback) { listeners[name] = callback; },
  };
  const script = readFileSync(new URL("assets/js/i18n.js", root), "utf8").replace(/^import .*;\n/, "");
  runInNewContext(script, {
    chooseLanguage, LANGUAGE_KEY, LANGUAGES, LOCALES: { en: "en-GB", hu: "hu-HU", de: "de-DE" }, translate,
    document: { documentElement: html, querySelectorAll: () => [select] },
    window, navigator: { languages: ["en"] },
    localStorage: { setItem: (key, value) => storage.set(key, value) },
    MutationObserver: class {
      constructor(callback) { observe = callback; }
      observe() {}
    },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
  });
  window.SeedI18n.setLanguage("hu");
  assert.equal(button.childNodes[0].nodeValue, "Bejelentkezés");
  assert.equal(input.getAttribute("placeholder"), "Nem kötelező");
  assert.equal(select.value, "hu");
  assert.equal(storage.get(LANGUAGE_KEY), "hu");
  assert.equal(html.lang, "hu");
  const status = html.append(new Element("p", "Profile picture saved."));
  observe([{ type: "childList", addedNodes: [status] }]);
  assert.equal(status.childNodes[0].nodeValue, "Profilkép mentve.");
  button.childNodes[0].nodeValue = "Sign out";
  observe([{ type: "characterData", target: button.childNodes[0] }]);
  assert.equal(button.childNodes[0].nodeValue, "Kijelentkezés");
  window.SeedI18n.setLanguage("de");
  assert.equal(button.childNodes[0].nodeValue, "Abmelden");
  assert.equal(status.childNodes[0].nodeValue, "Profilbild gespeichert.");
  window.SeedI18n.setLanguage("en");
  assert.equal(button.childNodes[0].nodeValue, "Sign out");
  assert.equal(input.value, "my private password");
  assert.equal(user.childNodes[0].nodeValue, "Home");
  assert.equal(code.childNodes[0].nodeValue, "DELETE MY SEED ACCOUNT");
  listeners.storage({ key: LANGUAGE_KEY, newValue: "de" });
  assert.equal(html.lang, "de");
  assert.equal(storage.get(LANGUAGE_KEY), "en", "storage event must not write back");
  assert.equal(events.at(-1).type, "seedworks:languagechange");
});
