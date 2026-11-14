// The team lead's teleportation idea, made precise.
//
// "The QKD tells us how entangled [two nodes] are. If the QBER is below about 11%, we're good on our entanglement,
// and we'd be able to teleport between any node where the QBER is low enough. Entanglement swapping teleports
// one half of an entangled pair." (team recording, Saturday)
//
// What this module assumes, stated plainly:
//  - Our fibers run prepare-and-measure BB84. If the same fibers ran an entanglement-based protocol (BBM92), a
//    fiber's measured error rate Q would describe the quality of the entangled pairs it delivers.
//  - Below 11%, one-way entanglement distillation still works (the same threshold as BB84's secret key,
//    Shor and Preskill 2000), so a fiber under 11% can supply usable entanglement.
//  - Entanglement swapping at intermediate nodes joins pairs into one end-to-end pair. With independent bit and
//    phase errors on each hop, errors combine like XOR: (1 - 2 Q_end) = product of (1 - 2 Q_i).
//  - Unlike relaying a QKD key, swapping nodes never hold the key: they are not trusted nodes.
// Teleportation still needs two classical bits per qubit, so nothing travels faster than the fiber.

import { shortestPathTree, pathFromTree } from "./network.js";

export const TELEPORT_QBER_LIMIT = 0.11;

/** End-to-end error rate after swapping across hops with error rates qs. */
export function composeQber(qs) {
  let prod = 1;
  for (const q of qs) prod *= 1 - 2 * q;
  return (1 - prod) / 2;
}

/**
 * Best entanglement-swapping route from any control center to `target`, using only quantum fibers that are in
 * service and under the 11% limit. The route minimizes the end-to-end error rate, which is a shortest path with
 * weights -ln(1 - 2 Q_i). linkQ: Map linkId -> current error rate, or null when the fiber carries no quantum signal.
 */
export function teleportRoute(net, centers, target, linkQ) {
  const usable = (l) => {
    const q = linkQ.get(l.id);
    return q != null && q < TELEPORT_QBER_LIMIT;
  };
  const tree = shortestPathTree(net, centers, usable, (l) => -Math.log(1 - 2 * linkQ.get(l.id)));
  const path = pathFromTree(tree, target);
  if (!path) return null;
  const qs = path.links.map((l) => linkQ.get(l.id));
  const qEnd = composeQber(qs);
  return { ...path, hopQbers: qs, qber: qEnd, ok: qEnd < TELEPORT_QBER_LIMIT, swaps: Math.max(0, path.links.length - 1) };
}
