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
