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
  local: ["Key authority", "gold"],
};

const pct = (x, d = 1) => `${(100 * x).toFixed(d)}%`;
const pill = ([text, tone]) => `<span class="pill pill--${tone}">${text}</span>`;

export function createUI({ panel, net, networks = [], currentNetwork, coverage = "backbone", engines = {}, handlers }) {
  const engineIds = Object.keys(engines);
  const startedAt = performance.now();
  const netOptions = networks
    .map((m) => `<option value="${m.id}"${m.id === currentNetwork ? " selected" : ""}>${m.label} · ${m.nodes} sites</option>`)
    .join("");
  panel.innerHTML = `
    <section class="section">
      <h2>Network</h2>
      <select class="select" data-input="network" aria-label="Choose a network">${netOptions}</select>
      <div class="control__note">${net.meta?.note ?? ""}</div>
      <label class="field" for="coverage">QKD coverage</label>
      <select class="select" id="coverage" data-input="coverage" aria-label="Which fibers run QKD">
        <option value="backbone"${coverage === "backbone" ? " selected" : ""}>Backbone only: control centers and major substations (our design)</option>
        <option value="all"${coverage === "all" ? " selected" : ""}>Every fiber (the whiteboard sketch)</option>
      </select>
      <label class="field" for="jump">Find a fiber or site</label>
      <select class="select" id="jump" data-input="jump" aria-label="Select a fiber or site">
        <option value="">Choose…</option>
        <optgroup label="Sites">${[...net.nodes.values()].map((n) => `<option value="node:${n.id}">${n.id} · ${n.name}</option>`).join("")}</optgroup>
        <optgroup label="Fibers">${[...net.links.values()].map((l) => `<option value="link:${l.id}">${l.id} · ${l.a}–${l.b} · ${l.kind === "qkd" ? "QKD" : "ML-KEM"} · ${l.km} km</option>`).join("")}</optgroup>
      </select>
    </section>
    <section class="section">
      <h2>Network now</h2>
      <div class="stats">
        <div class="stat stat--ok"><div class="stat__v" data-s="healthy">–</div><div class="stat__l">QKD fibers healthy</div></div>
        <div class="stat stat--warn"><div class="stat__v" data-s="alerts">–</div><div class="stat__l">Fibers in alarm</div></div>
        <div class="stat"><div class="stat__v" data-s="qkdsites">–</div><div class="stat__l">Substations on QKD keys</div></div>
        <div class="stat stat--bad"><div class="stat__v" data-s="islanded">–</div><div class="stat__l">Sites without comms</div></div>
      </div>
    </section>

    <section class="section">
      <h2>Eavesdropper</h2>
      <div class="control">
        <div class="control__row"><span>Share of photons intercepted</span><span class="control__val" data-v="eve">100%</span></div>
        <input type="range" min="2" max="100" step="1" value="100" data-input="eve" aria-label="Share of photons the eavesdropper intercepts" />
        <div class="control__note">Sets the next tap you place, and changes the selected fiber's tap live if it has one. A careful spy taps only a few percent to hide inside the fiber's normal noise.</div>
      </div>
      <h2>Detection</h2>
      <div class="control">
        <div class="control__row"><span>Alarm sensitivity</span><span class="control__val" data-v="z">4.5 σ</span></div>
        <input type="range" min="2" max="6" step="0.5" value="4.5" data-input="z" aria-label="Alarm sensitivity in standard deviations" />
        <div class="control__note" data-v="znote"></div>
      </div>
      <label class="check" for="autodecoy"><input type="checkbox" id="autodecoy" data-input="autodecoy" aria-label="Auto-decoy suspicious fibers" /> <span><b>Auto-decoy</b>: when a fiber raises an alarm, keep it running on fake traffic and reroute real traffic, to measure the tap instead of just cutting it off</span></label>
      <h2>Teleportation</h2>
      <label class="check" for="teleport"><input type="checkbox" id="teleport" data-input="teleport" aria-label="Teleportation view" /> <span><b>Teleportation view</b>: show which fibers are under 11% error (usable entanglement if run entanglement-based) and each substation's entanglement-swapping route, which needs no trusted relays</span></label>
      <div class="btns">
        <button class="btn btn--danger" data-action="clear-eves">Remove all taps</button>
        <button class="btn btn--ok" data-action="restore-all">Restore all fibers</button>
        <button class="btn" data-action="pause">Pause</button>
      </div>
    </section>

    <section class="section">
      <h2>Inspector</h2>
      <div data-inspector></div>
    </section>

    <section class="section">
      <h2>Event log</h2>
      <ul class="log" data-log></ul>
    </section>

    <section class="section foot" data-foot>
      <b>What is simulated.</b> BB84 runs on every QKD fiber with an exact intercept-resend model, cross-checked against Qiskit Aer. Fiber loss and detector noise use published lab parameters. The layout is made up. The response cuts communication paths only; power is never switched off. Details in README.md and DESIGN.md.
    </section>`;

  const $ = (sel) => panel.querySelector(sel);
  const inspector = $("[data-inspector]");
  const logEl = $("[data-log]");
  let inspectorKey = null;
  let chart = null;

  // Controls
  const eveInput = $('[data-input="eve"]');
  const zInput = $('[data-input="z"]');
  const fill = (input) => input.style.setProperty("--fill", `${(100 * (input.value - input.min)) / (input.max - input.min)}%`);
  const showZ = () => {
    const z = Number(zInput.value);
    $('[data-v="z"]').textContent = `${z.toFixed(1)} σ`;
    const p = normalTail(z);
    $('[data-v="znote"]').innerHTML = `Warn when a fiber's error rate is ${z.toFixed(1)} standard deviations above its own baseline. Chance of a false alarm on one check with nobody listening: <b>${p < 1e-4 ? p.toExponential(1) : pct(p, 2)}</b>. Lower is touchier; higher lets a quiet spy hide longer.`;
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
  $('[data-input="autodecoy"]').addEventListener("change", (e) => handlers.onAutoDecoy(e.target.checked));
  $('[data-input="teleport"]').addEventListener("change", (e) => handlers.onTeleportView(e.target.checked));
  $('[data-input="coverage"]').addEventListener("change", (e) => handlers.onCoverage(e.target.value));
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
    else handlers.onAction(action, btn.dataset.id);
  });

  // Inspector -------------------------------------------------------------------------------
  function buildLinkInspector(link, s) {
    const a = net.nodes.get(link.a);
    const b = net.nodes.get(link.b);
    const head = `
      <div class="inspector__title"><span class="inspector__id">${link.id}</span><span class="inspector__name">${a.name} ↔ ${b.name}</span></div>
      <div class="inspector__kind">${link.kind === "qkd" ? "QKD fiber" : "Post-quantum link"} · ${link.km} km</div>`;
    if (link.kind !== "qkd") {
      return `${head}
        <dl class="kv">
          <dt>Key exchange</dt><dd>${pill(KEY_LABEL[s.keySource])}</dd>
          <dt>Tap on this link</dt><dd>${s.eve != null ? '<span class="pill pill--bad">Yes</span>' : "None"}</dd>
          <dt>If it were QKD: baseline error</dt><dd>${pct(s.baseline)}</dd>
        </dl>
        <p class="explain">This link carries no quantum signal, so <b>physics cannot detect a tap here</b>. Its traffic stays secret because it is encrypted with keys from ML-KEM (FIPS 203), a post-quantum algorithm. ${link.km > 60 ? "At this length QKD would lose most photons, which is why it uses post-quantum cryptography instead." : "Short, numerous links to sub-units are where post-quantum cryptography is cheapest."}</p>
        <div class="btns">${tapButton(link, s)}${quarantineButton(link, s)}</div>`;
    }
    return `${head}
      <dl class="kv">
        <dt>Status</dt><dd data-f="status"></dd>
        <dt>Error rate (QBER) now</dt><dd data-f="qhat"></dd>
        <dt>Baseline for this fiber</dt><dd>${pct(s.baseline, 2)}</dd>
        <dt>Warning line</dt><dd data-f="threshold"></dd>
        <dt>Abort line</dt><dd>${pct(ABORT_QBER, 0)}</dd>
        <dt>Sifted bits in window</dt><dd data-f="n"></dd>
        <dt>Key source</dt><dd data-f="key"></dd>
        <dt>Tap</dt><dd data-f="eve"></dd>
      </dl>
      <div class="control__row"><span style="font-size:12.5px;color:var(--ink-dim)">Secret key left after privacy amplification</span><span class="control__val" data-f="sf"></span></div>
      <div class="keybar"><div class="keybar__fill" data-f="sfbar"></div></div>
      <canvas class="chart" data-chart></canvas>
      <div class="chart__legend"><span><i style="background:#e8eefc"></i>QBER</span><span><i style="background:#ffb547"></i>warning</span><span><i style="background:#ff4d6d"></i>11% abort</span><span><i style="background:#4b5571"></i>baseline</span></div>
      <div class="intel" data-f="intel"></div>
      <div class="btns">${tapButton(link, s)}${decoyButton(link, s)}${quarantineButton(link, s)}</div>
      ${engineIds.length ? `<div class="frameworks">
        <div class="frameworks__title">Run this fiber as real quantum code</div>
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
          return `<div class="fw__row"><span>${r.label}</span><b>${pct(r.qber, 2)}</b><em>${r.sifted.toLocaleString()} bits · ${r.ms} ms</em></div>`;
        });
      fw.innerHTML = rows.length
        ? `<div class="fw__row fw__row--head"><span>Browser engine, live window</span><b>${pct(s.qhat, 2)}</b><em>theory ${pct(s.baseline + (s.eve ?? 0) * (0.25 - s.baseline / 2), 2)}</em></div>${rows.join("")}`
        : `<div class="fw__hint">Runs this fiber's current noise and tap as 4,000 photons of real quantum code and compares the error rate.</div>`;
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
    if (s.decoy) text = `<b>Decoy mode.</b> Real traffic has been rerouted; this fiber keeps running on fake traffic and quantum photons, so the tapper keeps tapping and every photon she disturbs tells us more: how much she intercepts, and that the pattern matches intercept-resend. Nothing she captures is real.`;
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
      <div class="inspector__title"><span class="inspector__id">${node.id}</span><span class="inspector__name">${node.name}</span></div>
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
    line(s.baseline, "rgba(120,135,170,.55)", [3, 4]);
    line(ABORT_QBER, "rgba(255,77,109,.8)", [4, 3]);
    g.setLineDash([]);
    if (hist.length > 1) {
      g.strokeStyle = "rgba(255,181,71,.85)";
      g.beginPath();
      hist.forEach((p, i) => (i ? g.lineTo(x(i), y(p.threshold)) : g.moveTo(x(i), y(p.threshold))));
      g.stroke();
      const grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "rgba(232,238,252,.28)");
      grad.addColorStop(1, "rgba(232,238,252,0)");
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(x(0), h);
      hist.forEach((p, i) => g.lineTo(x(i), y(p.qhat)));
      g.lineTo(x(hist.length - 1), h);
      g.closePath();
      g.fill();
      g.strokeStyle = "#e8eefc";
      g.lineWidth = 1.6;
      g.beginPath();
      hist.forEach((p, i) => (i ? g.lineTo(x(i), y(p.qhat)) : g.moveTo(x(i), y(p.qhat))));
      g.stroke();
    }
    g.fillStyle = "rgba(139,150,179,.8)";
    g.font = "10px JetBrains Mono, monospace";
    g.fillText(pct(top, 0), 4, 12);
  }

  // Public ----------------------------------------------------------------------------------
  function render(state) {
    let healthy = 0;
    let alerts = 0;
    let qkdLinks = 0;
    for (const [id, s] of state.links) {
      if (net.links.get(id).kind !== "qkd") continue;
      qkdLinks++;
      if (!s.quarantined && s.status === "ok") healthy++;
      if (!s.quarantined && s.status !== "ok") alerts++;
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
    if (!sel) {
      if (inspectorKey !== "none") {
        inspector.innerHTML = `<p class="inspector__empty">Click a fiber to see its live error rate, or a site to see where its keys come from. Drag to orbit, scroll to zoom. Keys <b>1</b>, <b>2</b>, <b>3</b> switch tools; <b>Esc</b> clears the selection.</p>`;
        inspectorKey = "none";
        chart = null;
      }
      return;
    }
    if (sel.type === "link") {
      const link = net.links.get(sel.id);
      const s = state.links.get(sel.id);
      const keyNow = `link:${sel.id}:${s.eve != null}:${s.quarantined}:${s.decoy}`;
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

  function log({ level = "info", text }) {
    const li = document.createElement("li");
    const secs = Math.floor((performance.now() - startedAt) / 1000);
    const t = `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;
    li.innerHTML = `<time>${t}</time><span class="lv-${level}"></span>`;
    li.querySelector("span").textContent = text;
    logEl.prepend(li);
    while (logEl.children.length > 80) logEl.lastChild.remove();
  }

  return { render, log };
}
