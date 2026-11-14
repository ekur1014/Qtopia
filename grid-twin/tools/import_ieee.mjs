// Turns the public IEEE test grids (data/ieee/*.json) into Grid Twin networks (data/networks/*.json).
//
//   node tools/import_ieee.mjs
//
// Assumptions, stated in each output file's meta:
//  - Every bus is a substation site and every power line carries fiber alongside it. Utilities commonly run
//    fiber inside the ground wire of their own power lines (OPGW), so the communication graph follows the grid.
//  - IEEE cases have no coordinates. Positions come from a deterministic force-directed layout, scaled so the
//    median line is about 14 km of fiber. Lengths are therefore illustrative, not the real line lengths.
//  - Roles: the two best-connected buses are control centers; generator buses and buses with 3 or more lines
//    are major substations; the rest are feeder sub-units.
//  - Links between control centers and major substations use QKD (if under 80 km); everything else uses ML-KEM.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const CASES = [
  { id: "ieee14", label: "IEEE 14-bus grid" },
  { id: "ieee30", label: "IEEE 30-bus grid" },
  { id: "ieee57", label: "IEEE 57-bus grid" },
  { id: "ieee118", label: "IEEE 118-bus grid" },
  { id: "ieee300", label: "IEEE 300-bus grid" },
];
const MEDIAN_FIBER_KM = 14;
const ROUTE_FACTOR = 1.3; // must match src/network.js
const QKD_MAX_KM = 80;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fruchterman-Reingold layout, deterministic for a given seed. */
function layout(buses, lines, seed = 7) {
  const n = buses.length;
  const index = new Map(buses.map((b, i) => [b, i]));
  const r = rng(seed);
  const pos = buses.map((_, i) => {
    const a = (2 * Math.PI * i) / n;
    return [Math.cos(a) * 10 + (r() - 0.5), Math.sin(a) * 10 + (r() - 0.5)];
  });
  const area = 400 * n;
  const k = Math.sqrt(area / n);
  let temp = Math.sqrt(area) / 6;
  const edges = lines.map(([a, b]) => [index.get(a), index.get(b)]);
  for (let it = 0; it < 900; it++) {
    const disp = pos.map(() => [0, 0]);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = pos[i][0] - pos[j][0];
        let dy = pos[i][1] - pos[j][1];
        let d = Math.hypot(dx, dy) || 0.01;
        const f = (k * k) / d;
        dx /= d;
        dy /= d;
        disp[i][0] += dx * f;
        disp[i][1] += dy * f;
        disp[j][0] -= dx * f;
        disp[j][1] -= dy * f;
      }
    }
    for (const [i, j] of edges) {
      let dx = pos[i][0] - pos[j][0];
      let dy = pos[i][1] - pos[j][1];
      const d = Math.hypot(dx, dy) || 0.01;
      const f = (d * d) / k;
      dx /= d;
      dy /= d;
      disp[i][0] -= dx * f;
      disp[i][1] -= dy * f;
      disp[j][0] += dx * f;
      disp[j][1] += dy * f;
    }
    for (let i = 0; i < n; i++) {
      const d = Math.hypot(disp[i][0], disp[i][1]) || 0.01;
      const step = Math.min(d, temp);
      pos[i][0] += (disp[i][0] / d) * step;
      pos[i][1] += (disp[i][1] / d) * step;
    }
    temp *= 0.994;
  }
  // Center and scale so the median line has the target fiber length.
  const cx = pos.reduce((s, p) => s + p[0], 0) / n;
  const cy = pos.reduce((s, p) => s + p[1], 0) / n;
  const lens = edges.map(([i, j]) => Math.hypot(pos[i][0] - pos[j][0], pos[i][1] - pos[j][1])).sort((a, b) => a - b);
  const median = lens[Math.floor(lens.length / 2)];
  const scale = MEDIAN_FIBER_KM / ROUTE_FACTOR / median;
  return new Map(buses.map((b, i) => [b, [round((pos[i][0] - cx) * scale), round((pos[i][1] - cy) * scale)]]));
}

