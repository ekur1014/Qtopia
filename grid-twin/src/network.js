// The utility's communication network as a graph, plus the two path searches the response policy needs.
// Pure functions: the browser and the node tests share them.

const ROUTE_FACTOR = 1.3; // fiber follows roads and rights-of-way, so it is longer than the straight line

export function buildNetwork(raw) {
  const nodes = new Map();
  for (const n of raw.nodes) nodes.set(n.id, { ...n });

  const links = new Map();
  const adjacency = new Map([...nodes.keys()].map((id) => [id, []]));
  for (const l of raw.links) {
    const a = nodes.get(l.a);
    const b = nodes.get(l.b);
    if (!a || !b) throw new Error(`link ${l.id} references a missing node (${l.a} or ${l.b})`);
    const straight = Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1]);
    const km = l.km ?? Math.round(straight * ROUTE_FACTOR * 10) / 10;
    const link = { ...l, km };
    links.set(l.id, link);
    adjacency.get(l.a).push(link);
    adjacency.get(l.b).push(link);
  }
  return { meta: raw.meta, nodes, links, adjacency };
}

export function otherEnd(link, nodeId) {
  return link.a === nodeId ? link.b : link.a;
}

/**
 * Shortest path (by fiber km) from any of `sources` to `target`, using only links where usable(link) is true.
 * Returns { nodes: [source ... target], links: [...], km } or null when the target cannot be reached.
 */
export function shortestPath(net, sources, target, usable) {
  const dist = new Map();
  const prev = new Map(); // nodeId -> { node, link }
  const done = new Set();
  for (const s of sources) dist.set(s, 0);

  while (true) {
    let current = null;
    let best = Infinity;
    for (const [id, d] of dist) {
      if (!done.has(id) && d < best) {
        best = d;
        current = id;
      }
    }
    if (current === null) return null;
    if (current === target) break;
    done.add(current);
    for (const link of net.adjacency.get(current)) {
      if (!usable(link)) continue;
      const next = otherEnd(link, current);
      const d = best + link.km;
      if (d < (dist.get(next) ?? Infinity)) {
        dist.set(next, d);
        prev.set(next, { node: current, link });
      }
    }
  }

  const nodes = [target];
  const links = [];
  let at = target;
  while (prev.has(at)) {
    const step = prev.get(at);
    links.unshift(step.link);
    nodes.unshift(step.node);
    at = step.node;
  }
  return { nodes, links, km: dist.get(target) };
}

export function controlCenters(net) {
  return [...net.nodes.values()].filter((n) => n.type === "control").map((n) => n.id);
}
