// Run with: node --test tests/   (from the grid-twin folder)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runRounds, mulberry32, expectedQber, baselineQber, secretFraction, ABORT_QBER, estimateTapFraction, transmittance } from "../src/bb84.js";
import { createDetector, normalTail, binomialCriticalCount } from "../src/detector.js";
import { buildNetwork, shortestPath, controlCenters } from "../src/network.js";
import { computeResponse, sitesStrandedWithout } from "../src/response.js";
import { findRoute, candidateRoutes, grover } from "../src/route.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(fs.readFileSync(path.join(here, "../data/network.json"), "utf8"));
const net = buildNetwork(raw);

function measuredQber(p, f, rounds, seed) {
  const r = runRounds({ rounds, lineError: p, eveFraction: f, rng: mulberry32(seed) });
  return { q: r.errors / r.sifted, n: r.sifted };
}
function assertNear(q, expected, n, label) {
  const sigma = Math.sqrt(Math.max(expected * (1 - expected), 1e-6) / n);
  assert.ok(Math.abs(q - expected) < 4.5 * sigma, `${label}: got ${q.toFixed(4)}, expected ${expected.toFixed(4)} ± ${(4.5 * sigma).toFixed(4)}`);
}

test("BB84 with no eavesdropper and no noise has zero errors", () => {
  const r = runRounds({ rounds: 50000, lineError: 0, eveFraction: 0, rng: mulberry32(1) });
  assert.equal(r.errors, 0);
  assert.ok(Math.abs(r.sifted / r.rounds - 0.5) < 0.01, "about half the rounds survive sifting");
});

test("A full intercept-resend eavesdropper causes about 25% QBER", () => {
  const { q, n } = measuredQber(0, 1, 200000, 101);
  assertNear(q, 0.25, n, "f=1");
});

test("QBER follows p + f(1/4 - p/2) across noise and tap strengths", () => {
  let seed = 1000;
  for (const p of [0, 0.033, 0.08]) {
    for (const f of [0, 0.1, 0.5, 1]) {
      const { q, n } = measuredQber(p, f, 120000, (seed += 7919));
      assertNear(q, expectedQber(p, f), n, `p=${p} f=${f}`);
    }
  }
});

test("Engine agrees with Qiskit Aer reference runs (sim/bb84_reference.py)", (t) => {
  const file = path.join(here, "../data/calibration.json");
  if (!fs.existsSync(file)) return t.skip("data/calibration.json not generated yet");
  const cal = JSON.parse(fs.readFileSync(file, "utf8"));
  let seed = 5000;
  for (const sc of cal.scenarios) {
    const js = measuredQber(sc.line_error, sc.eve_fraction, 200000, (seed += 104729));
    // Two independent estimates: compare with their combined standard error.
    const se = Math.sqrt(sc.qber * (1 - sc.qber) / sc.sifted + js.q * (1 - js.q) / js.n) || 1e-3;
    assert.ok(Math.abs(js.q - sc.qber) < 4.5 * se + 1e-9, `p=${sc.line_error} f=${sc.eve_fraction}: JS ${js.q.toFixed(4)} vs Aer ${sc.qber.toFixed(4)}`);
  }
});

test("Fiber model: baseline rises with distance and QKD dies around 200 km", () => {
  assert.ok(Math.abs(baselineQber(10) - 0.033) < 0.001, "short fiber: misalignment error only");
  assert.ok(baselineQber(100) > baselineQber(50));
  assert.ok(baselineQber(200) > ABORT_QBER, "200 km is beyond the 11% abort line with these parameters");
});

test("Secret-key fraction is 1 at zero error and reaches zero near 11%", () => {
  assert.equal(secretFraction(0), 1);
  assert.ok(secretFraction(ABORT_QBER) < 0.001);
  assert.equal(secretFraction(0.2), 0);
});

