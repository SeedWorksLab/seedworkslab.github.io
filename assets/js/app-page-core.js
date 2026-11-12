const LINUX_ASSET_ORDER = ["appimage", "deb", "rpm", "zip"];

function asText(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : "";
}

function asIsoString(value) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function toCount(value) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.trunc(number) : 0;
}

function safeHttpsUrl(value) {
  if (typeof value !== "string" || value.length === 0) return null;

  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch (error) {
    return null;
  }
}

export function trustedReleaseUrl(value, repo, kind = "download") {
  const safe = safeHttpsUrl(value);
  if (!safe || !/^(Coconut|Cherry|Banana)$/.test(repo)) return null;
  const url = new URL(safe);
  const prefix = `/SeedWorksLab/${repo}/releases/${kind === "download" ? "download/" : "tag/"}`;
  return url.hostname === "github.com" && url.port === "" &&
    url.pathname.startsWith(prefix) && url.pathname.length > prefix.length
    ? url.href
    : null;
}

export function assetKind(name) {
  const lower = String(name ?? "").toLowerCase();

  if (lower.endsWith(".apk")) return "apk";
  if (lower.endsWith(".appimage")) return "appimage";
  if (lower.endsWith(".deb")) return "deb";
  if (lower.endsWith(".rpm")) return "rpm";
  if (lower.endsWith(".zip")) return "zip";
  if (lower.endsWith(".dmg")) return "dmg";
  if (lower.endsWith(".exe") || lower.endsWith(".msi")) return "windows";
  if (lower.endsWith("sha256sums.txt")) return "checksums";
  return "other";
}

export function assetLabel(name) {
  switch (assetKind(name)) {
    case "apk":
      return "Android APK";
    case "appimage":
      return "Linux AppImage";
    case "deb":
      return "Debian package";
    case "rpm":
      return "Fedora package";
    case "zip":
      return "Linux ZIP";
    case "dmg":
      return "macOS disk image";
    case "windows":
      return "Windows installer";
    case "checksums":
      return "SHA-256 checksums";
    default:
      return String(name ?? "Download");
  }
}

export function normalizeRelease(raw, repo) {
  if (!raw || typeof raw !== "object") return null;

  const assets = Array.isArray(raw.assets)
    ? raw.assets
        .map((asset) => {
          if (!asset || typeof asset !== "object") return null;
          const name = asText(asset.name);
          const url = trustedReleaseUrl(asset.browser_download_url, repo);
          if (!name || !url) return null;
          return { name, size: toCount(asset.size), url };
        })
        .filter(Boolean)
    : [];

  const tag = asText(raw.tag_name);

  return {
    tag,
    name: asText(raw.name) || tag || "Release",
    prerelease: raw.prerelease === true,
    draft: raw.draft === true,
    publishedAt: asIsoString(raw.published_at),
    htmlUrl: trustedReleaseUrl(raw.html_url, repo, "tag"),
    assets,
  };
}

export function normalizeReleases(payload, repo) {
  if (!Array.isArray(payload)) return [];
  return payload.map((item) => normalizeRelease(item, repo)).filter((release) => release && !release.draft);
}

export function latestStableRelease(releases) {
  if (!Array.isArray(releases)) return null;
  return releases.find((release) => release && !release.prerelease && !release.draft) || null;
}

export function selectAsset(assets, repo, kind) {
  const list = Array.isArray(assets) ? assets : [];
  const slug = String(repo ?? "").toLowerCase();

  if (kind === "apk") {
    const apkAssets = list.filter((asset) => assetKind(asset.name) === "apk");
    const stable = apkAssets.find((asset) => asset.name.toLowerCase() === `${slug}.apk`);
    if (stable) return stable;

    const versioned = apkAssets.find((asset) =>
      asset.name.toLowerCase().startsWith(`${slug}-`)
    );
    return versioned || apkAssets[0] || null;
  }

  if (kind === "linux") {
    for (const desiredKind of LINUX_ASSET_ORDER) {
      const asset = list.find((item) => assetKind(item.name) === desiredKind);
      if (asset) return asset;
    }
  }

  return null;
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

export function formatReleaseDate(value) {
  if (!value) return "Unknown date";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}
