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
