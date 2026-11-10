(function () {
  "use strict";

  var root = document.documentElement;
  var THEME_KEY = "seedworks-theme";
  var themeToggle = document.getElementById("theme-toggle");
  var themeColor = document.getElementById("theme-color");

  function systemTheme() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }

  function currentTheme() {
    return root.getAttribute("data-theme") || systemTheme();
  }

  function updateThemeToggle(theme) {
    if (!themeToggle) return;
    var next = theme === "dark" ? "light" : "dark";
    themeToggle.setAttribute("aria-label", "Switch to " + next + " theme");
    themeToggle.setAttribute("title", "Switch to " + next + " theme");
  }

  function applyTheme(theme) {
    root.setAttribute("data-theme", theme);
    if (themeColor) {
      themeColor.setAttribute("content", theme === "dark" ? "#131412" : "#fbf9f4");
    }
    updateThemeToggle(theme);
  }

  if (themeToggle) {
    updateThemeToggle(currentTheme());

    themeToggle.addEventListener("click", function () {
      var next = currentTheme() === "dark" ? "light" : "dark";
      applyTheme(next);
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch (error) {
        /* localStorage can be unavailable in private or restricted contexts */
      }
    });
  }

  if (window.matchMedia) {
    var media = window.matchMedia("(prefers-color-scheme: dark)");
    var onSystemThemeChange = function () {
      var stored = null;
      try {
        stored = localStorage.getItem(THEME_KEY);
      } catch (error) {
        stored = null;
      }
      if (!stored) {
        var theme = systemTheme();
        if (themeColor) {
          themeColor.setAttribute("content", theme === "dark" ? "#131412" : "#fbf9f4");
        }
        updateThemeToggle(theme);
      }
    };

    if (media.addEventListener) {
      media.addEventListener("change", onSystemThemeChange);
    } else if (media.addListener) {
      media.addListener(onSystemThemeChange);
    }
  }

  var header = document.querySelector(".site-header");
  if (header) {
    var updateHeader = function () {
      header.classList.toggle("is-scrolled", window.scrollY > 8);
    };
    updateHeader();
    window.addEventListener("scroll", updateHeader, { passive: true });
  }

  var nav = document.getElementById("site-nav");
  var menuToggle = document.getElementById("menu-toggle");

  function closeMenu() {
    if (!nav || !menuToggle) return;
    nav.classList.remove("is-open");
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.setAttribute("aria-label", "Open menu");
  }

  if (nav && menuToggle) {
    menuToggle.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      menuToggle.setAttribute("aria-expanded", open ? "true" : "false");
      menuToggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    });

    nav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", closeMenu);
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeMenu();
    });

    window.addEventListener("resize", function () {
      if (window.innerWidth > 760) closeMenu();
    });
  }

  var year = document.getElementById("year");
  if (year) {
    year.textContent = String(new Date().getFullYear());
  }

  var downloadLinks = document.querySelectorAll("[data-download-repo]");
  var downloadStatuses = document.querySelectorAll("[data-download-status]");

  if (downloadLinks.length && window.fetch) {
    var releaseCache = {};

    var setDownloadStatus = function (repo, text) {
      downloadStatuses.forEach(function (status) {
        if (status.getAttribute("data-download-status") === repo) {
          status.textContent = text;
        }
      });
    };

    var findDownloadAsset = function (assets, repo, kind) {
      var stableApk = repo.toLowerCase() + ".apk";
      var apkAssets = [];
      var linuxAssets = [];

      assets.forEach(function (asset) {
        var name = asset.name.toLowerCase();
        if (name.slice(-4) === ".apk") {
          apkAssets.push(asset);
        }
        if (
          name.slice(-9) === ".appimage" ||
          name.slice(-4) === ".deb" ||
          name.slice(-4) === ".rpm"
        ) {
          linuxAssets.push(asset);
        }
      });

      if (kind === "apk") {
        for (var i = 0; i < apkAssets.length; i++) {
          if (apkAssets[i].name.toLowerCase() === stableApk) return apkAssets[i];
        }
        return apkAssets[0] || null;
      }

      if (kind === "linux") {
        for (var j = 0; j < linuxAssets.length; j++) {
          if (linuxAssets[j].name.toLowerCase().slice(-9) === ".appimage") {
            return linuxAssets[j];
          }
        }
        return linuxAssets[0] || null;
      }

      return null;
    };

    var disableDownloadLink = function (link, label) {
      link.classList.add("is-disabled");
      link.setAttribute("aria-disabled", "true");
      link.setAttribute("tabindex", "-1");
      link.removeAttribute("href");
      if (label) link.textContent = label;
    };

    var enableDownloadLink = function (link, asset) {
      link.classList.remove("is-disabled");
      link.removeAttribute("aria-disabled");
      link.removeAttribute("tabindex");
      link.href = asset.browser_download_url;
    };

    var loadLatestRelease = function (repo) {
      if (!releaseCache[repo]) {
        releaseCache[repo] = fetch(
          "https://api.github.com/repos/SeedWorksLab/" + repo + "/releases/latest",
          { headers: { Accept: "application/vnd.github+json" } }
        ).then(function (response) {
          if (response.status === 404) return null;
          if (!response.ok) throw new Error("GitHub API returned " + response.status);
          return response.json();
        });
      }
      return releaseCache[repo];
    };

    var linksByRepo = {};
    downloadLinks.forEach(function (link) {
      var repo = link.getAttribute("data-download-repo");
      if (!linksByRepo[repo]) linksByRepo[repo] = [];
      linksByRepo[repo].push(link);
    });

    Object.keys(linksByRepo).forEach(function (repo) {
      loadLatestRelease(repo)
        .then(function (release) {
          if (!release) {
            linksByRepo[repo].forEach(function (link) {
              var kind = link.getAttribute("data-download-kind");
              disableDownloadLink(
                link,
                kind === "linux" ? "Linux build \u2014 coming soon" : "Download APK \u2014 coming soon"
              );
            });
            setDownloadStatus(repo, "No release yet \u2014 the first build is coming soon.");
            return;
          }

          var missingBuild = false;
          linksByRepo[repo].forEach(function (link) {
            var kind = link.getAttribute("data-download-kind");
            var asset = findDownloadAsset(release.assets || [], repo, kind);
            if (asset) {
              enableDownloadLink(link, asset);
            } else {
              disableDownloadLink(
                link,
                kind === "linux" ? "Linux build \u2014 coming soon" : "Download APK \u2014 coming soon"
              );
              missingBuild = true;
            }
          });

          var version = release.tag_name || "latest";
          setDownloadStatus(
            repo,
            missingBuild
              ? "Latest release: " + version + ". Some builds are coming soon."
              : "Latest release: " + version + "."
          );
        })
        .catch(function () {
          setDownloadStatus(
            repo,
            "Could not check the latest release. Downloads open GitHub Releases."
          );
        });
    });
  }

  var revealItems = document.querySelectorAll(".reveal");
  var reduceMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (revealItems.length && "IntersectionObserver" in window && !reduceMotion) {
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );

    revealItems.forEach(function (item) {
      observer.observe(item);
    });
  } else {
    revealItems.forEach(function (item) {
      item.classList.add("is-visible");
    });
  }
})();
