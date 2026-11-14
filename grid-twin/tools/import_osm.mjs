// Turns public OpenStreetMap power data (the data behind OpenInfraMap) into a Grid Twin network:
// substations become sites, power lines become fiber links (fiber is assumed to run with the line, OPGW),
// and each link keeps its real route and length.
//
//   node grid-twin/tools/import_osm.mjs chattanooga   # data/osm/chattanooga.overpass.json -> data/networks/chattanooga.json
//   node grid-twin/tools/import_osm.mjs tennessee500  # data/osm/tennessee500.overpass.json -> data/networks/tennessee500.json
//
// The raw Overpass responses are kept in data/osm/ so the import is reproducible offline.
// Data © OpenStreetMap contributors, available under the Open Database License (ODbL).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const REGIONS = {
  chattanooga: {
    name: "Chattanooga, TN: EPB and TVA grid (real)",
    label: "Chattanooga real grid (OpenStreetMap)",
    bbox: "34.90,-85.55,35.30,-84.95",
    // Transmission (161 kV and up) is the QKD backbone; 46 kV and below is distribution, on ML-KEM.
    backboneKv: 161,
    qkdMaxKm: 80,
    nodeScale: 0.6, // substations here can be a few hundred metres apart
    note: "Real Chattanooga substations and power lines (OpenStreetMap, the data behind OpenInfraMap). We assume fiber runs along every line. Which two sites are control centers is our guess: the real locations are not public.",
    design: "QKD on the 161 kV and 500 kV transmission network (TVA and EPB transmission substations); ML-KEM on the 46 kV lines to EPB distribution substations, as the mentors advised (no QKD to neighborhoods or homes). Key hubs: the two transmission substations with the most QKD fibers (assumed).",
  },
  tennessee500: {
    name: "Tennessee 500 kV backbone (real)",
    label: "Tennessee 500 kV backbone (OpenStreetMap)",
    bbox: "34.98,-90.31,36.68,-81.65",
    backboneKv: 500,
    qkdMaxKm: 80,
    nodeScale: 4,
    note: "TVA's 500 kV backbone across Tennessee (OpenStreetMap). We assume fiber runs along every line. Eight spans are longer than about 80 km, past what fiber QKD reaches without relay stations.",
    design: "QKD only on 500 kV spans under 80 km; longer spans would need trusted relay stations (or, as a roadmap idea, satellite links) and run on ML-KEM here. Key hubs: the two substations with the most QKD fibers (assumed).",
  },
};

const region = process.argv[2] ?? "chattanooga";
const cfg = REGIONS[region];
if (!cfg) throw new Error(`unknown region ${region}; one of ${Object.keys(REGIONS)}`);
const raw = JSON.parse(readFileSync(join(root, `data/osm/${region}.overpass.json`), "utf8"));

// Geometry helpers -----------------------------------------------------------------------------
const lats = raw.elements.flatMap((e) => (e.geometry ?? []).map((g) => g.lat));
const lons = raw.elements.flatMap((e) => (e.geometry ?? []).map((g) => g.lon));
const lat0 = (Math.min(...lats) + Math.max(...lats)) / 2;
const lon0 = (Math.min(...lons) + Math.max(...lons)) / 2;
const kx = 111.32 * Math.cos((lat0 * Math.PI) / 180);
const kz = 110.57;
const proj = (g) => [(g.lon - lon0) * kx, -(g.lat - lat0) * kz]; // km east, km south (north is up on screen)
const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
const kv = (tags) => Math.max(0, ...String(tags?.voltage ?? "").split(/[;,]/).map((v) => Number(v) / 1000).filter(Number.isFinite));
const round = (x, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

function simplify(points, tol) {
  // Douglas-Peucker: keeps the route's shape with far fewer points.
  if (points.length < 3) return points;
  const [a, b] = [points[0], points.at(-1)];
  let worst = 0;
  let at = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const len = dist(a, b) || 1e-9;
    const d = Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / len;
    if (d > worst) ((worst = d), (at = i));
  }
  if (worst <= tol) return [a, b];
  return [...simplify(points.slice(0, at + 1), tol).slice(0, -1), ...simplify(points.slice(at), tol)];
}

