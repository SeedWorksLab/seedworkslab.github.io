import { MESSAGES } from "./translations.js";

export const LANGUAGE_KEY = "seedworks-language";
export const LANGUAGES = ["en", "hu", "de"];
export const LOCALES = { en: "en-GB", hu: "hu-HU", de: "de-DE" };

export function currentLocale() {
  return LOCALES[supportedLanguage(globalThis.document?.documentElement?.lang) || "en"];
}

export function supportedLanguage(value) {
  const language = typeof value === "string" ? value.toLowerCase().split("-")[0] : "";
  return LANGUAGES.includes(language) ? language : null;
}

export function chooseLanguage(stored, preferred = []) {
  return supportedLanguage(stored)
    || preferred.map(supportedLanguage).find(Boolean)
    || "en";
}

export function translate(source, language = "en") {
  if (typeof source !== "string" || language === "en") return source;
  const key = source.replace(/\s+/g, " ").trim();
  const index = language === "hu" ? 0 : language === "de" ? 1 : -1;
  if (index < 0) return source;
  let translated = Object.hasOwn(MESSAGES, key) ? MESSAGES[key][index] : null;
  if (!translated) {
    for (const [template, values] of Object.entries(MESSAGES)) {
      if (!template.includes("{value}")) continue;
      const [prefix, suffix] = template.split("{value}");
      if (key.startsWith(prefix) && key.endsWith(suffix) && key.length > prefix.length + suffix.length) {
        const value = key.slice(prefix.length, suffix ? -suffix.length : undefined);
        translated = values[index].replace("{value}", value);
        break;
      }
    }
  }
  if (!translated) return source;
  return source.match(/^\s*/)[0] + translated + source.match(/\s*$/)[0];
}
