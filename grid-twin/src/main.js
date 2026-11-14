// Wires the pieces together: a 4 Hz simulation loop drives BB84 on every QKD fiber, the detector turns counts
// into alarms, the response policy decides keys and routes, and the scene and panel draw the result.
import { buildNetwork } from "./network.js";
import { baselineQber, transmittance, runRounds, estimateTapFraction } from "./bb84.js";
import { createDetector } from "./detector.js";
import { computeResponse, describeChanges, sitesStrandedWithout } from "./response.js";
import { createScene } from "./scene.js";
import { createUI } from "./ui.js";
import { teleportRoute } from "./teleport.js";
import { controlCenters } from "./network.js";
import { findRoute, candidateRoutes, grover, DEFAULT_CUTOFF } from "./route.js";

const TICK_MS = 250;
// Detected photons simulated per tick on a 10 km fiber; longer fibers detect fewer, so they collect
// evidence more slowly. This sets the demo's pace, not a hardware key rate.
const DETECTED_PER_TICK_AT_10KM = 500;
const HISTORY = 120; // ticks shown in the chart (30 s)
const DEFAULT_Z = 4.5;
const MIN_W = 1024; // screen gate: smallest window the app will draw in
const MIN_H = 600;
// The standalone single-file build (tools/build_standalone.mjs) carries its data inline, so it opens with a
// double-click and needs no web server.
const EMBEDDED = globalThis.GRIDTWIN_DATA ?? null;
// Ticks of evidence after an alarm before the tap estimate is reported: one full detector window (4 s), so the
// estimate uses only photons sent after the alarm, all of them tapped, and is not diluted by older, clean ones.
const MEASURE_TICKS = 16;
const pct = (x, d = 1) => `${(100 * x).toFixed(d)}%`;
const list = (ids) => (ids.length <= 2 ? ids.join(" and ") : `${ids.slice(0, -1).join(", ")} and ${ids.at(-1)}`);

const loader = document.getElementById("loader");
const hint = document.getElementById("hint-text");

boot().catch((err) => {
  console.error(err);
  loader.classList.add("is-error");
  loader.querySelector("span").textContent =
    location.protocol === "file:" ? "Open grid_twin.html (the single-file copy at the top of the repo), or run python3 grid-twin/start.py" : `Could not start: ${err.message}`;
});

// Screen gate: the 3D view and its panel need a laptop-sized screen. Smaller screens get a message instead,
// and the app starts as soon as the window is big enough.
function roomy() {
  return window.innerWidth >= MIN_W && window.innerHeight >= MIN_H;
}
function waitForRoom() {
  if (roomy()) return Promise.resolve();
  return new Promise((resolve) => {
    const check = () => roomy() && (window.removeEventListener("resize", check), resolve());
    window.addEventListener("resize", check);
  });
}