test("Detector: no false alarms on a clean fiber, warning for a quiet tap, abort for a loud one", () => {
  const baseline = 0.033;
  const run = (f, ticks, seed) => {
    const d = createDetector({ baseline, z: 4.5 });
    const rng = mulberry32(seed);
    let last;
    const seen = new Set();
    for (let i = 0; i < ticks; i++) {
      last = d.push(runRounds({ rounds: 400, lineError: baseline, eveFraction: f, rng }));
      seen.add(last.status);
    }
    return { last, seen };
  };
  assert.ok(!run(0, 400, 7).seen.has("warning"), "clean fiber stays ok for 400 checks");
  assert.equal(run(0.15, 40, 8).last.status, "warning");
  assert.equal(run(1, 40, 9).last.status, "abort");
});

test("Detector clears only after several calm checks (hysteresis)", () => {
  const d = createDetector({ baseline: 0.033, z: 4.5, windowTicks: 4, clearChecks: 3 });
  const rng = mulberry32(42);
  for (let i = 0; i < 6; i++) d.push(runRounds({ rounds: 400, lineError: 0.033, eveFraction: 1, rng }));
  const statuses = [];
  for (let i = 0; i < 12; i++) statuses.push(d.push(runRounds({ rounds: 400, lineError: 0.033, eveFraction: 0, rng })).status);
  assert.notEqual(statuses[0], "ok", "still alarmed right after the tap is removed");
  assert.equal(statuses.at(-1), "ok", "eventually clears");
});

test("normalTail matches known values", () => {
  assert.ok(Math.abs(normalTail(0) - 0.5) < 1e-6);
  assert.ok(Math.abs(normalTail(1.96) - 0.025) < 1e-4);
  assert.ok(Math.abs(normalTail(4.5) - 3.398e-6) < 1e-7);
});

test("Network data is consistent", () => {
  assert.equal(controlCenters(net).length, 2);
  for (const node of net.nodes.values()) {
    if (node.type === "control") continue;
    assert.ok(shortestPath(net, controlCenters(net), node.id, () => true), `${node.id} reachable`);
  }
});

const healthy = () => new Map([...net.links.keys()].map((id) => [id, { alarm: "ok", quarantined: false }]));

test("Response: healthy network gives every substation a QKD key and every site comms", () => {
  const r = computeResponse(net, healthy());
  for (const [id, site] of r.sites) {
    const type = net.nodes.get(id).type;
    assert.equal(site.islanded, false, `${id} connected`);
    assert.equal(site.power, "energized");
    if (type === "substation") assert.equal(site.keySource, "qkd", `${id} on QKD`);
    if (type === "subunit" || type === "remote") assert.equal(site.keySource, "pqc", `${id} on ML-KEM`);
  }
});

test("Response: an alarm switches the link to ML-KEM but never takes it down", () => {
  const states = healthy();
  states.set("L4", { alarm: "abort", quarantined: false });
  const r = computeResponse(net, states);
  assert.equal(r.links.get("L4").keySource, "pqc-fallback");
  assert.equal(r.links.get("L4").carriesData, true);
  // S3's direct QKD fiber is in alarm, so its key must route around L4 through a trusted relay.
  const s3 = r.sites.get("S3");
  assert.equal(s3.keySource, "qkd");
  assert.ok(!s3.keyPath.links.some((l) => l.id === "L4"));
  assert.ok(s3.relays.length >= 1, "relayed through a trusted node");
});

test("Response: quarantining a sub-unit's only link islands it, but power stays on", () => {
  const states = healthy();
  states.set("P4", { alarm: "ok", quarantined: true });
  const r = computeResponse(net, states);
  const u4 = r.sites.get("U4");
  assert.equal(u4.islanded, true);
  assert.equal(u4.power, "energized");
});

test("Response: the response never de-energizes anything, whatever the alarms", () => {
  const states = new Map([...net.links.keys()].map((id) => [id, { alarm: "abort", quarantined: true }]));
  const r = computeResponse(net, states);
  for (const site of r.sites.values()) assert.equal(site.power, "energized");
});

test("Response: a substation with no healthy QKD chain falls back to ML-KEM and stays connected", () => {
  const states = healthy();
  for (const id of ["L8", "L9"]) states.set(id, { alarm: "warning", quarantined: false });
  const r = computeResponse(net, states);
  const s5 = r.sites.get("S5");
  assert.equal(s5.keySource, "pqc");
  assert.equal(s5.islanded, false);
});

