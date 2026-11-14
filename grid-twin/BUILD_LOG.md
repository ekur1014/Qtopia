# Grid Twin: build log

What was built, in order, and how each step was checked. Times are Saturday 14 November 2026 (Eastern).

## Decisions taken before building

- Direction from the team (Idea folder recordings and whiteboard): an interactive network view based on notebook 1's BB84, live QBER per link, buttons to place an eavesdropper. Satellites and teleportation out of scope for now.
- From the user: build it in 3D with Three.js, to a high visual standard; "isolate" means cutting the communication path, not power.
- Design critique (see DESIGN.md): simulate BB84 in the browser and verify it against Qiskit; statistical alarm per fiber with 11% as the abort line; alarms fall back to ML-KEM instead of taking links down; show trusted relays; stylized map.

## Stage 1: core engine and data

- `src/bb84.js`: BB84 with intercept-resend and fiber noise, fiber baseline model, secret-key fraction, seeded PRNG.
- `src/network.js`, `data/network.json`: 2 control centers, 6 substations, 8 sub-units, 1 remote site; 11 QKD fibers, 10 post-quantum links.
- Checks: baselines 3.30% on city fibers, 4.79% at 140 km, 20.79% at 200 km; secret fraction 1.00 at 0%, 0.58 at 3.3%, 0.0002 at 11%.
- Bias check: 200 independent runs per scenario, mean deviation from p + f(1/4 − p/2) within one standard error, spread about 1 (unbiased). An early 20-seed run looked slightly off; it was small-sample noise with consecutive seeds, so the tests use well-separated seeds.

## Stage 2: alarms

- `src/detector.js`: sliding window (16 ticks = 4 s), warning at z standard deviations above the fiber's baseline, abort at 11%, hysteresis (6 calm checks to clear), false-alarm probability shown via the normal tail.

## Stage 3: response policy

- `src/response.js`: per-link key source (QKD, ML-KEM fallback, ML-KEM, out of service), per-site key path with trusted relays, data path, islanding; every site stays energized.

## Stage 4: scene and panel

- `index.html`, `style.css`, `src/scene.js`, `src/ui.js`, `src/main.js`: Three.js 0.170.0 (pinned), bloom, fog, photons on QKD fibers that turn red past a tap, packets on post-quantum links, relay rings, intro camera flight, glass panel with live chart and event log, tools on keys 1/2/3.
- Bug caught in review before the first run: selected fibers re-multiplied their color every frame, which would have blown out the brightness. Fixed by deriving the displayed color from an eased color each frame.

## Stage 5: Qiskit cross-check and tests

- `sim/bb84_reference.py`: the same scenarios as real circuits on Qiskit Aer (stabilizer method, 2,000 rounds per circuit, 6 circuits per scenario). Results:

  | p | f | Aer QBER | Expected |
  |---|---|---|---|
  | 0 | 0 | 0.0000 | 0.0000 |
  | 0 | 1 | 0.2506 | 0.2500 |
  | 0 | 0.5 | 0.1246 | 0.1250 |
  | 0.033 | 0 | 0.0328 | 0.0330 |
  | 0.033 | 0.25 | 0.0967 | 0.0914 |
  | 0.033 | 1 | 0.2613 | 0.2665 |
  | 0.08 | 0.5 | 0.1905 | 0.1850 |

  All within 4.5 standard errors (largest gap 1.4σ). First run failed only when saving (numpy integers in JSON); fixed and rerun.
- `tests/engine.test.mjs`: 15 tests, all passing: physics, Aer agreement, fiber model, secret fraction, detector (no false alarms over 400 clean checks, warning for a 15% tap, abort for a full tap, hysteresis), network consistency, and response rules (alarms never take links down, rerouting through trusted relays, islanding keeps power on, nothing is ever de-energized).

## Browser verification (built-in browser, 1440×900 and 722×795)

