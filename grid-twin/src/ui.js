// The glass control panel: stats, controls, inspector with a live chart, and the event log.
import { ABORT_QBER, secretFraction } from "./bb84.js";
import { normalTail } from "./detector.js";

const TYPE_LABEL = {
  control: "Control center",
  substation: "Major substation",
  remote: "Remote substation",
  subunit: "Feeder sub-unit",
};
const STATUS_PILL = {
  ok: ["Healthy", "ok"],
  warning: ["Above baseline", "warn"],
  abort: ["No key possible", "bad"],
  pending: ["Measuring", "gold"],
};
const KEY_LABEL = {
  qkd: ["QKD keys", "ok"],
  "pqc-fallback": ["ML-KEM fallback", "warn"],
  pqc: ["ML-KEM (post-quantum)", "pqc"],
  none: ["Out of service", "off"],
  decoy: ["Decoy traffic only", "decoy"],
  local: ["Control center (holds the keys)", "gold"],
};

const pct = (x, d = 1) => `${(100 * x).toFixed(d)}%`;
const pill = ([text, tone]) => `<span class="pill pill--${tone}">${text}</span>`;

// Footer: what is real and what is simulated, per kind of network.
const FOOT = {
  real: "<b>What is real.</b> Substations, lines and their lengths (OpenStreetMap). <b>Simulated:</b> the photons, the fiber noise and the spy, checked against Qiskit, CUDA-Q, Guppy and qBraid. Assumed: fiber along every power line, and which sites hold the keys. Only data links are ever cut, never power.",
  lab: "<b>What this is.</b> A test network: the layout is made up. <b>Simulated:</b> the photons, the fiber noise and the spy, checked against Qiskit, CUDA-Q, Guppy and qBraid. Only data links are ever cut, never power.",
};

const MODE_PILL = {
  qkd: ["QKD route", "ok"],
  pqc: ["ML-KEM fallback", "pqc"],
  islanded: ["No path: islanded", "bad"],
  local: ["Same site", "gold"],
};

