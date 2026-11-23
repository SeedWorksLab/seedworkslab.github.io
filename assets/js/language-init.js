// Read the preference before first paint; actual text is translated after parsing.
(() => {
  let stored;
  try { stored = localStorage.getItem("seedworks-language"); } catch {}
  const supported = (value) => {
    const language = typeof value === "string" ? value.toLowerCase().split("-")[0] : "";
    return ["en", "hu", "de"].includes(language) ? language : null;
  };
  const preferred = navigator.languages || [navigator.language];
  document.documentElement.lang = supported(stored) || preferred.map(supported).find(Boolean) || "en";
})();
