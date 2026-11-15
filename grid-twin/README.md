# Grid Twin

Shareable copy (private until shared from its Share menu): https://claude.ai/artifact/RMHGPbTvUVXPvKpzXgE6pH

A 3D twin of a city utility's quantum-secured communication network, built for the Tennessee Quantum Hackathon (Secure the Grid track, Step 3).

Every green fiber runs BB84 quantum key distribution. Tap any fiber with an eavesdropper and watch its error rate (QBER) climb, the alarm fire, and the network respond on its own: keys switch to ML-KEM, real traffic reroutes, the fiber switches to decoy traffic so the tap can be measured, and a crew inspection is recommended. Any cut is to **communication paths**, never power, and only an operator can quarantine a fiber.

It opens on the **Tennessee Quantum Grid**: Chattanooga's real EPB and TVA grid from OpenStreetMap. The stylized city and the IEEE test grids are the **Simulation lab** in the same network list. Screens smaller than 1024 × 600 get a "needs a bigger screen" message instead of the 3D view.

It opens in a light theme (easier to read on a projector); **T** or the moon button switches to dark, and `?theme=dark` opens dark.

## Open it (teammates: start here)

**Fastest, nothing to install:** download [`grid_twin.html`](../grid_twin.html) from the top of the repo (on GitHub: open it, then the download button), and double-click it. It is the whole app in one file and needs no web server; it only needs internet for Three.js and the fonts.

**From a clone, one command** (opens your browser; adds the live quantum-code buttons if Qiskit, CUDA-Q or Guppy are installed):

```bash
python3 grid-twin/start.py
```

**Shareable link:** https://claude.ai/artifact/RMHGPbTvUVXPvKpzXgE6pH (the owner has to share it from its Share menu before others can open it).

**Changed something in `grid-twin/`?** Rebuild the single file so teammates get the new version:

```bash
node grid-twin/tools/build_standalone.mjs
```

## Run it by hand

`index.html` uses ES modules, so it needs a local web server (opening `grid-twin/index.html` directly from disk will not work; `grid_twin.html` will). Serve the **repo root**, so the shared top bar (`shared/`) and the other pages work too:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000 (the project home) or http://localhost:8000/grid-twin/ (the live grid). Three.js and the fonts load from public CDNs, so you need an internet connection.

### With live quantum frameworks

To re-run any fiber as real quantum code from the page, serve it with the bridge instead (needs Qiskit, CUDA-Q and Guppy installed; see `sim/engines.py`):

```bash
python grid-twin/sim/live_server.py 8000   # serves the repo root; the grid is at /grid-twin/
```

A fiber's inspector then shows **Run this fiber as real quantum code**: Qiskit Aer, NVIDIA CUDA-Q and Quantinuum Guppy on the Selene emulator each run 4,000 photons with that fiber's current noise and tap. Two more engines: **qBraid · IonQ simulator** runs the fiber as a real cloud job on qBraid's free IonQ simulator (needs `QBRAID_API_KEY` in the server's environment, for example `source ~/.qtopia.env` first; about 45 s with the queue), and **Team notebook 1** runs the team's own `encode()` and `measure()` from `1_bb84_eavesdropper.ipynb` (the team's finished code), and the error rates appear next to the browser's live value and the theory. Example (L11, 40% tap, theory 12.64%): Qiskit 13.52%, CUDA-Q 12.11%, Guppy 11.15%, each on about 2,000 sifted bits (±0.7%).

## What you can do