- Page loads with no console errors.
- Tapped L5 (S1–S2) at 100%: QBER read 26.91% ± 0.86% against 26.65% expected. Event log in order: warning at 6.2%, QKD keys distrusted and link switched to ML-KEM (stays up), abort above 11%. All 6 substations kept QKD keys by rerouting.
- Quarantined P4 (S3–U4): U4 shown without comms, power still energized, counter "Sites without comms" = 1.
- Layout fixes after the first look: the network was partly hidden behind the panel and the toolbar overlapped the legend. Fixed with a camera view offset that centers the network beside the panel (or above the bottom sheet on phones), a pull-back on tall screens, and lifting the legend on mid-size screens.
- Hardened the keyboard handler for events not aimed at an element.

## Final tuning and checks

- Browser caching: Python's simple server let the browser reuse old JavaScript modules, which made a camera change look like it had no effect. Testing switched to a no-cache dev server (outside the repo); `python3 -m http.server` is still fine for normal use.
- Visual tuning at 1440×900: camera brought closer, fibers thicker (QKD 0.12, post-quantum 0.07), photons larger, bloom stronger (1.2). Only pulls the camera back when the free screen area is taller than wide.
- Added `window.gridTwin` (tap, untap, quarantine, restore, select, state) for scripted demos and browser tests, because clicking moving 3D objects by screen coordinates is fragile.
- Trusted-relay check: tapped L11 (CC2–S6) at 100%. L11 went to abort (QBER 27.8%, expected 26.65% ± about 1%). S6 kept a QKD key by rerouting CC1 → S1 → S6, the inspector named S1 as a trusted node, and the gold relay ring appeared on S1. S6's data stayed on CC2 → S6, because an alarmed fiber keeps carrying traffic on ML-KEM keys. No console errors.
- All 15 node tests pass after the final changes.

## Audit fixes

- **Phone layout** (375×812): the toolbar was 411 px wide and overflowed the screen, and the network was framed far too close. The toolbar is now compact on phones (fits: 48 to 327 px of 375).
- **Camera framing** is now automatic: the scene projects every site onto the screen and binary-searches the closest camera distance at which all of them fall inside the area the panel leaves free, with a margin. This replaced hand-tuned constants that were right on desktop and wrong on phones. Checked at 375×812 (all 19 sites visible above the bottom sheet) and 1440×900 (network fills the space beside the panel). No console errors at either size.
- **Citation corrected**: the fiber parameter values come from Table 1 (GYS row) of Ma, Qi, Zhao and Lo, arXiv quant-ph/0503005; the earlier text credited Lo, Ma and Chen's PRL, which uses but does not print them. The baseline formula was confirmed to be the single-photon case of that PRL's Eq. (8).
- **Wording**: DESIGN.md no longer calls a 140 km fiber "close to unusable" because of its 4.8% baseline; the real issue is that it detects about 537 times fewer photons than a 10 km fiber.

## Expansion: datasets, scale and visuals

- **IEEE grids imported** (`tools/import_ieee.mjs`): 14, 30, 57, 118 and 300-bus public test grids, selectable in the panel or with `?net=`. All connected; fiber lengths 3 to 52 km after scaling.
- **Scale**: the response now builds one shortest-path tree per tick instead of one search per site: 2.6 ms per tick on the 300-bus grid. The 118-bus grid renders at about 120 fps in the test browser.
- **Visuals** (user request: bigger nodes, less glow, more deliberate effects): nodes about 40% larger and sized to the network; bloom roughly halved and limited to photons, beacons and taps so fibers stay crisp; flat ground without speckle; a shockwave ring where an alarm fires; the camera glides to whatever is selected; gold key packets flow along the selected site's key path; sites lift on hover; F frames the whole network. On big grids only control centers keep permanent labels.
- **Probation fix** (from the audit): restoring a fiber now starts it on ML-KEM keys until fresh measurements clear it. Checked in the browser: restored L5 showed "Measuring" on ML-KEM, then "QKD keys trusted" about 3 s later.
- Tests: 17 passing (added probation and imported-grid checks).

