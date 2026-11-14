// What the control center does when a quantum link raises an alarm.
//
// Design rules (see DESIGN.md):
//  1. "Isolate" cuts communication paths, never power. Every site stays energized in every state.
//  2. An alarm never takes a link offline by itself. The link stops trusting QKD keys and falls back to
//     post-quantum key exchange (ML-KEM), so an attacker who taps a fiber cannot use the alarm to cut comms.
//  3. Only an operator quarantine removes a link from service; traffic then reroutes around it.
//  4. A QKD key that crosses several links is relayed through trusted nodes: every relay sees the key.
//  5. Decoy mode: a suspicious fiber can keep running on fake traffic (and quantum photons) while real traffic
//     takes another route, so the attack can be measured instead of simply cut off.
//  7. Key paths use the fewest trusted relays (see RELAY_COST): fewer sites that could read the key.
//  6. Real traffic takes the least risky route, not just the shortest: each fiber's cost is its length times
//     (1 + RISK_WEIGHT x risk), where risk comes from its live error-rate evidence.

import { shortestPathTree, pathFromTree, controlCenters } from "./network.js";

export const RISK_WEIGHT = 4;
// No quantum repeaters: every site a QKD key passes through measures and re-encrypts it, so an insider there
// could read it. Key paths minimise the number of such trusted relays first (this cost dwarfs any route's km),
// then distance.
export const RELAY_COST = 1e5;

/** How one link gets its keys right now. */
export function linkKeySource(link, state) {
  if (state.quarantined) return "none";
  if (state.decoy) return "decoy";
  if (link.kind === "pqc") return "pqc";
  return state.alarm === "ok" ? "qkd" : "pqc-fallback";
}

/**
 * linkStates: Map linkId -> { alarm: "ok" | "warning" | "abort", quarantined: boolean }
 * Returns per-link and per-site decisions. Pure: the same inputs always give the same plan.
 */
export function computeResponse(net, linkStates) {
  const centers = controlCenters(net);
  const links = new Map();
  for (const link of net.links.values()) {
    const state = linkStates.get(link.id) ?? { alarm: "ok", quarantined: false };
    const keySource = linkKeySource(link, state);
    links.set(link.id, { keySource, carriesData: keySource !== "none" && keySource !== "decoy", risk: state.risk ?? 0 });
  }

  // One search tree for data paths (any link in service) and one for QKD key paths (healthy QKD links only).
  const dataTree = shortestPathTree(net, centers, (l) => links.get(l.id).carriesData, (l) => l.km * (1 + RISK_WEIGHT * links.get(l.id).risk));
  // Key paths: fewest trusted relays first (each relay re-encrypts the key and could leak it), then km.
  const qkdTree = shortestPathTree(net, centers, (l) => links.get(l.id).keySource === "qkd", (l) => RELAY_COST + l.km);

  const sites = new Map();
  for (const node of net.nodes.values()) {
    if (node.type === "control") {
      sites.set(node.id, { keySource: "local", keyPath: null, relays: [], dataPath: null, islanded: false, power: "energized" });
      continue;
    }

    const dataPath = pathFromTree(dataTree, node.id);

    // A site gets an end-to-end QKD key when a chain of healthy QKD links reaches a control center; otherwise
    // ML-KEM. In the backbone design only major substations have QKD fibers, so sub-units and the remote site
    // use ML-KEM; with QKD on every fiber, they can get QKD keys too.
    let keySource = "pqc";
    let keyPath = null;
    const qkdPath = pathFromTree(qkdTree, node.id);
    if (qkdPath) {
      keySource = "qkd";
      keyPath = qkdPath;
    }
    const relays = keyPath ? keyPath.nodes.slice(1, -1) : [];
    sites.set(node.id, {
      keySource: dataPath ? keySource : "none",
      keyPath: dataPath ? keyPath : null,
      relays: dataPath ? relays : [],
      dataPath,
      islanded: !dataPath,
      power: "energized", // rule 1: the response never de-energizes anything
    });
  }
  return { links, sites };
}

/** Human-readable changes between two responses, for the event log. */
export function describeChanges(net, before, after) {
  const events = [];
  if (!before) return events;
  for (const [id, now] of after.links) {
    const was = before.links.get(id);
    if (!was || was.keySource === now.keySource) continue;
    const l = net.links.get(id);
    const name = `${l.id} (${l.a}–${l.b})`;
    if (now.keySource === "pqc-fallback" && was.keySource === "qkd") events.push({ level: "warn", text: `${name}: QKD keys no longer trusted. Switched to ML-KEM; link stays up.` });
    else if (now.keySource === "qkd" && was.keySource === "pqc-fallback") events.push({ level: "ok", text: `${name}: enough clean measurements, error rate within normal noise. QKD keys trusted.` });
    else if (now.keySource === "none") events.push({ level: "bad", text: `${name}: quarantined by operator. Traffic rerouted.` });
    else if (now.keySource === "decoy") events.push({ level: "info", text: `${name}: decoy mode. Real traffic rerouted; the fiber keeps running on fake traffic so the tap can be measured.` });
    else if (was.keySource === "decoy") events.push({ level: "ok", text: `${name}: decoy mode ended. Real traffic may use this fiber again.` });
    else if (was.keySource === "none") events.push({ level: "ok", text: `${name}: restored to service. On ML-KEM keys until fresh measurements clear it.` });
  }
  for (const [id, now] of after.sites) {
    const was = before.sites.get(id);
    if (!was) continue;
    if (!was.islanded && now.islanded) events.push({ level: "bad", text: `${id}: no communication path left. Site runs on local protection; power stays on; crew dispatched.` });
    if (was.islanded && !now.islanded) events.push({ level: "ok", text: `${id}: communication restored.` });
    if (!now.islanded && was.keySource !== now.keySource && (now.keySource === "qkd" || was.keySource === "qkd")) {
      if (now.keySource === "pqc") events.push({ level: "warn", text: `${id}: no healthy QKD chain to a control center. Keys now from ML-KEM.` });
      if (now.keySource === "qkd" && was.keySource === "pqc") events.push({ level: "ok", text: `${id}: QKD key chain available again.` });
    }
    const wasRelays = (was.relays || []).join(",");
    const nowRelays = (now.relays || []).join(",");
    if (now.keySource === "qkd" && was.keySource === "qkd" && wasRelays !== nowRelays) {
      events.push({ level: "info", text: `${id}: QKD key rerouted${now.relays.length ? ` via trusted node ${now.relays.join(", ")}` : " directly"}.` });
    }
  }
  return events;
}

/** Sites that would lose every communication path if `linkId` stopped carrying real traffic. */
export function sitesStrandedWithout(net, linkStates, linkId) {
  const trial = new Map(linkStates);
  trial.set(linkId, { ...(linkStates.get(linkId) ?? { alarm: "ok" }), decoy: true });
  const before = computeResponse(net, linkStates);
  const after = computeResponse(net, trial);
  return [...after.sites].filter(([id, s]) => s.islanded && !before.sites.get(id).islanded).map(([id]) => id);
}
