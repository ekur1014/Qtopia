// The 3D view. It only draws: all physics and decisions live in bb84.js, detector.js and response.js.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

// Two looks. Dark glows (bloom on, colors above 1 for emissive parts); light reads like a printed map
// (no bloom, no tone mapping, saturated mid-tone colors on white buildings) and is the default.
const THEMES = {
  dark: {
    bg: "#04060b", fog: 0.55, ground: ["#0f1729", "#070b15", "#04060b"], grid: ["#253559", "#141d35"], gridOpacity: 0.32,
    metal: { color: "#151c2c", metalness: 0.65, roughness: 0.38 }, hemi: ["#9fb6ff", "#06080f", 0.6], key: 1.2,
    bloom: 0.6, glow: true, beacon: new THREE.Color(2.0, 2.2, 2.4), selBoost: 1.5, pulseLo: 0.9, pulseAmp: 0.55, toneMapping: THREE.ACESFilmicToneMapping,
    colors: { ok: "#3ef0c6", warn: "#ffb547", bad: "#ff4d6d", pqc: "#6aa1ff", off: "#2b3244", gold: "#ffd76a", photon: "#e9fbff", photonHit: "#ff3d62", packet: "#a9c8ff", decoy: "#ff5ec7", tele: "#5ad7ff", sat: "#cfe0ff" },
  },
  light: {
    bg: "#eef2f7", fog: 0.28, ground: ["#ffffff", "#f5f7fb", "#eef2f7"], grid: ["#b3bed0", "#d3dae6"], gridOpacity: 0.6,
    metal: { color: "#eef1f6", metalness: 0.12, roughness: 0.6 }, hemi: ["#ffffff", "#9aa6ba", 1.15], key: 1.6,
    bloom: 0, glow: false, beacon: new THREE.Color("#0f1a2e"), selBoost: 0.68, pulseLo: 0.72, pulseAmp: 0.34, toneMapping: THREE.NoToneMapping,
    colors: { ok: "#07a27e", warn: "#e08600", bad: "#e0314f", pqc: "#2d6cdf", off: "#c3cad6", gold: "#c99500", photon: "#1d4ed8", photonHit: "#e0314f", packet: "#2d6cdf", decoy: "#d23c97", tele: "#0e95cf", sat: "#334155" },
  },
};
const COLORS = Object.fromEntries(Object.entries(THEMES.dark.colors).map(([k, v]) => [k, new THREE.Color(v)]));
const PHOTONS_PER_LINK = 7;
const PACKETS_PER_LINK = 3;
const KEY_PACKETS = 28; // gold packets that trace the selected site's key path