async function boot() {
  await waitForRoom();
  // Which network: ?net=<id> from data/networks/index.json (default: the stylized city).
  const manifest = await fetchJson("data/networks/index.json");
  // The hero is the real Chattanooga grid; the stylized city and IEEE grids are the simulation lab (?net=<id>).
  const wanted = new URLSearchParams(location.search).get("net") ?? "chattanooga";
  const entry = manifest.find((m) => m.id === wanted) ?? manifest[0];
  // Live quantum frameworks: available only when the page is served by sim/live_server.py.
  const engines = EMBEDDED ? {} : await fetch("api/engines").then((r) => (r.ok ? r.json() : null)).then((j) => j?.engines ?? {}).catch(() => ({}));
  const params = new URLSearchParams(location.search);
  const coverage = params.get("qkd") === "all" ? "all" : "backbone";
  const raw = await fetchJson(entry.file);
  // QKD coverage: "backbone" is the design (QKD on control-center and major-substation fibers, ML-KEM elsewhere);
  // "all" puts QKD on every fiber, as on the team's whiteboard sketch.
  if (coverage === "all") for (const l of raw.links) l.kind = "qkd";
  const net = buildNetwork(raw);
  // Hero framing: the real grid gets the Tennessee title and the map-data credit the ODbL licence requires.
  const real = !!net.meta?.real;
  document.body.classList.toggle("is-real", real); // shows the OpenStreetMap credit
  document.querySelector(".brand__title").textContent = real ? "Tennessee Quantum Grid" : "Grid Twin";
  document.querySelector(".brand__mark").textContent = real ? "QRYPT · REAL GRID" : "QRYPT · TEST NETWORK";
  document.querySelector(".brand__sub").textContent = real
    ? `${net.meta.name.replace(" (real)", "")}: real substations and lines. Every green fiber runs BB84 live; tap one and the network defends itself.`
    : "A quantum-secured utility network, live. Every green fiber runs BB84; every error is counted.";
  document.title = real ? "Tennessee Quantum Grid · Qrypt" : "Grid Twin · Qrypt";
  const centers = controlCenters(net);
  // Route search defaults: the substation whose QKD key path to a control center passes the most trusted sites,
  // so the first route shown has something to compare. Falls back to the first two sites.
  const routeDefaults = pickRouteDefaults(net, centers);

  const sim = {
    tool: "inspect",
    eveStrength: 1,
    z: DEFAULT_Z,
    paused: false,
    autoResponse: true, // detect, switch keys, reroute, decoy, measure, recommend: all without a click
    teleportView: false,
    route: null, // { from, to, cutoff } while a route is shown
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
      // Floor of 90 detections per tick: about half survive sifting, so one 16-tick window always reaches the
      // detector's 600-bit minimum. Without it, fibers longer than about 50 km could never be judged.
      perTick: Math.max(90, Math.round((DETECTED_PER_TICK_AT_10KM * transmittance(link.km)) / transmittance(10))),
      eve: null,
      quarantined: false,
      decoy: false,
      autoDecoy: false, // true when decoy mode was switched on by the automatic response, not by the operator
      incident: null, // the open incident on this fiber, if any
      tapAt: null, // simulation time the tap was placed (shown so the demo can quote time to detection)
      last: freshReading(baseline),
      history,
    });
  }

  // Warm-up: collect evidence on every fiber before the first frame (the loader's "calibrating fibers"), so no
  // fiber starts on probation. Long fibers at the 90-detections floor need up to a full 16-tick window.
  for (let i = 0; i < 16; i++) {
    let all = true;
    for (const s of sim.links.values()) if (s.detector) (s.last = s.detector.push(runRounds({ rounds: s.perTick, lineError: s.baseline }))), (all &&= s.last.enough);
    if (all && i >= 5) break;
  }
  let response = computeResponse(net, alarmStates());

  const ui = createUI({
    panel: document.getElementById("panel"),
    incidentsEl: document.getElementById("incidents"),
    net,
    networks: manifest,
    currentNetwork: entry.id,
    coverage,
    engines,
    routeDefaults,
    handlers: {
      onRoute: (args, on) => {
        const was = sim.route;
        sim.route = on ? args : null;
        if (on && (!was || was.from !== args.from || was.to !== args.to)) {
          sim.selected = null;
          scene.setOrbit(false);
        }
        refresh();
      },
      onNetwork: (id) => {
        const url = new URL(location.href);
        url.searchParams.set("net", id);
        location.href = url.toString();
      },
      onEveStrength: (f) => {
        sim.eveStrength = f;
        // If the selected fiber is tapped, the slider adjusts that tap live (handy for the careful-spy demo).
        const sel = sim.selected?.type === "link" ? sim.links.get(sim.selected.id) : null;
        if (sel && sel.eve != null) sel.eve = f;
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
      onTeleportView: (on) => {
        sim.teleportView = on;
        ui.log({ level: "info", text: on ? "Teleportation view: fibers under 11% error could supply usable entanglement if run entanglement-based; select a substation to see its swapping route." : "Teleportation view off." });
        refresh();
      },
      onCoverage: (mode) => {
        const url = new URL(location.href);
        if (mode === "all") url.searchParams.set("qkd", "all");
        else url.searchParams.delete("qkd");
        location.href = url.toString();
      },
      onJump: (type, id) => {
        sim.selected = type ? { type, id } : null;
        refresh();
      },
      onAutoResponse: (on) => {
        sim.autoResponse = on;
        ui.log({ level: "info", text: on ? "Automatic response on: an alarmed fiber switches to decoy traffic, its tap is measured and an inspection is recommended." : "Automatic response off: alarms still switch keys to ML-KEM and reroute traffic; decoy traffic is left to the operator." });
        refresh();
      },
      onIncident: (action, n) => {
        const inc = incidents.find((i) => i.n === n);
        if (!inc) return;
        if (action === "quarantine") quarantine(inc.link);
        else if (action === "restore") restore(inc.link);
        else if (action === "dismiss" && inc.state !== "active") incidents.splice(incidents.indexOf(inc), 1);
        refresh();
      },
      // "Tap a fiber for me": a full tap on the network's demo fiber, so a first-time visitor sees the response at once.
      onDemo: () => {
        const preferred = { chattanooga: "L6", tennessee500: "L11", city: "L11" }[entry.id];
        const id = preferred && net.links.get(preferred)?.kind === "qkd" ? preferred : [...net.links.values()].find((l) => l.kind === "qkd")?.id;
        if (!id) return;
        const s = sim.links.get(id);
        if (s.eve == null) {
          const keep = sim.eveStrength;
          sim.eveStrength = 1;
          placeEve(id);
          sim.eveStrength = keep;
        }
        sim.selected = { type: "link", id };
        scene.setOrbit(false);
        refresh();
      },
      // One button puts the demo back to its start for the next visitor.
      onResetDemo: () => {
        for (const [id, s] of sim.links) {
          s.eve = null;
          if (s.quarantined) restore(id);
          if (s.decoy) setDecoy(id, false, false);
        }
        incidents.length = 0;
        sim.route = null;
        sim.selected = null;
        if (sim.paused) ((sim.paused = false), scene.setPaused(false));
        setTool("inspect");
        scene.frameAll();
        ui.log({ level: "ok", text: "Demo reset: every tap removed, every fiber back in service." });
        ui.resetRoute?.();
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
        else if (action.startsWith("engine:")) return runOnEngine(id, action.slice(7));
        else if (action === "decoy-on") setDecoy(id, true, false);
        else if (action === "decoy-off") setDecoy(id, false, false);
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
      } else {
        if (pick.type === "node" && sim.tool === "eve") ui.log({ level: "info", text: "Taps go on fibers: click a link, not a site." });
        sim.selected = pick;
      }
      refresh();
    },
    onHover: (pick, x, y) => showTooltip(pick, x, y),
    onInteract: () => syncDock(),
    theme: document.documentElement.dataset.theme === "dark" ? "dark" : "light",
  });

  // Actions ---------------------------------------------------------------------------------------
  function placeEve(id) {
    const s = sim.links.get(id);
    const link = net.links.get(id);
    s.eve = sim.eveStrength;
    s.tapAt = simTime();
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
    if (s.incident) {
      const cut = sitesStrandedWithout(net, alarmStates(), id);
      endIncident(
        s.incident,
        "contained",
        `<b>Quarantined</b> by the operator: ${id} is out of service. ${cut.length ? `${list(cut)} ${cut.length > 1 ? "have" : "has"} no comms path left and ${cut.length > 1 ? "run" : "runs"} on local protection; a crew is dispatched.` : "Its traffic is rerouted."} Power stays on everywhere.`,
      );
    }
    s.decoy = false;
    s.autoDecoy = false;
    s.quarantined = true;
    s.detector?.reset();
    s.last = freshReading(s.baseline);
    releaseDecoysNeededAfter(id);
  }
  // Taking a fiber out of service can leave a site whose only remaining route is a fiber on decoy traffic.
  // Real traffic must never be stranded to keep a decoy running, so that decoy ends and the site's traffic
  // goes back on that fiber, protected by ML-KEM keys.
  function releaseDecoysNeededAfter(quarantinedId) {
    for (const [id, s] of sim.links) {
      if (!s.decoy) continue;
      const now = computeResponse(net, alarmStates());
      const islanded = [...now.sites].filter(([, site]) => site.islanded).map(([sid]) => sid);
      if (!islanded.length) return;
      const trial = alarmStates();
      trial.set(id, { ...trial.get(id), decoy: false });
      const after = computeResponse(net, trial);
      const rescued = islanded.filter((sid) => !after.sites.get(sid).islanded);
      if (!rescued.length) continue;
      s.decoy = false;
      s.autoDecoy = false;
      const text = `Decoy traffic on ${id} ended: with ${quarantinedId} quarantined, ${list(rescued)} ${rescued.length > 1 ? "have" : "has"} no other route. Real traffic is back on ${id}, protected by ML-KEM keys.`;
      if (s.incident) setStage(s.incident, "decoy", "skipped", `<b>Decoy traffic ended</b>: ${text.slice(text.indexOf(":") + 2)}`);
      ui.log({ level: "warn", text });
    }
  }
  function restore(id) {
    // A restored fiber starts on probation: it carries traffic on ML-KEM keys until it has collected enough
    // fresh measurements to judge it, as real QKD estimates the error rate before trusting any key.
    const s = sim.links.get(id);
    s.quarantined = false;
    s.detector?.reset();
    s.last = freshReading(s.baseline);
    for (const inc of incidents) {
      if (inc.link === id && inc.state === "contained") {
        inc.state = "closed";
        inc.stages.push({ key: "restored", state: "done", at: simTime(), html: `<b>Restored</b>: back in service. It carries ML-KEM traffic until fresh measurements clear it for QKD keys${s.eve != null ? "; the tap is still there, so expect a new alarm" : ""}.` });
      }
    }
  }

  // Automatic response ----------------------------------------------------------------------------
  // One incident per alarm. Detection, the switch to ML-KEM and rerouting are the policy itself; decoy traffic,
  // the tap measurement and the recommendation follow on their own when automatic response is on.
  // Quarantine is never automatic: an attacker must not be able to take a fiber down by tapping it.
  const incidents = [];
  let incidentSeq = 0;
  let simTicks = 0;
  function simTime() {
    return (simTicks * TICK_MS) / 1000;
  }
  function stageOf(inc, key) {
    return inc.stages.find((x) => x.key === key);
  }
  function setStage(inc, key, state, html) {
    const st = stageOf(inc, key);
    st.state = state;
    if (html) st.html = html;
    st.at = simTime();
  }
  // On the real map, sites have names people know; use them in incident cards.
  function placeName(nodeId) {
    return net.nodes.get(nodeId).short ?? nodeId;
  }
  function openIncident(id) {
    const s = sim.links.get(id);
    const l = net.links.get(id);
    const t = simTime();
    const abort = s.last.status === "abort";
    const inc = {
      n: ++incidentSeq,
      link: id,
      a: placeName(l.a),
      b: placeName(l.b),
      state: "active",
      openedAt: t,
      measureFrom: null,
      estimate: null,
      stages: [
        { key: "detect", state: "bad", at: t, html: `<b>Detected</b>: error rate ${pct(s.last.qhat)} is ${abort ? "above the 11% abort line" : `above this fiber's ${pct(s.last.threshold)} warning line`}${s.tapAt != null ? ` (simulation: tap placed ${(t - s.tapAt).toFixed(1)} s earlier)` : ""}.` },
        { key: "keys", state: "done", at: t, html: `<b>Keys switched</b>: QKD keys from ${id} are no longer trusted; its traffic uses ML-KEM. The fiber stays up.` },
        { key: "reroute", state: "pending", at: null, html: "<b>Reroute</b> real traffic around the fiber" },
        { key: "decoy", state: "pending", at: null, html: "<b>Decoy traffic</b> on the fiber" },
        { key: "measure", state: "pending", at: null, html: "<b>Measure</b> the tap" },
        { key: "recommend", state: "pending", at: null, html: "<b>Recommend</b> a response" },
      ],
    };
    incidents.unshift(inc);
    while (incidents.length > 12) incidents.pop();
    s.incident = inc;
    if (!sim.selected) sim.selected = { type: "link", id }; // bring the incident into view
    ui.log({ level: "bad", text: `Incident #${inc.n} on ${id}: automatic response started.` });
    advanceIncident(inc);
  }
  function advanceIncident(inc) {
    if (inc.state !== "active") return;
    const id = inc.link;
    const s = sim.links.get(id);
    if (stageOf(inc, "decoy").state === "pending") {
      if (!sim.autoResponse) {
        setStage(inc, "decoy", "skipped", "<b>Decoy traffic</b>: skipped, automatic response is off.");
      } else {
        const stranded = sitesStrandedWithout(net, alarmStates(), id);
        if (stranded.length) {
          setStage(inc, "decoy", "skipped", `<b>Decoy traffic</b> not possible: ${list(stranded)} would have no other route, so real traffic stays on ${id} with ML-KEM keys.`);
        } else {
          setDecoy(id, true, true);
          setStage(inc, "decoy", "done", `<b>Decoy traffic</b>: ${id} now carries only fake data. The tapper keeps tapping and captures nothing real.`);
          ui.log({ level: "info", text: `Incident #${inc.n}: ${id} switched to decoy traffic to measure the tap.` });
        }
      }
      // Rerouting is decided by the policy (risk-weighted routes, decoy fibers excluded): report where traffic went.
      const r = computeResponse(net, alarmStates());
      const still = [...r.sites].filter(([, site]) => site.dataPath?.links.some((x) => x.id === id)).map(([sid]) => sid);
      setStage(
        inc,
        "reroute",
        still.length ? "skipped" : "done",
        still.length
          ? `<b>Reroute</b>: ${list(still)} ${still.length > 1 ? "have" : "has"} no other path, so ${still.length > 1 ? "their" : "its"} traffic stays on ${id}, protected by ML-KEM.`
          : `<b>Rerouted</b>: real traffic now avoids ${id}; every site keeps a path.`,
      );
      inc.measureFrom = simTicks;
      setStage(inc, "measure", "active", "<b>Measuring</b> the tap from the photons it disturbs…");
    }
    if (stageOf(inc, "measure").state === "active" && simTicks - inc.measureFrom >= MEASURE_TICKS && s.last.n > 0) {
      const est = estimateTapFraction(s.last.qhat, s.baseline, s.last.n);
      inc.estimate = est;
      const l = net.links.get(id);
      setStage(inc, "measure", "done", `<b>Measured</b>: about ${pct(est.f, 0)} ± ${pct(Math.min(1, est.se), 0)} of photons intercepted; the pattern fits intercept-resend.`);
      setStage(
        inc,
        "recommend",
        "done",
        `<b>Recommended</b>: send a crew to inspect ${id} (${placeName(l.a)}–${placeName(l.b)}, ${l.km} km of fiber) for a physical tap. ${s.decoy ? "Decoy traffic keeps running meanwhile." : "Traffic stays on ML-KEM keys meanwhile."} Quarantine is the operator's call.`,
      );
      ui.log({ level: "warn", text: `Incident #${inc.n}: about ${pct(est.f, 0)} of photons on ${id} are being intercepted. Crew inspection recommended.` });
    }
  }
  function endIncident(inc, state, html) {
    for (const st of inc.stages) if (st.state === "pending" || st.state === "active") ((st.state = "skipped"), (st.at = null));
    inc.state = state;
    inc.stages.push({ key: "end", state: state === "closed" ? "done" : "bad", at: simTime(), html });
    const s = sim.links.get(inc.link);
    if (s.incident === inc) s.incident = null;
  }
  // Re-run a fiber's current physics (its noise and tap) as real quantum programs on a framework.
  const engineRuns = new Map(); // linkId -> { engine -> result | "running" | {error} }
  async function runOnEngine(id, engine) {
    const s = sim.links.get(id);
    const runs = engineRuns.get(id) ?? {};
    engineRuns.set(id, runs);
    const targets = engine === "all" ? Object.keys(engines) : [engine];
    for (const e of targets) {
      runs[e] = "running";
      refresh();
      try {
        const res = await fetch("api/bb84", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ engine: e, line_error: s.baseline, eve_fraction: s.eve ?? 0, rounds: 4000 }),
        }).then((r) => r.json());
        runs[e] = res;
        if (res.error) ui.log({ level: "bad", text: `${id} on ${engines[e]}: ${res.error}` });
        else ui.log({ level: "info", text: `${id} re-run on ${res.label}: QBER ${(100 * res.qber).toFixed(1)}% (theory ${(100 * res.expected).toFixed(1)}%), ${res.sifted.toLocaleString()} sifted photons, ${res.ms} ms.` });
      } catch (err) {
        runs[e] = { error: String(err) };
      }
      refresh();
    }
  }

  function setDecoy(id, on, auto) {
    const s = sim.links.get(id);
    const link = net.links.get(id);
    if (on === s.decoy) return true;
    if (on) {
      if (link.kind !== "qkd") {
        ui.log({ level: "info", text: `${id} is a post-quantum link: it has no quantum signal to measure a tap with, so decoy mode would teach us nothing.` });
        return false;
      }
      if (s.quarantined) {
        ui.log({ level: "info", text: `${id} is quarantined. Restore it before switching it to decoy traffic.` });
        return false;
      }
      const stranded = sitesStrandedWithout(net, alarmStates(), id);
      if (stranded.length) {
        ui.log({ level: "warn", text: `${id}: decoy mode refused: ${stranded.join(", ")} would have no other route. Real traffic stays on this fiber with ML-KEM keys.` });
        return false;
      }
    }
    s.decoy = on;
    s.autoDecoy = on && auto;
    return true;
  }
  function alarmStates() {
    const m = new Map();
    for (const [id, s] of sim.links) {
      const alarm = s.detector && !s.last.enough ? "pending" : s.last.status;
      m.set(id, { alarm, quarantined: s.quarantined, decoy: s.decoy, risk: riskOf(s, alarm) });
    }
    return m;
  }
  // Risk for the routing decision: 0 for a clean fiber, rising with evidence of tampering.
  function riskOf(s, alarm) {
    if (!s.detector || s.quarantined) return 0;
    if (alarm === "abort") return 4;
    if (alarm === "warning") return 2;
    if (alarm === "pending") return 0.5;
    const room = Math.max(1e-6, s.last.threshold - s.baseline);
    return 0.5 * Math.min(1, Math.max(0, (s.last.qhat - s.baseline) / room));
  }

  // Simulation loop -----------------------------------------------------------------------------
  function tick() {
    if (!sim.paused) {
      simTicks++;
      for (const [id, s] of sim.links) {
        if (!s.detector) continue;
        if (s.quarantined) continue; // no photons on a fiber out of service
        const counts = runRounds({ rounds: s.perTick, lineError: s.baseline, eveFraction: s.eve ?? 0 });
        const before = s.last.status;
        s.last = s.detector.push(counts);
        s.history.push({ qhat: s.last.qhat, threshold: s.last.threshold });
        if (s.history.length > HISTORY) s.history.shift();
        if (before !== s.last.status) logAlarm(id, before, s.last);
        const alarmed = s.last.enough && (s.last.status === "warning" || s.last.status === "abort");
        if (alarmed && !s.incident) openIncident(id);
        else if (s.incident) {
          if (s.last.enough && s.last.status === "ok") {
            const wasDecoy = s.decoy && s.autoDecoy;
            if (wasDecoy) setDecoy(id, false, false);
            endIncident(s.incident, "closed", `<b>Cleared</b>: error rate back within normal noise.${wasDecoy ? " Decoy traffic ended;" : ""} QKD keys resume.`);
          } else advanceIncident(s.incident);
        } else if (s.decoy && s.autoDecoy && s.last.status === "ok") {
          setDecoy(id, false, false);
        }
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
        decoy: s.decoy,
        risk: response.links.get(id).risk,
        estimate: s.detector && s.last.n > 0 ? estimateTapFraction(s.last.qhat, s.baseline, s.last.n) : null,
        engineRuns: engineRuns.get(id) ?? null,
        keySource: response.links.get(id).keySource,
        history: s.history,
        // Only for the selected fiber (it costs two response computations): sites decoy mode would cut off.
        decoyBlocked: sim.selected?.type === "link" && sim.selected.id === id && net.links.get(id).kind === "qkd" && !s.decoy && !s.quarantined ? sitesStrandedWithout(net, alarmStates(), id) : [],
      });
    }
    // Teleportation view: each quantum fiber's current error rate, and the selected site's swapping route.
    let teleport = null;
    if (sim.teleportView) {
      const linkQ = new Map();
      for (const [id, s] of sim.links) linkQ.set(id, s.detector && !s.quarantined && s.last.n > 0 ? s.last.qhat : null);
      const sel = sim.selected;
      const route = sel && sel.type === "node" && net.nodes.get(sel.id).type !== "control" ? teleportRoute(net, centers, sel.id, linkQ) : null;
      teleport = { linkQ, route };
    }
    const route = sim.route ? routeNow(sim.route) : null;
    const view = { links, sites: response.sites, selected: sim.selected, paused: sim.paused, teleport, coverage, route };
    scene.update(view);
    ui.render(view);
    ui.renderIncidents(incidents);
    document.body.classList.toggle("has-incidents", incidents.length > 0);
    document.getElementById("paused").hidden = !sim.paused;
    lastView = view;
  }
  let lastView = null;

  // Route search ------------------------------------------------------------------------------
  // A fiber's QBER for the search: its live measured error rate (unknown until it has measurements).
  // Quarantined and decoy fibers carry no real traffic, so the search skips them.
  const routeQber = (l) => {
    const s = sim.links.get(l.id);
    return s.detector && s.last.n > 0 ? s.last.qhat : null;
  };
  // A QKD fiber on probation (new or just restored, too few measurements) carries no trusted QKD key yet.
  const routeMeasured = (l) => {
    const s = sim.links.get(l.id);
    return !s.detector || s.last.enough;
  };
  const routeInService = (l) => {
    const s = sim.links.get(l.id);
    return !s.quarantined && !s.decoy;
  };
  // Grover's candidates (Yen's search) change only when the sites or the fibers in service change, and its
  // sampled draw only when the clean set changes, so both are cached rather than recomputed every tick.
  let groverCache = { key: null, routes: [], drawKey: null, result: null };
  function routeNow({ from, to, cutoff }) {
    const r = findRoute(net, from, to, { cutoff, qberOf: routeQber, inService: routeInService, measured: routeMeasured });
    const service = [...net.links.values()].filter((l) => l.kind === "qkd" && !routeInService(l)).map((l) => l.id).join(",");
    const key = `${from}|${to}|${service}`;
    if (groverCache.key !== key) groverCache = { key, routes: candidateRoutes(net, from, to, { k: 8, inService: routeInService }), drawKey: null, result: null };
    const marked = groverCache.routes.map((links, i) => (links.every((l) => routeMeasured(l) && (routeQber(l) ?? 0) < cutoff) ? i : -1)).filter((i) => i >= 0);
    const drawKey = marked.join(",");
    if (groverCache.drawKey !== drawKey) {
      const g = grover(8, marked);
      let x = Math.random();
      let pick = 7;
      for (let i = 0; i < 8; i++) if ((x -= g.probs[i]) <= 0) ((pick = i), (i = 8));
      groverCache.drawKey = drawKey;
      groverCache.result = { ...g, routes: groverCache.routes.map((rt) => rt.map((l) => l.id)), marked, pick, pickClean: marked.includes(pick) };
    }
    const toLinks = (ids) => ids.map((id) => net.links.get(id));
    return { ...r, path: r.links.length ? { nodes: r.nodes, links: toLinks(r.links) } : null, grover: r.mode === "local" ? null : groverCache.result };
  }

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
      html = `<b>${n.id}</b> · ${n.name}<br>${site.islanded ? "No comms path · power on" : site.keySource === "qkd" ? "Keys: QKD" : site.keySource === "local" ? "Control center (holds the keys)" : "Keys: ML-KEM"}`;
    }
    tooltip.innerHTML = html;
    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
    tooltip.classList.add("is-on");
  }

  // Tools, hints and keyboard ----------------------------------------------------------------
  const toolButtons = [...document.querySelectorAll(".tool[data-tool]")];
  function setTool(tool) {
    sim.tool = tool;
    for (const b of toolButtons) b.classList.toggle("is-active", b.dataset.tool === tool);
    setHint();
  }
  for (const b of toolButtons) b.addEventListener("click", () => setTool(b.dataset.tool));
  // What a drag does: Move (pan across the map, the default) or Rotate. The other one stays on right-drag and
  // Shift-drag, and the legend line says so.
  const dragButtons = [...document.querySelectorAll("[data-drag]")];
  const navHelp = document.getElementById("nav-help");
  function setDragMode(mode) {
    scene.setDragMode(mode);
    for (const b of dragButtons) {
      const on = b.dataset.drag === scene.dragMode;
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-pressed", String(on));
    }
    navHelp.innerHTML = scene.dragMode === "move"
      ? "<b>Drag</b> to move · <b>right-drag</b> or <b>Shift-drag</b> to rotate · <b>scroll</b> to zoom · <b>H</b> to recenter"
      : "<b>Drag</b> to rotate · <b>right-drag</b> or <b>Shift-drag</b> to move · <b>scroll</b> to zoom · <b>H</b> to recenter";
  }
  for (const b of dragButtons) b.addEventListener("click", () => setDragMode(b.dataset.drag));
  // The map key starts closed on smaller screens so it does not cover the network; its summary line stays.
  const legendEl = document.getElementById("legend");
  if (legendEl && (window.innerWidth < 1320 || window.innerHeight < 780)) legendEl.open = false;
  document.getElementById("paused").addEventListener("click", () => {
    sim.paused = false;
    scene.setPaused(false);
    refresh();
  });
  window.addEventListener("keydown", (e) => {
    if (e.target instanceof Element && e.target.closest("input, textarea")) return;
    if (e.target instanceof Element && e.target.closest("select")) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === "i") setTool("inspect");
    else if (k === "e") setTool("eve");
    else if (k === "+" || k === "=") viewAction("zoom-in");
    else if (k === "-" || k === "_") viewAction("zoom-out");
    else if (k === "f") viewAction("focus");
    else if (k === "h") viewAction("fit");
    else if (k === "o") viewAction("orbit");
    else if (k === "m") setDragMode(scene.dragMode === "move" ? "rotate" : "move");
    else if (e.key === "Escape") {
      sim.selected = null;
      refresh();
    } else if (e.key === " ") {
      if (e.target instanceof Element && e.target.closest("button, a, summary")) return; // Space presses a focused button
      e.preventDefault();
      sim.paused = !sim.paused;
      scene.setPaused(sim.paused);
      refresh();
    }
  });

  // Viewer dock: zoom, fit, focus, cinematic orbit, theme ---------------------------------------------
  const dockButtons = [...document.querySelectorAll("[data-view]")];
  for (const b of dockButtons) b.addEventListener("click", () => viewAction(b.dataset.view));
  const MOON = '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>';
  const SUN = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>';
  function syncDock() {
    const theme = document.documentElement.dataset.theme;
    for (const b of dockButtons) {
      const v = b.dataset.view;
      if (v === "orbit") {
        b.classList.toggle("is-on", scene.orbit);
        b.setAttribute("aria-pressed", String(scene.orbit));
      } else if (v === "focus") {
        b.classList.toggle("is-on", scene.focusMode);
        b.setAttribute("aria-pressed", String(scene.focusMode));
      } else if (v === "theme") {
        b.querySelector("svg").innerHTML = theme === "dark" ? SUN : MOON;
        b.querySelector("span").textContent = theme === "dark" ? "Light" : "Dark";
        b.title = theme === "dark" ? "Switch to light (T)" : "Switch to dark (T)";
      }
    }
  }
  // One theme for the whole project: the shared top bar (shared/qbar.js) owns it and announces changes.
  function setTheme(theme) {
    if (window.qrypt) window.qrypt.setTheme(theme); // announces "qrypt:theme", handled below
    else applyTheme(theme);
  }
  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    scene.setTheme(theme);
    refresh();
    syncDock();
  }
  window.addEventListener("qrypt:theme", (e) => applyTheme(e.detail === "dark" ? "dark" : "light"));
  function viewAction(v) {
    if (v === "zoom-in") scene.zoom(0.72);
    else if (v === "zoom-out") scene.zoom(1.38);
    else if (v === "fit") {
      scene.noteInteraction();
      scene.frameAll();
    } else if (v === "focus") {
      if (scene.focusMode) scene.frameAll();
      else if (!scene.focus(sim.selected)) ui.log({ level: "info", text: "Focus: select a fiber or site first (click it, or use Find a fiber or site)." });
      else scene.noteInteraction();
    } else if (v === "orbit") scene.setOrbit(!scene.orbit);
    else if (v === "theme") setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
    syncDock();
  }
  syncDock();

  let tapped = false;
  function firstTapHint() {
    if (tapped) return;
    tapped = true;
    hint.innerHTML = "Watch the tapped fiber: once its error rate is significantly above baseline, an <b>incident</b> opens and the network responds on its own.";
  }
  function setHint() {
    if (tapped && sim.tool === "inspect") return;
    if (sim.tool === "inspect") hint.innerHTML = "Choose <b>Eavesdrop</b> below, then click a fiber. The network responds on its own.";
    else hint.innerHTML = `Click a fiber to tap it. The tap intercepts <b>${Math.round(sim.eveStrength * 100)}%</b> of photons (set it in the panel). Click it again to remove the tap.`;
  }

  // Keys for the ? list in the top bar (1-4, 0, T and D are handled there for every page).
  window.qrypt?.addShortcuts([
    ["I / E", "Inspect tool or Eavesdrop tool"],
    ["M", "Swap what dragging does: move or rotate"],
    ["Arrows", "Move the view (click the map first)"],
    ["+ / −", "Zoom in or out"],
    ["H", "Recenter on the whole network"],
    ["F", "Focus on the selection"],
    ["O", "Auto-turn on or off"],
    ["Space", "Pause or resume the simulation"],
    ["Esc", "Clear the selection"],
  ]);

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
    decoy: (id, on = true) => (setDecoy(id, on, false), refresh()),
    autoResponse: (on = true) => ((sim.autoResponse = on), (document.getElementById("autoresponse").checked = on), refresh()),
    autoDecoy: (on = true) => window.gridTwin.autoResponse(on), // older name
    incidents: () => incidents.map((i) => ({ n: i.n, link: i.link, state: i.state, estimate: i.estimate, stages: i.stages.map((st) => ({ key: st.key, state: st.state, at: st.at, text: st.html.replace(/<[^>]+>/g, "") })) })),
    theme: (t) => setTheme(t === "dark" ? "dark" : "light"),
    dragMode: (mode) => (mode ? setDragMode(mode) : scene.dragMode),
    orbit: (on = true) => (scene.setOrbit(on), syncDock()),
    focus: () => viewAction("focus"),
    fit: () => viewAction("fit"),
    zoom: (factor) => scene.zoom(factor),
    restore: (id) => (restore(id), refresh()),
    select: (type, id) => ((sim.selected = type ? { type, id } : null), refresh()),
    // Route search, e.g. gridTwin.route("T1", "T4", 0.11); gridTwin.route(null) clears it.
    route: (from, to, cutoff = DEFAULT_CUTOFF) => {
      sim.route = from ? { from, to, cutoff } : null;
      refresh();
      return lastView.route ? { mode: lastView.route.mode, nodes: lastView.route.nodes, links: lastView.route.links, relays: lastView.route.relays, km: lastView.route.km, maxQber: lastView.route.maxQber, shortest: lastView.route.shortest, grover: lastView.route.grover && { N: lastView.route.grover.N, M: lastView.route.grover.M, iterations: lastView.route.grover.iterations, success: lastView.route.grover.success } } : null;
    },
    state: () => ({
      links: Object.fromEntries(
        [...sim.links].map(([id, s]) => [
          id,
          { status: s.detector && !s.quarantined && !s.last.enough ? "pending" : s.last.status, qber: s.last.qhat, tapped: s.eve != null, tapFraction: s.eve, decoy: s.decoy, quarantined: s.quarantined, keySource: response.links.get(id).keySource, risk: response.links.get(id).risk, estimatedTap: s.detector && s.last.n > 0 ? estimateTapFraction(s.last.qhat, s.baseline, s.last.n) : null },
        ]),
      ),
      sites: Object.fromEntries([...response.sites].map(([id, s]) => [id, { keySource: s.keySource, relays: s.relays, islanded: s.islanded, power: s.power, dataPath: s.dataPath?.nodes ?? null }])),
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

  // Deep links from the other pages: ?select=link:L6 or ?select=node:T23 opens that fiber or site.
  const deep = params.get("select")?.split(":");
  if (deep && (deep[0] === "link" ? net.links.has(deep[1]) : deep[0] === "node" && net.nodes.has(deep[1]))) {
    sim.selected = { type: deep[0], id: deep[1] };
    // ?tap=0.4 with a selected fiber: the spy setting carried over from the real map.
    const tapF = Number(params.get("tap"));
    if (deep[0] === "link" && tapF > 0 && tapF <= 1) {
      const keep = sim.eveStrength;
      sim.eveStrength = tapF;
      placeEve(deep[1]);
      sim.eveStrength = keep;
    }
    scene.setOrbit(false);
  }

  if (params.get("teleport") === "1") {
    sim.teleportView = true;
    const box = document.getElementById("teleport");
    if (box) box.checked = true;
  }

  // Start -----------------------------------------------------------------------------------------
  const qkdCount = [...net.links.values()].filter((l) => l.kind === "qkd").length;
  ui.log({ level: "info", text: coverage === "all" ? `Network online. BB84 running on all ${qkdCount} fibers (QKD everywhere, as on the whiteboard).` : `Network online. BB84 running on ${qkdCount} QKD fibers; the other ${net.links.size - qkdCount} links use ML-KEM.` });
  refresh();
  setInterval(tick, TICK_MS);
  // Hide the loader on the next frame, or after 400 ms if the tab is in the background (no frames run there).
  const hideLoader = () => loader.classList.add("is-done");
  requestAnimationFrame(hideLoader);
  setTimeout(hideLoader, 400);
}

function pickRouteDefaults(net, centers) {
  const ids = [...net.nodes.keys()];
  let best = null;
  if (net.nodes.size > 150) return { from: [...net.nodes.values()].find((n) => n.type === "substation")?.id ?? ids[0], to: centers[0] ?? ids[1] }; // keep boot fast on the big test grids
  for (const n of net.nodes.values()) {
    if (n.type !== "substation") continue;
    for (const c of centers) {
      const r = findRoute(net, n.id, c);
      if (r.mode !== "qkd") continue;
      const gap = (r.shortest?.sites ?? 0) - r.relays.length; // routes where fewest-sites differs from shortest-km first
      const score = [gap, r.relays.length];
      if (!best || score[0] > best.score[0] || (score[0] === best.score[0] && score[1] > best.score[1])) best = { from: n.id, to: c, score };
    }
  }
  return best ? { from: best.from, to: best.to } : { from: ids[0], to: centers[0] ?? ids[1] };
}

function freshReading(baseline) {
  return { n: 0, errors: 0, qhat: 0, sigma: Infinity, threshold: baseline, status: "ok", enough: false };
}

async function fetchJson(url) {
  if (EMBEDDED && url in EMBEDDED) return structuredClone(EMBEDDED[url]);
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
}