test("Response: a fiber on probation (pending) uses ML-KEM keys but keeps carrying traffic", () => {
  const states = healthy();
  states.set("L4", { alarm: "pending", quarantined: false });
  const r = computeResponse(net, states);
  assert.equal(r.links.get("L4").keySource, "pqc-fallback");
  assert.equal(r.links.get("L4").carriesData, true);
});

test("Imported IEEE grids: every site can reach a control center, and the response runs on all of them", () => {
  const dir = path.join(here, "../data/networks");
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "index.json"), "utf8"));
  for (const m of manifest.filter((x) => x.id.startsWith("ieee"))) {
    const g = buildNetwork(JSON.parse(fs.readFileSync(path.join(here, "..", m.file), "utf8")));
    assert.equal(g.nodes.size, m.nodes, `${m.id} node count`);
    assert.equal(controlCenters(g).length, 2, `${m.id} has 2 control centers`);
    const st = new Map([...g.links.keys()].map((id) => [id, { alarm: "ok", quarantined: false }]));
    const r = computeResponse(g, st);
    for (const [id, site] of r.sites) assert.equal(site.islanded, false, `${m.id} ${id} connected`);
  }
});

test("Decoy mode: the fiber stops carrying real traffic, sites reroute, nothing is islanded", () => {
  const states = healthy();
  states.set("L5", { alarm: "abort", quarantined: false, decoy: true });
  const r = computeResponse(net, states);
  assert.equal(r.links.get("L5").keySource, "decoy");
  assert.equal(r.links.get("L5").carriesData, false);
  for (const [id, site] of r.sites) {
    assert.equal(site.islanded, false, `${id} still connected`);
    if (site.dataPath) assert.ok(!site.dataPath.links.some((l) => l.id === "L5"), `${id} avoids L5`);
  }
});

test("Decoy mode is refused where it would strand a site (a sub-unit's only link)", () => {
  assert.deepEqual(sitesStrandedWithout(net, healthy(), "P4"), ["U4"]);
  assert.deepEqual(sitesStrandedWithout(net, healthy(), "L5"), []);
});

test("Risk-aware routing: real traffic avoids a suspicious fiber when a safer route exists", () => {
  const states = healthy();
  const base = computeResponse(net, states).sites.get("S6").dataPath.links.map((l) => l.id);
  assert.deepEqual(base, ["L11"], "S6 normally uses its direct fiber from CC2");
  states.set("L11", { alarm: "warning", quarantined: false, risk: 2 });
  const risky = computeResponse(net, states).sites.get("S6").dataPath.links.map((l) => l.id);
  assert.ok(!risky.includes("L11"), `with L11 suspicious, S6 routes ${risky.join(",")}`);
});

test("Tap estimate recovers the true intercepted share within its error bar", () => {
  let seed = 9000;
  for (const [p, f] of [[0.033, 0.1], [0.033, 0.5], [0.033, 1], [0.02, 0.3]]) {
    const r = runRounds({ rounds: 80000, lineError: p, eveFraction: f, rng: mulberry32((seed += 7919)) });
    const est = estimateTapFraction(r.errors / r.sifted, p, r.sifted);
    assert.ok(Math.abs(est.f - f) < 4.5 * est.se + 1e-9, `p=${p} f=${f}: estimate ${est.f.toFixed(3)} ± ${est.se.toFixed(3)}`);
  }
});

import { composeQber, teleportRoute, TELEPORT_QBER_LIMIT } from "../src/teleport.js";

test("Teleportation: swapping composes errors like XOR of independent flips", () => {
  assert.equal(composeQber([]), 0);
  assert.ok(Math.abs(composeQber([0.05]) - 0.05) < 1e-12);
  assert.ok(Math.abs(composeQber([0.05, 0.05]) - 0.095) < 1e-12, "two 5% hops give 9.5%");
  // Monte Carlo check of the formula: XOR of independent flips.
  const rng = mulberry32(77);
  let odd = 0;
  const N = 200000;
  for (let i = 0; i < N; i++) odd += ((rng() < 0.04) ^ (rng() < 0.06) ^ (rng() < 0.03)) ? 1 : 0;
  assert.ok(Math.abs(odd / N - composeQber([0.04, 0.06, 0.03])) < 0.003);
});