export function createScene({ container, net, onPick, onHover, theme = "light", onInteract = () => {} }) {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let T = THEMES[theme] ?? THEMES.light;
  for (const [k, v] of Object.entries(T.colors)) COLORS[k].set(v);
  // Emissive color: pushed above 1 in the dark theme so bloom picks it up; plain in the light theme.
  const glow = (c, k) => c.clone().multiplyScalar(T.glow ? k : 1);
  const nodeCount = net.nodes.size;
  const crowded = nodeCount > 40; // big grids: fewer labels, smaller photons per link

  // Network extent; everything visual scales with it so a 300-bus grid reads as well as the 17-site city.
  const xs = [...net.nodes.values()].map((n) => n.pos[0]);
  const zs = [...net.nodes.values()].map((n) => n.pos[1]);
  const center = new THREE.Vector3((Math.min(...xs) + Math.max(...xs)) / 2, 0, (Math.min(...zs) + Math.max(...zs)) / 2);
  const span = Math.max(30, Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
  // Size factor for nodes, fibers and photons. Real maps set nodeScale: substations there can sit a few hundred metres apart.
  const S = THREE.MathUtils.clamp(Math.sqrt(span / 55), 1, 2.2) * (net.meta?.nodeScale ?? 1);

  // Renderer, labels, post-processing ------------------------------------------------------------
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.toneMapping = T.toneMapping;
  renderer.toneMappingExposure = 1.0;
  container.appendChild(renderer.domElement);

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(container.clientWidth, container.clientHeight);
  Object.assign(labelRenderer.domElement.style, { position: "absolute", inset: "0", pointerEvents: "none" });
  container.appendChild(labelRenderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(T.bg);
  scene.fog = new THREE.FogExp2(T.bg, T.fog / span);

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
  const bloom = new UnrealBloomPass(new THREE.Vector2(container.clientWidth, container.clientHeight), T.bloom || 0.6, 0.45, 0.32);
  bloom.enabled = T.bloom > 0;
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // Lights and ground ---------------------------------------------------------------------------
  const hemi = new THREE.HemisphereLight(T.hemi[0], T.hemi[1], T.hemi[2]);
  scene.add(hemi);
  const key = new THREE.DirectionalLight("#cfe0ff", T.key);
  key.position.set(-span * 0.5, span, span * 0.7);
  scene.add(key);

  const groundCanvas = document.createElement("canvas");
  groundCanvas.width = groundCanvas.height = 512;
  const groundTex = new THREE.CanvasTexture(groundCanvas);
  groundTex.colorSpace = THREE.SRGBColorSpace;
  function paintGround() {
    const g = groundCanvas.getContext("2d");
    const grad = g.createRadialGradient(256, 256, 10, 256, 256, 256);
    grad.addColorStop(0, T.ground[0]);
    grad.addColorStop(0.6, T.ground[1]);
    grad.addColorStop(1, T.ground[2]);
    g.fillStyle = grad;
    g.fillRect(0, 0, 512, 512);
    groundTex.needsUpdate = true;
  }
  paintGround();
  const ground = new THREE.Mesh(new THREE.CircleGeometry(span * 1.9, 96), new THREE.MeshBasicMaterial({ map: groundTex }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(center.x, -0.02, center.z);
  scene.add(ground);

  let grid = null;
  function buildGrid() {
    if (grid) {
      scene.remove(grid);
      grid.geometry.dispose();
      grid.material.dispose();
    }
    grid = new THREE.GridHelper(span * 3.2, 64, T.grid[0], T.grid[1]);
    grid.position.set(center.x, 0, center.z);
    grid.material.transparent = true;
    grid.material.opacity = T.gridOpacity;
    scene.add(grid);
  }
  buildGrid();

  // Nodes ---------------------------------------------------------------------------------------
  const pickables = [];
  const nodeViews = new Map();
  const darkMetal = new THREE.MeshStandardMaterial(T.metal);
  const controlGlows = []; // control-center beacons: not recolored by state, so the theme sets them
  const halos = [];

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
      glowMat = new THREE.MeshBasicMaterial({ color: T.beacon.clone(), toneMapped: false });
      controlGlows.push(glowMat);
      const beacon = new THREE.Mesh(new THREE.OctahedronGeometry(0.7 * S, 0), glowMat);
      beacon.position.y = height + 1.3 * S;
      const haloMat = new THREE.MeshBasicMaterial({ color: COLORS.ok.clone(), toneMapped: false });
      halos.push(haloMat);
      const halo = new THREE.Mesh(new THREE.TorusGeometry(1.6 * S, 0.06 * S, 8, 64), haloMat);
      halo.rotation.x = Math.PI / 2;
      halo.position.y = height + 1.3 * S;
      body.add(base, pillar, beacon, halo);
      group.userData.spin = [beacon, halo];
    } else if (node.type === "substation" || node.type === "remote") {
      const r = (node.type === "remote" ? 1.1 : 1.45) * S;
      height = 2.2 * S;
      const shell = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.1, height, 6), darkMetal);
      shell.position.y = height / 2;
      glowMat = new THREE.MeshBasicMaterial({ color: glow(COLORS.ok, 1.3), toneMapped: false });
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
      glowMat = new THREE.MeshBasicMaterial({ color: glow(COLORS.pqc, 1.2), toneMapped: false });
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
    el.className = `label label--${node.type}${crowded && node.type !== "control" && !node.short ? " label--quiet" : ""}`;
    el.innerHTML = node.short ? `${node.short}<span class="label__name">${node.id}</span>` : `${node.id}<span class="label__name">${node.name}</span>`;
    const label = new CSS2DObject(el);
    label.position.set(0, height + (node.type === "control" ? 3.2 : 1.6) * S, 0);
    group.add(label);

    scene.add(group);
    nodeViews.set(node.id, { group, body, glowMat, relayRing, el, height, hover: 0 });
  }

  // Links ---------------------------------------------------------------------------------------
  const linkViews = new Map();
  const linkBase = (isQkd) => (isQkd ? COLORS.ok.clone().multiplyScalar(T.glow ? 0.85 : 1) : COLORS.pqc.clone().multiplyScalar(T.glow ? 0.8 : 1));
  const eveMat = new THREE.MeshBasicMaterial({ color: glow(COLORS.bad, 2.0), toneMapped: false }); // shared by every tap marker
  const eveLineMat = new THREE.MeshBasicMaterial({ color: COLORS.bad.clone(), toneMapped: false, transparent: true, opacity: 0.7 });
  for (const link of net.links.values()) {
    const a = net.nodes.get(link.a);
    const b = net.nodes.get(link.b);
    const pa = new THREE.Vector3(a.pos[0], endHeight(a), a.pos[1]);
    const pb = new THREE.Vector3(b.pos[0], endHeight(b), b.pos[1]);
    let curve;
    if (link.path?.length >= 2) {
      // Real route (from the map data): follow it, lifted like a cable on towers.
      const pts = link.path.map(([x, z]) => new THREE.Vector3(x, 0, z));
      pts[0].copy(pa).setY(0);
      pts[pts.length - 1].copy(pb).setY(0);
      if (pts.length === 2) pts.splice(1, 0, pts[0].clone().lerp(pts[1], 0.5));
      const n = pts.length;
      pts.forEach((p, i) => {
        const t = i / (n - 1);
        p.y = THREE.MathUtils.lerp(pa.y, pb.y, t) + Math.sin(Math.PI * t) * (0.5 * S + pa.distanceTo(pb) * 0.04);
      });
      curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
    } else {
      const mid = pa.clone().lerp(pb, 0.5);
      mid.y += 1.4 * S + pa.distanceTo(pb) * 0.12; // arc, so links read as cables lifted off the ground
      curve = new THREE.QuadraticBezierCurve3(pa, mid, pb);
    }

    const isQkd = link.kind === "qkd";
    const base = linkBase(isQkd);
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
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.7 * S, 0), eveMat);
    crystal.position.y = 2.8 * S;
    const tap = new THREE.Mesh(new THREE.CylinderGeometry(0.03 * S, 0.03 * S, 2.8 * S, 6), eveLineMat);
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
  const keyPackets = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.32 * S, 0), new THREE.MeshBasicMaterial({ color: glow(COLORS.gold, 2.2), toneMapped: false }), KEY_PACKETS);
  for (const m of [photons, packets, keyPackets]) m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(photons, packets, keyPackets);
  const tmp = new THREE.Object3D();
  const tmpColor = new THREE.Color();

  // Shockwaves: an expanding ring where a fiber's alarm fires.
  const shockwaves = [];
  function shockwave(at, color) {
    const mat = new THREE.MeshBasicMaterial({ color: glow(color, 1.8), toneMapped: false, transparent: true, opacity: 0.9, depthWrite: false });
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

  // Camera ----------------------------------------------------------------------------------------
  // Glide: when something is selected, the orbit target eases toward it and the camera keeps its angle.
  // Fly: a timed move of both camera and target (Fit, Focus). Dolly: an eased zoom (+ and − buttons).
  // Cinematic orbit: a slow turn around the target that stops on any interaction and resumes when idle.
  const targetGoal = center.clone();
  let fly = null;
  let dollyGoal = null;
  let focusMode = false;
  let orbitOn = !reduceMotion;
  let lastInteract = -Infinity;
  const ORBIT_IDLE_S = 20;
  controls.autoRotateSpeed = 0.9; // about 67 s per turn

  function pointOf(sel) {
    if (sel.type === "node") {
      const n = net.nodes.get(sel.id);
      return new THREE.Vector3(n.pos[0], 0, n.pos[1]);
    }
    return linkViews.get(sel.id).mid.clone().setY(0);
  }
  function focusOn(sel) {
    if (sel) targetGoal.copy(pointOf(sel));
  }
  function flyTo(pos, target, seconds = 1.1) {
    dollyGoal = null;
    fly = { fromPos: camera.position.clone(), toPos: pos, fromTarget: controls.target.clone(), toTarget: target, t: 0, dur: reduceMotion ? 0.001 : seconds };
    targetGoal.copy(target);
  }
  function noteInteraction() {
    lastInteract = clock.elapsedTime;
    controls.autoRotate = false;
    onInteract();
  }
  controls.addEventListener("start", () => {
    fly = null;
    dollyGoal = null;
    noteInteraction();
  });
  // Close-up on the selection: a site and its neighbours, or a whole fiber with both ends in view.
  function closeUp(sel) {
    const p = pointOf(sel);
    let dist = 48 * S;
    if (sel.type === "link") {
      const l = net.links.get(sel.id);
      const a = net.nodes.get(l.a);
      const b = net.nodes.get(l.b);
      dist = Math.max(dist, 1.7 * Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1]));
    }
    const dir = camera.position.clone().sub(controls.target);
    dir.y = 0;
    if (dir.lengthSq() < 1e-6) dir.set(-0.2, 0, 1);
    dir.normalize().multiplyScalar(Math.cos(0.85)).setY(Math.sin(0.85)); // about 49 degrees above the ground
    flyTo(p.clone().addScaledVector(dir, Math.min(dist, controls.maxDistance)), p);
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
      // Teleportation view: quantum fibers under 11% error are usable for entanglement, others are not.
      if (view.teleport) {
        const q = view.teleport.linkQ.get(id);
        v.pulse = 0;
        if (q == null) {
          v.target.copy(COLORS.off);
          v.mat.opacity = 0.3;
        } else if (q < 0.11) {
          v.target.copy(COLORS.tele);
          v.mat.opacity = 0.95;
        } else {
          v.target.copy(COLORS.bad).multiplyScalar(T.glow ? 0.7 : 1);
          v.mat.opacity = 0.6;
        }
      }
    }

    const sel = view.selected;
    const selKey = sel ? `${sel.type}:${sel.id}` : null;
    if (selKey !== lastSelKey) {
      lastSelKey = selKey;
      if (sel && focusMode) closeUp(sel);
      else if (sel) focusOn(sel);
      else {
        focusMode = false;
        if (!fly) targetGoal.copy(center);
      }
    }
    const focusSite = sel && sel.type === "node" ? view.sites.get(sel.id) : null;
    const teleRoute = view.teleport?.route ?? null;
    // A shown route search wins over the selected site's own key path (outside the teleportation view).
    const searched = !view.teleport && view.route?.path ? view.route : null;
    // In the teleportation view the rings mark swapping nodes (blue: never hold the key); otherwise trusted relays
    // (gold). On an ML-KEM route the sites in between only forward ciphertext, so their rings are blue.
    const relaySet = new Set(view.teleport ? (teleRoute ? teleRoute.nodes.slice(1, -1) : []) : searched ? searched.relays : (focusSite?.relays ?? []));
    keyPath = view.teleport ? teleRoute : searched ? searched.path : (focusSite?.keyPath ?? focusSite?.dataPath ?? null);
    const ringColor = view.teleport ? COLORS.tele : searched && searched.mode === "pqc" ? COLORS.pqc : COLORS.gold;
    keyPackets.material.color.copy(glow(ringColor, 2.2));
    const pathLinks = new Set((keyPath?.links ?? []).map((l) => l.id));
    for (const [id, nv] of nodeViews) {
      const site = view.sites.get(id);
      const node = net.nodes.get(id);
      let c;
      if (site.islanded) c = COLORS.bad;
      else if (node.type === "control") c = null;
      else if (site.keySource === "qkd") c = COLORS.ok;
      else c = COLORS.pqc;
      if (c) nv.glowMat.color.copy(glow(c, node.type === "subunit" ? 1.2 : 1.3));
      nv.relayRing.material.opacity = relaySet.has(id) ? 0.95 : 0;
      nv.relayRing.material.color.copy(ringColor);
      const focus = (sel && sel.type === "node" && sel.id === id) || relaySet.has(id) || (keyPath?.nodes ?? []).includes(id) || (sel && sel.type === "link" && (net.links.get(sel.id).a === id || net.links.get(sel.id).b === id));
      nv.el.classList.toggle("is-focus", !!focus);
      nv.el.classList.toggle("is-dim", focusMode && !!sel && !focus);
    }
    for (const [id, v] of linkViews) {
      v.selected = (sel && sel.type === "link" && sel.id === id) || pathLinks.has(id);
      // Focus mode: everything not on the selection or its path fades back.
      const related = v.selected || (sel && sel.type === "node" && (v.link.a === sel.id || v.link.b === sel.id));
      if (focusMode && sel && !related) v.mat.opacity *= 0.16;
    }
  }

  // Satellite concept layer (off by default) ----------------------------------------------------------
  // A drawing only: nothing about it is simulated. It shows where a satellite QKD link to the control
  // centers would sit, for discussion; the team scoped satellites out of the build.
  const satRadius = span * 0.3;
  const satHeight = span * 0.3;
  const centersList = [...net.nodes.values()].filter((n) => n.type === "control");
  const sat = new THREE.Group();
  const satBodyMat = new THREE.MeshStandardMaterial({ color: "#d4dae5", metalness: 0.55, roughness: 0.32 });
  const satPanelMat = new THREE.MeshStandardMaterial({ color: "#1f3f9a", metalness: 0.3, roughness: 0.45, emissive: "#0b1d4d", emissiveIntensity: 0.35 });
  const satBody = new THREE.Mesh(new THREE.BoxGeometry(1.6 * S, 1.2 * S, 1.2 * S), satBodyMat);
  const wingL = new THREE.Mesh(new THREE.BoxGeometry(3.4 * S, 0.06 * S, 1.3 * S), satPanelMat);
  wingL.position.x = -2.6 * S;
  const wingR = wingL.clone();
  wingR.position.x = 2.6 * S;
  const dish = new THREE.Mesh(new THREE.ConeGeometry(0.55 * S, 0.6 * S, 18, 1, true), satBodyMat);
  dish.position.y = -0.85 * S;
  sat.add(satBody, wingL, wingR, dish);
  const satEl = document.createElement("div");
  satEl.className = "label label--sat";
  satEl.innerHTML = `SAT<span class="label__name">concept, not simulated</span>`;
  const satLabel = new CSS2DObject(satEl);
  satLabel.position.set(0, 2.2 * S, 0);
  sat.add(satLabel);
  const ringPts = Array.from({ length: 129 }, (_, i) => {
    const a = (i / 128) * Math.PI * 2;
    return new THREE.Vector3(center.x + Math.cos(a) * satRadius, satHeight, center.z + Math.sin(a) * satRadius);
  });
  const satRingMat = new THREE.LineDashedMaterial({ color: COLORS.sat.clone(), dashSize: span * 0.02, gapSize: span * 0.015, transparent: true, opacity: 0.45 });
  const satRing = new THREE.Line(new THREE.BufferGeometry().setFromPoints(ringPts), satRingMat);
  satRing.computeLineDistances();
  const beamGeo = new THREE.BufferGeometry();
  beamGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(centersList.length * 6), 3));
  const beamMat = new THREE.LineBasicMaterial({ color: glow(COLORS.tele, 1.6), transparent: true, opacity: 0.7, toneMapped: false });
  const beams = new THREE.LineSegments(beamGeo, beamMat);
  beams.frustumCulled = false;
  const satLayer = new THREE.Group();
  satLayer.add(sat, satRing, beams);
  satLayer.visible = false;
  scene.add(satLayer);
  function setSatellite(on) {
    satLayer.visible = !!on;
  }
  function moveSatellite(t) {
    const a = t * 0.06;
    sat.position.set(center.x + Math.cos(a) * satRadius, satHeight, center.z + Math.sin(a) * satRadius);
    sat.lookAt(center.x, 0, center.z);
    const arr = beamGeo.attributes.position.array;
    centersList.forEach((n, i) => {
      arr.set([sat.position.x, sat.position.y - 0.9 * S, sat.position.z, n.pos[0], 7.7 * S, n.pos[1]], i * 6);
    });
    beamGeo.attributes.position.needsUpdate = true;
    beamMat.opacity = 0.45 + 0.3 * (0.5 + 0.5 * Math.sin(t * 2.4));
  }

  // Theme -----------------------------------------------------------------------------------------
  function setTheme(name) {
    const next = THEMES[name];
    if (!next || next === T) return;
    T = next;
    for (const [k, v] of Object.entries(T.colors)) COLORS[k].set(v);
    renderer.toneMapping = T.toneMapping;
    scene.background.set(T.bg);
    scene.fog.color.set(T.bg);
    scene.fog.density = T.fog / span;
    bloom.enabled = T.bloom > 0;
    if (T.bloom) bloom.strength = T.bloom;
    hemi.color.set(T.hemi[0]);
    hemi.groundColor.set(T.hemi[1]);
    hemi.intensity = T.hemi[2];
    key.intensity = T.key;
    paintGround();
    buildGrid();
    darkMetal.color.set(T.metal.color);
    darkMetal.metalness = T.metal.metalness;
    darkMetal.roughness = T.metal.roughness;
    for (const m of controlGlows) m.color.copy(T.beacon);
    for (const m of halos) m.color.copy(COLORS.ok);
    eveMat.color.copy(glow(COLORS.bad, 2.0));
    eveLineMat.color.copy(COLORS.bad);
    satRingMat.color.copy(COLORS.sat);
    beamMat.color.copy(glow(COLORS.tele, 1.6));
    for (const v of linkViews.values()) v.base.copy(linkBase(v.isQkd));
    if (view) update(view);
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
      if (intro.t === 1) {
        controls.enabled = true;
        lastInteract = time - ORBIT_IDLE_S + 2; // the cinematic orbit starts two seconds after the intro
      }
    } else if (fly) {
      fly.t = Math.min(1, fly.t + dt / fly.dur);
      const e = fly.t < 0.5 ? 4 * fly.t ** 3 : 1 - Math.pow(-2 * fly.t + 2, 3) / 2; // ease-in-out cubic
      controls.target.lerpVectors(fly.fromTarget, fly.toTarget, e);
      camera.position.lerpVectors(fly.fromPos, fly.toPos, e);
      if (fly.t === 1) fly = null;
      controls.update();
    } else {
      // Glide the orbit target toward the selection; the camera moves with it so the view angle is kept.
      const step = targetGoal.clone().sub(controls.target).multiplyScalar(reduceMotion ? 1 : 0.06);
      controls.target.add(step);
      camera.position.add(step);
      if (dollyGoal != null) {
        const off = camera.position.clone().sub(controls.target);
        const d = off.length();
        const nd = d + (dollyGoal - d) * 0.14;
        camera.position.copy(controls.target).addScaledVector(off.normalize(), nd);
        if (Math.abs(nd - dollyGoal) < 0.02 * S) dollyGoal = null;
      }
      controls.autoRotate = orbitOn && !paused && time - lastInteract > ORBIT_IDLE_S;
      controls.update(dt);
    }

    for (const v of linkViews.values()) {
      // `current` eases toward the state color; the displayed color is derived from it each frame,
      // so pulse and selection brightness never compound.
      v.current.lerp(v.target, 0.12);
      v.mat.color.copy(v.current);
      if (v.pulse) {
        const speed = v.pulse === 2 ? 9 : v.pulse === 3 ? 2 : 4;
        v.mat.color.multiplyScalar(T.pulseLo + T.pulseAmp * (0.5 + 0.5 * Math.sin(time * speed)));
      }
      if (v.selected) v.mat.color.multiplyScalar(T.selBoost);
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
        tmpColor.copy(tapped ? COLORS.photonHit : COLORS.photon).multiplyScalar(T.glow ? (tapped ? 2.2 : 1.6) : 1);
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
        packets.setColorAt(j, tmpColor.copy(COLORS.packet).multiplyScalar(T.glow ? 1.1 : 1));
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

    if (satLayer.visible) moveSatellite(flow);

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
    /** Fly back to the framed overview of the whole network (Fit, the H key). */
    frameAll() {
      focusMode = false;
      flyTo(restPos.clone(), center.clone());
      if (view) update(view);
    },
    /** Focus mode: fly close to the selection and fade everything unrelated (the F key). */
    focus(sel) {
      if (!sel) return false;
      focusMode = true;
      closeUp(sel);
      if (view) update(view);
      return true;
    },
    get focusMode() {
      return focusMode;
    },
    /** Zoom by a factor of the current distance (below 1 zooms in). */
    zoom(factor) {
      fly = null;
      const d = (dollyGoal ?? camera.position.distanceTo(controls.target)) * factor;
      dollyGoal = THREE.MathUtils.clamp(d, controls.minDistance, controls.maxDistance);
      noteInteraction();
    },
    /** Cinematic orbit: turns slowly while nobody is interacting. */
    setOrbit(on) {
      orbitOn = on;
      lastInteract = on ? clock.elapsedTime - ORBIT_IDLE_S : clock.elapsedTime;
    },
    get orbit() {
      return orbitOn;
    },
    noteInteraction,
    setTheme,
    setSatellite,
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
