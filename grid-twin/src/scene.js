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
};
const PHOTONS_PER_LINK = 7;
const PACKETS_PER_LINK = 3;

export function createScene({ container, net, onPick, onHover }) {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Renderer, labels, post-processing ------------------------------------------------------------
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(container.clientWidth, container.clientHeight);
  Object.assign(labelRenderer.domElement.style, { position: "absolute", inset: "0", pointerEvents: "none" });
  container.appendChild(labelRenderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#04060b");
  scene.fog = new THREE.FogExp2("#04060b", 0.0105);

  const camera = new THREE.PerspectiveCamera(42, container.clientWidth / container.clientHeight, 0.1, 600);

  // Center of the network, so the camera orbits the middle of it.
  const xs = [...net.nodes.values()].map((n) => n.pos[0]);
  const zs = [...net.nodes.values()].map((n) => n.pos[1]);
  const center = new THREE.Vector3((Math.min(...xs) + Math.max(...xs)) / 2, 0, (Math.min(...zs) + Math.max(...zs)) / 2);
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(center);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 18;
  controls.maxDistance = 140;
  controls.minPolarAngle = 0.15;
  controls.maxPolarAngle = 1.32;
  controls.enabled = false; // until the intro flight ends

  // Insets: the part of the screen covered by the panel (right on desktop, bottom on phones).
  // The view is offset so the network is centered in what is left, and pulled back on tall screens.
  let insets = { right: 0, bottom: 0 };
  const restDir = new THREE.Vector3(-span * 0.1, span * 0.5, span * 0.56);
  function framing() {
    const w = Math.max(1, container.clientWidth - insets.right);
    const h = Math.max(1, container.clientHeight - insets.bottom);
    const k = THREE.MathUtils.clamp(1.1 / (w / h), 0.92, 2.1); // only pull back when the free area is taller than wide
    return center.clone().add(restDir.clone().multiplyScalar(k));
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
  const bloom = new UnrealBloomPass(new THREE.Vector2(container.clientWidth, container.clientHeight), 1.2, 0.6, 0.16);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // Lights and ground ---------------------------------------------------------------------------
  scene.add(new THREE.HemisphereLight("#9fb6ff", "#06080f", 0.55));
  const key = new THREE.DirectionalLight("#cfe0ff", 1.1);
  key.position.set(-30, 60, 40);
  scene.add(key);

  const groundTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 512;
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(256, 256, 10, 256, 256, 256);
    grad.addColorStop(0, "#111a2e");
    grad.addColorStop(0.55, "#070b15");
    grad.addColorStop(1, "#04060b");
    g.fillStyle = grad;
    g.fillRect(0, 0, 512, 512);
    // Faint "city blocks" so the ground reads as terrain, not void.
    const rand = mulberry(11);
    for (let i = 0; i < 900; i++) {
      const x = rand() * 512;
      const y = rand() * 512;
      const r = Math.hypot(x - 256, y - 256);
      if (r > 230) continue;
      g.fillStyle = `rgba(120,150,220,${0.02 + rand() * 0.05 * (1 - r / 256)})`;
      g.fillRect(x, y, 1 + rand() * 4, 1 + rand() * 4);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  })();
  const ground = new THREE.Mesh(new THREE.CircleGeometry(span * 1.9, 96), new THREE.MeshBasicMaterial({ map: groundTex, transparent: true }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(center.x, -0.02, center.z);
  scene.add(ground);

  const grid = new THREE.GridHelper(span * 3.2, 64, "#2a3a66", "#16203a");
  grid.position.set(center.x, 0, center.z);
  grid.material.transparent = true;
  grid.material.opacity = 0.28;
  scene.add(grid);

  // Nodes ---------------------------------------------------------------------------------------
  const pickables = [];
  const nodeViews = new Map();
  const darkMetal = new THREE.MeshStandardMaterial({ color: "#121827", metalness: 0.7, roughness: 0.35 });

  for (const node of net.nodes.values()) {
    const group = new THREE.Group();
    group.position.set(node.pos[0], 0, node.pos[1]);
    let glowMat;
    let height;

    if (node.type === "control") {
      height = 5.2;
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.8, 0.6, 6), darkMetal);
      base.position.y = 0.3;
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, height, 6), darkMetal);
      pillar.position.y = height / 2 + 0.3;
      glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.4, 2.6), toneMapped: false });
      const beacon = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), glowMat);
      beacon.position.y = height + 1.0;
      const halo = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.05, 8, 64), new THREE.MeshBasicMaterial({ color: COLORS.ok, toneMapped: false }));
      halo.rotation.x = Math.PI / 2;
      halo.position.y = height + 1.0;
      group.add(base, pillar, beacon, halo);
      group.userData.spin = [beacon, halo];
    } else if (node.type === "substation" || node.type === "remote") {
      const r = node.type === "remote" ? 0.8 : 1.05;
      height = 1.6;
      const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.08, height, 6), darkMetal);
      body.position.y = height / 2;
      glowMat = new THREE.MeshBasicMaterial({ color: COLORS.ok.clone().multiplyScalar(1.6), toneMapped: false });
      const crown = new THREE.Mesh(new THREE.TorusGeometry(r * 0.98, 0.07, 6, 6), glowMat);
      crown.rotation.x = Math.PI / 2;
      crown.rotation.z = Math.PI / 6;
      crown.position.y = height + 0.02;
      group.add(body, crown);
    } else {
      height = 0.7;
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.75, height, 0.75), darkMetal);
      body.position.y = height / 2;
      glowMat = new THREE.MeshBasicMaterial({ color: COLORS.pqc.clone().multiplyScalar(1.4), toneMapped: false });
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.06, 0.8), glowMat);
      cap.position.y = height + 0.03;
      group.add(body, cap);
    }

    // A generous invisible hit-box makes nodes easy to click.
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, height + 2, 8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = (height + 2) / 2;
    hit.userData.pick = { type: "node", id: node.id };
    group.add(hit);
    pickables.push(hit);

    // Relay ring: shown when a site's QKD key passes through this node (trusted node).
    const relayRing = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.06, 8, 72), new THREE.MeshBasicMaterial({ color: COLORS.gold, toneMapped: false, transparent: true, opacity: 0 }));
    relayRing.rotation.x = Math.PI / 2;
    relayRing.position.y = 0.08;
    group.add(relayRing);

    const el = document.createElement("div");
    el.className = `label label--${node.type}`;
    el.innerHTML = `${node.id}<span class="label__name">${node.name}</span>`;
    const label = new CSS2DObject(el);
    label.position.set(0, height + (node.type === "control" ? 2.4 : 1.2), 0);
    group.add(label);

    scene.add(group);
    nodeViews.set(node.id, { group, glowMat, relayRing, el, height });
  }

  // Links ---------------------------------------------------------------------------------------
  const linkViews = new Map();
  for (const link of net.links.values()) {
    const a = net.nodes.get(link.a);
    const b = net.nodes.get(link.b);
    const ya = endHeight(a);
    const yb = endHeight(b);
    const pa = new THREE.Vector3(a.pos[0], ya, a.pos[1]);
    const pb = new THREE.Vector3(b.pos[0], yb, b.pos[1]);
    const mid = pa.clone().lerp(pb, 0.5);
    mid.y += 1.2 + pa.distanceTo(pb) * 0.12; // arc, so links read as cables lifted off the ground
    const curve = new THREE.QuadraticBezierCurve3(pa, mid, pb);

    const isQkd = link.kind === "qkd";
    const mat = new THREE.MeshBasicMaterial({ color: isQkd ? COLORS.ok : COLORS.pqc, toneMapped: false, transparent: true, opacity: isQkd ? 0.9 : 0.55 });
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, isQkd ? 0.12 : 0.07, 8, false), mat);
    scene.add(tube);

    const hit = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.75, 6, false), new THREE.MeshBasicMaterial({ visible: false }));
    hit.userData.pick = { type: "link", id: link.id };
    scene.add(hit);
    pickables.push(hit);

    // Eavesdropper marker: a red crystal hovering over the fiber with a tap line down to it.
    const evePoint = curve.getPoint(0.5);
    const eve = new THREE.Group();
    const eveMat = new THREE.MeshBasicMaterial({ color: COLORS.bad.clone().multiplyScalar(2.2), toneMapped: false });
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), eveMat);
    crystal.position.y = 2.2;
    const tap = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.2, 6), new THREE.MeshBasicMaterial({ color: COLORS.bad, toneMapped: false, transparent: true, opacity: 0.7 }));
    tap.position.y = 1.1;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.035, 8, 40), eveMat);
    ring.rotation.x = Math.PI / 2;
    eve.add(crystal, tap, ring);
    eve.position.copy(evePoint);
    eve.visible = false;
    scene.add(eve);

    linkViews.set(link.id, { link, curve, tube, mat, eve, crystal, isQkd, phase: Math.random(), target: mat.color.clone(), current: mat.color.clone(), pulse: 0, selected: false });
  }

  // Photons on QKD links and packets on PQC links, drawn as instanced meshes.
  const qkdLinks = [...linkViews.values()].filter((v) => v.isQkd);
  const pqcLinks = [...linkViews.values()].filter((v) => !v.isQkd);
  const photons = new THREE.InstancedMesh(new THREE.SphereGeometry(0.21, 12, 12), new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false }), qkdLinks.length * PHOTONS_PER_LINK);
  const packets = new THREE.InstancedMesh(new THREE.BoxGeometry(0.26, 0.26, 0.26), new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false }), pqcLinks.length * PACKETS_PER_LINK);
  photons.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  packets.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(photons, packets);
  const tmp = new THREE.Object3D();
  const tmpColor = new THREE.Color();

  // Interaction -----------------------------------------------------------------------------------
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let downAt = null;
  let hovered = null;

  function pickAt(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(pickables, false);
    if (!hits.length) return null;
    // Prefer nodes over links when both are under the pointer.
    const node = hits.find((h) => h.object.userData.pick.type === "node");
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
    const key = pick ? `${pick.type}:${pick.id}` : null;
    renderer.domElement.style.cursor = pick ? "pointer" : "grab";
    if (key !== hovered) hovered = key;
    onHover(pick, e.clientX, e.clientY);
  });
  renderer.domElement.addEventListener("pointerleave", () => onHover(null));

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

  // State from the simulation -----------------------------------------------------------------
  let view = null;

  function update(nextView) {
    view = nextView;
    for (const [id, v] of linkViews) {
      const s = view.links.get(id);
      v.eve.visible = s.eve != null;
      if (s.quarantined) {
        v.target.copy(COLORS.off);
        v.mat.opacity = 0.35;
      } else if (!v.isQkd) {
        v.target.copy(COLORS.pqc);
        v.mat.opacity = 0.55;
      } else if (s.status === "abort") {
        v.target.copy(COLORS.bad);
        v.mat.opacity = 1;
      } else if (s.status === "warning") {
        v.target.copy(COLORS.warn);
        v.mat.opacity = 1;
      } else {
        // Healthy: drift from teal toward amber as the error rate approaches the warning line.
        const span = Math.max(1e-6, s.threshold - s.baseline);
        const t = THREE.MathUtils.clamp((s.qhat - s.baseline) / span, 0, 1);
        v.target.copy(COLORS.ok).lerp(COLORS.warn, t * 0.7);
        v.mat.opacity = 0.9;
      }
      v.pulse = s.status === "warning" ? 1 : s.status === "abort" ? 2 : 0;
    }

    const sel = view.selected;
    const focusSite = sel && sel.type === "node" ? view.sites.get(sel.id) : null;
    const relaySet = new Set(focusSite?.relays ?? []);
    const pathLinks = new Set((focusSite?.keyPath?.links ?? focusSite?.dataPath?.links ?? []).map((l) => l.id));
    for (const [id, nv] of nodeViews) {
      const site = view.sites.get(id);
      const node = net.nodes.get(id);
      let c;
      if (site.islanded) c = COLORS.bad;
      else if (node.type === "control") c = null;
      else if (site.keySource === "qkd") c = COLORS.ok;
      else c = COLORS.pqc;
      if (c) nv.glowMat.color.copy(c).multiplyScalar(node.type === "subunit" ? 1.4 : 1.7);
      nv.relayRing.material.opacity = relaySet.has(id) ? 0.95 : 0;
      const focus = (sel && sel.type === "node" && sel.id === id) || relaySet.has(id) || (sel && sel.type === "link" && (net.links.get(sel.id).a === id || net.links.get(sel.id).b === id));
      nv.el.classList.toggle("is-focus", !!focus);
    }
    for (const [id, v] of linkViews) {
      v.selected = (sel && sel.type === "link" && sel.id === id) || pathLinks.has(id);
    }
  }

  // Animation loop --------------------------------------------------------------------------
  const clock = new THREE.Clock();
  const intro = { t: reduceMotion ? 1 : 0 };
  let paused = false;

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    const time = clock.elapsedTime;

    if (intro.t < 1) {
      intro.t = Math.min(1, intro.t + dt / 3.2);
      const e = 1 - Math.pow(1 - intro.t, 3); // ease-out cubic
      camera.position.lerpVectors(startPos, restPos, e);
      camera.lookAt(center);
      if (intro.t === 1) controls.enabled = true;
    } else {
      controls.update();
    }

    // Links: ease colors, pulse alarms, brighten selection.
    for (const v of linkViews.values()) {
      // `current` eases toward the state color; the displayed color is derived from it each frame,
      // so pulse and selection brightness never compound.
      v.current.lerp(v.target, 0.12);
      v.mat.color.copy(v.current);
      if (v.pulse) {
        const speed = v.pulse === 2 ? 9 : 4;
        const k = 0.65 + 0.35 * Math.sin(time * speed);
        v.mat.color.multiplyScalar(0.9 + 0.8 * k);
      }
      if (v.selected) v.mat.color.multiplyScalar(1.45);
      if (v.eve.visible) {
        v.crystal.rotation.y += dt * 1.6;
        v.crystal.position.y = 2.2 + Math.sin(time * 2.2) * 0.18;
      }
    }

    // Photons travel the QKD fibers; past an eavesdropper, the share she intercepts turns red.
    let i = 0;
    for (const v of qkdLinks) {
      const s = view?.links.get(v.link.id);
      const off = !s || s.quarantined;
      for (let k = 0; k < PHOTONS_PER_LINK; k++) {
        const t = (v.phase + (paused ? 0 : time * 0.11) + k / PHOTONS_PER_LINK) % 1;
        if (off) {
          tmp.scale.setScalar(0);
        } else {
          tmp.position.copy(v.curve.getPoint(t));
          const sz = 0.75 + 0.25 * Math.sin((t + k) * Math.PI * 2);
          tmp.scale.setScalar(sz);
        }
        tmp.updateMatrix();
        photons.setMatrixAt(i, tmp.matrix);
        const tapped = s && s.eve != null && t > 0.5 && fract(k * 0.618034 + 0.17) < s.eve;
        tmpColor.copy(tapped ? COLORS.photonHit : COLORS.photon).multiplyScalar(tapped ? 2.4 : 2.0);
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
        const t = (v.phase + (paused ? 0 : time * 0.2) + k / PACKETS_PER_LINK) % 1;
        if (off) tmp.scale.setScalar(0);
        else {
          tmp.position.copy(v.curve.getPoint(t));
          tmp.rotation.set(time, time * 0.7, 0);
          tmp.scale.setScalar(1);
        }
        tmp.updateMatrix();
        packets.setMatrixAt(j, tmp.matrix);
        packets.setColorAt(j, tmpColor.copy(COLORS.packet).multiplyScalar(1.3));
        j++;
      }
    }
    packets.instanceMatrix.needsUpdate = true;
    if (packets.instanceColor) packets.instanceColor.needsUpdate = true;

    for (const nv of nodeViews.values()) {
      if (nv.group.userData.spin) for (const m of nv.group.userData.spin) m.rotation.z += dt * 0.6;
      if (nv.relayRing.material.opacity > 0) {
        const s = 1 + 0.08 * Math.sin(time * 3);
        nv.relayRing.scale.set(s, s, s);
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
  };

  function endHeight(node) {
    if (node.type === "control") return 0.9;
    if (node.type === "subunit") return 0.55;
    return 1.0;
  }
}

function fract(x) {
  return x - Math.floor(x);
}

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