test("Teleportation: routes avoid fibers above 11% and report whether the end-to-end pair is usable", () => {
  const linkQ = new Map([...net.links.values()].map((l) => [l.id, l.kind === "qkd" ? 0.033 : null]));
  const healthy = teleportRoute(net, controlCenters(net), "S6", linkQ);
  assert.deepEqual(healthy.links.map((l) => l.id), ["L11"], "one hop from CC2");
  assert.ok(healthy.ok);
  linkQ.set("L11", 0.27); // tapped: above 11%, unusable
  const around = teleportRoute(net, controlCenters(net), "S6", linkQ);
  assert.ok(!around.links.some((l) => l.id === "L11"));
  assert.equal(around.swaps, around.links.length - 1);
  assert.ok(Math.abs(around.qber - composeQber(around.hopQbers)) < 1e-12);
  assert.equal(teleportRoute(net, controlCenters(net), "U4", linkQ), null, "sub-unit links carry no quantum signal");
  assert.ok(TELEPORT_QBER_LIMIT === 0.11);
});

test("QKD on every fiber (whiteboard mode): sub-units get QKD keys when their fiber is healthy", () => {
  const allQkd = buildNetwork({ ...raw, links: raw.links.map((l) => ({ ...l, kind: "qkd" })) });
  const st = new Map([...allQkd.links.keys()].map((id) => [id, { alarm: "ok", quarantined: false }]));
  const r = computeResponse(allQkd, st);
  assert.equal(r.sites.get("U4").keySource, "qkd");
  st.set("P4", { alarm: "warning", quarantined: false });
  assert.equal(computeResponse(allQkd, st).sites.get("U4").keySource, "pqc", "its only fiber in alarm: ML-KEM");
});

test("Real OpenStreetMap grids: connected, real lengths, QKD only on short backbone spans, routes start and end at their sites", () => {
  const dir = path.join(here, "../data/networks");
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "index.json"), "utf8"));
  const real = manifest.filter((x) => x.real);
  assert.deepEqual(real.map((m) => m.id), ["chattanooga", "tennessee500"]);
  for (const m of real) {
    const raw = JSON.parse(fs.readFileSync(path.join(here, "..", m.file), "utf8"));
    const g = buildNetwork(raw);
    assert.equal(controlCenters(g).length, 2, `${m.id} has 2 key hubs`);
    const st = new Map([...g.links.keys()].map((id) => [id, { alarm: "ok", quarantined: false }]));
    for (const [id, site] of computeResponse(g, st).sites) assert.equal(site.islanded, false, `${m.id} ${id} connected`);
    for (const l of raw.links) {
      const a = g.nodes.get(l.a);
      const b = g.nodes.get(l.b);
      assert.ok(l.km > 0, `${m.id} ${l.id} has a length`);
      // A real route is never shorter than the straight line between its ends (small slack for centroids).
      assert.ok(l.km + 0.6 >= Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1]), `${m.id} ${l.id} length vs straight line`);
      if (l.kind === "qkd") assert.ok(l.km < 80, `${m.id} ${l.id} QKD span under 80 km`);
      assert.ok(Array.isArray(l.path) && l.path.length >= 2, `${m.id} ${l.id} has a route`);
    }
  }
});

test("Every fiber up to 80 km reaches the detector's minimum evidence within one window (no endless 'Measuring')", () => {
  for (const km of [5, 40, 79.9]) {
    const perTick = Math.max(90, Math.round((500 * transmittance(km)) / transmittance(10))); // as in main.js
    const det = createDetector({ baseline: baselineQber(km), z: 4.5 });
    let r;
    for (let i = 0; i < 16; i++) r = det.push(runRounds({ rounds: perTick, lineError: baselineQber(km), rng: mulberry32(7 + i) }));
    assert.ok(r.enough, `${km} km: ${r.n} sifted bits in one window`);
    assert.equal(r.status, "ok", `${km} km: no false alarm`);
  }
});

const chattanooga = () => buildNetwork(JSON.parse(fs.readFileSync(path.join(here, "../data/networks/chattanooga.json"), "utf8")));
const allOk = (g) => new Map([...g.links.keys()].map((id) => [id, { alarm: "ok", quarantined: false, risk: 0 }]));

