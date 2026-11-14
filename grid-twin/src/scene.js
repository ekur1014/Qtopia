// The 3D view. It only draws: all physics and decisions live in bb84.js, detector.js and response.js.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const COLORS = {
  ok: new THREE.Color("#3ef0c6"),
  warn: new THREE.Color("#ffb547"),
  bad: new THREE.Color("#ff4d6d"),
  pqc: new THREE.Color("#8a8dff"),
  off: new THREE.Color("#2b3244"),
  gold: new THREE.Color("#ffd76a"),
  photon: new THREE.Color("#e9fbff"),
  photonHit: new THREE.Color("#ff3d62"),
  packet: new THREE.Color("#b5b8ff"),
  decoy: new THREE.Color("#ff5ec7"),
};
const PHOTONS_PER_LINK = 7;
const PACKETS_PER_LINK = 3;
const KEY_PACKETS = 28; // gold packets that trace the selected site's key path

export function createScene({ container, net, onPick, onHover }) {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const nodeCount = net.nodes.size;
  const crowded = nodeCount > 40; // big grids: fewer labels, smaller photons per link

  // Network extent; everything visual scales with it so a 300-bus grid reads as well as the 17-site city.
  const xs = [...net.nodes.values()].map((n) => n.pos[0]);
  const zs = [...net.nodes.values()].map((n) => n.pos[1]);
  const center = new THREE.Vector3((Math.min(...xs) + Math.max(...xs)) / 2, 0, (Math.min(...zs) + Math.max(...zs)) / 2);
  const span = Math.max(30, Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
  const S = THREE.MathUtils.clamp(Math.sqrt(span / 55), 1, 2.2); // size factor for nodes, fibers and photons

  // Renderer, labels, post-processing ------------------------------------------------------------
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  container.appendChild(renderer.domElement);

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(container.clientWidth, container.clientHeight);
  Object.assign(labelRenderer.domElement.style, { position: "absolute", inset: "0", pointerEvents: "none" });
  container.appendChild(labelRenderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#04060b");
  scene.fog = new THREE.FogExp2("#04060b", 0.55 / span);

  const camera = new THREE.PerspectiveCamera(42, container.clientWidth / container.clientHeight, 0.1, span * 12);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(center);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 6 * S;
  controls.maxDistance = span * 4;
  controls.minPolarAngle = 0.15;
  controls.maxPolarAngle = 1.32;
  controls.enabled = false; // until the intro flight ends

  // Framing: the panel covers part of the screen (right on desktop, bottom on phones). The view is offset so
  // the network is centered in what is left, and the camera distance is searched so every site fits there.
  let insets = { right: 0, bottom: 0 };
  const restDir = new THREE.Vector3(-span * 0.1, span * 0.5, span * 0.56);
  const fitPoints = [...net.nodes.values()].flatMap((n) => [new THREE.Vector3(n.pos[0], 0, n.pos[1]), new THREE.Vector3(n.pos[0], 3 * S, n.pos[1])]);
  const probe = new THREE.PerspectiveCamera(42, 1, 0.1, span * 12);
  function framing() {
    const W = Math.max(1, container.clientWidth);
    const H = Math.max(1, container.clientHeight);
    probe.aspect = W / H;
    probe.setViewOffset(W, H, insets.right / 2, insets.bottom / 2, W, H);
    const xMax = ((W - insets.right) / W) * 0.9;
    const yMax = ((H - insets.bottom) / H) * 0.84;
    const cx = -insets.right / W; // center of the free area in normalized screen coordinates
    const cy = insets.bottom / H;
    const v = new THREE.Vector3();
    const fits = (k) => {
      probe.position.copy(center).addScaledVector(restDir, k);
      probe.lookAt(center);
      probe.updateMatrixWorld();
      probe.updateProjectionMatrix();
      return fitPoints.every((p) => {
        v.copy(p).project(probe);
        return Math.abs(v.x - cx) <= xMax && Math.abs(v.y - cy) <= yMax;
      });
    };
    let lo = 0.3;
    let hi = 4;
    if (fits(hi)) {
      for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2;
        if (fits(mid)) hi = mid;
        else lo = mid;
      }
    }
    return center.clone().addScaledVector(restDir, hi);
  }
  function applyViewOffset() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.setViewOffset(w, h, insets.right / 2, insets.bottom / 2, w, h);
  }
  let restPos = framing();
  const startPos = center.clone().add(new THREE.Vector3(span * 0.9, span * 2.2, span * 1.6));
  camera.position.copy(reduceMotion ? restPos : startPos);
  camera.lookAt(center);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  // Restrained bloom: only things brighter than the threshold (photons, beacons, taps) glow; fibers stay crisp.
  const bloom = new UnrealBloomPass(new THREE.Vector2(container.clientWidth, container.clientHeight), 0.6, 0.45, 0.32);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // Lights and ground ---------------------------------------------------------------------------
  scene.add(new THREE.HemisphereLight("#9fb6ff", "#06080f", 0.6));
  const key = new THREE.DirectionalLight("#cfe0ff", 1.2);
  key.position.set(-span * 0.5, span, span * 0.7);
  scene.add(key);

  const groundTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 512;
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(256, 256, 10, 256, 256, 256);
    grad.addColorStop(0, "#0f1729");
    grad.addColorStop(0.6, "#070b15");
    grad.addColorStop(1, "#04060b");
    g.fillStyle = grad;
    g.fillRect(0, 0, 512, 512);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  })();
  const ground = new THREE.Mesh(new THREE.CircleGeometry(span * 1.9, 96), new THREE.MeshBasicMaterial({ map: groundTex }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(center.x, -0.02, center.z);
  scene.add(ground);

  const grid = new THREE.GridHelper(span * 3.2, 64, "#253559", "#141d35");
  grid.position.set(center.x, 0, center.z);
  grid.material.transparent = true;
  grid.material.opacity = 0.32;
  scene.add(grid);

  // Nodes ---------------------------------------------------------------------------------------
  const pickables = [];
  const nodeViews = new Map();
  const darkMetal = new THREE.MeshStandardMaterial({ color: "#151c2c", metalness: 0.65, roughness: 0.38 });

  for (const node of net.nodes.values()) {
    const group = new THREE.Group();
    group.position.set(node.pos[0], 0, node.pos[1]);
    const body = new THREE.Group(); // scaled on hover
    group.add(body);
    let glowMat;
    let height;

    if (node.type === "control") {
      height = 6.4 * S;
      const base = new THREE.Mesh(new THREE.CylinderGeometry(2.0 * S, 2.4 * S, 0.8 * S, 6), darkMetal);
      base.position.y = 0.4 * S;
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.42 * S, 0.55 * S, height, 6), darkMetal);
      pillar.position.y = height / 2 + 0.4 * S;
      glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, 2.2, 2.4), toneMapped: false });
      const beacon = new THREE.Mesh(new THREE.OctahedronGeometry(0.7 * S, 0), glowMat);
      beacon.position.y = height + 1.3 * S;
      const halo = new THREE.Mesh(new THREE.TorusGeometry(1.6 * S, 0.06 * S, 8, 64), new THREE.MeshBasicMaterial({ color: COLORS.ok, toneMapped: false }));
      halo.rotation.x = Math.PI / 2;
      halo.position.y = height + 1.3 * S;
      body.add(base, pillar, beacon, halo);
      group.userData.spin = [beacon, halo];
    } else if (node.type === "substation" || node.type === "remote") {
      const r = (node.type === "remote" ? 1.1 : 1.45) * S;
      height = 2.2 * S;
      const shell = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.1, height, 6), darkMetal);
      shell.position.y = height / 2;
      glowMat = new THREE.MeshBasicMaterial({ color: COLORS.ok.clone().multiplyScalar(1.3), toneMapped: false });
      const crown = new THREE.Mesh(new THREE.TorusGeometry(r * 0.98, 0.09 * S, 6, 6), glowMat);
      crown.rotation.x = Math.PI / 2;
      crown.rotation.z = Math.PI / 6;
      crown.position.y = height + 0.03;
      const core = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.35, r * 0.35, 0.12 * S, 6), glowMat);
      core.position.y = height + 0.06;
      body.add(shell, crown, core);
    } else {
      height = 1.0 * S;
      const shell = new THREE.Mesh(new THREE.BoxGeometry(1.05 * S, height, 1.05 * S), darkMetal);
      shell.position.y = height / 2;
      glowMat = new THREE.MeshBasicMaterial({ color: COLORS.pqc.clone().multiplyScalar(1.2), toneMapped: false });
      const cap = new THREE.Mesh(new THREE.BoxGeometry(1.1 * S, 0.08 * S, 1.1 * S), glowMat);
      cap.position.y = height + 0.04;
      body.add(shell, cap);
    }

    // A generous invisible hit-box makes nodes easy to click.
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(2.4 * S, 2.4 * S, height + 2 * S, 8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = (height + 2 * S) / 2;
    hit.userData.pick = { type: "node", id: node.id };
    group.add(hit);
    pickables.push(hit);

    // Relay ring: shown when a site's QKD key passes through this node (trusted node).
    const relayRing = new THREE.Mesh(new THREE.TorusGeometry(3.0 * S, 0.08 * S, 8, 72), new THREE.MeshBasicMaterial({ color: COLORS.gold, toneMapped: false, transparent: true, opacity: 0 }));
    relayRing.rotation.x = Math.PI / 2;
    relayRing.position.y = 0.1;
    group.add(relayRing);

    const el = document.createElement("div");
    el.className = `label label--${node.type}${crowded && node.type !== "control" ? " label--quiet" : ""}`;
    el.innerHTML = `${node.id}<span class="label__name">${node.name}</span>`;
    const label = new CSS2DObject(el);
    label.position.set(0, height + (node.type === "control" ? 3.2 : 1.6) * S, 0);
    group.add(label);

    scene.add(group);
    nodeViews.set(node.id, { group, body, glowMat, relayRing, el, height, hover: 0 });
  }

  // Links ---------------------------------------------------------------------------------------
  const linkViews = new Map();
  for (const link of net.links.values()) {
    const a = net.nodes.get(link.a);
    const b = net.nodes.get(link.b);
    const pa = new THREE.Vector3(a.pos[0], endHeight(a), a.pos[1]);
    const pb = new THREE.Vector3(b.pos[0], endHeight(b), b.pos[1]);
    const mid = pa.clone().lerp(pb, 0.5);
    mid.y += 1.4 * S + pa.distanceTo(pb) * 0.12; // arc, so links read as cables lifted off the ground
    const curve = new THREE.QuadraticBezierCurve3(pa, mid, pb);

    const isQkd = link.kind === "qkd";
    const base = isQkd ? COLORS.ok.clone().multiplyScalar(0.85) : COLORS.pqc.clone().multiplyScalar(0.8);
    const mat = new THREE.MeshBasicMaterial({ color: base, transparent: true, opacity: isQkd ? 0.85 : 0.5 });
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, (isQkd ? 0.13 : 0.075) * S, 8, false), mat);
    scene.add(tube);

    const hit = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.9 * S, 6, false), new THREE.MeshBasicMaterial({ visible: false }));
    hit.userData.pick = { type: "link", id: link.id };
    scene.add(hit);
    pickables.push(hit);

    // Eavesdropper marker: a red crystal hovering over the fiber with a tap line down to it.
    const evePoint = curve.getPoint(0.5);
    const eve = new THREE.Group();
    const eveMat = new THREE.MeshBasicMaterial({ color: COLORS.bad.clone().multiplyScalar(2.0), toneMapped: false });
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.7 * S, 0), eveMat);
    crystal.position.y = 2.8 * S;
    const tap = new THREE.Mesh(new THREE.CylinderGeometry(0.03 * S, 0.03 * S, 2.8 * S, 6), new THREE.MeshBasicMaterial({ color: COLORS.bad, toneMapped: false, transparent: true, opacity: 0.7 }));
    tap.position.y = 1.4 * S;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55 * S, 0.045 * S, 8, 40), eveMat);
    ring.rotation.x = Math.PI / 2;
    eve.add(crystal, tap, ring);
    eve.position.copy(evePoint);
    eve.visible = false;
    scene.add(eve);

    linkViews.set(link.id, { link, curve, tube, mat, eve, crystal, isQkd, base, mid: evePoint, phase: hash01(link.id), target: base.clone(), current: base.clone(), pulse: 0, selected: false, status: "ok" });
  }

  // Photons on QKD links, packets on post-quantum links, gold packets on the selected key path.
  const qkdLinks = [...linkViews.values()].filter((v) => v.isQkd);
  const pqcLinks = [...linkViews.values()].filter((v) => !v.isQkd);
  const photonsPer = crowded ? 4 : PHOTONS_PER_LINK;
  const photons = new THREE.InstancedMesh(new THREE.SphereGeometry(0.24 * S, 12, 12), new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false }), Math.max(1, qkdLinks.length * photonsPer));
  const packets = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3 * S, 0.3 * S, 0.3 * S), new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false }), Math.max(1, pqcLinks.length * PACKETS_PER_LINK));
  const keyPackets = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.32 * S, 0), new THREE.MeshBasicMaterial({ color: COLORS.gold.clone().multiplyScalar(2.2), toneMapped: false }), KEY_PACKETS);
  for (const m of [photons, packets, keyPackets]) m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(photons, packets, keyPackets);
  const tmp = new THREE.Object3D();
  const tmpColor = new THREE.Color();

  // Shockwaves: an expanding ring where a fiber's alarm fires.
  const shockwaves = [];
  function shockwave(at, color) {
    const mat = new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(1.8), toneMapped: false, transparent: true, opacity: 0.9, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 8, 96), mat);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.set(at.x, 0.15, at.z);
    scene.add(mesh);
    shockwaves.push({ mesh, age: 0 });
  }

  // Interaction -----------------------------------------------------------------------------------
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let downAt = null;
  let hoveredNode = null;

  function pickAt(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(pickables, false);
    if (!hits.length) return null;
    const node = hits.find((h) => h.object.userData.pick.type === "node"); // prefer sites over fibers
    return (node ?? hits[0]).object.userData.pick;
  }

  renderer.domElement.addEventListener("pointerdown", (e) => (downAt = { x: e.clientX, y: e.clientY }));
  renderer.domElement.addEventListener("pointerup", (e) => {
    if (!downAt) return;
    const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
    downAt = null;
    if (moved > 5) return; // that was a drag to orbit, not a click
    onPick(pickAt(e.clientX, e.clientY));
  });
  renderer.domElement.addEventListener("pointermove", (e) => {
    const pick = pickAt(e.clientX, e.clientY);
    renderer.domElement.style.cursor = pick ? "pointer" : "grab";
    hoveredNode = pick && pick.type === "node" ? pick.id : null;
    onHover(pick, e.clientX, e.clientY);
  });
  renderer.domElement.addEventListener("pointerleave", () => {
    hoveredNode = null;
    onHover(null);
  });

  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    applyViewOffset();
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    labelRenderer.setSize(w, h);
    composer.setSize(w, h);
    bloom.setSize(w, h);
  }
  window.addEventListener("resize", resize);

  // Camera glide: when something is selected, the orbit target eases toward it.
  const targetGoal = center.clone();
  function focusOn(sel) {
    if (!sel) return;
    if (sel.type === "node") {
      const n = net.nodes.get(sel.id);
      targetGoal.set(n.pos[0], 0, n.pos[1]);
    } else {
      targetGoal.copy(linkViews.get(sel.id).mid).setY(0);
    }
  }

  // State from the simulation -----------------------------------------------------------------
  let view = null;
  let lastSelKey = null;
  let keyPath = null; // { nodes, links } of the selected site's key path, from the control center outward

  function update(nextView) {
    view = nextView;
    for (const [id, v] of linkViews) {
      const s = view.links.get(id);
      v.eve.visible = s.eve != null;
      const before = v.status;
      v.status = s.quarantined ? "off" : s.status;
      if (v.isQkd && before !== v.status && (v.status === "warning" || v.status === "abort")) shockwave(v.mid, v.status === "abort" ? COLORS.bad : COLORS.warn);
      if (s.quarantined) {
        v.target.copy(COLORS.off);
        v.mat.opacity = 0.35;
      } else if (s.decoy) {
        v.target.copy(COLORS.decoy);
        v.mat.opacity = 0.95;
      } else if (!v.isQkd) {
        v.target.copy(v.base);
        v.mat.opacity = 0.5;
      } else if (s.status === "abort") {
        v.target.copy(COLORS.bad);
        v.mat.opacity = 1;
      } else if (s.status === "warning") {
        v.target.copy(COLORS.warn);
        v.mat.opacity = 1;
      } else {
        // Healthy: drift from teal toward amber as the error rate approaches the warning line.
        const room = Math.max(1e-6, s.threshold - s.baseline);
        const t = THREE.MathUtils.clamp((s.qhat - s.baseline) / room, 0, 1);
        v.target.copy(v.base).lerp(COLORS.warn, t * 0.7);
        v.mat.opacity = 0.85;
      }
      v.pulse = s.quarantined ? 0 : s.decoy ? 3 : s.status === "warning" ? 1 : s.status === "abort" ? 2 : 0;
    }

    const sel = view.selected;
    const selKey = sel ? `${sel.type}:${sel.id}` : null;
    if (selKey !== lastSelKey) {
      lastSelKey = selKey;
      if (sel) focusOn(sel);
      else targetGoal.copy(center);
    }
    const focusSite = sel && sel.type === "node" ? view.sites.get(sel.id) : null;
    const relaySet = new Set(focusSite?.relays ?? []);
    keyPath = focusSite?.keyPath ?? focusSite?.dataPath ?? null;
    const pathLinks = new Set((keyPath?.links ?? []).map((l) => l.id));
    for (const [id, nv] of nodeViews) {
      const site = view.sites.get(id);
      const node = net.nodes.get(id);
      let c;
      if (site.islanded) c = COLORS.bad;
      else if (node.type === "control") c = null;
      else if (site.keySource === "qkd") c = COLORS.ok;
      else c = COLORS.pqc;
      if (c) nv.glowMat.color.copy(c).multiplyScalar(node.type === "subunit" ? 1.2 : 1.3);
      nv.relayRing.material.opacity = relaySet.has(id) ? 0.95 : 0;
      const focus = (sel && sel.type === "node" && sel.id === id) || relaySet.has(id) || (sel && sel.type === "link" && (net.links.get(sel.id).a === id || net.links.get(sel.id).b === id));
      nv.el.classList.toggle("is-focus", !!focus);
    }
    for (const [id, v] of linkViews) v.selected = (sel && sel.type === "link" && sel.id === id) || pathLinks.has(id);
  }

  // Animation loop --------------------------------------------------------------------------
  const clock = new THREE.Clock();
  const intro = { t: reduceMotion ? 1 : 0 };
  let paused = false;
  let flow = 0; // animation time for photons and packets: advances only while not paused, so pausing freezes them in place

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    const time = clock.elapsedTime;
    if (!paused) flow += dt;

    if (intro.t < 1) {
      intro.t = Math.min(1, intro.t + dt / 3.2);
      const e = 1 - Math.pow(1 - intro.t, 3); // ease-out cubic
      camera.position.lerpVectors(startPos, restPos, e);
      camera.lookAt(center);
      if (intro.t === 1) controls.enabled = true;
    } else {
      // Glide the orbit target toward the selection; the camera moves with it so the view angle is kept.
      const step = targetGoal.clone().sub(controls.target).multiplyScalar(reduceMotion ? 1 : 0.06);
      controls.target.add(step);
      camera.position.add(step);
      controls.update();
    }

    for (const v of linkViews.values()) {
      // `current` eases toward the state color; the displayed color is derived from it each frame,
      // so pulse and selection brightness never compound.
      v.current.lerp(v.target, 0.12);
      v.mat.color.copy(v.current);
      if (v.pulse) {
        const speed = v.pulse === 2 ? 9 : v.pulse === 3 ? 2 : 4;
        v.mat.color.multiplyScalar(0.9 + 0.55 * (0.5 + 0.5 * Math.sin(time * speed)));
      }
      if (v.selected) v.mat.color.multiplyScalar(1.5);
      if (v.eve.visible) {
        v.crystal.rotation.y += dt * 1.6;
        v.crystal.position.y = 2.8 * S + Math.sin(time * 2.2) * 0.2 * S;
      }
    }

    // Photons travel the QKD fibers; past an eavesdropper, the share she intercepts turns red.
    let i = 0;
    for (const v of qkdLinks) {
      const s = view?.links.get(v.link.id);
      const off = !s || s.quarantined;
      for (let k = 0; k < photonsPer; k++) {
        const t = (v.phase + flow * 0.11 + k / photonsPer) % 1;
        if (off) tmp.scale.setScalar(0);
        else {
          tmp.position.copy(v.curve.getPoint(t));
          tmp.scale.setScalar(0.75 + 0.25 * Math.sin((t + k) * Math.PI * 2));
        }
        tmp.rotation.set(0, 0, 0);
        tmp.updateMatrix();
        photons.setMatrixAt(i, tmp.matrix);
        const tapped = s && s.eve != null && t > 0.5 && fract(k * 0.618034 + 0.17) < s.eve;
        tmpColor.copy(tapped ? COLORS.photonHit : COLORS.photon).multiplyScalar(tapped ? 2.2 : 1.6);
        photons.setColorAt(i, tmpColor);
        i++;
      }
    }
    photons.instanceMatrix.needsUpdate = true;
    if (photons.instanceColor) photons.instanceColor.needsUpdate = true;

    let j = 0;
    for (const v of pqcLinks) {
      const s = view?.links.get(v.link.id);
      const off = !s || s.quarantined;
      for (let k = 0; k < PACKETS_PER_LINK; k++) {
        const t = (v.phase + flow * 0.2 + k / PACKETS_PER_LINK) % 1;
        if (off) tmp.scale.setScalar(0);
        else {
          tmp.position.copy(v.curve.getPoint(t));
          tmp.rotation.set(flow, flow * 0.7, 0);
          tmp.scale.setScalar(1);
        }
        tmp.updateMatrix();
        packets.setMatrixAt(j, tmp.matrix);
        packets.setColorAt(j, tmpColor.copy(COLORS.packet).multiplyScalar(1.1));
        j++;
      }
    }
    packets.instanceMatrix.needsUpdate = true;
    if (packets.instanceColor) packets.instanceColor.needsUpdate = true;

    // Gold key packets walk the selected site's key path from the control center outward.
    const path = keyPath?.links ?? [];
    for (let k = 0; k < KEY_PACKETS; k++) {
      if (!path.length) {
        tmp.scale.setScalar(0);
      } else {
        const u = (flow * 0.35 + k / KEY_PACKETS) % 1;
        const along = u * path.length;
        const idx = Math.min(path.length - 1, Math.floor(along));
        const lv = linkViews.get(path[idx].id);
        const frac = along - idx;
        // Path nodes run from the control center to the site, so link idx starts at keyPath.nodes[idx].
        const forward = lv.link.a === keyPath.nodes[idx];
        tmp.position.copy(lv.curve.getPoint(forward ? frac : 1 - frac));
        tmp.position.y += 0.15 * S;
        tmp.rotation.set(flow * 2, flow * 3, 0);
        tmp.scale.setScalar(0.8 + 0.4 * Math.sin(u * Math.PI));
      }
      tmp.updateMatrix();
      keyPackets.setMatrixAt(k, tmp.matrix);
    }
    keyPackets.instanceMatrix.needsUpdate = true;

    for (const [id, nv] of nodeViews) {
      if (nv.group.userData.spin) for (const m of nv.group.userData.spin) m.rotation.z += dt * 0.6;
      if (nv.relayRing.material.opacity > 0) nv.relayRing.scale.setScalar(1 + 0.08 * Math.sin(time * 3));
      nv.hover += ((hoveredNode === id ? 1 : 0) - nv.hover) * 0.2;
      nv.body.scale.setScalar(1 + 0.14 * nv.hover);
    }

    for (let k = shockwaves.length - 1; k >= 0; k--) {
      const w = shockwaves[k];
      w.age += dt;
      const t = w.age / 1.4;
      w.mesh.scale.setScalar(1 + t * 9 * S);
      w.mesh.material.opacity = 0.9 * (1 - t);
      if (t >= 1) {
        scene.remove(w.mesh);
        w.mesh.geometry.dispose();
        w.mesh.material.dispose();
        shockwaves.splice(k, 1);
      }
    }

    composer.render();
    labelRenderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return {
    update,
    setPaused(p) {
      paused = p;
    },
    /** Tell the scene how much of the screen the panel covers, so the network stays centered beside it. */
    setInsets(next) {
      insets = { right: next.right ?? 0, bottom: next.bottom ?? 0 };
      const wasResting = intro.t >= 1 && camera.position.distanceTo(restPos) < 0.5;
      restPos = framing();
      if (wasResting) camera.position.copy(restPos);
      applyViewOffset();
      camera.updateProjectionMatrix();
    },
    /** Fly back to the framed overview (the F key). */
    frameAll() {
      targetGoal.copy(center);
      const offset = restPos.clone().sub(center);
      camera.position.copy(controls.target).add(offset);
    },
  };

  function endHeight(node) {
    if (node.type === "control") return 1.1 * S;
    if (node.type === "subunit") return 0.75 * S;
    return 1.35 * S;
  }
}

function fract(x) {
  return x - Math.floor(x);
}

function hash01(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}
