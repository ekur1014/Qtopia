// Run with: node --test tests/   (from the grid-twin folder)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runRounds, mulberry32, expectedQber, baselineQber, secretFraction, ABORT_QBER, estimateTapFraction, transmittance } from "../src/bb84.js";
import { createDetector, normalTail } from "../src/detector.js";
import { buildNetwork, shortestPath, controlCenters } from "../src/network.js";
import { computeResponse, sitesStrandedWithout } from "../src/response.js";

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

test("Dual ring (team design): a tapped span sends the key the other way round the ring", () => {
  const raw = JSON.parse(fs.readFileSync(path.join(here, "../data/networks/dualring.json"), "utf8"));
  const g = buildNetwork(raw);
  assert.equal([...g.nodes.values()].filter((n) => n.type === "substation").length, 9, "nine supernodes");
  const ring = raw.links.filter((l) => l.ring);
  assert.equal(ring.length, 9, "one fiber pair per span");
  assert.ok(ring.every((l) => l.kind === "qkd" && l.km === 8.5), "QKD on every 8.5 km span");
  const ok = () => new Map([...g.links.keys()].map((id) => [id, { alarm: "ok", quarantined: false, risk: 0 }]));
  const keyLinks = (st) => computeResponse(g, st).sites.get("N4").keyPath.links.map((l) => l.id);
  assert.deepEqual(keyLinks(ok()), ["C3", "R3"]);
  const st = ok();
  st.set("R3", { alarm: "abort", quarantined: false, risk: 4 });
  assert.deepEqual(keyLinks(st), ["C7", "R6", "R5", "R4"], "the other way round the ring");
});