| Control | What it does |
|---|---|
| **1 · Inspect** | Click a fiber to see its live QBER, chart, warning line and secret-key fraction. Click a site to see where its keys come from and which trusted nodes relay them. |
| **2 · Eavesdrop** | Click a fiber to tap it (click again to remove). The panel sets what share of photons the tap intercepts: 100% is loud, a few percent is a careful spy. |
| Automatic response (on by default) | When a fiber alarms, an **incident card** opens and the response runs by itself, stage by stage with timings: detected, keys switched to ML-KEM, real traffic rerouted, decoy traffic on the fiber (only if every site keeps another route), the tap measured (after one full 4 s window of fresh photons), and a crew inspection recommended. The card closes itself when the error rate returns to normal. Turning it off leaves detection, the key switch and rerouting (they are the policy) and skips decoy traffic. |
| Operator overrides | In a fiber's inspector, or on the incident card: **Quarantine fiber** takes it out of service (a site with no path left keeps power and runs on local protection), **Restore fiber** brings it back on probation, **Decoy traffic** switches decoy mode by hand. Quarantine is never automatic, so an attacker cannot take a fiber down by tapping it. |
| Alarm sensitivity | How many standard deviations above a fiber's own baseline counts as an alarm, with the false-alarm chance per check. |
| Find a fiber or site | Picker in the panel: selects anything without clicking in 3D (keyboard and projector friendly). |
| Find a route | Pick a **Start** and an **End** site and set the **QBER cutoff** (1% to 25%, default 11%, the Shor–Preskill limit). A fiber at or above the cutoff counts as tapped and is not used. The route is highlighted in 3D, with its hops, km, highest QBER and the trusted sites it passes through. It updates live as taps are placed. See "Route search" below. |
| QKD coverage | **Backbone only** (our design) or **Every fiber** (the team's whiteboard sketch); also `?qkd=all`. |
| Teleportation view | Fibers under 11% error light up as usable for entanglement; select a substation to see its entanglement-swapping route and end-to-end error. Swapping nodes are shown in blue: unlike trusted relays (gold), they never hold the key. |
| View dock (bottom right of the 3D view) | **+** / **−** zoom; **Fit** (H) flies back to the whole network; **Focus** (F) flies close to the selection and fades everything unrelated; **Cinematic orbit** (O) turns the view slowly, stops the moment you drag, scroll or click, and resumes after 20 s idle; **Light/dark** (T). |
| Space / Esc | Pause and resume / clear the selection. Drag to orbit, scroll to zoom. |
| Browser console | `gridTwin.tap("L4", 0.1)`, `gridTwin.quarantine("P4")`, `gridTwin.select("node", "S6")`, `gridTwin.incidents()`, `gridTwin.focus()`, `gridTwin.route("T1", "T4", 0.11)`, `gridTwin.theme("dark")`, `gridTwin.orbit(false)`, `gridTwin.state()`: for scripted demos and tests. |

## Route search

The **Find a route** section answers one question: how does site A reach site B when some fibers may be tapped? It is built for the real Chattanooga grid.

- **Inputs:** a start site, an end site, and a QBER cutoff (QBER is the share of key bits that arrive wrong). A fiber at or above the cutoff counts as tapped and is not used. The default, 11%, is the Shor–Preskill limit, where no secret key can be made.
- **Fewest sites first.** There are no quantum repeaters, so every site a QKD key passes through is a trusted relay: it measures the key and re-encrypts it for the next fiber. Someone inside that site (an insider, or a hacked device) could read the key in between. So the search picks the route with the fewest intermediate sites, and only among those the lowest risk-weighted distance, km × (1 + 20 × QBER). The panel compares it with the plain shortest route by km: "the shortest route would pass through N sites; this one passes through M".
- **Fallback order:**
  1. A clean QKD route, every fiber under the cutoff, relayed by trusted sites.
  2. If there is none: the best route over every fiber still in service, on ML-KEM keys (post-quantum encryption) agreed end to end. Sites along the way only forward ciphertext they cannot read.
  3. If there is no physical path at all: the site is islanded. Power stays on, it runs on local protection, and a crew is dispatched.
- **Grover card.** A small card shows the same route problem as a Grover search: 8 candidate routes, how many are clean, the number of Grover steps, and the chance of drawing a clean route. This is a demonstration, not a speed-up. See DESIGN.md.

Code: `src/route.js` (shared by the page and the tests). Python twin: `chattanooga_router.py` at the repo root, which credits teammate Asheb's earlier ring router for the cutoff, the blocked-link rule, the cost formula and the ML-KEM fallback. The automatic response's QKD key paths follow the same fewest-sites rule.

## Networks

Pick one in the panel, or open `?net=<id>`. An old link to the removed ring network opens Chattanooga instead.

| id | Network | Sites | Fibers | QKD fibers |
|---|---|---|---|---|
| `chattanooga` (default, the hero) | **Real** Chattanooga grid: EPB and TVA substations and lines from OpenStreetMap | 117 | 145 | 34 |
| `tennessee500` | **Real** TVA 500 kV backbone across Tennessee, from OpenStreetMap | 33 | 38 | 30 |
| `city` | Simulation lab: stylized city network, hand-made | 17 | 21 | 11 |
| `ieee14` | IEEE 14-bus test grid | 14 | 20 | 13 |
| `ieee30` | IEEE 30-bus test grid | 30 | 41 | 20 |
| `ieee57` | IEEE 57-bus test grid | 57 | 78 | 30 |
| `ieee118` | IEEE 118-bus test grid | 118 | 179 | 104 |
| `ieee300` | IEEE 300-bus test grid | 300 | 409 | 258 |

The two real networks come from OpenStreetMap, the data behind OpenInfraMap (the mentors' suggestion), © OpenStreetMap contributors, ODbL; the credit shows on screen.
- `tools/import_osm.mjs` joins power lines end to end, including lines that tee into others, into substation-to-substation links that keep the real route and length. Raw Overpass responses are in `data/osm/`, so the import reruns offline.
- **Chattanooga:** QKD on 161 kV and above, ML-KEM on 46 kV distribution.
- **Statewide:** QKD only on 500 kV spans under 80 km.
- **Assumption:** the two key hubs (Chickamauga and Oglethorpe in Chattanooga) are ours, because real control-center locations are not public. Fiber is assumed along every line (OPGW).

The IEEE grids are public test systems (MATPOWER, UW Power Systems Test Case Archive; copies in `data/ieee/`). `tools/import_ieee.mjs` turns them into networks: every power line is assumed to carry fiber (utilities commonly run fiber in the ground wire of their own lines, OPGW), the two best-connected buses become control centers, generator buses and buses with 3 or more lines become major substations on QKD, and the rest are feeder sub-units on ML-KEM. IEEE cases have no coordinates, so positions come from a force-directed layout and fiber lengths are scaled (median 14 km): illustrative, not real distances.

## What is real and what is simulated

| Part | Status |
|---|---|
| BB84 with an intercept-resend eavesdropper | Simulated in the browser (`src/bb84.js`). This is an exact simulation: BB84 only uses single qubits in the Z or X basis, so every outcome probability is 0, 1/2 or 1. |
| Cross-check against Qiskit | `sim/bb84_reference.py` runs the same scenarios as real circuits on Qiskit Aer and writes `data/calibration.json`; `tests/engine.test.mjs` checks the browser engine against it. All 7 scenarios agree. |
| Fiber loss and detector noise | A standard model (Eq. (8) of Lo, Ma and Chen, PRL 94, 230504, 2005) with published lab parameters: the GYS 2004 row of Table 1 in Ma, Qi, Zhao and Lo, arXiv quant-ph/0503005: 0.21 dB/km loss, 4.5% detection efficiency, 1.7e-6 dark counts, 3.3% detector error, 1550 nm. Assumptions for a generic metro fiber, not measurements of any utility. |
| Abort line at 11% | Where the secret-key fraction 1 − 2h(Q) reaches zero (Shor and Preskill, PRL 85, 441, 2000). |
| The network layout | Real for Chattanooga and the Tennessee 500 kV view (OpenStreetMap, public data); made up for the Simulation lab's city (2 control centers, 6 major substations, 8 feeder sub-units, 1 remote site). Which substations hold the keys is our assumption. |
| The response policy | Our design (`src/response.js`). See DESIGN.md. |
| Key rates in bits per second | Not shown: the tool shows the *fraction* of sifted bits that become secret key, which does not depend on hardware we do not have. |

## Tests

```bash
cd grid-twin
node --test tests/*.test.mjs                       # physics, detector, networks, response policy, route search
~/vscode/qtopia-venv/bin/python sim/bb84_reference.py # regenerate the Qiskit Aer reference (about 20 s)
```

## Files

```
grid-twin/
  index.html, style.css   page shell and visual design (Three.js pinned to 0.170.0 via import map)
  src/bb84.js             BB84 physics, fiber model, secret-key fraction (pure, tested)
  src/detector.js         sliding-window QBER, statistical warning, 11% abort, hysteresis (pure, tested)
  src/network.js          graph model and shortest paths (pure, tested)
  src/response.js         response policy: ML-KEM fallback, rerouting, quarantine, trusted relays (pure, tested)
  src/route.js            route search from a start to an end site under a QBER cutoff, plus the Grover demo (pure, tested)
  src/scene.js            Three.js scene: fibers, photons, taps, relay rings, bloom, camera
  src/ui.js               control panel, inspector, live chart, event log
  src/main.js             simulation loop (4 Hz) wiring it all together
  data/network.json       the network
  data/calibration.json   generated by sim/bb84_reference.py
  sim/bb84_reference.py   Qiskit Aer reference
  tests/engine.test.mjs   node tests
  DESIGN.md               design decisions and the physics behind them
  BUILD_LOG.md            what was built, in order, and how it was verified
```

## Part of one project site

Every page shares one design system and one top bar (`shared/qtopia.css`, `shared/qbar.js`): Home (`index.html`), Live grid (this folder), Real map (`chattanooga_quantum_map.html`), Photon line (`bb84_visualizer.html`) and Quantum lab (`threejs_quantum_grid.html`). The light/dark choice is shared. Other pages link straight to a fiber or site here with `?net=chattanooga&select=link:L6` or `select=node:T23`.

## qBraid engines

With `QBRAID_API_KEY` set (for example `source ~/.qtopia.env` before `start.py`), a fiber's inspector also offers:
- **qBraid · IonQ simulator** and **qBraid · QIR simulator** (both free cloud simulators).
- **Team notebook 1 on qBraid · QIR simulator:** notebook 1's own `encode()` and `qber_from_counts()`, with the fiber's tap and noise added.

The GPU state-vector simulator costs credits, so it is offered only with `GRIDTWIN_ALLOW_PAID=1`. Measured results are in BUILD_LOG.md.

## Deploying to Vercel

`vercel.json` runs `bash tools/build_site.sh` and serves the static `site/` folder.

- **No environment variables are needed.** The site is static: no serverless functions, no keys in the page code.
- **Do not add `QBRAID_API_KEY` to Vercel.**
  - It is only read by the local Python server (`grid-twin/start.py` / `sim/live_server.py`) for the qBraid buttons, and Vercel does not run that server.
  - On the public site those buttons stay hidden; everything else works. The live grid, map, photon line and lab all run in the browser.
  - A key there would only matter if someone later added a server function, and then a public page could spend the team's qBraid credits.
- The build writes `site/.vercelignore` so local `.env*` files and `.vercel/` are never uploaded.
- The map loads standard OpenStreetMap tiles. That is fine for a demo; heavy public traffic would need another tile provider under OSM's tile usage policy.

## Simple and Detailed

Every page has a **Simple / Detailed** switch in the top bar (default Simple, remembered per browser, `?mode=detailed` in a link).
- **Simple** shows the whole story and every main interaction.
- **Detailed** adds what an expert wants: sensitivity, coverage, layers, raw readings, formulas, job IDs, logs.

Pages mark detail with `class="q-adv"`.

**The journey runs from simple to complex**, in the top bar's order:
1. The real map.
2. The live grid.
3. The photon line.
4. The quantum lab.

Home comes before step 1.

**In the live grid**, "Tap a fiber for me" taps the network's demo fiber, so a first-time visitor sees the automatic response at once.