test("Chattanooga: an aborted fiber on a key path sends the key another way to a control center", () => {
  const g = chattanooga();
  const centers = controlCenters(g);
  const before = computeResponse(g, allOk(g));
  // A site whose QKD key path has at least two fibers and survives losing its first one.
  let found = null;
  for (const [id, s] of before.sites) {
    if (s.keySource !== "qkd" || !s.keyPath || s.keyPath.links.length < 2) continue;
    const cut = s.keyPath.links[0].id;
    const st = allOk(g);
    st.set(cut, { alarm: "abort", quarantined: false, risk: 4 });
    const after = computeResponse(g, st).sites.get(id);
    if (after.keySource === "qkd") {
      found = { id, cut, after };
      break;
    }
  }
  assert.ok(found, "some substation has a reroutable QKD key path");
  const ids = found.after.keyPath.links.map((l) => l.id);
  assert.ok(!ids.includes(found.cut), "the new key path avoids the aborted fiber");
  assert.ok(centers.includes(found.after.keyPath.nodes[0]), "and still starts at a control center");
});

test("Key paths use the fewest trusted relays: never more than the shortest-km QKD path", () => {
  const g = chattanooga();
  const centers = controlCenters(g);
  const res = computeResponse(g, allOk(g));
  const healthyQkd = (l) => l.kind === "qkd";
  let compared = 0;
  for (const [id, s] of res.sites) {
    if (s.keySource !== "qkd" || !s.keyPath) continue;
    const byKm = centers.map((c) => shortestPath(g, [c], id, healthyQkd)).filter(Boolean).sort((a, b) => a.km - b.km)[0];
    assert.ok(s.relays.length <= byKm.nodes.length - 2, `${id}: ${s.relays.length} relays vs ${byKm.nodes.length - 2} on the shortest path`);
    compared++;
  }
  assert.ok(compared >= 20, "most Chattanooga substations have QKD keys");
});

test("Route search: clean QKD route with fewest sites; the shortest-km route is reported for comparison", () => {
  const g = chattanooga();
  const r = findRoute(g, "T1", "T4");
  assert.equal(r.mode, "qkd");
  assert.equal(r.nodes[0], "T1");
  assert.equal(r.nodes.at(-1), "T4");
  assert.ok(r.relaysCanReadKey);
  assert.ok(r.links.every((id) => g.links.get(id).kind === "qkd"), "QKD fibers only");
  assert.ok(r.shortest && r.relays.length <= r.shortest.sites, "never more sites than the shortest-km route");
  assert.ok(r.km >= r.shortest.km, "and never shorter than it");
});

test("Route search: a fiber at the cutoff is blocked; lowering the cutoff blocks an 8.5% fiber", () => {
  const g = chattanooga();
  const base = findRoute(g, "T1", "T4");
  const L = base.links[1];
  const at = findRoute(g, "T1", "T4", { cutoff: 0.11, qberOf: (l) => (l.id === L ? 0.11 : null) });
  assert.ok(at.blocked.includes(L) && !at.links.includes(L), "QBER equal to the cutoff counts as tapped");
  const q = (l) => (l.id === L ? 0.085 : null);
  const loose = findRoute(g, "T1", "T4", { cutoff: 0.11, qberOf: q });
  assert.ok(!loose.blocked.includes(L), "8.5% is allowed under 11%");
  const strict = findRoute(g, "T1", "T4", { cutoff: 0.07, qberOf: q });
  assert.ok(strict.blocked.includes(L) && !strict.links.includes(L), "8.5% is blocked under a 7% cutoff");
  assert.equal(strict.mode, "qkd", "and another clean QKD route exists");
});

test("Route search: a QKD fiber still measuring carries no QKD key", () => {
  const g = chattanooga();
  const base = findRoute(g, "T1", "T4");
  const L = base.links[0];
  const r = findRoute(g, "T1", "T4", { measured: (l) => l.id !== L });
  assert.ok(r.pending.includes(L) && !r.links.includes(L) && !r.blocked.includes(L));
});

