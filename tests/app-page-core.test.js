import assert from "node:assert/strict";
import test from "node:test";

import {
  assetKind,
  assetLabel,
  formatBytes,
  formatReleaseDate,
  latestStableRelease,
  normalizeRelease,
  normalizeReleases,
  selectAsset,
} from "../assets/js/app-page-core.js";

const ASSETS = [
  {
    name: "coconut-1.2.2.apk",
    size: 108960459,
    browser_download_url:
      "https://github.com/SeedWorksLab/Coconut/releases/download/v1.2.2/coconut-1.2.2.apk",
  },
  {
    name: "coconut-1.2.2.AppImage",
    size: 929023288,
    browser_download_url:
      "https://github.com/SeedWorksLab/Coconut/releases/download/v1.2.2/coconut-1.2.2.AppImage",
  },
  {
    name: "SHA256SUMS.txt",
    size: 173,
    browser_download_url:
      "https://github.com/SeedWorksLab/Coconut/releases/download/v1.2.2/SHA256SUMS.txt",
  },
];

test("release assets are classified by extension", () => {
  assert.equal(assetKind("coconut-1.2.2.apk"), "apk");
  assert.equal(assetKind("coconut-1.2.2.AppImage"), "appimage");
  assert.equal(assetKind("coconut-1.2.2.deb"), "deb");
  assert.equal(assetKind("coconut-1.2.2.rpm"), "rpm");
  assert.equal(assetKind("coconut-1.2.2.zip"), "zip");
  assert.equal(assetKind("SHA256SUMS.txt"), "checksums");
  assert.equal(assetKind("notes.txt"), "other");

  assert.equal(assetLabel("coconut-1.2.2.apk"), "Android APK");
  assert.equal(assetLabel("coconut-1.2.2.AppImage"), "Linux AppImage");
  assert.equal(assetLabel("SHA256SUMS.txt"), "SHA-256 checksums");
});

test("versioned APKs are selected when no stable filename exists", () => {
  const apk = selectAsset(ASSETS, "Coconut", "apk");
  assert.equal(apk.name, "coconut-1.2.2.apk");
});

test("stable APK filenames are preferred", () => {
  const assets = [
    ...ASSETS,
    {
      name: "coconut.apk",
      size: 1024,
      browser_download_url:
        "https://github.com/SeedWorksLab/Coconut/releases/download/v1.2.1/coconut.apk",
    },
  ];

  assert.equal(selectAsset(assets, "Coconut", "apk").name, "coconut.apk");
});

test("Linux downloads prefer AppImage, then packages", () => {
  assert.equal(selectAsset(ASSETS, "Coconut", "linux").name, "coconut-1.2.2.AppImage");
  assert.equal(
    selectAsset(
      [{ name: "coconut.deb", browser_download_url: "https://example.com/coconut.deb" }],
      "Coconut",
      "linux"
    ).name,
    "coconut.deb"
  );
  assert.equal(selectAsset([], "Coconut", "linux"), null);
});

test("release normalization drops drafts and unsafe asset URLs", () => {
  const release = normalizeRelease({
    tag_name: "v1.2.2",
    name: "Coconut 1.2.2",
    prerelease: true,
    draft: false,
    published_at: "2026-11-12T08:49:53Z",
    html_url: "https://github.com/SeedWorksLab/Coconut/releases/tag/v1.2.2",
    assets: [
      ...ASSETS,
      {
        name: "unsafe.apk",
        browser_download_url: "javascript:alert(1)",
      },
    ],
  });

  assert.equal(release.tag, "v1.2.2");
  assert.equal(release.prerelease, true);
  assert.equal(release.assets.length, 3);
  assert.equal(release.assets[0].size, 108960459);
  assert.equal(release.htmlUrl.endsWith("/v1.2.2"), true);
});

test("latest stable release ignores pre-releases and drafts", () => {
  const releases = normalizeReleases([
    {
      tag_name: "v1.2.2",
      prerelease: true,
      draft: false,
      assets: [],
    },
    {
      tag_name: "v1.2.1",
      prerelease: false,
      draft: false,
      assets: [],
    },
    {
      tag_name: "v1.2.0",
      prerelease: false,
      draft: true,
      assets: [],
    },
  ]);

  assert.equal(releases.length, 2);
  assert.equal(latestStableRelease(releases).tag, "v1.2.1");
  assert.equal(latestStableRelease(normalizeReleases([])), null);
});

test("release formatting is stable", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(1024), "1 KB");
  assert.equal(formatBytes(1536), "1.5 KB");
  assert.equal(formatReleaseDate(null), "Unknown date");
  assert.equal(formatReleaseDate("not-a-date"), "Unknown date");
  assert.equal(formatReleaseDate("2026-11-12T08:49:53Z"), "12 Nov 2026");
});