const round = (x) => Math.round(x * 10) / 10;

function convert({ id, label }) {
  const src = JSON.parse(fs.readFileSync(path.join(root, "data/ieee", `${id}.json`), "utf8"));
  const degree = new Map(src.buses.map((b) => [b, 0]));
  for (const [a, b] of src.lines) {
    degree.set(a, degree.get(a) + 1);
    degree.set(b, degree.get(b) + 1);
  }
  const gens = new Set(src.generator_buses);
  const byDegree = [...src.buses].sort((a, b) => degree.get(b) - degree.get(a) || a - b);
  const controls = new Set(byDegree.slice(0, 2));
  const pos = layout(src.buses, src.lines);

  const typeOf = (b) => (controls.has(b) ? "control" : gens.has(b) || degree.get(b) >= 3 ? "substation" : "subunit");
  const nodes = src.buses.map((b) => {
    const type = typeOf(b);
    const load = src.load_mw?.[String(b)];
    const role = type === "control" ? "Control center" : gens.has(b) ? "Generator substation" : type === "substation" ? "Substation" : "Feeder sub-unit";
    return { id: `B${b}`, name: `${role} · bus ${b}`, type, pos: pos.get(b), bus: b, generator: gens.has(b), load_mw: load ?? null };
  });
  const nodeType = new Map(nodes.map((n) => [n.bus, n.type]));
  const links = src.lines.map(([a, b], i) => {
    const pa = pos.get(a);
    const pb = pos.get(b);
    const km = round(Math.hypot(pa[0] - pb[0], pa[1] - pb[1]) * ROUTE_FACTOR);
    const backbone = nodeType.get(a) !== "subunit" && nodeType.get(b) !== "subunit";
    return { id: `F${i + 1}`, a: `B${a}`, b: `B${b}`, kind: backbone && km <= QKD_MAX_KM ? "qkd" : "pqc" };
  });

  const out = {
    meta: {
      name: label,
      source: src.source,
      note: "Public IEEE test grid (MATPOWER / UW Power Systems Test Case Archive). Every power line is assumed to carry fiber (OPGW), so the communication graph follows the grid. Positions are a computed layout and fiber lengths are scaled so the median line is about 14 km: illustrative, not real distances.",
      design: "Control centers: the two buses with the most lines. Major substations (QKD backbone): generator buses and buses with 3 or more lines. Feeder sub-units (ML-KEM): the rest. QKD only on backbone fibers under 80 km.",
    },
    nodes,
    links,
  };
  fs.writeFileSync(path.join(root, "data/networks", `${id}.json`), JSON.stringify(out, null, 1) + "\n");
  const counts = { control: 0, substation: 0, subunit: 0 };
  for (const n of nodes) counts[n.type]++;
  const qkd = links.filter((l) => l.kind === "qkd").length;
  return { id, label, file: `data/networks/${id}.json`, nodes: nodes.length, links: links.length, qkd, ...counts };
}

const manifest = [
  { id: "city", label: "Stylized city network", file: "data/network.json", nodes: 17, links: 21, qkd: 11, note: "Hand-made layout: 2 control centers, 6 substations, 8 sub-units, 1 remote site." },
  ...CASES.map(convert),
];
// Keep the real networks (written by import_osm.mjs) at the top of the picker: only the test grids are replaced here.
const idxPath = path.join(root, "data/networks/index.json");
const existing = fs.existsSync(idxPath) ? JSON.parse(fs.readFileSync(idxPath, "utf8")) : [];
fs.writeFileSync(idxPath, JSON.stringify([...existing.filter((m) => m.real), ...manifest], null, 1) + "\n");
for (const m of manifest) console.log(`${m.id.padEnd(8)} ${String(m.nodes).padStart(3)} nodes ${String(m.links).padStart(3)} links  ${String(m.qkd).padStart(3)} QKD  ${m.control ?? ""} ${m.substation ?? ""} ${m.subunit ?? ""}`);