// Sites: substations and power plants ---------------------------------------------------------------
const sites = [];
for (const e of raw.elements) {
  const p = e.tags?.power;
  if (e.type !== "way" || (p !== "substation" && p !== "plant") || !e.geometry) continue;
  const poly = e.geometry.map(proj);
  const c = poly.reduce((s, q) => [s[0] + q[0] / poly.length, s[1] + q[1] / poly.length], [0, 0]);
  const xs = poly.map((q) => q[0]);
  const zs = poly.map((q) => q[1]);
  sites.push({
    osm: e.id,
    plant: p === "plant",
    name: e.tags.name ?? null,
    operator: e.tags.operator ?? null,
    kv: kv(e.tags),
    source: e.tags["plant:source"] ?? null,
    c,
    box: [Math.min(...xs) - 0.12, Math.min(...zs) - 0.12, Math.max(...xs) + 0.12, Math.max(...zs) + 0.12], // 120 m margin
  });
}
function siteAt(pt) {
  let best = null;
  for (const s of sites) {
    if (pt[0] < s.box[0] || pt[0] > s.box[2] || pt[1] < s.box[1] || pt[1] > s.box[3]) continue;
    // Prefer a substation over the plant around it (the switchyard is where lines end).
    if (!best || (best.plant && !s.plant) || dist(pt, s.c) < dist(pt, best.c)) best = s;
  }
  return best;
}

// Lines, joined end to end into site-to-site links -------------------------------------------------
const rawWays = raw.elements.filter((e) => e.type === "way" && e.tags?.power === "line" && e.geometry?.length > 1);
// A line often tees into the middle of another, so split every line at each tower it shares with another line;
// then every junction is a line end and lines can be followed end to end.
const uses = new Map();
for (const w of rawWays) for (const n of w.nodes) uses.set(n, (uses.get(n) ?? 0) + 1);
const ways = [];
for (const w of rawWays) {
  let from = 0;
  for (let i = 1; i < w.nodes.length; i++) {
    if (i === w.nodes.length - 1 || uses.get(w.nodes[i]) > 1) {
      ways.push({ tags: w.tags, nodes: w.nodes.slice(from, i + 1), geometry: w.geometry.slice(from, i + 1) });
      from = i;
    }
  }
}
const atEnd = new Map(); // OSM node id -> ways ending there
for (const w of ways) {
  w.pts = w.geometry.map(proj);
  w.len = w.pts.slice(1).reduce((s, q, i) => s + dist(w.pts[i], q), 0);
  w.kv = kv(w.tags);
  for (const n of [w.nodes[0], w.nodes.at(-1)]) atEnd.set(n, [...(atEnd.get(n) ?? []), w]);
}
const endSite = new Map(); // OSM node id -> site, for line ends inside a substation or plant
for (const w of ways) for (const [n, pt] of [[w.nodes[0], w.pts[0]], [w.nodes.at(-1), w.pts.at(-1)]]) {
  const s = siteAt(pt);
  if (s) endSite.set(n, s);
}

