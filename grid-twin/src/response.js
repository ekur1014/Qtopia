// What the control center does when a quantum link raises an alarm.
//
// Design rules (see DESIGN.md):
//  1. "Isolate" cuts communication paths, never power. Every site stays energized in every state.
//  2. An alarm never takes a link offline by itself. The link stops trusting QKD keys and falls back to
//     post-quantum key exchange (ML-KEM), so an attacker who taps a fiber cannot use the alarm to cut comms.
//  3. Only an operator quarantine removes a link from service; traffic then reroutes around it.
//  4. A QKD key that crosses several links is relayed through trusted nodes: every relay sees the key.

import { shortestPath, controlCenters } from "./network.js";

/** How one link gets its keys right now. */
export function linkKeySource(link, state) {
  if (state.quarantined) return "none";
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
    links.set(link.id, { keySource, carriesData: keySource !== "none" });
  }

  const sites = new Map();
  for (const node of net.nodes.values()) {
    if (node.type === "control") {
      sites.set(node.id, { keySource: "local", keyPath: null, relays: [], dataPath: null, islanded: false, power: "energized" });
      continue;
    }

    const dataPath = shortestPath(net, centers, node.id, (l) => links.get(l.id).carriesData);

    // Major substations get an end-to-end QKD key when a chain of healthy QKD links reaches a control center.
    // Everything else (sub-units, remote sites, or a substation whose QKD chain is broken) uses ML-KEM.
    let keySource = "pqc";
    let keyPath = null;
    if (node.type === "substation") {
      const qkdPath = shortestPath(net, centers, node.id, (l) => links.get(l.id).keySource === "qkd");
      if (qkdPath) {
        keySource = "qkd";
        keyPath = qkdPath;
      }
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
    if (now.keySource === "pqc-fallback") events.push({ level: "warn", text: `${name}: QKD keys no longer trusted. Switched to ML-KEM; link stays up.` });
    else if (now.keySource === "qkd" && was.keySource === "pqc-fallback") events.push({ level: "ok", text: `${name}: error rate back to baseline. QKD keys trusted again.` });
    else if (now.keySource === "none") events.push({ level: "bad", text: `${name}: quarantined by operator. Traffic rerouted.` });
    else if (was.keySource === "none") events.push({ level: "ok", text: `${name}: restored to service.` });
  }
  for (const [id, now] of after.sites) {
    const was = before.sites.get(id);
    if (!was) continue;
    if (!was.islanded && now.islanded) events.push({ level: "bad", text: `${id}: no communication path left. Site runs on local protection; power stays on; crew dispatched.` });
    if (was.islanded && !now.islanded) events.push({ level: "ok", text: `${id}: communication restored.` });
    if (!now.islanded && was.keySource !== now.keySource && net.nodes.get(id).type === "substation") {
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
