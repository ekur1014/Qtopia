// The Qrypt top bar: the same navigation on every page, plus the shared light/dark switch.
// Usage: <script src="shared/qbar.js" data-page="map" data-root="./"></script> (data-root points at the repo root).
// The theme is stored per browser (key "qrypt-theme") and announced with a "qrypt:theme" event,
// so pages with their own rendering (the 3D grid) can follow it.
(function () {
  var me = document.currentScript;
  var page = me && me.dataset.page;
  var root = (me && me.dataset.root) || "./";
  var PAGES = [
    { id: "home", label: "Home", href: "index.html" },
    { id: "grid", label: "Live grid", href: "grid-twin/index.html" },
    { id: "ring", label: "Dual ring", href: "dual_ring_quantum_routing.html" },
    { id: "map", label: "Real map", href: "chattanooga_quantum_map.html" },
    { id: "photon", label: "Photon line", href: "bb84_visualizer.html" },
    { id: "lab", label: "Quantum lab", href: "threejs_quantum_grid.html" },
  ];

  function readTheme() {
    var t = new URLSearchParams(location.search).get("theme");
    if (t === "dark" || t === "light") return t;
    try {
      t = localStorage.getItem("qrypt-theme") || localStorage.getItem("gridtwin-theme");
    } catch (e) {
      t = null;
    }
    return t === "dark" ? "dark" : "light";
  }
  function applyTheme(t, announce) {
    document.documentElement.dataset.theme = t;
    try {
      localStorage.setItem("qrypt-theme", t);
      localStorage.setItem("gridtwin-theme", t);
    } catch (e) {}
    var b = document.querySelector(".qbar__theme");
    if (b) {
      b.innerHTML = t === "dark" ? SUN : MOON;
      b.title = t === "dark" ? "Switch to light" : "Switch to dark";
    }
    if (announce) window.dispatchEvent(new CustomEvent("qrypt:theme", { detail: t }));
  }
  var MOON = '<svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/></svg>';
  var SUN = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';

  applyTheme(readTheme(), false); // before first paint

  function build() {
    var bar = document.createElement("header");
    bar.className = "qbar";
    bar.setAttribute("role", "banner");
    var links = PAGES.map(function (p) {
      return '<a class="qbar__link" href="' + root + p.href + '"' + (p.id === page ? ' aria-current="page"' : "") + ">" + p.label + "</a>";
    }).join("");
    bar.innerHTML =
      '<a class="qbar__brand" href="' + root + 'index.html"><span class="qbar__mark">QRYPT</span><span class="qbar__name">Tennessee Quantum Grid</span></a>' +
      '<nav class="qbar__nav" aria-label="Project pages">' + links + "</nav>" +
      '<button class="qbar__theme" type="button" aria-label="Switch light or dark"></button>';
    document.body.prepend(bar);
    bar.querySelector(".qbar__theme").addEventListener("click", function () {
      applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark", true);
    });
    applyTheme(document.documentElement.dataset.theme, false);
  }
  if (document.body) build();
  else document.addEventListener("DOMContentLoaded", build);

  window.qrypt = { setTheme: function (t) { applyTheme(t, true); } };
})();
