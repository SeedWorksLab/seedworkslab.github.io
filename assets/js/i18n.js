import { chooseLanguage, LANGUAGE_KEY, LANGUAGES, LOCALES, translate } from "./i18n-core.js";

const root = document.documentElement;
const attributes = ["aria-label", "title", "placeholder", "alt"];
const originals = new WeakMap();
const excluded = "script, style, svg, code, pre, [translate='no'], [data-no-translate]";
let language = chooseLanguage(root.lang);

function translateValue(node, key, value, write) {
  let values = originals.get(node);
  if (!values) { values = new Map(); originals.set(node, values); }
  let state = values.get(key);
  // Application renders may replace a value after its first translation.
  if (!state || value !== state.rendered) state = { source: value, rendered: value };
  const rendered = translate(state.source, language);
  state.rendered = rendered;
  values.set(key, state);
  if (rendered !== value) write(rendered);
}

function apply(node) {
  const element = node.nodeType === 1 ? node : node.parentElement;
  if (!element || element.closest(excluded)) return;
  if (node.nodeType === 3) {
    translateValue(node, "text", node.nodeValue, (value) => { node.nodeValue = value; });
    return;
  }
  if (node.nodeType !== 1) return;
  for (const attribute of attributes) {
    if (node.hasAttribute(attribute)) {
      translateValue(node, attribute, node.getAttribute(attribute),
        (value) => node.setAttribute(attribute, value));
    }
  }
  if (node.matches("meta[name='description'], meta[property='og:title'], meta[property='og:description']")) {
    translateValue(node, "content", node.content, (value) => { node.content = value; });
  }
  node.childNodes.forEach(apply);
}

function setLanguage(next, persist = true) {
  if (!LANGUAGES.includes(next)) return;
  language = next;
  root.lang = language;
  document.querySelectorAll("[data-language-select]").forEach((select) => { select.value = language; });
  if (persist) {
    try { localStorage.setItem(LANGUAGE_KEY, language); } catch {}
  }
  apply(root);
  window.dispatchEvent(new CustomEvent("seedworks:languagechange", { detail: { language } }));
}

document.querySelectorAll("[data-language-select]").forEach((select) => {
  select.addEventListener("change", () => setLanguage(select.value));
});

// Covers async account/status/release UI without translating user or repository content.
new MutationObserver((records) => {
  const pending = new Set();
  for (const record of records) {
    if (record.type === "childList") record.addedNodes.forEach((node) => pending.add(node));
    else pending.add(record.target);
  }
  pending.forEach(apply);
}).observe(root, {
  subtree: true, childList: true, characterData: true,
  attributes: true, attributeFilter: [...attributes, "content"],
});

window.SeedI18n = {
  get language() { return language; },
  get locale() { return LOCALES[language]; },
  t: (source) => translate(source, language),
  setLanguage,
};
window.addEventListener("storage", (event) => {
  if (event.key === LANGUAGE_KEY || event.key === null) {
    setLanguage(chooseLanguage(event.newValue, navigator.languages || [navigator.language]), false);
  }
});
setLanguage(language, false);