export function createUI({ panel, incidentsEl = null, net, networks = [], currentNetwork, coverage = "backbone", engines = {}, routeDefaults = null, handlers }) {
  const engineIds = Object.keys(engines);
  const startedAt = performance.now();
  const opt = (m) => `<option value="${m.id}"${m.id === currentNetwork ? " selected" : ""}>${m.label} · ${m.nodes} sites</option>`;
  const netOptions =
    `<optgroup label="Real grid">${networks.filter((m) => m.real).map(opt).join("")}</optgroup>` +
    `<optgroup label="Test networks (not real)">${networks.filter((m) => !m.real).map(opt).join("")}</optgroup>`;
  // Route pickers: control centers first, then substations, then the rest, each by name.
  const RANK = { control: 0, substation: 1, remote: 2, subunit: 3 };
  const siteName = (id) => {
    const n = net.nodes.get(id);
    return n ? (n.short ?? n.name) : id;
  };
  const siteOptions = (selected) =>
    [...net.nodes.values()]
      .sort((a, b) => (RANK[a.type] ?? 9) - (RANK[b.type] ?? 9) || (a.short ?? a.name).localeCompare(b.short ?? b.name))
      .map((n) => `<option value="${n.id}"${n.id === selected ? " selected" : ""}>${n.short ?? n.name} · ${n.id}${n.type === "control" ? " · control center" : ""}</option>`)
      .join("");
  panel.innerHTML = `
    <section class="section">
      <h2>Network</h2>
      <select class="select" data-input="network" aria-label="Choose a network">${netOptions}</select>
      <div class="control__note q-adv">${net.meta?.note ?? ""}${net.meta?.design_detail ? ` ${net.meta.design_detail}` : ""}${net.meta?.real ? ` <a href="https://openinframap.org/#11.68/35.0463/-85.2892/A,B,L,P" target="_blank" rel="noopener">Open the same area on OpenInfraMap</a>.` : ""}</div>
      <div class="q-adv">
      <label class="field" for="coverage">QKD coverage</label>
      <select class="select" id="coverage" data-input="coverage" aria-label="Which fibers run QKD">
        <option value="backbone"${coverage === "backbone" ? " selected" : ""}>Backbone only: control centers and major substations (our design)</option>
        <option value="all"${coverage === "all" ? " selected" : ""}>Every fiber (early team sketch)</option>
      </select>
      </div>
    </section>
    <section class="section try">
      <h2>Try it</h2>
      <p class="try__text"><b>Green fibers</b> carry keys sent as single photons (QKD). Choose <b>Eavesdrop</b> at the bottom of the screen and click a green fiber, or let us do it:</p>
      <button class="btn btn--try q-btn" data-action="demo">Tap a fiber for me</button>
      <p class="try__after">Then watch the incident card: the network notices the spy in under a second of simulated time and protects itself, with no one at the controls.</p>
      <button class="btn btn--reset q-btn" data-action="reset-demo">Reset the demo</button>
    </section>
    <section class="section" data-selected>
      <h2>Selected</h2>
      <label class="field field--first" for="jump">Find a fiber or site</label>
      <select class="select" id="jump" data-input="jump" aria-label="Select a fiber or site">
        <option value="">Choose…</option>
        <optgroup label="Sites">${[...net.nodes.values()].map((n) => `<option value="node:${n.id}">${n.id} · ${n.name}</option>`).join("")}</optgroup>
        <optgroup label="Fibers">${[...net.links.values()].map((l) => `<option value="link:${l.id}">${l.id} · ${l.a}–${l.b} · ${l.kind === "qkd" ? "QKD" : "ML-KEM"} · ${l.km} km</option>`).join("")}</optgroup>
      </select>
      <div data-inspector></div>
    </section>
    <section class="section route">
      <h2>Find a route</h2>
      <p class="route__text">Pick two sites. A QKD key is decrypted and re-encrypted at every site it passes (there are no quantum repeaters), so someone inside any of them could read it. The search uses <b>as few sites as possible</b>, then the shortest, cleanest fibers.</p>
      <div class="route__pick">
        <label class="field" for="route-from">From</label>
        <select class="select" id="route-from" data-input="route-from">${siteOptions(routeDefaults?.from)}</select>
        <label class="field" for="route-to">To</label>
        <select class="select" id="route-to" data-input="route-to">${siteOptions(routeDefaults?.to)}</select>
      </div>
      <div class="control">
        <div class="control__row"><span>Error-rate cutoff</span><span class="control__val" data-v="cutoff">11%</span></div>
        <input type="range" min="1" max="25" step="0.5" value="11" data-input="cutoff" aria-label="Error-rate cutoff: fibers at or above it count as tapped" />
        <div class="control__note">A fiber at or above the cutoff counts as tapped and is skipped. 11% is the Shor–Preskill limit: above it no secret key can be made.</div>
      </div>
      <div class="btns">
        <button class="btn btn--try q-btn" data-action="route-show">Show this route</button>
        <button class="btn" data-action="route-clear" hidden>Clear route</button>
      </div>
      <div class="route__out" data-route aria-live="polite"></div>
    </section>
    <section class="section">
      <h2>Network now</h2>
      <div class="stats">
        <div class="stat stat--ok"><div class="stat__v" data-s="healthy">–</div><div class="stat__l">QKD fibers healthy</div></div>
        <div class="stat stat--warn"><div class="stat__v" data-s="alerts">–</div><div class="stat__l">Fibers in alarm</div></div>
        <div class="stat"><div class="stat__v" data-s="qkdsites">–</div><div class="stat__l">Substations on QKD keys</div></div>
        <div class="stat stat--bad"><div class="stat__v" data-s="islanded">–</div><div class="stat__l">Sites cut off (power still on)</div></div>
      </div>
    </section>

    <section class="section">
      <h2>Eavesdropper</h2>
      <div class="control">
        <div class="control__row"><span>Share of photons intercepted</span><span class="control__val" data-v="eve">100%</span></div>
        <input type="range" min="2" max="100" step="1" value="100" data-input="eve" aria-label="Share of photons the eavesdropper intercepts" />
        <div class="control__note">How many photons the next tap reads. If a tapped fiber is selected, this changes its tap too. A careful spy reads only a few percent to hide in the fiber's normal noise. (<b>Tap a fiber for me</b> always reads 100%.)</div>
      </div>
      <h2 class="q-adv">Detection</h2>
      <div class="control q-adv">
        <div class="control__row"><span>Alarm sensitivity</span><span class="control__val" data-v="z">4.5 σ</span></div>
        <input type="range" min="2" max="6" step="0.5" value="4.5" data-input="z" aria-label="Alarm sensitivity in standard deviations" />
        <div class="control__note" data-v="znote"></div>
      </div>
      <label class="check" for="autoresponse"><input type="checkbox" id="autoresponse" data-input="autoresponse" checked aria-label="Automatic response" /> <span><b>Automatic response.</b> When a fiber alarms, the network switches its keys to ML-KEM, reroutes data, measures the tap and calls a crew, on its own. Only you can take a fiber offline.</span></label>
      <h2 class="q-adv">Layers</h2>
      <label class="check q-adv" for="teleport"><input type="checkbox" id="teleport" data-input="teleport" aria-label="Teleportation view" /> <span><b>Teleportation view (future).</b> Shows which fibers are clean enough (under 11% errors) for teleportation, and the path each site would use. Relay sites on that path never see the key.</span></label>
      <div class="btns">
        <button class="btn btn--danger" data-action="clear-eves">Remove all taps</button>
        <button class="btn btn--ok" data-action="restore-all">Restore all fibers</button>
        <button class="btn q-adv" data-action="pause">Pause</button>
      </div>
    </section>


    <section class="section q-adv">
      <h2>Event log</h2>
      <ul class="log" data-log></ul>
    </section>

    <section class="section foot" data-foot>
      ${FOOT[net.meta?.real ? "real" : "lab"]}
    </section>`;

  const $ = (sel) => panel.querySelector(sel);
  const inspector = $("[data-inspector]");
  const logEl = $("[data-log]");
  let inspectorKey = null;
  let lastSelShown = null;
  let chart = null;

  // Controls
  const eveInput = $('[data-input="eve"]');
  const zInput = $('[data-input="z"]');
  const fill = (input) => input.style.setProperty("--fill", `${(100 * (input.value - input.min)) / (input.max - input.min)}%`);
  const showZ = () => {
    const z = Number(zInput.value);
    $('[data-v="z"]').textContent = `${z.toFixed(1)} σ`;
    const p = normalTail(z);
    $('[data-v="znote"]').innerHTML = `Higher means fewer false alarms, but a careful spy hides longer. False-alarm chance per check with nobody listening: at most <b>${p < 1e-4 ? p.toExponential(1) : pct(p, 2)}</b>. (The alarm fires when a fiber's error rate is ${z.toFixed(1)} standard deviations above its own normal level.)`;
    fill(zInput);
  };
  eveInput.addEventListener("input", () => {
    $('[data-v="eve"]').textContent = `${eveInput.value}%`;
    fill(eveInput);
    handlers.onEveStrength(Number(eveInput.value) / 100);
  });
  zInput.addEventListener("input", () => {
    showZ();
    handlers.onZ(Number(zInput.value));
  });
  fill(eveInput);
  showZ();
  $('[data-input="network"]').addEventListener("change", (e) => handlers.onNetwork(e.target.value));
  $('[data-input="autoresponse"]').addEventListener("change", (e) => handlers.onAutoResponse(e.target.checked));
  $('[data-input="teleport"]').addEventListener("change", (e) => handlers.onTeleportView(e.target.checked));
  $('[data-input="coverage"]').addEventListener("change", (e) => handlers.onCoverage(e.target.value));
  // Route search inputs: the cutoff and the two sites update a shown route live.
  const cutoffInput = $('[data-input="cutoff"]');
  const routeFrom = $('[data-input="route-from"]');
  const routeTo = $('[data-input="route-to"]');
  let routeOn = false;
  const routeArgs = () => ({ from: routeFrom.value, to: routeTo.value, cutoff: Number(cutoffInput.value) / 100 });
  const showCutoff = () => {
    $('[data-v="cutoff"]').textContent = `${Number(cutoffInput.value).toFixed(cutoffInput.value % 1 ? 1 : 0)}%`;
    fill(cutoffInput);
  };
  showCutoff();
  cutoffInput.addEventListener("input", () => {
    showCutoff();
    handlers.onRoute?.(routeArgs(), routeOn);
  });
  for (const el of [routeFrom, routeTo]) el.addEventListener("change", () => handlers.onRoute?.(routeArgs(), routeOn));
  const jump = $('[data-input="jump"]');
  jump.addEventListener("change", () => {
    const [type, id] = jump.value.split(":");
    handlers.onJump(type || null, id || null);
  });

  panel.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === "pause") handlers.onPause();
    else if (action === "clear-eves") handlers.onClearEves();
    else if (action === "restore-all") handlers.onRestoreAll();
    else if (action === "demo") handlers.onDemo();
    else if (action === "reset-demo") handlers.onResetDemo?.();
    else if (action === "route-show") {
      routeOn = true;
      handlers.onRoute?.(routeArgs(), true);
      requestAnimationFrame(() => $("[data-route]").scrollIntoView({ block: "nearest", behavior: "smooth" }));
    } else if (action === "route-clear") {
      routeOn = false;
      handlers.onRoute?.(routeArgs(), false);
    }
    else handlers.onAction(action, btn.dataset.id);
  });

  // Inspector -------------------------------------------------------------------------------
  function buildLinkInspector(link, s) {
    const a = net.nodes.get(link.a);
    const b = net.nodes.get(link.b);
    const head = `
      <div class="inspector__title"><span class="inspector__id">${link.id}</span><span class="inspector__name">${a.short ?? a.name} ↔ ${b.short ?? b.name}</span></div>
      <div class="inspector__full q-adv">${a.name} ↔ ${b.name}</div>
      <div class="inspector__kind">${link.kind === "qkd" ? "QKD fiber" : "Post-quantum link"} · ${link.km} km</div>`;
    if (link.kind !== "qkd") {
      return `${head}
        <dl class="kv">
          <dt>Key exchange</dt><dd>${pill(KEY_LABEL[s.keySource])}</dd>
          <dt>Tap on this link</dt><dd>${s.eve != null ? '<span class="pill pill--bad">Yes</span>' : "None"}</dd>
          <dt>If it were QKD: baseline error</dt><dd>${pct(s.baseline)}</dd>
        </dl>
        <p class="explain">This link carries no quantum signal, so <b>physics cannot detect a tap here</b>. Its traffic stays secret because it is encrypted with keys from ML-KEM (post-quantum). ${link.km > 80 ? "At this length QKD would lose most photons, which is why it uses post-quantum cryptography instead." : "Short, numerous links to sub-units are where post-quantum cryptography is cheapest."}</p>
        <div class="btns">${tapButton(link, s)}</div>
        <div class="overrides"><div class="overrides__title">Operator override</div><div class="btns">${quarantineButton(link, s)}</div></div>`;
    }
    return `${head}
      <dl class="kv">
        <dt>Status</dt><dd data-f="status"></dd>
        <dt>Error rate (QBER) now</dt><dd data-f="qhat"></dd>
        <dt class="q-adv">Baseline for this fiber</dt><dd class="q-adv">${pct(s.baseline, 2)}</dd>
        <dt class="q-adv">Warning line</dt><dd class="q-adv" data-f="threshold"></dd>
        <dt class="q-adv">Abort line</dt><dd class="q-adv">${pct(ABORT_QBER, 0)}</dd>
        <dt class="q-adv">Sifted bits in window</dt><dd class="q-adv" data-f="n"></dd>
        <dt>Key source</dt><dd data-f="key"></dd>
        <dt>Tap</dt><dd data-f="eve"></dd>
      </dl>
      <div class="control__row"><span style="font-size:12.5px;color:var(--ink-dim)">Secret key left after privacy amplification</span><span class="control__val" data-f="sf"></span></div>
      <div class="keybar"><div class="keybar__fill" data-f="sfbar"></div></div>
      <canvas class="chart" data-chart></canvas>
      <div class="chart__legend q-adv"><span><i style="background:var(--ink)"></i>QBER</span><span><i style="background:var(--warn)"></i>warning</span><span><i style="background:var(--bad)"></i>11% abort</span><span><i style="background:var(--ink-faint)"></i>baseline</span></div>
      <div class="intel" data-f="intel"></div>
      <div class="btns">${tapButton(link, s)}</div>
      <div class="overrides"><div class="overrides__title">Operator overrides</div><div class="btns">${decoyButton(link, s)}${quarantineButton(link, s)}</div></div>
      ${engineIds.length ? `<div class="frameworks q-adv">
        <div class="frameworks__title">Re-run this fiber on quantum simulators</div>
        <div class="btns">${engineIds.map((e) => `<button class="btn" data-action="engine:${e}" data-id="${link.id}">${engines[e]}</button>`).join("")}<button class="btn btn--ok" data-action="engine:all" data-id="${link.id}">All</button></div>
        <div class="frameworks__table" data-f="frameworks"></div>
      </div>` : ""}
      <p class="explain" data-f="explain"></p>`;
  }

  function tapButton(link, s) {
    return s.eve != null
      ? `<button class="btn btn--ok" data-action="remove-eve" data-id="${link.id}">Remove tap</button>`
      : `<button class="btn btn--danger" data-action="place-eve" data-id="${link.id}">Place tap here</button>`;
  }
  function decoyButton(link, s) {
    if (link.kind !== "qkd" || s.quarantined) return "";
    if (!s.decoy && s.decoyBlocked?.length)
      return `<button class="btn btn--decoy" disabled title="Not possible on this fiber">Decoy traffic</button><p class="btn-why">Not possible here: ${s.decoyBlocked.join(", ")} would have no other route, so real traffic must stay on this fiber (on ML-KEM keys).</p>`;
    return s.decoy
      ? `<button class="btn btn--ok" data-action="decoy-off" data-id="${link.id}">End decoy mode</button>`
      : `<button class="btn btn--decoy" data-action="decoy-on" data-id="${link.id}">Decoy traffic</button>`;
  }
  function quarantineButton(link, s) {
    return s.quarantined
      ? `<button class="btn btn--ok" data-action="restore" data-id="${link.id}">Restore fiber</button>`
      : `<button class="btn btn--warn" data-action="quarantine" data-id="${link.id}">Quarantine fiber</button>`;
  }

  function fillLinkInspector(link, s) {
    const f = (k) => inspector.querySelector(`[data-f="${k}"]`);
    if (!f("status")) return;
    f("status").innerHTML = s.quarantined ? pill(["Quarantined", "off"]) : pill(STATUS_PILL[s.status]);
    f("qhat").textContent = s.n > 0 ? `${pct(s.qhat, 2)} ± ${pct(Math.sqrt(Math.max(s.qhat * (1 - s.qhat), 1e-9) / s.n), 2)}` : "–";
    f("threshold").textContent = s.n > 0 ? pct(s.threshold, 2) : "–";
    f("n").textContent = s.n.toLocaleString();
    f("key").innerHTML = pill(KEY_LABEL[s.keySource]);
    f("eve").innerHTML = s.eve != null ? `<span class="pill pill--bad">${pct(s.eve, 0)} of photons</span>` : "None";
    const fw = f("frameworks");
    if (fw) {
      const runs = s.engineRuns ?? {};
      const rows = engineIds
        .filter((e) => runs[e])
        .map((e) => {
          const r = runs[e];
          if (r === "running") return `<div class="fw__row"><span>${engines[e]}</span><b>running…</b></div>`;
          if (r.error) return `<div class="fw__row"><span>${engines[e]}</span><b class="bad">error</b></div>`;
          const extra = [r.job_id ? `job ${r.job_id}` : "", r.note ?? ""].filter(Boolean).map((t) => `<em>${t}</em>`).join("");
          return `<div class="fw__row"><span>${r.label}</span><b>${pct(r.qber, 2)}</b><em>${r.sifted.toLocaleString()} bits · ${(r.ms / 1000).toFixed(1)} s</em>${extra}</div>`;
        });
      fw.innerHTML = rows.length
        ? `<div class="fw__row fw__row--head"><span>Browser engine, live window</span><b>${pct(s.qhat, 2)}</b><em>theory ${pct(s.baseline + (s.eve ?? 0) * (0.25 - s.baseline / 2), 2)}</em></div>${rows.join("")}`
        : `<div class="fw__hint">Re-runs this fiber's current noise and tap on a quantum simulator (4,000 photons on Qiskit, CUDA-Q and Guppy; 2,000 to 12,000 bits on qBraid) and compares the error rate.</div>`;
    }
    // Attack intelligence: shown when the fiber is suspicious or running decoy traffic.
    const showIntel = s.estimate && (s.decoy || s.status === "warning" || s.status === "abort");
    f("intel").innerHTML = showIntel
      ? `<div class="intel__title">Attack estimate${s.decoy ? " · decoy mode" : ""}</div>
         <div class="intel__row"><span>Share of photons intercepted</span><b>${pct(s.estimate.f, 0)} ± ${pct(Math.min(1, s.estimate.se), 0)}</b></div>
         <div class="intel__row"><span>Signature</span><b>intercept-resend (error rate ≈ p + f(¼ − p/2))</b></div>
         <div class="intel__row"><span>Real data on this fiber</span><b>${s.decoy ? "none (rerouted)" : "yes, on ML-KEM keys"}</b></div>
         <div class="intel__note">Simulation check: the tap really intercepts ${s.eve != null ? pct(s.eve, 0) : "0%"} of photons. In the field only the estimate is known.</div>`
      : "";
    const sf = s.n > 0 ? secretFraction(s.qhat) : secretFraction(s.baseline);
    f("sf").textContent = pct(sf, 0);
    f("sfbar").style.width = pct(sf, 1);
    let text;
    if (s.decoy) text = `<b>Decoy mode.</b> Real data now takes another route. This fiber carries fake data, so the spy keeps tapping, captures nothing real, and every photon she disturbs helps us measure her.`;
    else if (s.quarantined) text = "Out of service. Traffic that used this fiber has been rerouted. Restore it to resume key exchange.";
    else if (s.status === "pending") text = "Measuring. This fiber has just come into service, so it carries traffic on ML-KEM keys until it has enough fresh measurements to judge its error rate. No QKD key is trusted before then.";
    else if (s.status === "abort") text = `The error rate is above 11%. Error correction would leak more than the key is worth, so <b>no secret key can come from this fiber</b>. Its traffic now uses ML-KEM keys and stays up. Someone should inspect the fiber.`;
    else if (s.status === "warning") text = `The error rate is <b>significantly above this fiber's baseline</b>. That is the signature of someone measuring the photons. QKD keys from this fiber are no longer trusted; traffic switches to ML-KEM and stays up.`;
    else if (s.eve != null) text = `A tap is intercepting ${pct(s.eve, 0)} of photons, but the error rate is still inside normal noise. A careful spy can hide this way; the price for her is that privacy amplification removes what she learned. Raise the sensitivity or watch longer.`;
    else text = "Healthy. Errors come only from fiber loss and detector noise, and there is enough margin to distill a secret key.";
    f("explain").innerHTML = text;
  }

  function teleportBlock(t) {
    if (!t) return "";
    const r = t.route;
    if (!r) return `<div class="tele"><div class="tele__title">Teleportation route</div><p class="explain">No chain of quantum fibers under 11% error reaches a control center from here, so no usable entangled pair can be built right now.</p></div>`;
    const hops = r.links.map((l, i) => `${l.id} ${pct(r.hopQbers[i], 1)}`).join(" · ");
    return `<div class="tele"><div class="tele__title">Teleportation route</div>
      <dl class="kv"><dt>Route</dt><dd>${r.nodes.join(" → ")}</dd><dt>Entanglement swaps</dt><dd>${r.swaps}</dd><dt>Hop error rates</dt><dd>${hops}</dd><dt>End-to-end error</dt><dd>${pill([pct(r.qber, 1), r.ok ? "ok" : "bad"])}</dd></dl>
      <p class="explain">${r.ok ? "Usable: under 11%, so an entangled pair could be distilled and a qubit teleported, with two classical bits sent over the fiber." : "Each hop is under 11%, but errors add up across swaps: the end-to-end pair is over 11% and could not be distilled."} ${r.swaps ? `Swapping nodes (${r.nodes.slice(1, -1).join(", ")}) never hold the key, unlike trusted relays.` : ""} Assumes the fibers run an entanglement-based protocol with the error rates measured here.</p></div>`;
  }

  function buildNodeInspector(node, site, teleport) {
    const kind = TYPE_LABEL[node.type];
    const path = (p) => (p ? p.nodes.join(" → ") : "–");
    let explain;
    if (node.type === "control") explain = "Control centers hold the keys. Every other site needs a path back to one of them.";
    else if (site.islanded) explain = "No communication path left to any control center. The site keeps running on its own local protection: <b>power stays on</b>. A crew is dispatched.";
    else if (site.keySource === "qkd" && site.relays.length) explain = `Its QKD key is relayed through <b>${site.relays.join(", ")}</b>. Each relay is a trusted node: it briefly holds the key in the clear, so it must be physically secured. That is the trusted-node problem.`;
    else if (site.keySource === "qkd") explain = "Its QKD key comes over a single fiber straight from a control center: no relay sees it.";
    else if (node.type === "substation") explain = "No chain of healthy QKD fibers reaches a control center right now, so this substation uses ML-KEM keys. It stays connected.";
    else explain = "This site has no QKD fiber, so it uses ML-KEM keys. In our design, sub-units and remote sites are on ML-KEM because QKD there would cost more than it protects.";
    return `
      <div class="inspector__title"><span class="inspector__id">${node.id}</span><span class="inspector__name">${node.short ?? node.name}</span></div>
      ${node.short ? `<div class="inspector__full q-adv">${node.name}</div>` : ""}
      <div class="inspector__kind">${kind}</div>
      <dl class="kv">
        <dt>Power</dt><dd><span class="pill pill--ok">Energized</span></dd>
        <dt>Keys</dt><dd>${pill(KEY_LABEL[site.keySource] ?? KEY_LABEL.none)}</dd>
        ${node.type === "control" ? "" : `<dt>Key path</dt><dd>${site.keySource === "qkd" ? path(site.keyPath) : "end-to-end ML-KEM"}</dd><dt>Data path</dt><dd>${path(site.dataPath)}</dd>`}
      </dl>
      <p class="explain">${explain}</p>
      ${node.type === "control" ? "" : teleportBlock(teleport)}`;
  }

  function drawChart(canvas, s) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const g = canvas.getContext("2d");
    const css = getComputedStyle(document.documentElement);
    const tok = (n) => css.getPropertyValue(n).trim();
    const ink = tok("--ink");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const hist = s.history;
    const top = Math.max(0.16, ...hist.map((p) => p.qhat * 1.15));
    const y = (q) => h - 6 - (q / top) * (h - 14);
    const x = (i) => (hist.length <= 1 ? w : (i / (hist.capacity - 1)) * w);
    const line = (q, color, dash) => {
      g.strokeStyle = color;
      g.setLineDash(dash);
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(0, y(q));
      g.lineTo(w, y(q));
      g.stroke();
    };
    line(s.baseline, tok("--ink-faint"), [3, 4]);
    line(ABORT_QBER, tok("--bad"), [4, 3]);
    g.setLineDash([]);
    if (hist.length > 1) {
      g.strokeStyle = tok("--warn");
      g.beginPath();
      hist.forEach((p, i) => (i ? g.lineTo(x(i), y(p.threshold)) : g.moveTo(x(i), y(p.threshold))));
      g.stroke();
      const grad = g.createLinearGradient(0, 0, 0, h);
      g.globalAlpha = 0.22;
      grad.addColorStop(0, ink);
      grad.addColorStop(1, "transparent");
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(x(0), h);
      hist.forEach((p, i) => g.lineTo(x(i), y(p.qhat)));
      g.lineTo(x(hist.length - 1), h);
      g.closePath();
      g.fill();
      g.globalAlpha = 1;
      g.strokeStyle = ink;
      g.lineWidth = 1.6;
      g.beginPath();
      hist.forEach((p, i) => (i ? g.lineTo(x(i), y(p.qhat)) : g.moveTo(x(i), y(p.qhat))));
      g.stroke();
    }
    g.fillStyle = tok("--ink-dim");
    g.font = "10px JetBrains Mono, monospace";
    g.fillText(pct(top, 0), 4, 12);
  }

  // Route result ------------------------------------------------------------------------------
  let routeSig = "";
  function renderRoute(r, linkStates) {
    const out = $("[data-route]");
    $('[data-action="route-clear"]').hidden = !r;
    $('[data-action="route-show"]').textContent = r ? "Route shown on the map" : "Show this route";
    $('[data-action="route-show"]').classList.toggle("is-on", !!r);
    const sig = r ? JSON.stringify([r.mode, r.links.map((id) => linkStates?.get(id)?.status), r.nodes, r.km, r.maxQber.toFixed(3), r.blocked, r.pending, r.unavailable, r.grover && [r.grover.marked, r.grover.pick]]) : "";
    if (sig === routeSig) return;
    routeSig = sig;
    if (!r) {
      out.innerHTML = "";
      return;
    }
    const n = r.relays.length;
    const sitesWord = (k) => `${k} site${k === 1 ? "" : "s"}`;
    let lead;
    if (r.mode === "islanded") lead = "<b>No fiber path between these sites.</b> A site cut off this way keeps running on its local protection: power stays on, and a crew is dispatched.";
    else if (r.mode === "local") lead = "Start and end are the same site.";
    else if (r.mode === "qkd") lead = n ? `The key passes through <b>${sitesWord(n)}</b> that decrypt and re-encrypt it. Each must be trusted.` : "<b>Direct fiber.</b> No site in between ever holds the key.";
    else lead = `<b>No QKD route stays under the cutoff.</b> Keys come from ML-KEM, agreed end to end, so the ${sitesWord(n)} on the way only forward data they cannot read.`;
    const chain = r.nodes.length
      ? `<ol class="route__chain">${r.nodes.map((id, i) => `<li class="${i === 0 || i === r.nodes.length - 1 ? "is-end" : r.relaysCanReadKey ? "is-relay" : "is-forward"}"><b>${siteName(id)}</b><span>${id}</span></li>`).join("")}</ol>`
      : "";
    let compare = "";
    if (r.shortest && (r.mode === "qkd" || r.mode === "pqc")) {
      const s = r.shortest;
      compare =
        s.sites > n
          ? `<p class="route__compare">The shortest route by distance (${s.km} km) would pass through ${sitesWord(s.sites)}. This one passes through ${n}${r.km > s.km ? `, for ${(r.km - s.km).toFixed(1)} km more fiber` : ""}.</p>`
          : `<p class="route__compare">This is also the shortest route by distance.</p>`;
    }
    // A fiber on the route that is alarmed (above its own normal level) yet under the cutoff: say so, so it does not look like a mistake.
    const alarmed = r.mode === "qkd" && linkStates ? r.links.filter((id) => ["warning", "abort"].includes(linkStates.get(id)?.status)) : [];
    const alarmNote = alarmed.length ? `<p class="route__compare"><b>${alarmed.join(", ")}</b> ${alarmed.length === 1 ? "is" : "are"} in alarm (error rate above ${alarmed.length === 1 ? "its" : "their"} normal level) but under your cutoff, so the search still uses ${alarmed.length === 1 ? "it" : "them"}. Lower the cutoff to avoid ${alarmed.length === 1 ? "it" : "them"}.</p>` : "";
    const blocked = r.blocked.length ? `${r.blocked.length} fiber${r.blocked.length === 1 ? "" : "s"}: ${r.blocked.join(", ")}` : "none";
    let groverHtml = "";
    if (r.grover && r.grover.routes.length) {
      const g = r.grover;
      const M = g.marked.length;
      groverHtml = `<div class="route__grover">
        <div class="route__grover-title">Grover check (quantum search)</div>
        <p>${g.routes.length} candidate QKD routes, <b>${M} clean</b>. ${M ? `${g.iterations ? `After ${g.iterations} Grover round${g.iterations === 1 ? "" : "s"}, a` : "With most routes clean no Grover round is needed: a"} clean route comes out ${pct(g.success, 0)} of the time${g.iterations ? `, against ${pct(M / g.N, 0)} for a random pick` : ""}.` : r.mode === "qkd" ? "None of these candidates is clean, so Grover's output stays random and every check fails. The classical search above still found a clean route: it lies outside the shortest candidates, and Grover only searches the list it is given." : "None is clean, so Grover's output stays random and every check fails: fall back to ML-KEM."}</p>
        <p class="q-adv">Notebook 2b's oracle marks every route whose fibers are all under the cutoff; its diffuser amplifies them. ${g.N} slots (${Math.log2(g.N)} qubits), ${g.iterations} iteration${g.iterations === 1 ? "" : "s"}, the best count for ${M || 1} marked in ${g.N}${M > g.N / 2 ? " (with most routes clean, a plain random draw already wins, so Grover adds no rounds)" : ""}. This draw: ${g.pick < g.routes.length ? `candidate ${g.pick + 1}, ${g.pickClean ? "clean, checked hop by hop" : "not clean, so it is rejected and Grover runs again"}` : `an empty slot (only ${g.routes.length} routes exist), so it is rejected and Grover runs again`}. Classical search already finds the exact answer quickly; this shows the same circuit working on the grid problem, not a speed-up.</p>
        <p class="q-adv">Recorded run: notebook 3b ran this circuit on Qiskit Aer for Falling Water to Oglethorpe with one fiber tapped (3 of 8 routes clean). 172 of 200 draws were clean, against 84.4% exact and 37.5% for a random pick.</p>
      </div>`;
    }
    out.innerHTML = `
      <div class="route__head">${pill(MODE_PILL[r.mode])}${r.mode === "qkd" || r.mode === "pqc" ? `<span class="route__km">${r.km} km</span>` : ""}</div>
      <p class="route__lead">${lead}</p>
      ${chain}
      ${compare}
      ${alarmNote}
      <dl class="kv">
        ${r.mode === "qkd" || r.mode === "pqc" ? `<dt>Highest error rate on the route</dt><dd>${pct(r.maxQber, 1)}</dd>` : ""}
        <dt>Fibers over the cutoff</dt><dd>${blocked}</dd>
        ${r.pending?.length ? `<dt>Fibers still measuring</dt><dd>${r.pending.join(", ")}</dd>` : ""}
        ${r.unavailable?.length ? `<dt>Fibers out of service (decoy or quarantine)</dt><dd>${r.unavailable.join(", ")}</dd>` : ""}
      </dl>
      ${groverHtml}`;
  }

  // Public ----------------------------------------------------------------------------------
  function render(state) {
    renderRoute(state.route ?? null, state.links);
    let healthy = 0;
    let alerts = 0;
    let qkdLinks = 0;
    for (const [id, s] of state.links) {
      if (net.links.get(id).kind !== "qkd") continue;
      qkdLinks++;
      if (!s.quarantined && s.status === "ok") healthy++;
      if (!s.quarantined && (s.status === "warning" || s.status === "abort")) alerts++;
    }
    let qkdSites = 0;
    let substations = 0;
    let islanded = 0;
    for (const [id, site] of state.sites) {
      const n = net.nodes.get(id);
      if (n.type === "substation") {
        substations++;
        if (site.keySource === "qkd") qkdSites++;
      }
      if (site.islanded) islanded++;
    }
    $('[data-s="healthy"]').textContent = `${healthy}/${qkdLinks}`;
    $('[data-s="alerts"]').textContent = alerts;
    $('[data-s="qkdsites"]').textContent = `${qkdSites}/${substations}`;
    $('[data-s="islanded"]').textContent = islanded;
    $('[data-action="pause"]').textContent = state.paused ? "Resume" : "Pause";

    const sel = state.selected;
    const selNow = sel ? `${sel.type}:${sel.id}` : null;
    if (selNow && selNow !== lastSelShown) requestAnimationFrame(() => $("[data-selected]").scrollIntoView({ block: "nearest", behavior: "smooth" }));
    lastSelShown = selNow;
    if (!sel) {
      if (inspectorKey !== "none") {
        inspector.innerHTML = `<p class="inspector__empty">Click a fiber to see its error rate, or a site to see where its keys come from.</p>
          <dl class="keys q-adv"><dt>Drag · right-drag</dt><dd>move · rotate</dd><dt>Scroll · arrows</dt><dd>zoom · move</dd><dt>M</dt><dd>swap move and rotate</dd><dt>I · E</dt><dd>inspect · eavesdrop</dd><dt>F · H</dt><dd>focus · recenter</dd><dt>O · T</dt><dd>auto-turn · light/dark</dd><dt>1–4 · ?</dt><dd>pages · all keys</dd><dt>Space · Esc</dt><dd>pause · clear</dd></dl>`;
        inspectorKey = "none";
        chart = null;
      }
      return;
    }
    if (sel.type === "link") {
      const link = net.links.get(sel.id);
      const s = state.links.get(sel.id);
      const keyNow = `link:${sel.id}:${s.eve != null}:${s.quarantined}:${s.decoy}:${(s.decoyBlocked ?? []).length}`;
      if (keyNow !== inspectorKey) {
        inspector.innerHTML = buildLinkInspector(link, s);
        inspectorKey = keyNow;
        chart = inspector.querySelector("[data-chart]");
      }
      if (link.kind === "qkd") {
        fillLinkInspector(link, s);
        if (chart) drawChart(chart, s);
      }
    } else {
      const node = net.nodes.get(sel.id);
      const site = state.sites.get(sel.id);
      const html = buildNodeInspector(node, site, state.teleport);
      if (html !== inspector.innerHTML) inspector.innerHTML = html;
      inspectorKey = `node:${sel.id}`;
      chart = null;
    }
  }

  // Incidents: one card per alarm, showing the automatic response stage by stage. Re-rendered only when
  // something in it changes, so a click on a card is never lost to a refresh.
  const INCIDENT_STATE = { active: "Responding", contained: "Contained", closed: "Resolved" };
  let incidentSig = "";
  const latestStage = (stages) => stages.filter((st) => st.state !== "pending").at(-1);
  // While an incident is open, show its two latest steps and the next one, so the card and its buttons fit
  // on a projector; the full history stays in the event log.
  function shortStages(stages) {
    const done = stages.filter((st) => st.state !== "pending");
    const next = stages.find((st) => st.state === "pending");
    return [...done.slice(-2), ...(next ? [next] : [])];
  }
  function renderIncidents(list) {
    if (!incidentsEl) return;
    const shown = list.slice(0, 4);
    const sig = JSON.stringify(shown.map((i) => [i.n, i.state, i.stages.map((st) => [st.state, st.html])]));
    if (sig === incidentSig) return;
    incidentSig = sig;
    incidentsEl.innerHTML = shown
      .map((i) => {
        const btns =
          i.state === "active"
            ? `<button class="btn btn--warn" data-iaction="quarantine" data-n="${i.n}">Quarantine fiber</button>`
            : i.state === "contained"
              ? `<button class="btn btn--ok" data-iaction="restore" data-n="${i.n}">Restore fiber</button><button class="btn" data-iaction="dismiss" data-n="${i.n}">Dismiss</button>`
              : `<button class="btn" data-iaction="dismiss" data-n="${i.n}">Dismiss</button>`;
        return `<article class="incident incident--${i.state}" data-link="${i.link}" title="Select ${i.link}">
          <div class="incident__head"><div class="incident__title"><span>#${i.n}</span>${i.link} · ${i.a}–${i.b}</div><div class="incident__state">${INCIDENT_STATE[i.state]}</div></div>
          <ol class="stages">${(i.state === "active" ? shortStages(i.stages) : i.stages.slice(-1))
            .map((st, k, arr) => `<li class="stage stage--${st.state}${st === latestStage(arr) ? " stage--latest" : ""}"><i class="stage__dot"></i><span>${st.html}</span><time>${st.at != null ? `+${(st.at - i.openedAt).toFixed(1)} s` : ""}</time></li>`)
            .join("")}</ol>
          <div class="btns">${btns}</div>
        </article>`;
      })
      .join("");
  }
  incidentsEl?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-iaction]");
    if (btn) return handlers.onIncident(btn.dataset.iaction, Number(btn.dataset.n));
    const card = e.target.closest("[data-link]");
    if (card) handlers.onJump("link", card.dataset.link);
  });

  function log({ level = "info", text }) {
    const li = document.createElement("li");
    const secs = Math.floor((performance.now() - startedAt) / 1000);
    const t = `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;
    li.innerHTML = `<time>${t}</time><span class="lv-${level}"></span>`;
    li.querySelector("span").textContent = text;
    logEl.prepend(li);
    while (logEl.children.length > 80) logEl.lastChild.remove();
  }

  function resetRoute() {
    routeOn = false;
  }

  return { render, log, renderIncidents, resetRoute };
}
