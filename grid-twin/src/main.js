// Wires the pieces together: a 4 Hz simulation loop drives BB84 on every QKD fiber, the detector turns counts
// into alarms, the response policy decides keys and routes, and the scene and panel draw the result.
import { buildNetwork } from "./network.js";
import { baselineQber, transmittance, runRounds } from "./bb84.js";
import { createDetector } from "./detector.js";
import { computeResponse, describeChanges } from "./response.js";
import { createScene } from "./scene.js";
import { createUI } from "./ui.js";

const TICK_MS = 250;
// Detected photons simulated per tick on a 10 km fiber; longer fibers detect fewer, so they collect
// evidence more slowly. This sets the demo's pace, not a hardware key rate.
const DETECTED_PER_TICK_AT_10KM = 500;
const HISTORY = 120; // ticks shown in the chart (30 s)
const DEFAULT_Z = 4.5;

const loader = document.getElementById("loader");
const hint = document.getElementById("hint-text");

boot().catch((err) => {
  console.error(err);
  loader.classList.add("is-error");
  loader.querySelector("span").textContent =
    location.protocol === "file:" ? "Open this page through a local web server (see README.md)" : `Could not start: ${err.message}`;
});

async function boot() {
  // Which network: ?net=<id> from data/networks/index.json (default: the stylized city).
  const manifest = await fetchJson("data/networks/index.json");
  const wanted = new URLSearchParams(location.search).get("net") ?? "city";
  const entry = manifest.find((m) => m.id === wanted) ?? manifest[0];
  const net = buildNetwork(await fetchJson(entry.file));

  const sim = {
    tool: "inspect",
    eveStrength: 1,
    z: DEFAULT_Z,
    paused: false,
    selected: null,
    links: new Map(),
  };
  for (const link of net.links.values()) {
    const baseline = baselineQber(link.km);
    const history = [];
    history.capacity = HISTORY;
    sim.links.set(link.id, {
      baseline,
      detector: link.kind === "qkd" ? createDetector({ baseline, z: DEFAULT_Z }) : null,
      perTick: Math.max(40, Math.round((DETECTED_PER_TICK_AT_10KM * transmittance(link.km)) / transmittance(10))),
      eve: null,
      quarantined: false,
      last: freshReading(baseline),
      history,
    });
  }

  // Warm-up: collect a few seconds of evidence on every fiber before the first frame (the loader's
  // "calibrating fibers"), so no fiber starts on probation.
  for (let i = 0; i < 6; i++) for (const s of sim.links.values()) if (s.detector) s.last = s.detector.push(runRounds({ rounds: s.perTick, lineError: s.baseline }));
  let response = computeResponse(net, alarmStates());

  const ui = createUI({
    panel: document.getElementById("panel"),
    net,
    networks: manifest,
    currentNetwork: entry.id,
    handlers: {
      onNetwork: (id) => {
        const url = new URL(location.href);
        url.searchParams.set("net", id);
        location.href = url.toString();
      },
      onEveStrength: (f) => {
        sim.eveStrength = f;
        setHint();
      },
      onZ: (z) => {
        sim.z = z;
        for (const s of sim.links.values()) s.detector?.setZ(z);
      },
      onPause: () => {
        sim.paused = !sim.paused;
        scene.setPaused(sim.paused);
        refresh();
      },
      onClearEves: () => {
        let any = false;
        for (const s of sim.links.values()) if (s.eve != null) ((s.eve = null), (any = true));
        if (any) ui.log({ level: "ok", text: "All taps removed. Error rates will settle back to baseline as the window refreshes." });
        refresh();
      },
      onRestoreAll: () => {
        for (const [id, s] of sim.links) if (s.quarantined) restore(id);
        refresh();
      },
      onAction: (action, id) => {
        if (action === "place-eve") placeEve(id);
        else if (action === "remove-eve") removeEve(id);
        else if (action === "quarantine") quarantine(id);
        else if (action === "restore") restore(id);
        refresh();
      },
    },
  });

  const scene = createScene({
    container: document.getElementById("stage"),
    net,
    onPick: (pick) => {
      if (!pick) {
        sim.selected = null;
      } else if (pick.type === "link" && sim.tool === "eve") {
        const s = sim.links.get(pick.id);
        s.eve == null ? placeEve(pick.id) : removeEve(pick.id);
        sim.selected = pick;
      } else if (pick.type === "link" && sim.tool === "quarantine") {
        sim.links.get(pick.id).quarantined ? restore(pick.id) : quarantine(pick.id);
        sim.selected = pick;
      } else {
        if (pick.type === "node" && sim.tool !== "inspect") ui.log({ level: "info", text: "Taps and quarantines apply to fibers: click a link, not a site." });
        sim.selected = pick;
      }
      refresh();
    },
    onHover: (pick, x, y) => showTooltip(pick, x, y),
  });

  // Actions ---------------------------------------------------------------------------------------
  function placeEve(id) {
    const s = sim.links.get(id);
    const link = net.links.get(id);
    s.eve = sim.eveStrength;
    if (link.kind === "qkd") {
      ui.log({ level: "bad", text: `Tap placed on ${id} (${link.a}–${link.b}): intercepting ${Math.round(s.eve * 100)}% of photons.` });
    } else {
      ui.log({ level: "info", text: `Tap placed on ${id}, a post-quantum link. No quantum signal to disturb, so nothing detects it; ML-KEM keeps the traffic unreadable to the tapper.` });
    }
    firstTapHint();
  }
  function removeEve(id) {
    sim.links.get(id).eve = null;
    ui.log({ level: "ok", text: `Tap removed from ${id}.` });
  }
  function quarantine(id) {
    const s = sim.links.get(id);
    s.quarantined = true;
    s.detector?.reset();
    s.last = freshReading(s.baseline);
  }
  function restore(id) {
    // A restored fiber starts on probation: it carries traffic on ML-KEM keys until it has collected enough
    // fresh measurements to judge it, as real QKD estimates the error rate before trusting any key.
    const s = sim.links.get(id);
    s.quarantined = false;
    s.detector?.reset();
    s.last = freshReading(s.baseline);
  }
  function alarmStates() {
    const m = new Map();
    for (const [id, s] of sim.links) {
      const alarm = s.detector && !s.last.enough ? "pending" : s.last.status;
      m.set(id, { alarm, quarantined: s.quarantined });
    }
    return m;
  }

  // Simulation loop -----------------------------------------------------------------------------
  function tick() {
    if (!sim.paused) {
      for (const [id, s] of sim.links) {
        if (!s.detector) continue;
        if (s.quarantined) continue; // no photons on a fiber out of service
        const counts = runRounds({ rounds: s.perTick, lineError: s.baseline, eveFraction: s.eve ?? 0 });
        const before = s.last.status;
        s.last = s.detector.push(counts);
        s.history.push({ qhat: s.last.qhat, threshold: s.last.threshold });
        if (s.history.length > HISTORY) s.history.shift();
        if (before !== s.last.status) logAlarm(id, before, s.last);
      }
    }
    refresh();
  }

  function logAlarm(id, before, now) {
    const l = net.links.get(id);
    const name = `${id} (${l.a}–${l.b})`;
    const q = `${(100 * now.qhat).toFixed(1)}%`;
    if (now.status === "warning") ui.log({ level: "warn", text: `${name}: error rate ${q} is significantly above its ${(100 * now.threshold).toFixed(1)}% warning line. Possible eavesdropper.` });
    else if (now.status === "abort") ui.log({ level: "bad", text: `${name}: error rate ${q} is above 11%. No secret key can be distilled on this fiber.` });
    else if (now.status === "ok" && before !== "ok") ui.log({ level: "ok", text: `${name}: error rate back within normal noise. Alarm cleared.` });
  }

  function refresh() {
    const next = computeResponse(net, alarmStates());
    for (const ev of describeChanges(net, response, next)) ui.log(ev);
    response = next;

    const links = new Map();
    for (const [id, s] of sim.links) {
      links.set(id, {
        kind: net.links.get(id).kind,
        baseline: s.baseline,
        qhat: s.last.qhat,
        n: s.last.n,
        threshold: s.last.threshold,
        status: s.detector && !s.quarantined && !s.last.enough ? "pending" : s.last.status,
        eve: s.eve,
        quarantined: s.quarantined,
        keySource: response.links.get(id).keySource,
        history: s.history,
      });
    }
    const view = { links, sites: response.sites, selected: sim.selected, paused: sim.paused };
    scene.update(view);
    ui.render(view);
    lastView = view;
  }
  let lastView = null;

  // Tooltip -----------------------------------------------------------------------------------
  const tooltip = document.getElementById("tooltip");
  function showTooltip(pick, x, y) {
    if (!pick || !lastView) {
      tooltip.classList.remove("is-on");
      return;
    }
    let html;
    if (pick.type === "link") {
      const l = net.links.get(pick.id);
      const s = lastView.links.get(pick.id);
      html =
        l.kind === "qkd"
          ? `<b>${l.id}</b> · ${l.a}–${l.b} · QKD · ${l.km} km<br>QBER ${(100 * s.qhat).toFixed(2)}% (baseline ${(100 * s.baseline).toFixed(1)}%)${s.eve != null ? "<br>Tapped" : ""}`
          : `<b>${l.id}</b> · ${l.a}–${l.b} · post-quantum · ${l.km} km`;
    } else {
      const n = net.nodes.get(pick.id);
      const site = lastView.sites.get(pick.id);
      html = `<b>${n.id}</b> · ${n.name}<br>${site.islanded ? "No comms path · power on" : site.keySource === "qkd" ? "Keys: QKD" : site.keySource === "local" ? "Key authority" : "Keys: ML-KEM"}`;
    }
    tooltip.innerHTML = html;
    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
    tooltip.classList.add("is-on");
  }

  // Tools, hints and keyboard ----------------------------------------------------------------
  const toolButtons = [...document.querySelectorAll(".tool")];
  function setTool(tool) {
    sim.tool = tool;
    for (const b of toolButtons) b.classList.toggle("is-active", b.dataset.tool === tool);
    setHint();
  }
  for (const b of toolButtons) b.addEventListener("click", () => setTool(b.dataset.tool));
  window.addEventListener("keydown", (e) => {
    if (e.target instanceof Element && e.target.closest("input, textarea")) return;
    if (e.key === "1") setTool("inspect");
    else if (e.key === "2") setTool("eve");
    else if (e.key === "3") setTool("quarantine");
    else if (e.key === "f" || e.key === "F") {
      sim.selected = null;
      scene.frameAll();
      refresh();
    }
    else if (e.key === "Escape") {
      sim.selected = null;
      refresh();
    } else if (e.key === " ") {
      e.preventDefault();
      sim.paused = !sim.paused;
      scene.setPaused(sim.paused);
      refresh();
    }
  });

  let tapped = false;
  function firstTapHint() {
    if (tapped) return;
    tapped = true;
    hint.innerHTML = "Watch the tapped fiber: it turns <b>amber</b> once its error rate is significantly above baseline, and keys switch to ML-KEM.";
  }
  function setHint() {
    if (tapped && sim.tool === "inspect") return;
    if (sim.tool === "inspect") hint.innerHTML = "Choose <b>Eavesdrop</b> below, then click a glowing fiber.";
    else if (sim.tool === "eve") hint.innerHTML = `Click a fiber to tap it. The tap intercepts <b>${Math.round(sim.eveStrength * 100)}%</b> of photons (set it in the panel).`;
    else hint.innerHTML = "Click a fiber to take it out of service, or click again to restore it. Traffic reroutes; power never goes off.";
  }

  // A small handle for scripted demos and browser tests, e.g. gridTwin.tap("L11"); gridTwin.select("node", "S6").
  window.gridTwin = {
    tap: (id, fraction = sim.eveStrength) => {
      const keep = sim.eveStrength;
      sim.eveStrength = fraction;
      placeEve(id);
      sim.eveStrength = keep;
      refresh();
    },
    untap: (id) => (removeEve(id), refresh()),
    quarantine: (id) => (quarantine(id), refresh()),
    restore: (id) => (restore(id), refresh()),
    select: (type, id) => ((sim.selected = type ? { type, id } : null), refresh()),
    state: () => ({
      links: Object.fromEntries(
        [...sim.links].map(([id, s]) => [
          id,
          { status: s.detector && !s.quarantined && !s.last.enough ? "pending" : s.last.status, qber: s.last.qhat, tapped: s.eve != null, quarantined: s.quarantined, keySource: response.links.get(id).keySource },
        ]),
      ),
      sites: Object.fromEntries([...response.sites].map(([id, s]) => [id, { keySource: s.keySource, relays: s.relays, islanded: s.islanded, power: s.power }])),
    }),
  };

  // Keep the network centered in the part of the screen the panel does not cover.
  const panelEl = document.getElementById("panel");
  function updateInsets() {
    const r = panelEl.getBoundingClientRect();
    const sheet = window.matchMedia("(max-width: 860px)").matches;
    scene.setInsets(sheet ? { right: 0, bottom: window.innerHeight - r.top } : { right: window.innerWidth - r.left, bottom: 0 });
  }
  window.addEventListener("resize", updateInsets);
  updateInsets();

  // Start -----------------------------------------------------------------------------------------
  const qkdCount = [...net.links.values()].filter((l) => l.kind === "qkd").length;
  ui.log({ level: "info", text: `Network online. BB84 running on ${qkdCount} QKD fibers; sub-units and the remote site use ML-KEM.` });
  refresh();
  setInterval(tick, TICK_MS);
  requestAnimationFrame(() => loader.classList.add("is-done"));
}

function freshReading(baseline) {
  return { n: 0, errors: 0, qhat: 0, sigma: Infinity, threshold: baseline, status: "ok", enough: false };
}

async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
}
