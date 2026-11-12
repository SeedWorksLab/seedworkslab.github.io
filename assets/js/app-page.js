import {
  assetLabel,
  formatBytes,
  formatReleaseDate,
  latestStableRelease,
  normalizeReleases,
  selectAsset,
} from "./app-page-core.js";

const body = document.body;
const repo = body.dataset.appRepo || "";
const repoApi = `https://api.github.com/repos/SeedWorksLab/${repo}`;
const repoWeb = `https://github.com/SeedWorksLab/${repo}`;
const readmeRawBase = `https://raw.githubusercontent.com/SeedWorksLab/${repo}/HEAD/`;
const readmeBlobBase = `${repoWeb}/blob/HEAD/`;

const ALLOWED_TAGS = new Set([
  "a",
  "blockquote",
  "br",
  "code",
  "dd",
  "del",
  "details",
  "dl",
  "dt",
  "em",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "img",
  "kbd",
  "li",
  "ol",
  "p",
  "pre",
  "s",
  "strong",
  "sub",
  "summary",
  "sup",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "ul",
]);

const DROPPED_TAGS = new Set([
  "audio",
  "base",
  "button",
  "canvas",
  "embed",
  "form",
  "h1",
  "iframe",
  "input",
  "link",
  "meta",
  "object",
  "option",
  "path",
  "script",
  "select",
  "source",
  "style",
  "svg",
  "textarea",
  "video",
]);

const ALLOWED_ATTRIBUTES = {
  a: ["href", "title"],
  img: ["src", "alt", "title", "width", "height"],
  ol: ["start"],
  td: ["colspan", "rowspan"],
  th: ["colspan", "rowspan"],
};

function textNode(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = text;
  return element;
}

function setText(id, text) {
  const node = document.getElementById(id);
  if (node) node.textContent = text;
}

function externalLink(href, className, text) {
  const link = textNode("a", className, text);
  link.href = href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  return link;
}

function disableDownloadLink(link, label) {
  link.classList.add("is-disabled");
  link.setAttribute("aria-disabled", "true");
  link.setAttribute("tabindex", "-1");
  link.removeAttribute("href");
  link.textContent = label;
}

function enableDownloadLink(link, asset, label) {
  link.classList.remove("is-disabled");
  link.removeAttribute("aria-disabled");
  link.removeAttribute("tabindex");
  link.href = asset.url;
  link.textContent = label;
}

function setDownloadMeta(id, text) {
  setText(id, text);
}

function renderLatestRelease(releases) {
  const stable = latestStableRelease(releases);
  const apkLinks = document.querySelectorAll('[data-app-download="apk"]');
  const linuxLinks = document.querySelectorAll('[data-app-download="linux"]');

  if (!stable) {
    setText("latest-release-version", "No stable release yet");
    setText("latest-release-date", "");
    setText(
      "release-status",
      releases.length
        ? "Preview builds are listed below. Stable downloads appear once a full release is published."
        : "No releases have been published yet."
    );
    setDownloadMeta("download-apk-meta", "No stable APK has been published yet.");
    setDownloadMeta("download-linux-meta", "No stable Linux build has been published yet.");
    apkLinks.forEach((link) => disableDownloadLink(link, "Download APK \u2014 coming soon"));
    linuxLinks.forEach((link) => disableDownloadLink(link, "Linux build \u2014 coming soon"));
    return;
  }

  const apk = selectAsset(stable.assets, repo, "apk");
  const linux = selectAsset(stable.assets, repo, "linux");
  const releaseName = stable.tag || stable.name;

  setText("latest-release-version", releaseName);
  setText("latest-release-date", `Published ${formatReleaseDate(stable.publishedAt)}`);
  setText("release-status", `Latest stable release: ${releaseName}.`);

  apkLinks.forEach((link) => {
    if (apk) enableDownloadLink(link, apk, "Download APK");
    else disableDownloadLink(link, "APK unavailable");
  });
  linuxLinks.forEach((link) => {
    if (linux) enableDownloadLink(link, linux, "Download Linux build");
    else disableDownloadLink(link, "Linux build unavailable");
  });

  setDownloadMeta(
    "download-apk-meta",
    apk ? `${apk.name} \u00b7 ${formatBytes(apk.size)}` : "This release has no Android APK."
  );
  setDownloadMeta(
    "download-linux-meta",
    linux ? `${linux.name} \u00b7 ${formatBytes(linux.size)}` : "This release has no Linux build."
  );
}

function renderReleaseFeed(releases) {
  const list = document.getElementById("release-list");
  if (!list) return;
  list.replaceChildren();

  if (!releases.length) {
    const empty = textNode("p", "release-empty", "No releases have been published yet.");
    list.append(empty);
    return;
  }

  releases.slice(0, 10).forEach((release) => {
    const item = document.createElement("article");
    item.className = "release-item";
    if (release.prerelease) item.classList.add("is-prerelease");

    const head = document.createElement("div");
    head.className = "release-head";

    const titleWrap = document.createElement("div");
    const title = release.htmlUrl
      ? externalLink(release.htmlUrl, "release-title", release.name)
      : textNode("h3", "release-title", release.name);
    titleWrap.append(title);

    const meta = textNode(
      "p",
      "release-meta",
      `${release.tag || "Untagged"} \u00b7 ${formatReleaseDate(release.publishedAt)}`
    );
    titleWrap.append(meta);

    const badge = textNode(
      "span",
      release.prerelease ? "release-badge is-prerelease" : "release-badge is-stable",
      release.prerelease ? "Pre-release" : "Stable"
    );

    head.append(titleWrap, badge);
    item.append(head);

    if (release.assets.length === 0) {
      item.append(textNode("p", "release-empty", "This release has no downloadable assets."));
    } else {
      const assets = document.createElement("div");
      assets.className = "release-assets";

      release.assets.forEach((asset) => {
        const link = externalLink(asset.url, "release-asset", assetLabel(asset.name));
        link.append(textNode("span", "release-asset-size", formatBytes(asset.size)));
        assets.append(link);
      });

      item.append(assets);
    }

    list.append(item);
  });
}

