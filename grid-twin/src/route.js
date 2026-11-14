// Route search: how site A reaches site B under a QBER cutoff.
// Pure functions: the browser and the node tests share them. Python twin: chattanooga_router.py.
//
// Credit: the cutoff, the blocked-link rule, the km x (1 + 20 x QBER) cost and the ML-KEM fallback come from
// teammate Asheb's earlier ring router (its logic now lives in chattanooga_router.py).
//
// The rule that decides the route (from the team): fewest sites first. There are no quantum repeaters, so every
// site a QKD key passes through is a trusted relay: it measures the key and re-encrypts it for the next fiber.
// Someone inside that site could read the key before it is re-encrypted. So a route minimises the number of
// intermediate sites first, and only then the risk-weighted distance km x (1 + 20 x QBER).
//
// Fallback order:
//  1. "qkd": QKD fibers in service whose QBER is under the cutoff. Intermediate sites are trusted relays.
//  2. "pqc": every fiber still in service, any QBER, on ML-KEM keys agreed end to end. Sites along the way only
//     forward ciphertext they cannot read.
//  3. "islanded": no physical path. Power stays on, local protection, crew dispatched.

import { otherEnd } from "./network.js";

export const DEFAULT_CUTOFF = 0.11;
export const QBER_WEIGHT = 20;

const less = (a, b) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);

/**
 * Dijkstra on (hops, cost) compared lexicographically. cost(link) gives the second component.
 * blockedNodes / blockedLinks are used by Yen's search. Returns { nodes, links, hops, cost } or null.
 */
function search(net, start, end, usable, cost, blockedNodes = new Set(), blockedLinks = new Set()) {
  if (!net.nodes.has(start) || !net.nodes.has(end)) return null;
  const dist = new Map([[start, [0, 0]]]);
  const prev = new Map();
  const done = new Set();
  while (true) {
    let current = null;
    let best = null;
    for (const [id, d] of dist) {
      if (done.has(id)) continue;
      if (best === null || less(d, best) || (!less(best, d) && id < current)) {
        best = d;
        current = id;
      }
    }
    if (current === null) return null;
    if (current === end) break;
    done.add(current);
    for (const link of net.adjacency.get(current)) {
      if (blockedLinks.has(link.id) || !usable(link)) continue;
      const next = otherEnd(link, current);
      if (done.has(next) || blockedNodes.has(next)) continue;
      const d = [best[0] + 1, best[1] + cost(link)];
      const was = dist.get(next);
      if (!was || less(d, was)) {
        dist.set(next, d);
        prev.set(next, { node: current, link });
      }
    }
  }
  const nodes = [end];
  const links = [];
  let at = end;
  while (prev.has(at)) {
    const step = prev.get(at);
    links.unshift(step.link);
    nodes.unshift(step.node);
    at = step.node;
  }
  const [hops, c] = dist.get(end);
  return { nodes, links, hops, cost: c };
}

/** Plain shortest-by-km path (no hop preference), for the comparison line. */
function shortestByKm(net, start, end, usable) {
  if (!net.nodes.has(start) || !net.nodes.has(end)) return null;
  const dist = new Map([[start, 0]]);
  const prev = new Map();
  const done = new Set();
  while (true) {
    let current = null;
    let best = Infinity;
    for (const [id, d] of dist) if (!done.has(id) && (d < best || (d === best && id < current))) (best = d), (current = id);
    if (current === null) return null;
    if (current === end) break;
    done.add(current);
    for (const link of net.adjacency.get(current)) {
      if (!usable(link)) continue;
      const next = otherEnd(link, current);
      const d = best + link.km;
      if (d < (dist.get(next) ?? Infinity)) dist.set(next, d), prev.set(next, { node: current, link });
    }
  }
  const nodes = [end];
  let at = end;
  while (prev.has(at)) (at = prev.get(at).node), nodes.unshift(at);
  return { nodes, km: Math.round(dist.get(end) * 10) / 10, sites: nodes.length - 2 };
}

/**
 * findRoute(net, start, end, { cutoff, qberOf, inService, measured })
 *   qberOf(link)    -> measured QBER (number) or null when unknown (counts as 0 for the cost)
 *   inService(link) -> false for a quarantined fiber
 *   measured(link)  -> false while a QKD fiber is still on probation (too few measurements to judge): it may
 *                      carry ML-KEM traffic, but no QKD key is trusted on it yet
 * Returns { ok, mode, nodes, links, km, maxQber, relays, relaysCanReadKey, blocked, pending, unavailable, shortest, reason }.
 */