test("Route search: every QKD fiber over the cutoff falls back to ML-KEM; no fiber at all is islanded", () => {
  const g = chattanooga();
  const pqc = findRoute(g, "T1", "T4", { qberOf: (l) => (l.kind === "qkd" ? 0.2 : null) });
  assert.equal(pqc.mode, "pqc");
  assert.ok(pqc.ok && !pqc.relaysCanReadKey, "sites on an ML-KEM route only forward ciphertext");
  const cutOff = new Set(g.adjacency.get("T1").map((l) => l.id));
  const island = findRoute(g, "T1", "T4", { inService: (l) => !cutOff.has(l.id) });
  assert.equal(island.mode, "islanded");
  assert.equal(island.ok, false);
});

test("Grover over routes: state vector matches the closed form for every set of marks at N = 8", () => {
  for (let mask = 0; mask < 256; mask++) {
    const marked = [...Array(8).keys()].filter((i) => mask & (1 << i));
    const g = grover(8, marked);
    const M = marked.length;
    if (M === 0) {
      assert.ok(g.probs.every((p) => Math.abs(p - 1 / 8) < 1e-12), "no clean route: output stays uniform");
      continue;
    }
    const th = Math.asin(Math.sqrt(M / 8));
    const s = Math.sin((2 * g.iterations + 1) * th) ** 2;
    marked.forEach((i) => assert.ok(Math.abs(g.probs[i] - s / M) < 1e-12));
    if (M < 8) [...Array(8).keys()].filter((i) => !marked.includes(i)).forEach((i) => assert.ok(Math.abs(g.probs[i] - (1 - s) / (8 - M)) < 1e-12));
  }
  assert.ok(grover(8, [5]).success > 0.94, "one clean route in eight: about 94.5% after 2 iterations");
  for (let M = 1; M <= 8; M++) for (const N of [8, 16]) if (M <= N) assert.ok(grover(N, [...Array(M).keys()]).success >= M / N - 1e-12, `N=${N} M=${M}: Grover never does worse than a random pick`);
});

test("Route candidates (Yen): distinct simple QKD routes, fewest sites first, the first equal to the route search", () => {
  const g = chattanooga();
  const c = candidateRoutes(g, "T1", "T4", { k: 8 });
  assert.equal(c.length, 8);
  const keys = c.map((r) => r.map((l) => l.id).join(","));
  assert.equal(new Set(keys).size, 8, "all different");
  for (const r of c) {
    const seen = new Set(["T1"]);
    let at = "T1";
    for (const l of r) {
      assert.equal(l.kind, "qkd");
      at = l.a === at ? l.b : l.a;
      assert.ok(!seen.has(at), "simple path");
      seen.add(at);
    }
    assert.equal(at, "T4");
  }
  for (let i = 1; i < c.length; i++) assert.ok(c[i].length >= c[i - 1].length, "ranked by number of sites");
  assert.deepEqual(c[0].map((l) => l.id), findRoute(g, "T1", "T4").links);
});

// Cross-check with the Python twin (chattanooga_router.py) and Qiskit Aer (check_grover.py --write-fixture).
test("Route search and Grover match the Python router and the Aer state vector (fixture)", () => {
  const fx = JSON.parse(fs.readFileSync(path.join(here, "fixtures/route_cases.json"), "utf8"));
  const g = chattanooga();
  for (const c of fx.cases) {
    const off = new Set(c.out_of_service);
    const r = findRoute(g, c.start, c.end, { cutoff: c.cutoff, qberOf: (l) => c.qber[l.id] ?? null, inService: (l) => !off.has(l.id) });
    assert.equal(r.mode, c.expect.mode, c.name);
    assert.deepEqual(r.nodes, c.expect.nodes, c.name);
    assert.deepEqual(r.links, c.expect.links, c.name);
    assert.deepEqual(r.relays, c.expect.relays, c.name);
    if (c.detail?.km != null && r.ok) assert.equal(r.km, c.detail.km, `${c.name}: km`);
    if (c.detail?.blocked) assert.deepEqual(r.blocked, c.detail.blocked, `${c.name}: blocked`);
  }
  const k = fx.candidates;
  assert.deepEqual(candidateRoutes(g, k.start, k.end, { k: k.k }).map((r) => r.map((l) => l.id)), k.routes, "Yen candidates");
  for (const e of fx.grover) {
    const out = grover(e.N, e.marked);
    assert.equal(out.iterations, e.iterations, `N=${e.N} marked=${e.marked}: iterations`);
    out.probs.forEach((p, i) => assert.ok(Math.abs(p - e.probs[i]) < 1e-9, `N=${e.N} marked=${e.marked}: index ${i}`));
  }
});