function renderReleaseError() {
  setText("latest-release-version", "Release data unavailable");
  setText("latest-release-date", "");
  setText("release-status", "Could not load release data from GitHub. Buttons open GitHub Releases.");
  setDownloadMeta("download-apk-meta", "Open GitHub Releases to choose a build.");
  setDownloadMeta("download-linux-meta", "Open GitHub Releases to choose a build.");

  const list = document.getElementById("release-list");
  if (!list) return;
  list.replaceChildren();

  const message = textNode(
    "p",
    "release-empty",
    "Could not load the release feed. "
  );
  message.append(externalLink(`${repoWeb}/releases`, "text-link", "View releases on GitHub"));
  message.append(document.createTextNode("."));
  list.append(message);
}

async function loadReleases() {
  try {
    const response = await fetch(`${repoApi}/releases?per_page=10`, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!response.ok) throw new Error(`GitHub API returned ${response.status}`);
    const releases = normalizeReleases(await response.json());
    renderLatestRelease(releases);
    renderReleaseFeed(releases);
  } catch (error) {
    renderReleaseError();
  }
}

function rewriteLink(value) {
  const href = String(value ?? "").trim();
  if (!href) return null;
  if (href.startsWith("#")) return `${repoWeb}/blob/HEAD/README.md${href}`;
  if (/^mailto:/i.test(href)) return href;

  try {
    const url = new URL(href, readmeBlobBase);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch (error) {
    return null;
  }
}

function rewriteImage(value) {
  const src = String(value ?? "").trim();
  if (!src) return null;
  if (/^data:image\/(?:png|jpe?g|gif|webp|svg\+xml);/i.test(src)) return src;

  try {
    const url = new URL(src, readmeRawBase);
    return url.protocol === "https:" ? url.href : null;
  } catch (error) {
    return null;
  }
}

function sanitizeNode(node) {
  if (node.nodeType === 3) return document.createTextNode(node.nodeValue || "");
  if (node.nodeType !== 1) return null;

  const tag = node.tagName.toLowerCase();
  if (DROPPED_TAGS.has(tag)) return null;

  if (!ALLOWED_TAGS.has(tag)) {
    const fragment = document.createDocumentFragment();
    Array.from(node.childNodes).forEach((child) => {
      const cleaned = sanitizeNode(child);
      if (cleaned) fragment.append(cleaned);
    });
    return fragment;
  }

  const element = document.createElement(tag);
  const attributes = ALLOWED_ATTRIBUTES[tag] || [];

  attributes.forEach((attribute) => {
    const value = node.getAttribute(attribute);
    if (!value) return;

    if (attribute === "href") {
      const href = rewriteLink(value);
      if (!href) return;
      element.setAttribute("href", href);
      element.setAttribute("target", "_blank");
      element.setAttribute("rel", "noopener noreferrer");
      return;
    }

    if (attribute === "src") {
      const src = rewriteImage(value);
      if (!src) return;
      element.setAttribute("src", src);
      element.setAttribute("loading", "lazy");
      element.setAttribute("decoding", "async");
      element.setAttribute("referrerpolicy", "no-referrer");
      return;
    }

    if ((tag === "img" && (attribute === "width" || attribute === "height")) ||
        (tag === "ol" && attribute === "start") ||
        ((tag === "td" || tag === "th") && (attribute === "colspan" || attribute === "rowspan"))) {
      if (!/^\d{1,4}$/.test(value)) return;
    }

    element.setAttribute(attribute, value);
  });

  Array.from(node.childNodes).forEach((child) => {
    const cleaned = sanitizeNode(child);
    if (cleaned) element.append(cleaned);
  });

  if (tag === "img" && !element.getAttribute("src")) return null;
  if (tag === "a" && !element.textContent.trim() && !element.querySelector("img")) return null;

  return element;
}

function sanitizeReadme(html) {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const fragment = document.createDocumentFragment();

  Array.from(parsed.body.childNodes).forEach((child) => {
    const cleaned = sanitizeNode(child);
    if (cleaned) fragment.append(cleaned);
  });

  return fragment;
}

async function loadReadme() {
  const container = document.getElementById("readme-content");
  if (!container) return;

  try {
    const response = await fetch(`${repoApi}/readme`, {
      headers: { Accept: "application/vnd.github.html+json" },
    });
    if (!response.ok) throw new Error(`GitHub API returned ${response.status}`);

    const fragment = sanitizeReadme(await response.text());
    container.replaceChildren(fragment);
    container.setAttribute("aria-busy", "false");
  } catch (error) {
    container.replaceChildren();
    container.append(
      textNode("p", "release-empty", "Could not load the README from GitHub. ")
    );
    container.append(externalLink(`${repoWeb}#readme`, "text-link", "Read it on GitHub"));
    container.append(document.createTextNode("."));
    container.setAttribute("aria-busy", "false");
  }
}

if (repo) {
  loadReleases();
  loadReadme();
}