export function findRoute(net, start, end, { cutoff = DEFAULT_CUTOFF, qberOf = () => null, inService = () => true, measured = () => true } = {}) {
  const q = (l) => qberOf(l) ?? 0;
  const blocked = [...net.links.values()].filter((l) => l.kind === "qkd" && inService(l) && measured(l) && q(l) >= cutoff).map((l) => l.id).sort();
  const pending = [...net.links.values()].filter((l) => l.kind === "qkd" && inService(l) && !measured(l)).map((l) => l.id).sort();
  const unavailable = [...net.links.values()].filter((l) => !inService(l)).map((l) => l.id).sort();
  const cost = (l) => l.km * (1 + QBER_WEIGHT * q(l));
  const clean = (l) => l.kind === "qkd" && inService(l) && measured(l) && q(l) < cutoff;
  const anyLink = (l) => inService(l);

  const pack = (mode, p, usable, reason) => {
    const nodes = p.nodes;
    const links = p.links.map((l) => l.id);
    const km = Math.round(p.links.reduce((s, l) => s + l.km, 0) * 10) / 10;
    const maxQber = p.links.reduce((m, l) => Math.max(m, l.kind === "qkd" ? q(l) : 0), 0);
    return {
      ok: true,
      mode,
      nodes,
      links,
      km,
      maxQber,
      relays: nodes.slice(1, -1),
      relaysCanReadKey: mode === "qkd",
      blocked,
      pending,
      unavailable,
      shortest: shortestByKm(net, start, end, usable),
      reason,
    };
  };

  if (start === end) return { ok: true, mode: "local", nodes: [start], links: [], km: 0, maxQber: 0, relays: [], relaysCanReadKey: false, blocked, pending, unavailable, shortest: null, reason: "Same site." };
  const quantum = search(net, start, end, clean, cost);
  if (quantum) return pack("qkd", quantum, clean, "A clean QKD route exists under the cutoff.");
  const pqc = search(net, start, end, anyLink, cost);
  if (pqc) return pack("pqc", pqc, anyLink, "No QKD route stays under the cutoff, so keys come from ML-KEM, agreed end to end.");
  return { ok: false, mode: "islanded", nodes: [], links: [], km: 0, maxQber: 0, relays: [], relaysCanReadKey: false, blocked, pending, unavailable, shortest: null, reason: "No fiber path at all. The site runs on local protection; power stays on; crew dispatched." };
}

/**
 * Yen's k shortest simple paths over every in-service QKD fiber, any QBER (Grover's oracle decides which are
 * clean), ranked by fewest sites, then km. Returns up to k arrays of links.
 */
export function candidateRoutes(net, start, end, { k = 8, inService = () => true } = {}) {
  const usable = (l) => l.kind === "qkd" && inService(l);
  const km = (l) => l.km;
  const first = search(net, start, end, usable, km);
  if (!first) return [];
  const A = [first];
  const B = [];
  const key = (p) => p.links.map((l) => l.id).join(",");
  const seen = new Set([key(first)]);
  while (A.length < k) {
    const last = A[A.length - 1];
    for (let i = 0; i < last.nodes.length - 1; i++) {
      const spur = last.nodes[i];
      const rootNodes = last.nodes.slice(0, i + 1);
      const rootLinks = last.links.slice(0, i);
      const blockedLinks = new Set();
      for (const p of A) {
        if (p.nodes.length > i && p.nodes.slice(0, i + 1).every((n, j) => n === rootNodes[j])) blockedLinks.add(p.links[i]?.id);
      }
      const blockedNodes = new Set(rootNodes.slice(0, -1));
      const tail = search(net, spur, end, usable, km, blockedNodes, blockedLinks);
      if (!tail) continue;
      const path = {
        nodes: [...rootNodes.slice(0, -1), ...tail.nodes],
        links: [...rootLinks, ...tail.links],
        hops: i + tail.hops,
        cost: rootLinks.reduce((s, l) => s + l.km, 0) + tail.cost,
      };
      const id = key(path);
      if (!seen.has(id)) seen.add(id), B.push(path);
    }
    if (!B.length) break;
    B.sort((a, b) => a.hops - b.hops || a.cost - b.cost || (key(a) < key(b) ? -1 : 1));
    A.push(B.shift());
  }
  return A.map((p) => p.links);
}

/**
 * Exact state-vector Grover over N = 2^n candidates (N <= 64). marked: Set or array of indices.
 * iterations default: the optimal count floor(pi / (4 asin(sqrt(M/N)))). The textbook round(pi/4 * sqrt(N/M))
 * overshoots when more than half the items are marked (7 of 8 would fall to 22%); the floor form never does.
 * With nothing marked it uses the M = 1 count, and the output stays uniform.
 * Returns { N, M, iterations, probs, success }.
 */
export function groverIterations(N, M) {
  return Math.floor(Math.PI / (4 * Math.asin(Math.sqrt(Math.max(M, 1) / N))) + 1e-9); // 1e-9: at M = N/2 the quotient is 0.999…
}

export function grover(N, marked, iterations) {
  const m = new Set(marked);
  const M = m.size;
  const r = iterations ?? groverIterations(N, M);
  let amp = new Float64Array(N).fill(1 / Math.sqrt(N));
  for (let t = 0; t < r; t++) {
    for (const i of m) amp[i] = -amp[i]; // oracle: phase flip on clean routes
    let mean = 0;
    for (let i = 0; i < N; i++) mean += amp[i];
    mean /= N;
    for (let i = 0; i < N; i++) amp[i] = 2 * mean - amp[i]; // diffuser: inversion about the mean
  }
  const probs = [...amp].map((a) => a * a);
  const success = [...m].reduce((s, i) => s + probs[i], 0);
  return { N, M, iterations: r, probs, success };
}

/** Candidate routes padded to N = 8, with Grover run on the clean ones. rng() picks one sampled route. */
export function groverRoutes(net, start, end, { cutoff = DEFAULT_CUTOFF, qberOf = () => null, inService = () => true, measured = () => true, N = 8, rng = Math.random } = {}) {
  const routes = candidateRoutes(net, start, end, { k: N, inService });
  const clean = (links) => links.every((l) => measured(l) && (qberOf(l) ?? 0) < cutoff);
  const marked = routes.map((r, i) => (clean(r) ? i : -1)).filter((i) => i >= 0);
  const g = grover(N, marked);
  let x = rng();
  let pick = N - 1;
  for (let i = 0; i < N; i++) {
    x -= g.probs[i];
    if (x <= 0) {
      pick = i;
      break;
    }
  }
  const picked = routes[pick] ?? null;
  return { ...g, routes: routes.map((r) => r.map((l) => l.id)), marked, pick, pickClean: picked ? clean(picked) : false };
}
