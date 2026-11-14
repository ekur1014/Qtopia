# Grid Twin: build log

> This is a running log, oldest first. Older sections are kept as history; when a later section corrects one (for example the IonQ simulator figure, notebook 1's TODOs, the pitch deck link), the later one is right.

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

## Easy access for teammates

- **`grid_twin.html`** at the top of the repo: the whole app in one file (CSS, all modules and all six networks inlined, 246 KB). Download and double-click: no server, no install. Built by `grid-twin/tools/build_standalone.mjs` (no dependencies: each module gets its own scope, imports become lookups); rebuild after any change in `grid-twin/`. Checked from `file://` in headless Chrome: city and 118-bus networks load, a full tap on L11 opens an incident and measures 100% ± 4%.
- **`grid-twin/start.py`**: one command that serves the page and opens the browser; it starts the live quantum-framework bridge when the packages are installed (checked: Qiskit, CUDA-Q, Guppy and notebook 1 listed) and otherwise serves the page alone (checked with system Python).
- `grid-twin/README.md` now opens with these three ways in. The root README is untouched.

## Tennessee Quantum Grid hero, screen gate, mentor notes

Driven by the mentor recordings (see `docs/MENTOR_NOTES.md`).

- **Real grid:**
  - `tools/import_osm.mjs` turns OpenStreetMap power data (Overpass API) into networks.
  - Chattanooga: 117 substations, 145 links (34 QKD), real routes and lengths.
  - Tennessee 500 kV: 33 substations, 38 links (30 QKD).
  - Lines that tee into other lines are split at shared towers. Teed duplicates are pruned when two shorter legs exist.
  - The real Chattanooga grid is now the default view, titled Tennessee Quantum Grid. The earlier networks became the Simulation lab.
- **Scene:** links follow real routes (Catmull-Rom through the simplified line geometry). Named transmission sites keep short on-map labels. A node-size factor handles dense downtown substations.
- **Fixes found on the statewide view:**
  - Fibers over about 50 km never collected enough evidence and stayed "Measuring". Added a detection floor, with a test.
  - "Fibers in alarm" counted "Measuring" fibers. It now counts warning and abort only.
- **Screen gate:** below 1024 × 600 the page shows "Needs a bigger screen" and starts once the window is large enough.
- **Satellite:** the note now says it will probably be removed unless a quantum application needs it.
- **Docs:** `docs/TECH_RANKED.md` (ranked "what we can do with each", GPU included) and `docs/MENTOR_NOTES.md`.
- **Checked** in headless Chrome:
  - Chattanooga hero: a tap opened an incident.
  - Tennessee view: all 38 fibers healthy at rest.
  - The gate at 800 × 700.
- Tests: 26 passing.

## qBraid simulators and notebook 1 on qBraid

User request: "integrate qbraid simulators and notebook 1 qbraid".

**New engines** (all in `sim/engines.py`; buttons appear in a fiber's inspector when the page is served by `start.py` with `QBRAID_API_KEY` set):

| Engine | What it runs |
|---|---|
| **qBraid · QIR simulator** | Free, noise-free, 6 BB84 rounds per circuit, 2,000 shots |
| **Team notebook 1 on qBraid · QIR simulator** | Notebook 1's own `encode()` builds every photon. Its batch circuit runs on qBraid with the fiber's tap and noise added as coin qubits, and its own `qber_from_counts()` scores the result |
| **qBraid · GPU state-vector simulator** | 35 qubits, 5 credits a minute. Wired in but **off** unless `GRIDTWIN_ALLOW_PAID=1`; not run yet |

**Notebook 1's unfinished TODO:** `encode()` still has its TODO, so the notebook engines complete it exactly as the TODO comment says. Every result carries a note saying so, and the notebook file is not edited.

**Measured** (p = 3.3%, seed 23):

| Engine | No tap (theory 3.30%) | 40% tap (theory 12.64%) | Full tap (theory 26.65%) |
|---|---|---|---|
| qBraid QIR simulator | 3.11% | 12.96% | 26.75% |
| Notebook 1 on qBraid QIR | 3.43% | 12.86% | 26.63% |
| qBraid IonQ simulator | 3.30% | 12.55% | 26.60% |

Every QIR result is within 1.2σ of theory. Job IDs are logged by the server; the IonQ 40% run is `ionq:ionq:sim:simulator-a7ae-qjob-6af89d21c8f5265fb3f1dcf7`.

**Bugs found and fixed:**
- **Bit order:** qBraid's QIR simulator reports classical bits, padded, while IonQ reports every qubit. Each photon now sits on qubit r and classical bit r, so both formats read the same.
- **Eve's basis:** with an odd number of rounds per circuit, Eve's basis could not match Alice's exactly half the time. It now matches on exactly half.
- **IonQ dropping outcomes:** IonQ's simulator returns probabilities and leaves out rare outcomes on big circuits. With 24 qubits, a 40% tap read 6.6% (6σ low). It now runs 2 rounds (8 qubits) per circuit.

**Correction:** our earlier "qBraid IonQ simulator 12.17%" came from the 24-qubit version and is replaced by 12.55% above.

## One project: shared design, honest teammate pages

User request: fix the teammates' pages and "make sure everything is like 1 thing".

- **Shared design system and top bar** (`shared/qrypt.css`, `shared/qbar.js`) on every page:
  - The bar links Home, Live grid, Real map, Quantum lab and Pitch deck.
  - Light is the default; the light/dark choice is shared and announced to the 3D grid.
- **Home page** (`index.html` at the repo root): what the project is, key numbers, the four pages, and how to run it.
- **Real map** (`chattanooga_quantum_map.html`), rebuilt on the same real data as the 3D grid (Chattanooga and Tennessee 500 kV, from `data/networks/*.js`):
  - Uses the same BB84 formulas, with a "what a tap would do" slider.
  - Every fiber and site opens in the live grid (`?select=`).
  - Removed: unsourced cost figures and invented sites.
  - Basemap: OpenStreetMap tiles, because CARTO's now require an API key.
- **Quantum lab** (`threejs_quantum_grid.html`): replaces the canned numbers with real in-browser computation.
  - **Teleportation:** a 3-qubit state-vector simulation over a real Chattanooga route, with per-fiber error composition. Default route Oglethorpe → JC Edwards → T6 → Hamilton: 9.27% end to end, fidelity 90.7%.
  - **BB84:** a Monte Carlo of 20,000 photons, matching theory to within the error bar.
  - **Grover:** exact probabilities.
  - **Measured results shown:** simulators, emulators and Rigetti hardware.
  - **Removed claims:** IonQ Forte 98.5%, NERC CIP-014, under-16 ms breaker trips, the fake AI/GraphQL tab, invented Guppy syntax.
  - **3D:** two Bloch spheres.
- **Pitch deck** (`presentation_deck.html`): five honest slides in the shared style; team names left as placeholders.
- **2D monitor** (`interactive_grid_monitor.html`): the same physics and policy as the grid, marked as the first prototype.
- **Server:** `start.py` and `live_server.py` serve the repo root.

**Update, notebook 1 finished:** the teammate filled notebook 1's TODOs, so both notebook engines now run the team's own `encode()` with no note.

| Engine | No tap (theory 3.30%) | 40% tap (theory 12.64%) | Full tap (theory 26.65%) |
|---|---|---|---|
| Notebook 1, local (about 300 bits each) | 4.68% | 11.26% | 28.94% |
| Notebook 1 on qBraid QIR (12,000 bits each) | 3.10% | 12.48% | 26.18% |

All within 1.3σ. The qBraid QIR job at 40% is `qbraid:qbraid:sim:qir-sv-a7ae-qjob-6af89fbcc8f5265fb3f1e23b`. On the live page, the real Chickamauga–Hamilton fiber at a 40% tap read 12.30%; that was before the notebook was finished, so it used the hint-based `encode()`.

## Pitch deck taken out of the Grid Twin site

The teammates own the pitch deck entirely, so it is no longer part of this site:
- It is gone from the shared top bar, the home page and the README.
- `presentation_deck.html` stays in the repo as the teammates' file. The Vercel build still publishes it at its original `/deck.html`, unlinked.

## Second opinion from Opus (qBraid AI gateway)

A read-only review by claude-opus-5-5 through qBraid's AI gateway: 5 turns, $0.59. The log is kept locally in `~/vscode/qbraid-gw/logs/`. It found no high-severity mistakes in the teleportation circuit, error composition, BB84 Monte Carlo, Grover maths or the qBraid coin circuit.

Fixed from its findings (each checked by hand first):
- **Teleportation fidelity was wrong with a spy on.** The lab assumed independent bit and phase flips for the spy too, but intercept-resend gives a bit flip or a phase flip, never both. The lab now composes exact Pauli channels per hop.
  - |+i⟩ with a full spy now shows 50.0% fidelity; it showed 62.5% before.
  - The route error is unchanged (9.27% to Hamilton).
  - Added the teleportation benchmark: average fidelity against the 2/3 classical limit (88.2% on the Hamilton route, so it beats the limit).
- **BB84 sphere:** now includes fiber noise; Bob's vector is (1 − f/2)(1 − 2p).
- **Grover sphere:** now a real Bloch picture, with the target at the top and the angle doubled.
- **Captions:** the sphere labels change per tab.
- **Wording:** "about N/2" classical tries; the 11% threshold is labelled as the key threshold.
- **`engines.py` comment updated:** IonQ's free simulator returns exact probabilities, not samples.

## Dual ring (New Chat Grid), sync and audits

- **Read the new folder:** the whiteboard photo and the 7-minute recording. Re-transcribed it locally with whisper.cpp because the app's transcript looked short; the gaps were side conversation. Saved as `transcript-local.txt`.
- **Built the dual ring** (`tools/make_dualring.mjs`, `?net=dualring`), as described in DESIGN.md. Added a "Team design" group in the network list, its own title, and a home-page card.
- **New test:** one tapped fiber moves to its twin; with both fibers tapped, the key goes the other way round. 27 tests passing.
- **Checked in the browser:** with both fibers between supernodes 3 and 4 tapped, two incident cards fire and supernode 4's key path runs via 7, 6, 5.
- **Opus reviewers** (qBraid gateway) audited readability, faithfulness to the plan, and consistency of numbers. Fixes follow below.

### Audit results and what changed

- **Consistency audit** (Opus, $1.89): 30 stale or inconsistent spots, mostly old docs from before the real-grid hero. All fixed, except unfilled placeholders in the teammates' `WRITEUP_step1.md`.
- **Readability audit** (Opus, $2.86): 40 items. Fixed the high-impact ones:
  - One name for the key site: control center.
  - A plain-language home page.
  - "Quantum simulators" instead of "real quantum code".
  - A footer for each kind of network: real, team design, test.
  - "Test networks (not real)" instead of "Simulation lab".
  - Shorter labels and a shortcut list.
  - The same quick alarm rule on the map, lab and monitor.
- **Faithfulness audit** (Opus, $1.44; a first try died on a PDF, $0.39): found the teammate's own dual ring (`dual_ring_quantum_routing.html`, `dual_ring_router.py`). Grid Twin's dual ring now uses its model: one fiber pair per 8.5 km span, 6 km gateway links, and a tapped span going the other way round.
  - Its other findings concern `WRITEUP.md` (the team's write-up) and are listed for the team. Examples: Step 1 Part 3 hardware run missing, a Forte claim without a run, Step 3 Parts 2 and 4 missing, notebook 3 outputs not saved.
- **The teammate's router page joins the site** (restyled by Opus in edit mode, $1.21, then checked in the browser):
  - Shared look and top bar, "Dual ring" in the bar and on the home page.
  - Removed: "EPB" in the title, the unmeasured "<12 ms" failover claim.
  - Its simplified 8%/11% rule is labelled.
  - Its routing logic is unchanged and checked: a ring partition falls back to ML-KEM.
  - The legend moved off the ring.
- **Bug found while checking:** test networks were titled as the dual ring, because their `meta.design` text field was read as a flag. Fixed with `meta.teamDesign`.
- **The pitch deck is no longer published** by the Vercel build (the team removed it).

## Design pass: taste skill, Simple/Detailed, simple-to-complex journey

User request: make the dual ring the first step (hypothetical), go from simple to complex, unslop the whole site with the "taste" skill, make it intuitive, readable, cinematic and quantum, and use Opus as much as needed.

- **Installed the taste skill** (Leonxlnx/taste-skill, MIT) for the user as `~/.claude/skills/design-taste-frontend`. Its files were read before installing; its scripts are local dev tools (an icon fetcher, a preview server, headless Chrome checks).
- **Shared foundation** (`shared/`):
  - The Simple/Detailed switch.
  - The journey order in the bar.
  - The skill's motion rules: a one-time hero entrance; hover lift 2px; buttons step 1px and press; ease-out only.
  - Post-quantum moves from violet to blue: the skill bans violet.
  - The skill's prism-dispersion effect, a beam splitting into a spectrum, copied in for the home hero (MIT).
- **Six Opus workers** redesigned one page each in parallel, under a shared brief: home, dual ring, real map, photon line, quantum lab, monitor.
- **The live grid** (by hand):
  - A "Try it" box with "Tap a fiber for me".
  - Panel order for first-time visitors.
  - Ten expert parts Detailed-only.
  - Short site names.
- **Copy-lint** (the skill's checker) on the live grid's visible text: 0 FAIL. Its one WARN came from JavaScript operators in the extraction, not copy.
- **Photon line** (redone by an Opus worker in small edits after a first attempt stalled):
  - Each round plays as a five-beat scene: Alice picks, the photon travels, Eve may grab it, Bob measures, the result lands in the table. The caption updates at each beat.
  - The send buttons now say what each does, and the Eve switch states what it does.
  - The error rate is a big number on a bar marked at 11% and 25%.
  - Step 6 (cloud job details) and the formulas are Detailed-only.
  - Checked in headless Chrome:
    - One round plays through to "5. Result".
    - 200 photons with Eve on every photon gave about 21% to 30% error rate (theory: 25%).
    - No script errors.
    - No sideways scroll at 390 px, in light or dark.
  - copy-lint: 0 FAIL; 1 WARN, for the results tiles, accepted.
- **Done:** all six pages are redesigned and checked in light, dark and phone width. The claude.ai preview was republished from the new build.