const edges = new Map(); // "osmA|osmB" -> best edge
function walk(start, fromNode, way, used, len, pts, maxKv, depth, tees) {
  if (depth > 40 || len > 120) return;
  const forward = way.nodes[0] === fromNode;
  const seq = forward ? way.pts : [...way.pts].reverse();
  const toNode = forward ? way.nodes.at(-1) : way.nodes[0];
  const nlen = len + way.len;
  const npts = [...pts, ...seq.slice(pts.length ? 1 : 0)];
  const nkv = Math.max(maxKv, way.kv);
  const site = endSite.get(toNode);
  if (site && site !== start) {
    const key = [start.osm, site.osm].sort().join("|");
    const prev = edges.get(key);
    const a = start.osm < site.osm ? start : site;
    const route = a === start ? npts : [...npts].reverse();
    if (!prev || nlen < prev.len) edges.set(key, { a, b: a === start ? site : start, len: nlen, kv: Math.max(nkv, prev?.kv ?? 0), pts: route, tees });
    return;
  }
  if (site === start) return; // looped back
  const nexts = (atEnd.get(toNode) ?? []).filter((n) => !used.has(n));
  const tee = nexts.length > 1 ? 1 : 0; // a branch point: this route shares the line with others
  for (const next of nexts) walk(start, toNode, next, new Set([...used, next]), nlen, npts, nkv, depth + 1, tees + tee);
}
for (const w of ways) {
  for (const n of [w.nodes[0], w.nodes.at(-1)]) {
    const s = endSite.get(n);
    if (s) walk(s, n, w, new Set([w]), 0, [], 0, 0, 0);
  }
}
// Through a tee, every pair of substations on the line looks connected. Keep a teed route only if no other
// substation c has both legs (a-c and c-b) shorter: then the line's own chain of substations carries it.
// Routes with no tee are real point-to-point lines and are always kept.
{
  const len = new Map([...edges.values()].map((e) => [`${e.a.osm}|${e.b.osm}`, e.len]));
  const L = (x, y) => len.get(x.osm < y.osm ? `${x.osm}|${y.osm}` : `${y.osm}|${x.osm}`);
  const ends = [...new Set([...edges.values()].flatMap((e) => [e.a, e.b]))];
  for (const [k, e] of [...edges]) {
    if (!e.tees) continue;
    if (ends.some((c) => c !== e.a && c !== e.b && L(e.a, c) < e.len && L(c, e.b) < e.len)) edges.delete(k);
  }
}

// Keep the largest connected piece -------------------------------------------------------------------
const adj = new Map();
for (const e of edges.values()) {
  adj.set(e.a, [...(adj.get(e.a) ?? []), e.b]);
  adj.set(e.b, [...(adj.get(e.b) ?? []), e.a]);
}
let best = [];
const seen = new Set();
for (const s of adj.keys()) {
  if (seen.has(s)) continue;
  const comp = [];
  const stack = [s];
  seen.add(s);
  while (stack.length) {
    const x = stack.pop();
    comp.push(x);
    for (const y of adj.get(x)) if (!seen.has(y)) (seen.add(y), stack.push(y));
  }
  if (comp.length > best.length) best = comp;
}
const keep = new Set(best);
const kept = [...edges.values()].filter((e) => keep.has(e.a) && keep.has(e.b));

// Site voltage: its own tag, or the highest line that reaches it.
for (const s of keep) s.kvAll = Math.max(s.kv, ...kept.filter((e) => e.a === s || e.b === s).map((e) => e.kv));

// Recenter on what is kept.
const cx = best.reduce((t, s) => t + s.c[0], 0) / best.length;
const cz = best.reduce((t, s) => t + s.c[1], 0) / best.length;
const P = (q) => [round(q[0] - cx), round(q[1] - cz)];

// Ids, types and links ----------------------------------------------------------------------------
const backbone = (s) => s.kvAll >= cfg.backboneKv || s.plant;
const sorted = [...keep].sort((a, b) => b.kvAll - a.kvAll || a.c[0] - b.c[0]);
let nT = 0;
let nD = 0;
for (const s of sorted) s.id = backbone(s) ? `T${++nT}` : `D${++nD}`;
const linksOut = kept.map((e, i) => {
  const qkd = backbone(e.a) && backbone(e.b) && e.kv >= cfg.backboneKv && e.len < cfg.qkdMaxKm;
  return { id: `L${i + 1}`, a: e.a.id, b: e.b.id, kind: qkd ? "qkd" : "pqc", km: round(e.len, 1), kv: e.kv, path: simplify(e.pts, 0.08).map(P) };
});
// Key hubs (assumed): the two backbone sites with the most QKD fibers, not both at the same place.
const qdeg = new Map();
for (const l of linksOut) if (l.kind === "qkd") for (const id of [l.a, l.b]) qdeg.set(id, (qdeg.get(id) ?? 0) + 1);
// Named sites first, so the hubs are places people recognise.
const ranked = sorted.filter((s) => backbone(s) && !s.plant).sort((a, b) => !!b.name - !!a.name || (qdeg.get(b.id) ?? 0) - (qdeg.get(a.id) ?? 0) || b.kvAll - a.kvAll);
const hubs = [ranked[0], ranked.find((s) => s !== ranked[0] && dist(s.c, ranked[0].c) > 5) ?? ranked[1]];

