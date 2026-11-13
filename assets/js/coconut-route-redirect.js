(() => {
  "use strict";
  const base = "/apps/coconut/web/";
  const key = "coconut-route";
  const url = new URL(window.location.href);
  const restored = url.searchParams.get(key);

  if (restored !== null && url.pathname === base) {
    const path = new URL(restored, url.origin);
    if (path.origin === url.origin && path.pathname.startsWith(base)) {
      window.history.replaceState(window.history.state, "", path.pathname + path.search + path.hash);
    }
    return;
  }

  if (!url.pathname.startsWith(base) || url.pathname === base) return;
  const relative = url.pathname.slice(base.length);
  if (relative.startsWith("_expo/") || relative.startsWith("assets/") || relative.includes(".")) return;
  const destination = new URL(base, url.origin);
  destination.searchParams.set(key, url.pathname + url.search + url.hash);
  window.location.replace(destination.href);
})();