## Team ideas built: decoy mode, risk-aware routing, live frameworks

- **Decoy mode** (`4` / Decoy tool, Auto-decoy toggle): real traffic reroutes, the fiber keeps running so the tap can be measured; refused when a site would be stranded. Browser check on the city network: L11 tapped at 40%; decoy mode kept S6 connected (rerouted via S1); P4 refused (post-quantum link, nothing to measure); auto-decoy switched a fully tapped L5 by itself.
- **Tap estimate** f̂ = (Q − p)/(1/4 − p/2): unbiased (2,000 simulated windows: mean 39.98% for a true 40%; spread 1.0σ). In the live app, 15 independent readings averaged 38.9% for a true 40%.
- **Risk-aware routing**: S6's real traffic left L11 as soon as L11 went to warning (CC1 → S1 → S6).
- **Live frameworks** (`sim/engines.py`, `sim/live_server.py`): the same BB84 fiber in Qiskit Aer (one circuit per case, mid-circuit measurement), NVIDIA CUDA-Q 0.16 (ancilla measurement), and Quantinuum Guppy 1.2.1 on Selene 0.3.8 (the whole round, coin flips included, inside the emulator). Self-test: all three within statistical error of theory at f = 0, 0.4 and 1. From the page: L11 at a 40% tap gave Qiskit 13.52%, CUDA-Q 12.11%, Guppy 11.15% against 12.64% theory (±0.7%).
- Tests: 21 passing.

## Alignment audit (see docs/ALIGNMENT_AUDIT.md)

- Checked Grid Twin against every team source (recordings, whiteboard, notebook page, chat, README Step 3, notebooks 1 and 3) and walked through every control.
- Added: teleportation view (the lead's 11% / entanglement-swapping idea), QKD coverage switch (whiteboard version), "Find a fiber or site" picker, live tap slider, qBraid IonQ simulator engine (real job from the page, 12.17% vs 12.64% theory), Team notebook 1 engine (runs the team's own code; refuses clearly while its TODOs are open).
- Fixed: loader stuck in background tabs, inspector button order, checkbox labels, sub-units' keys in every-fiber mode, refusal status code.
- Tests: 24 passing.

## Light theme, viewer controls, automatic response

User request: the dark scene made stations hard to see; wanted a light mode, a real 3D-viewer feel (focus, zoom in and out, center, cinematic orbit until interaction), a possible satellite, and the response to happen automatically when a tap is placed instead of separate Quarantine and Decoy tools.

- **Light theme, now the default**: every scene color, light, fog, ground and grid comes from a theme table; light uses white buildings, saturated mid-tone fibers, no bloom and no tone mapping so colors print true; dark keeps the glow. The panel uses CSS tokens for both. **T**, the dock button or `?theme=` switch it; the choice is remembered in the browser.
- **Viewer dock**: zoom in and out (eased), Fit (H), Focus (F: flies close and fades unrelated fibers and labels), Cinematic orbit (O: slow turn that stops on any drag, scroll or click and resumes after 20 s idle).
- **Automatic response**: one incident per alarm, with six stages (detect, switch keys, reroute, decoy, measure, recommend) and timings. Quarantine and Decoy left the toolbar and became operator overrides in the inspector and on the card. Quarantine is still never automatic.
- **Measurement fix found while testing**: reporting the tap estimate 3 s after the alarm under-read a full tap (89%) because the detector window still held older, untapped photons. It now waits one full 4 s window: 95% ± 4% and 96% ± 4% on full taps, 100% ± 3% on a sub-unit fiber.
- **Satellite**: an optional concept layer, off by default and labeled "concept, not simulated".
- **Checked** in headless Chrome at 1440×900, 1024×768 and phone size (390×844), light and dark, city and IEEE 118-bus grids: the full incident cycle (tap → card → cleared after untap), decoy correctly refused when sub-unit U1 would be stranded (every-fiber mode), quarantine from the card (U1 loses comms, power stays energized). Tests: 24 passing.
