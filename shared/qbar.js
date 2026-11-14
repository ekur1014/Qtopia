// The Qrypt top bar: the same navigation on every page, plus the shared light/dark switch.
// Usage: <script src="shared/qbar.js" data-page="map" data-root="./"></script> (data-root points at the repo root).
// The theme is stored per browser (key "qrypt-theme") and announced with a "qrypt:theme" event,
// so pages with their own rendering (the 3D grid) can follow it.
(function () {
  var me = document.currentScript;
  var page = me && me.dataset.page;
  var root = (me && me.dataset.root) || "./";
  // Simple to complex: the real map first, then the full live grid, then one fiber, then the physics.
  var PAGES = [
    { id: "home", label: "Home", href: "index.html" },
    { id: "map", label: "Real map", href: "chattanooga_quantum_map.html", step: 1 },
    { id: "grid", label: "Live grid", href: "grid-twin/index.html", step: 2 },
    { id: "photon", label: "Photon line", href: "bb84_visualizer.html", step: 3 },
    { id: "lab", label: "Quantum lab", href: "threejs_quantum_grid.html", step: 4 },
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
  document.documentElement.dataset.mode = readMode();
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) document.documentElement.classList.add("q-enter-ready");
  setTimeout(function () { document.documentElement.classList.add("q-entered"); }, 1600); // never leave words hidden

  function build() {
    var bar = document.createElement("header");
    bar.className = "qbar";
    bar.setAttribute("role", "banner");
    var links = PAGES.map(function (p) {
      return '<a class="qbar__link" href="' + root + p.href + '"' + (p.id === page ? ' aria-current="page"' : "") + ">" + (p.step ? '<span class="qbar__step">' + p.step + "</span>" : "") + p.label + "</a>";
    }).join("");
    bar.innerHTML =
      '<a class="qbar__brand" href="' + root + 'index.html"><span class="qbar__mark">QRYPT</span><span class="qbar__name">Tennessee Quantum Grid</span></a>' +
      '<nav class="qbar__nav" aria-label="Project pages">' + links + "</nav>" +
      '<div class="qbar__mode" role="group" aria-label="How much detail"><button type="button" data-mode="simple">Simple</button><button type="button" data-mode="detailed">Detailed</button></div>' +
      '<button class="qbar__keys" type="button" aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)">?</button>' +
      '<button class="qbar__theme" type="button" aria-label="Switch light or dark"></button>';
    document.body.prepend(bar);
    bar.querySelector(".qbar__theme").addEventListener("click", function () {
      applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark", true);
    });
    applyTheme(document.documentElement.dataset.theme, false);
    bar.querySelectorAll(".qbar__mode button").forEach(function (b) {
      b.addEventListener("click", function () { applyMode(b.dataset.mode, true); });
    });
    applyMode(document.documentElement.dataset.mode, false);
    bar.querySelector(".qbar__keys").addEventListener("click", function () { toggleKeys(); });
    enter();
  }

  // Keyboard: the same keys on every page. 1-4 open the four steps, 0 the home page, T light/dark,
  // D Simple/Detailed, ? the list of keys (each page adds its own with window.qrypt.addShortcuts).
  var pageKeys = [];
  var keysDialog = null;
  function typing(e) {
    var el = e.target;
    return el && el.closest && el.closest('input, select, textarea, [contenteditable="true"]');
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function rows(list) { return list.map(function (k) { return "<dt>" + k[0].split(" / ").map(function (x) { return "<kbd>" + esc(x) + "</kbd>"; }).join(" ") + "</dt><dd>" + esc(k[1]) + "</dd>"; }).join(""); }
  function toggleKeys(open) {
    if (!keysDialog) {
      keysDialog = document.createElement("dialog");
      keysDialog.className = "qkeys";
      keysDialog.setAttribute("aria-labelledby", "qkeys-h");
      document.body.appendChild(keysDialog);
      keysDialog.addEventListener("click", function (e) { if (e.target === keysDialog || e.target.closest("[data-close]")) keysDialog.close(); });
    }
    var want = open == null ? !keysDialog.open : open;
    if (!want) { if (keysDialog.open) keysDialog.close(); return; }
    var global = [["1 / 2 / 3 / 4", "Open step 1 to 4: real map, live grid, photon line, quantum lab"], ["0", "Home"], ["T", "Light or dark"], ["D", "Simple or Detailed"], ["?", "Show or hide this list"]];
    keysDialog.innerHTML =
      '<div class="qkeys__head"><h2 id="qkeys-h">Keyboard shortcuts</h2><button type="button" class="qkeys__close" data-close aria-label="Close">Close</button></div>' +
      (pageKeys.length ? '<h3>On this page</h3><dl>' + rows(pageKeys) + "</dl>" : "") +
      '<h3>On every page</h3><dl>' + rows(global) + "</dl>";
    keysDialog.showModal();
  }
  document.addEventListener("keydown", function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
    if (e.key === "?") { e.preventDefault(); toggleKeys(); return; }
    if (typing(e) || (keysDialog && keysDialog.open)) return;
    var k = e.key.toLowerCase();
    if (/^[0-9]$/.test(k)) {
      var target = k === "0" ? PAGES[0] : PAGES.filter(function (p) { return p.step === Number(k); })[0];
      if (target && target.id !== page) { e.preventDefault(); location.href = root + target.href; }
    } else if (k === "t") {
      applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark", true);
    } else if (k === "d") {
      applyMode(document.documentElement.dataset.mode === "detailed" ? "simple" : "detailed", true);
    }
  });

  // Simple / Detailed, shared by every page (key "qrypt-mode"), announced as "qrypt:mode".
  function readMode() {
    var m = new URLSearchParams(location.search).get("mode");
    if (m === "simple" || m === "detailed") return m;
    try { m = localStorage.getItem("qrypt-mode"); } catch (e) { m = null; }
    return m === "detailed" ? "detailed" : "simple";
  }
  function applyMode(m, announce) {
    document.documentElement.dataset.mode = m;
    try { localStorage.setItem("qrypt-mode", m); } catch (e) {}
    document.querySelectorAll(".qbar__mode button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.mode === m)); });
    if (announce) window.dispatchEvent(new CustomEvent("qrypt:mode", { detail: m }));
  }

  // The hero's entrance, once per load: the h1 rises, then each .q-enter-item fades up, 60 ms apart.
  function enter() {
    var hero = document.querySelector("[data-enter]");
    if (!hero || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    hero.querySelectorAll(".q-enter-item").forEach(function (el, i) { el.style.transitionDelay = 300 + i * 60 + "ms"; });
    requestAnimationFrame(function () { requestAnimationFrame(function () { document.documentElement.classList.add("q-entered"); }); });
  }
  if (document.body) build();
  else document.addEventListener("DOMContentLoaded", build);

  window.qrypt = {
    setTheme: function (t) { applyTheme(t, true); },
    setMode: function (m) { applyMode(m, true); },
    get mode() { return document.documentElement.dataset.mode; },
    /** Add this page's keys to the ? list: [["S", "Send one photon"], ...]. */
    addShortcuts: function (list) { pageKeys = pageKeys.concat(list); },
    showShortcuts: function () { toggleKeys(true); },
  };
})();
