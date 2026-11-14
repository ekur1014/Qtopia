# Grid Twin

A 3D twin of a city utility's quantum-secured communication network, built for the Tennessee Quantum Hackathon (Secure the Grid track, Step 3).

Every glowing fiber runs BB84 quantum key distribution. You can tap any fiber with an eavesdropper and watch its error rate (QBER) climb, the alarm fire, and the control center respond. The response cuts **communication paths**, never power.

## Run it

The page uses ES modules, so it needs a local web server (opening `index.html` directly from disk will not work).

```bash
cd grid-twin
python3 -m http.server 8000
```

Then open http://localhost:8000. Three.js and the fonts load from public CDNs, so you need an internet connection.

### With live quantum frameworks

To re-run any fiber as real quantum code from the page, serve it with the bridge instead (needs Qiskit, CUDA-Q and Guppy installed; see `sim/engines.py`):

```bash
python sim/live_server.py 8000
```

A fiber's inspector then shows **Run this fiber as real quantum code**: Qiskit Aer, NVIDIA CUDA-Q and Quantinuum Guppy on the Selene emulator each run 4,000 photons with that fiber's current noise and tap, and the error rates appear next to the browser's live value and the theory. Example (L11, 40% tap, theory 12.64%): Qiskit 13.52%, CUDA-Q 12.11%, Guppy 11.15%, each on about 2,000 sifted bits (±0.7%).

## What you can do

| Control | What it does |
|---|---|
| **1 · Inspect** | Click a fiber to see its live QBER, chart, warning line and secret-key fraction. Click a site to see where its keys come from and which trusted nodes relay them. |
| **2 · Eavesdrop** | Click a fiber to tap it (click again to remove). The panel sets what share of photons the tap intercepts: 100% is loud, a few percent is a careful spy. |
| **4 · Decoy** | Click a QKD fiber to switch it to decoy traffic: real traffic reroutes (only if every site has another route), the fiber keeps running on fake traffic, and the panel estimates how much the tap intercepts. **Auto-decoy** in the panel does this automatically when a fiber raises an alarm. |
| **3 · Quarantine** | Click a fiber to take it out of service (click again to restore). Traffic reroutes; a site with no path left keeps its power on and runs on local protection. |
| Alarm sensitivity | How many standard deviations above a fiber's own baseline counts as an alarm, with the false-alarm chance per check. |
| Space / Esc / F | Pause and resume / clear the selection / frame the whole network. Drag to orbit, scroll to zoom. |
| Browser console | `gridTwin.tap("L4", 0.1)`, `gridTwin.quarantine("P4")`, `gridTwin.select("node", "S6")`, `gridTwin.state()`: for scripted demos and tests. |

## Networks

Pick one in the panel, or open `?net=<id>`:

| id | Network | Sites | Fibers | QKD fibers |
|---|---|---|---|---|
| `city` (default) | Stylized city network, hand-made | 17 | 21 | 11 |
| `ieee14` | IEEE 14-bus test grid | 14 | 20 | 13 |
| `ieee30` | IEEE 30-bus test grid | 30 | 41 | 20 |
| `ieee57` | IEEE 57-bus test grid | 57 | 78 | 30 |
| `ieee118` | IEEE 118-bus test grid | 118 | 179 | 104 |
| `ieee300` | IEEE 300-bus test grid | 300 | 409 | 258 |

The IEEE grids are public test systems (MATPOWER, UW Power Systems Test Case Archive; copies in `data/ieee/`). `tools/import_ieee.mjs` turns them into networks: every power line is assumed to carry fiber (utilities commonly run fiber in the ground wire of their own lines, OPGW), the two best-connected buses become control centers, generator buses and buses with 3 or more lines become major substations on QKD, and the rest are feeder sub-units on ML-KEM. IEEE cases have no coordinates, so positions come from a force-directed layout and fiber lengths are scaled (median 14 km): illustrative, not real distances.

## What is real and what is simulated

| Part | Status |
|---|---|
| BB84 with an intercept-resend eavesdropper | Simulated in the browser (`src/bb84.js`). This is an exact simulation: BB84 only uses single qubits in the Z or X basis, so every outcome probability is 0, 1/2 or 1. |
| Cross-check against Qiskit | `sim/bb84_reference.py` runs the same scenarios as real circuits on Qiskit Aer and writes `data/calibration.json`; `tests/engine.test.mjs` checks the browser engine against it. All 7 scenarios agree. |
| Fiber loss and detector noise | A standard model (Eq. (8) of Lo, Ma and Chen, PRL 94, 230504, 2005) with published lab parameters: the GYS 2004 row of Table 1 in Ma, Qi, Zhao and Lo, arXiv quant-ph/0503005: 0.21 dB/km loss, 4.5% detection efficiency, 1.7e-6 dark counts, 3.3% detector error, 1550 nm. Assumptions for a generic metro fiber, not measurements of any utility. |
| Abort line at 11% | Where the secret-key fraction 1 − 2h(Q) reaches zero (Shor and Preskill, PRL 85, 441, 2000). |
| The network layout | Made up, in the spirit of the README (2 control centers, 6 major substations, 8 feeder sub-units, 1 remote site). Real substation locations are sensitive, so none are used. |
| The response policy | Our design (`src/response.js`). See DESIGN.md. |
| Key rates in bits per second | Not shown: the tool shows the *fraction* of sifted bits that become secret key, which does not depend on hardware we do not have. |

## Tests

```bash
cd grid-twin
node --test tests/*.test.mjs                       # 15 tests: physics, detector, network, response policy
~/vscode/qrypt-venv/bin/python sim/bb84_reference.py # regenerate the Qiskit Aer reference (about 20 s)
```

## Files

```
grid-twin/
  index.html, style.css   page shell and visual design (Three.js pinned to 0.170.0 via import map)
  src/bb84.js             BB84 physics, fiber model, secret-key fraction (pure, tested)
  src/detector.js         sliding-window QBER, statistical warning, 11% abort, hysteresis (pure, tested)
  src/network.js          graph model and shortest paths (pure, tested)
  src/response.js         response policy: ML-KEM fallback, rerouting, quarantine, trusted relays (pure, tested)
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