// ---- Regression tests for the 14 Nov audit fixes ----------------------------------------------------------

test("Grover over routes is never worse than a random pick, for every number of clean routes (N = 8, 16)", () => {
  for (const N of [8, 16]) {
    for (let M = 1; M <= N; M++) {
      const g = grover(N, [...Array(M).keys()]);
      assert.ok(g.success >= M / N - 1e-9, `N=${N} M=${M}: ${g.success} < ${M / N}`);
    }
  }
});

test("Exact binomial alarm line: the false-alarm chance per check is at most the normal tail it claims", () => {
  const lnFact = (x) => { let r = 0; for (let i = 2; i <= x; i++) r += Math.log(i); return r; };
  const tail = (n, p, k) => { let t = 0; for (let j = k; j <= n; j++) t += Math.exp(lnFact(n) - lnFact(j) - lnFact(n - j) + j * Math.log(p) + (n - j) * Math.log(1 - p)); return t; };
  for (const [n, p, z] of [[600, 0.033, 4.5], [2240, 0.033, 4.5], [6424, 0.033, 4], [1500, 0.05, 3]]) {
    const a = normalTail(z);
    const k = binomialCriticalCount(n, p, a);
    assert.ok(tail(n, p, k) <= a, `n=${n}: tail at k exceeds alpha`);
    assert.ok(tail(n, p, k - 1) > a, `n=${n}: k is not the smallest count`);
  }
});

test("An alarm does not clear on checks without enough evidence", () => {
  const d = createDetector({ baseline: 0.033, z: 4.5 });
  for (let i = 0; i < 16; i++) d.push({ sifted: 300, errors: 90 });
  let r;
  for (let i = 0; i < 22; i++) r = d.push({ sifted: 30, errors: 9 });
  assert.notEqual(r.status, "ok", "thin evidence must not clear the alarm");
});

test("Yen's route candidates treat parallel fibers as different roots", () => {
  const n = (id) => ({ id, type: "substation", pos: [0, 0] });
  const l = (id, a, b, km) => ({ id, a, b, km, kind: "qkd" });
  const g = buildNetwork({
    nodes: [n("N0"), n("N1"), n("N3"), n("N4")],
    links: [l("L0", "N0", "N1", 5), l("L1", "N0", "N1", 5), l("L3", "N0", "N1", 5), l("L10", "N0", "N1", 6),
            l("L4", "N1", "N3", 4), l("L6", "N1", "N3", 4), l("L2", "N3", "N4", 3), l("L9", "N3", "N4", 4)],
  });
  const routes = candidateRoutes(g, "N0", "N4", { k: 8 }).map((r) => r.map((x) => x.id).join(","));
  assert.equal(new Set(routes).size, routes.length, "routes are distinct");
  const km = (ids) => ids.split(",").reduce((s, id) => s + g.links.get(id).km, 0);
  for (let i = 1; i < routes.length; i++) assert.ok(km(routes[i]) >= km(routes[i - 1]), `route ${i} shorter than route ${i - 1}`);
  const twelve = routes.filter((r) => km(r) === 12);
  assert.equal(twelve.length, 6, "all six 12 km routes come first (3 parallel first hops x 2 x 1)");
});

test("Route search: same site is local; out-of-service fibers are not listed as blocked", () => {
  const ids = [...net.nodes.keys()];
  assert.equal(findRoute(net, ids[0], ids[0]).mode, "local");
  const qkd = [...net.links.values()].find((x) => x.kind === "qkd");
  const r = findRoute(net, ids[0], ids[1], { qberOf: (x) => (x.id === qkd.id ? 0.3 : 0), inService: (x) => x.id !== qkd.id });
  assert.ok(!r.blocked.includes(qkd.id), "an out-of-service fiber is unavailable, not blocked");
});

