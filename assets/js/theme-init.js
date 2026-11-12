(function () {
  "use strict";

  document.documentElement.classList.add("js");
  try {
    var savedTheme = localStorage.getItem("seedworks-theme");
    if (savedTheme === "light" || savedTheme === "dark") {
      document.documentElement.setAttribute("data-theme", savedTheme);
    }
  } catch (error) {
    /* localStorage can be unavailable in private or restricted contexts */
  }
})();