const label = (s) => {
  const base = s.name ?? `Unnamed ${s.plant ? "power plant" : "substation"}${s.kvAll ? ` (${s.kvAll} kV)` : ""}`;
  return s.operator && !base.includes(s.operator) ? `${base} · ${s.operator}` : base;
};
const nodes = sorted.map((s) => ({
  id: s.id,
  name: hubs.includes(s) ? `${label(s)} · control center (assumed)` : label(s),
  type: hubs.includes(s) ? "control" : backbone(s) ? "substation" : "subunit",
  pos: P(s.c),
  // A short on-map name for named transmission sites and plants (the rest show their id until focused).
  ...(s.name && backbone(s) ? { short: s.name.replace(/\s+(Substation|Switchyard|Generating Station|Power Plant|Plant)$/i, "").replace(/\s+Fossil$/i, "") } : {}),
  kv: s.kvAll || null,
  osm: `https://www.openstreetmap.org/way/${s.osm}`,
  ...(s.plant ? { generator: true, source: s.source } : {}),
}));

const out = {
  // proj lets other pages (the 2D map) turn positions back into latitude and longitude:
  // lon = lon0 + (x + cx) / kx, lat = lat0 - (z + cz) / kz.
  meta: { name: cfg.name, nodeScale: cfg.nodeScale, proj: { lat0: round(lat0, 6), lon0: round(lon0, 6), kx: round(kx, 6), kz, cx: round(cx, 6), cz: round(cz, 6) }, source: `OpenStreetMap via the Overpass API, bbox ${cfg.bbox}, fetched ${new Date().toISOString().slice(0, 10)}. © OpenStreetMap contributors, ODbL.`, note: cfg.note, design: cfg.design, real: true },
  nodes,
  links: linksOut,
};
writeFileSync(join(root, `data/networks/${region}.json`), JSON.stringify(out));
// The same data as a script, for pages opened straight from disk (they cannot fetch local JSON).
writeFileSync(join(root, `data/networks/${region}.js`), `// Generated by tools/import_osm.mjs. Data © OpenStreetMap contributors, ODbL.\n(window.QRYPT_NETWORKS = window.QRYPT_NETWORKS || {})[${JSON.stringify(region)}] = ${JSON.stringify(out)};\n`);
const count = (t) => nodes.filter((n) => n.type === t).length;
console.log(`${region}: ${nodes.length} sites (${count("control")} key hubs, ${count("substation")} transmission, ${count("subunit")} distribution), ${linksOut.length} links (${linksOut.filter((l) => l.kind === "qkd").length} QKD); kept ${best.length} of ${adj.size} connected sites; ${sites.length} sites in the raw data`);
console.log("key hubs:", hubs.map((h) => `${h.id} ${label(h)}`).join(" | "));
const kms = linksOut.map((l) => l.km).sort((a, b) => a - b);
console.log("link km: min", kms[0], "median", kms[kms.length >> 1], "max", kms.at(-1));

// Register it in the network picker.
const idxPath = join(root, "data/networks/index.json");
const idx = JSON.parse(readFileSync(idxPath, "utf8")).filter((m) => m.id !== region);
const entry = { id: region, label: cfg.label, file: `data/networks/${region}.json`, nodes: nodes.length, links: linksOut.length, qkd: linksOut.filter((l) => l.kind === "qkd").length, real: true };
const order = Object.keys(REGIONS); // real networks first, in this order; then the simulation lab
const real = [entry, ...idx.filter((m) => m.real)].sort((x, y) => order.indexOf(x.id) - order.indexOf(y.id));
writeFileSync(idxPath, JSON.stringify([...real, ...idx.filter((m) => !m.real)], null, 1) + "\n");
