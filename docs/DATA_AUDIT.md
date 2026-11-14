# Data audit: every number on the site, traced to a notebook, a job, the map data or a cited source

Audited 14 Nov 2026 against commit `d14c09f` plus the uncommitted working tree. Another session was editing these pages during the audit, so line numbers may drift by a few lines; the quoted text is exact.

Sources of truth used:
- **Notebooks**: saved cell outputs in `1_bb84_eavesdropper.ipynb` (nb1), `2_shor_harvest_now.ipynb` (nb2), `2b_grover_symmetric_keys.ipynb` (nb2b), `3_secure_grid_link.ipynb` (nb3), `3b_grover_route_search.ipynb` (nb3b). Cell numbers are 0-based cell indices in the .ipynb JSON.
- **Run record**: `WRITEUP.md` (run record lines 276-322), `grid-twin/BUILD_LOG.md`, `docs/WORK_LOG.md`, `grid-twin/data/calibration.json`.
- **Map data**: `grid-twin/data/networks/chattanooga.json` (117 nodes, 145 links) and `tennessee500.json` (33 nodes, 38 links).
- **Cited sources named on the page**: Ma, Qi, Zhao and Lo, Table 1 (map page); Shor-Preskill 11% (WRITEUP line 47).

Recomputed locally (no qBraid, no paid jobs):
- `node --test tests/engine.test.mjs`: 35 of 35 pass.
- `check_grover.py`: total mismatches 0.
- numpy `default_rng(42)`: the first 16 rounds give 6 matching bases; all 200 give 93. Both match nb1.
- Alarm timing: a Node script ran the page's own `bb84.js` and `detector.js` with `main.js` settings (250 ms tick, 500 detections per tick at 10 km, z = 4.5, 200 trials per fiber). A full tap on any of Chattanooga's 34 QKD fibers alarms after 1 tick (0.25 s median) and within 2 ticks (0.5 s) at the 95th percentile.
- 4.5σ warning line across Chattanooga's 34 QKD fibers: 4.30% to 5.00% (baseline 3.30-3.31%).
- Map data: QKD links are 161 kV (30), 230 kV (2) and 500 kV (2), and every PQC link is 46 kV. Line lengths run 0.2 to 22.2 km (median 3.5). All 117 sites carry an OSM way link. By operator tag: 98 EPB/TVA, 2 North Georgia EMC, 2 Colonial Pipeline, 15 untagged. Tennessee: 8 of 38 spans are over 80 km, and the longest QKD span is 78.3 km.

---

## 1. MISMATCH and UNSOURCED (fix these), most visible first

| # | Page | Location | Claim (exact) | Verdict | Suggested replacement |
|---|---|---|---|---|---|
| 1 | Home | `index.html:314`, key-numbers tile | "≈1 s · from a full tap on a fiber to the alarm" | **MISMATCH.** The model gives 0.25 s median and at most 0.5 s on all 34 fibers, recomputed with the page's own engine. That pace comes from the demo constant `DETECTED_PER_TICK_AT_10KM = 500`, which `main.js:14-16` itself calls "not a hardware key rate". It is the only key number shown as a real-world speed, and no job backs it. | Swap the tile for a real job: `<b>4.25%</b><span>error rate on a real Rigetti quantum computer with no spy (51 of 1,200 bits), well under the 11% limit</span>`. Source: nb1 cell 10, job `aws:rigetti:qpu:cepheus-1-108q-a7ae-qjob-6af8baa6c8f5265fb3f203f7`, WRITEUP:33. If you keep the speed tile: `<b>&lt;0.5 s</b><span>simulated time from a full tap to the alarm (the demo's pace, not hardware)</span>` |
| 2 | Home | `index.html:312`, key-numbers tile | "117 · real EPB and TVA substations, from OpenStreetMap" | **MISMATCH** (minor). All 117 are real OSM substations, but only 98 are tagged EPB or TVA (2 North Georgia EMC, 2 Colonial Pipeline, 15 untagged). | "real substations around Chattanooga, mostly EPB and TVA, from OpenStreetMap" |
| 3 | Home | `index.html:294`, step 4 card "Try" | "Run 1,024 shots and compare your counts with the measured ones." | **MISMATCH.** The 1,024-shot run is on the lab's Teleport tab, and that tab shows no measured results. The measured tables are on the BB84 and Grover tabs, which run 20,000 photons or exact values, not 1,024 shots. | Best: add nb3's measured table to the Teleport tab (see Section 3, item 4); then the line is true. Otherwise: "Run the experiments in your browser and compare them with results measured on simulators and a real Rigetti quantum computer." |
| 4 | Home | `index.html:358` | "The live grid from step 3 also comes as a single HTML file." | **MISMATCH.** The live grid is step 2. Step 3 is the photon line (`index.html` journey; `qbar.js:14`). | "The live grid (step 2) also comes as a single HTML file." |
| 5 | Home | `index.html:309`, key-numbers intro | "Every figure comes from the model and the map data you can open above." | **MISMATCH** (framing). The "4 toolkits" tile comes from recorded simulator runs (WRITEUP:245-255), not the model or the map. If item 1 is fixed it also comes from a hardware job. | "Every figure comes from the map data, the model, or a recorded quantum run (job IDs in WRITEUP.md)." |
| 6 | Real map | `chattanooga_quantum_map.html:306`, subtitle | "Real EPB and TVA substations and power lines from OpenStreetMap." | **MISMATCH** (minor). Same as item 2. | "Real substations and power lines (mostly EPB and TVA) from OpenStreetMap." |
| 7 | Real map | `chattanooga_quantum_map.html:319`, Tennessee view, Detailed | "China's 2,000 km Beijing–Shanghai backbone uses 32 relays, about 70 km apart." | **UNSOURCED on the page.** The repo's source is `docs/TECH_RANKED.md:97-98,102` (arXiv:2212.10820). 2,000 km over 33 segments averages about 61 km, so "about 70 km" is not self-evident. | "China's Beijing–Shanghai fiber backbone, about 2,000 km long, uses 32 trusted relays (arXiv:2212.10820)." Keep a spacing only if the paper states it. |
| 8 | Live grid | `grid-twin/src/ui.js:83`, "Try it" box | "the network notices the spy in about a second" | **MISMATCH** (minor, conservative). The demo fiber L6 (12.1 km) alarms after 0.25 s median, 0.5 s at the 95th percentile (recomputed). | "the network notices the spy in under a second of simulated time" |
| 9 | Live grid | `grid-twin/src/ui.js:311`, engine hint, Detailed, server only | "Runs this fiber's current noise and tap as 4,000 photons of real quantum code" | **MISMATCH** for some engines. The page asks for 4,000 rounds (`main.js:421`). qBraid IonQ runs 2 rounds × 1,000 shots, QIR and notebook 1 on QIR run 6 × 2,000 = 12,000 bits (`engines.py:239-240,400`), and notebook 1 locally caps at 600 rounds (`engines.py:381`). | "Re-runs this fiber's current noise and tap on a quantum simulator (4,000 photons on Qiskit, CUDA-Q and Guppy; 2,000 to 12,000 bits on qBraid) and compares the error rate." |
| 10 | Photon line | `bb84_visualizer.html:366-371`, Step 6 facts card, Detailed | "IonQ simulator, “aria-1” noise model · Job ID ionq:ionq:sim:simulator-a7b0-qjob-6af7c328f15852ed27b72012 · … · QBER 0.08%" | **MISMATCH.** That job ran on a teammate's account and "can't be re-checked from ours" (WRITEUP:290). nb1's saved run of the same circuit (cell 12) is job `ionq:ionq:sim:simulator-a7ae-qjob-6af8bac1c8f5265fb3f20417`, QBER **0.000** (0 / 1,200). The real-hardware result from that cell set (cell 10) is the one to show. | Replace the card with nb1's own runs: "Rigetti Cepheus-1-108Q, **real QPU** · job `aws:rigetti:qpu:cepheus-1-108q-a7ae-qjob-6af8baa6c8f5265fb3f203f7` · 200 shots · 51 of 1,200 kept bits wrong · **QBER 4.25%**". Add rows for IonQ simulator (aria-1) 0 / 1,200 (job …20417), Quantinuum H2 emulator 1 / 1,200 = 0.08% (job `quantinuum:quantinuum:sim:h2-emulator-a7ae-qjob-6af8bac2c8f5265fb3f2041d`) and qBraid QIR 0 / 1,200 (job `qbraid:qbraid:sim:qir-sv-a7ae-qjob-6af8bac4c8f5265fb3f20421`). Source: WRITEUP:30-36. |
| 11 | Photon line | `bb84_visualizer.html:370` | "Errors · 1, on qubit 10" (and the flagged q10 tile, `q === 10`, about line 412) | **UNSOURCED.** No saved counts show which qubit erred, and the job behind it can't be re-checked. | Delete the row and the q10 flag. |
| 12 | Photon line | `bb84_visualizer.html:373` | "The Quantinuum H2 emulator and the real IonQ Forte also model readout errors and should come out higher." | **MISMATCH.** H2 was run: 0.08% (1 / 1,200). IonQ Forte never ran: refused, needing 1,630 credits with 500 available (WRITEUP:38,289). The real QPU we did run is Rigetti, at 4.25%. | "The Quantinuum H2 emulator, which models readout error, gave 0.08% (1 of 1,200). The real Rigetti Cepheus quantum computer gave 4.25% (51 of 1,200): real hardware has a noise floor the simulators do not show." |
| 13 | Photon line | `bb84_visualizer.html:354` (legend) and `:442` (`Y(.0008)` line in the chart) | "IonQ simulator noise, 0.08%" | **MISMATCH.** Same as item 10: nb1's saved IonQ run is 0.000. | Legend: "Real Rigetti QPU, no spy: 4.25%"; chart line `Y(.0425)`. Source: nb1 cell 10, WRITEUP:33. |
| 14 | Photon line | `bb84_visualizer.html:326`, Step 3 card | "about 3% · What real fiber adds on its own." | **UNSOURCED on the page.** The model value is 3.3%, the detector error from Ma, Qi, Zhao and Lo, Table 1 (WRITEUP:220), but this page names no source. | "about 3.3% · What a real fiber and detector add on their own (Ma, Qi, Zhao and Lo, Table 1). The live grid includes it." |
| 15 | Photon line | `bb84_visualizer.html:377`, footer | "Nothing on this page ran on quantum hardware." | True today; becomes **MISMATCH** once items 10/13 are fixed. | "The stage and the sweep run in your browser. The Step 6 results are saved cloud and hardware jobs from notebook 1." |
| 16 | Quantum lab | `threejs_quantum_grid.html:245`, Grover table, H2 row, 16 keys | "–" | **MISMATCH** (missing result). The H2 emulator ran N = 16: 174 of 200, **87.0%**, job `quantinuum:quantinuum:sim:h2-emulator-a7ae-qjob-6af8baa6c8f5265fb3f203f4` (WRITEUP:158,304). | `<td class="n" data-n="16">87.0%</td>` |
| 17 | Quantum lab | `threejs_quantum_grid.html:246`, Grover table, Rigetti row, 16 keys | "–" | **MISMATCH** (missing result, and the unflattering one). Rigetti ran N = 16: 9 of 200, **4.5%**, job `aws:rigetti:qpu:cepheus-1-108q-a7ae-qjob-6af8baa7c8f5265fb3f203fd` (WRITEUP:158,307). Leaving it blank hides that Grover failed at that size. | `<td class="n" data-n="16">4.5%</td>` |
| 18 | Quantum lab | `threejs_quantum_grid.html:248`, note under the table | "Random guessing: 25% with 4 keys, 12.5% with 8. On real hardware the right key is still the most common answer, but its lead shrinks fast as circuits grow." | **MISMATCH.** At 16 keys on Rigetti the right key was *not* the most common answer: 9 shots, while two wrong keys got 21 each, below the 6.25% of random guessing (WRITEUP:162). | "Random guessing: 25% with 4 keys, 12.5% with 8, 6.25% with 16. On the real Rigetti machine the right key was the most common answer with 4 and 8 keys; with 16 keys it came up on only 9 of 200 shots (4.5%), below random guessing, so the noise wiped out the search." |
| 19 | Quantum lab | `threejs_quantum_grid.html:336`, Roadmap → Next | "Hardware: notebook 3's teleportation on a real quantum computer." | **MISMATCH.** Already done: Rigetti Cepheus, 167 of 200 shots read 0 (83.5%), job `aws:rigetti:qpu:cepheus-1-108q-a7ae-qjob-6af8bab8c8f5265fb3f2040a` (nb3 cell 6, WRITEUP:238). | Move it to the Teleport tab as a result (Section 3, item 4). New roadmap line: "Hardware: teleportation between two chips over real fiber (today's run kept all three qubits on one Rigetti chip)." |
| 20 | Quantum lab | `threejs_quantum_grid.html:214`, note under the simulator table | "Each used 1,000 to 12,000 bits, so they land within about 1 to 2 points of theory." | **MISMATCH** (minor). Qiskit, CUDA-Q and Guppy used 4,000 rounds (about 2,000 sifted bits), IonQ 2 × 1,000 = 2,000, and QIR 12,000 (`engines.py`, BUILD_LOG:144-156). The largest gap is 1.49 points (Guppy), 2.0 standard errors (WRITEUP Step 3 Part 3, as of `d14c09f`). | "Each used about 2,000 to 12,000 sifted bits. All land within 1.5 points of theory; Guppy, the furthest out, is 2.0 standard errors away." |
| 21 | Quantum lab | `threejs_quantum_grid.html:337`, Roadmap → GPU, Detailed | "(35-qubit state vector, 500-qubit tensor network …)" | **UNSOURCED** ("500-qubit"). 35 qubits is in BUILD_LOG:146. No file in the repo gives 500 (`docs/TECH_RANKED.md:50` says only "many more qubits"). | "(35-qubit state vector, or tensor networks for larger circuits, and run whole teleportation routes as one circuit)" |
| 22 | 2D monitor | `interactive_grid_monitor.html:608`, Detailed note | "The live grid uses a 4.5σ test against each fiber's own baseline (about 4.7–5.0% on city fibers)" | **MISMATCH** (minor). On the live grid's default network (Chattanooga) the 4.5σ warning line runs **4.30% to 5.00%** across the 34 QKD fibers (recomputed from `detector.js` with `main.js` rates). | "(about 4.3–5.0% on Chattanooga's QKD fibers)" |

---

## 2. Checked and fine (SOURCED or COMPUTED-OK)

| Page | Location | Claim | Verdict and source |
|---|---|---|---|
| Home | `index.html:214` | "117 real substations" | SOURCED (c): `chattanooga.json` has 117 nodes, each with an OSM way link; WRITEUP:181 |
| Home | `index.html:214` | "BB84 on every transmission fiber" | COMPUTED-OK: all 34 QKD links are 161/230/500 kV; all 111 PQC links are 46 kV (map data) |
| Home | `index.html:261` | "runs four times a second on every QKD fiber" | COMPUTED-OK: `main.js:13` `TICK_MS = 250` |
| Home | `index.html:263` | "error-rate cutoff (11% by default)" | SOURCED: WRITEUP:204; `ui.js:96` |
| Home | `index.html:295` | "measured results come from simulators, emulators and a Rigetti quantum computer" | SOURCED: WRITEUP run record (Rigetti jobs …203f7, …2040a, …6af7d357…, …203fd, …6af7d39a…) |
| Home | `index.html:313` | "34 fibers running BB84 in the live grid" | SOURCED (c): map data; nb3b cell 3 (`fibers: {'qkd': 34, 'pqc': 111}`) |
| Home | `index.html:315`, `:333` | "4 quantum toolkits confirm the physics: Qiskit, CUDA-Q, Guppy and qBraid" | SOURCED: WRITEUP:245-255 (qBraid job `ionq:ionq:sim:simulator-a7ae-qjob-6af89d21c8f5265fb3f1dcf7`); BUILD_LOG:86 |
| Home | `index.html:316` | "0 links shut down by an alarm" | COMPUTED-OK: engine test "alarms never take links down" passes (35/35) |
| Home | `index.html:346` | "Grover's search on routes is a demonstration" | SOURCED: nb3b cells 10-12; WRITEUP:212 |
| Real map | `:310-313` | site, QKD, PQC and longest-link counts (117 / 34 / 111 / 22.2 km; Tennessee 33 / 30 / 8 / 124.4 km) | COMPUTED-OK from the map data (`net.nodes.length` and the links) |
| Real map | `:315` | "Fiber QKD works to roughly 80 to 100 km" | SOURCED: WRITEUP:191,221 (mentors) |
| Real map | `:318` | "8 of 38 spans are longer than 80 km" | COMPUTED-OK: `tennessee500.json` |
| Real map | `:168`, `:399` | QKD "161 kV and up"; 46 kV lines on ML-KEM | COMPUTED-OK: map data |
| Real map | `:182`, `:188-194` | Ma, Qi, Zhao and Lo Table 1 values (0.21 dB/km, 4.5%, 1.7e-6, 3.3%) | SOURCED (d): named on the page; same values as WRITEUP:220 |
| Real map | `:182`, `:195` | "Spy detected … quick estimate (1.4 points above normal)" | COMPUTED-OK: the live grid's 4.5σ line sits 1.0-1.7 points above baseline on Chattanooga fibers, and the page labels this rule a quick estimate |
| Real map | `:361` | "Above the 11% limit no secret key can be made" | SOURCED: Shor-Preskill, WRITEUP:47 |
| Real map | `:182` | "No cost figures: we found no published QKD prices." | SOURCED: WRITEUP:264 |
| Live grid | `ui.js:97` | "11% is the Shor–Preskill limit" | SOURCED: WRITEUP:47 |
| Live grid | `ui.js:31-32` | "checked against Qiskit, CUDA-Q, Guppy and qBraid" | SOURCED: WRITEUP:245-255; `calibration.json` (Aer, 7 scenarios) |
| Live grid | `main.js:771` | "BB84 running on 34 QKD fibers; the other 111 links use ML-KEM" | COMPUTED-OK: map data |
| Live grid | `engines.py:438-444` | engine labels (Qiskit Aer, NVIDIA CUDA-Q, Quantinuum Guppy (Selene), qBraid IonQ / QIR / GPU) | SOURCED: BUILD_LOG:140-158. The GPU engine is shown only with `GRIDTWIN_ALLOW_PAID=1` and has never run (BUILD_LOG:146) |
| Live grid | baseline 3.30% on city fibers | model | COMPUTED-OK: `baselineQber` with Ma Table 1 values gives 3.30-3.31% for 0.2-22 km |
| Photon line | `bb84_visualizer.html:325` | "QBER 0.0 · 200 photons … nobody listening" | SOURCED: nb1 cell 6 |
| Photon line | `:335` | "½ × ½ = 25%" | COMPUTED-OK (WRITEUP:21) |
| Photon line | `:336` | "QBER 0.258 … Eve on every photon" | SOURCED: nb1 cell 6 |
| Photon line | `:342` | "Each extra 10% she grabs adds about 2.5% to the error rate." | COMPUTED-OK from f(¼ − p/2). Optional reword: "about 2.5 percentage points" |
| Photon line | `:361` | "16 rounds on 16 qubits in one circuit and runs it 200 times" | SOURCED: nb1 cells 8 and 10; WRITEUP:28 |
| Photon line | `:362` and the `HW` arrays (about line 410) | "first 16 rounds … (seed 42). Six have matching bases" | COMPUTED-OK: re-derived with numpy `default_rng(42)` (6 of 16; 93 of 200) |
| Photon line | `:368` | "Kept bits 6 × 200 = 1,200" | SOURCED: WRITEUP:28 |
| Quantum lab | `:7` meta | "results measured on simulators and a real Rigetti quantum computer" | SOURCED: WRITEUP run record |
| Quantum lab | `:204` | "3.3% normal error and a spy reading 40% … Theory says 12.64%" | COMPUTED-OK: 0.033 + 0.4 × (0.25 − 0.0165) = 0.1264 |
| Quantum lab | `:207-209` | Qiskit 13.52%, CUDA-Q 12.11%, Guppy 11.15% | SOURCED: WRITEUP:249-251; BUILD_LOG:86 |
| Quantum lab | `:210` | qBraid IonQ simulator 12.55% | SOURCED: job `ionq:ionq:sim:simulator-a7ae-qjob-6af89d21c8f5265fb3f1dcf7` (WRITEUP:252,321) |
| Quantum lab | `:211` | qBraid QIR simulator 12.96% | SOURCED: BUILD_LOG:154. **No job ID recorded anywhere**; see Section 3, item 8 |
| Quantum lab | `:212` | Team notebook 1 on qBraid QIR 12.48% | SOURCED: job `qbraid:qbraid:sim:qir-sv-a7ae-qjob-6af89fbcc8f5265fb3f1e23b` (BUILD_LOG:196-198; WRITEUP:253) |
| Quantum lab | `:214` | "All six are simulators or emulators, not quantum hardware." | SOURCED |
| Quantum lab | `:222` | "about √N tries … For AES-128 that is like halving the key length … AES-256" | SOURCED: WRITEUP:165,169 |
| Quantum lab | `:239` | "200 runs per machine (Qiskit Aer: 1,024)" | SOURCED: WRITEUP:154 |
| Quantum lab | `:242` | Theory 100% / 94.5% / 96.1% | SOURCED and COMPUTED-OK: sin²((2k+1)·asin(1/√N)); `check_grover.py` 0 mismatches |
| Quantum lab | `:243` | Qiskit Aer 100% / 95.5% / 96.0% | SOURCED: nb2b cell 7 |
| Quantum lab | `:244` | IonQ noisy simulator 100% / 71.5% / 36% | SOURCED: jobs …6af7caaf…, …6af7cacb…, …6af7cadc… (WRITEUP:299-301; N = 4 also nb2b cell 9). Optional: add "(forte-1 noise model)" |
| Quantum lab | `:245` | H2 emulator 100% / 92.5% | SOURCED: jobs …6af7ccc1…, …6af7ccc3… (WRITEUP:302-303) |
| Quantum lab | `:246` | Rigetti 88.5% / 45.0% | SOURCED: jobs …6af7d357f15852ed27b72465 / …72468 (WRITEUP:305-306) |
| Quantum lab | `:249` | "Shor on 15 (hand-reduced circuit) put 65% of shots on the four ideal outcomes, against 25% for noise" | SOURCED: job `aws:rigetti:qpu:cepheus-1-108q-a7ae-qjob-6af7d39af15852ed27b724ad` (WRITEUP:81,296) |
| Quantum lab | `:274` | "66.7% · Classical limit (2/3)" | COMPUTED-OK: standard average-fidelity bound for a classical channel |
| Quantum lab | `:326` | "qBraid's GPU state-vector simulator is wired in too but off by default (it costs credits)" | SOURCED: BUILD_LOG:146; `engines.py:449-467` |
| Quantum lab | `:343` | "Chattanooga's links are all under 23 km" | COMPUTED-OK: longest 22.2 km |
| 2D monitor | `:345`, `:619` | "Q = p + f × (1/4 − p/2): each intercepted photon has a 1-in-4 chance of a wrong bit" | COMPUTED-OK (WRITEUP:25) |
| 2D monitor | `:354` | chain rule (1 − 2Q_end) = ∏(1 − 2Q_i) | COMPUTED-OK: composition of independent flip channels |
| 2D monitor | `:616` | "Above 11% … (Shor-Preskill bound)" | SOURCED: WRITEUP:47 |
| 2D monitor | `:376-381`, `:468-485` | fiber constants (Ma Table 1) and whiteboard link lengths | SOURCED (d) for the constants; the lengths come from the layout, which the page labels a sketch, not a real network (`:368`) |

---

## 3. Real results the site should show but doesn't

1. **BB84 on real hardware: Rigetti Cepheus-1-108Q, no spy, QBER 4.25% (51 / 1,200)**, job `aws:rigetti:qpu:cepheus-1-108q-a7ae-qjob-6af8baa6c8f5265fb3f203f7` (nb1 cell 10; WRITEUP:33). It is the project's headline hardware result, yet it appears on no page. Where it fits: the home key-numbers tile (item 1), photon line Step 6 (item 10), and a "What real machines measured" card on the lab's BB84 tab under the simulator table.
2. **nb1's own free-backend runs of the same circuit**: IonQ aria-1 0 / 1,200 (…20417), H2 emulator 1 / 1,200 (…2041d), qBraid QIR 0 / 1,200 (…20421) (nb1 cell 12). They belong in photon line Step 6, replacing the teammate's job that can't be re-checked.
3. **Grover N = 16 on H2 (87.0%) and Rigetti (4.5%)**: lab Grover table (items 16-18).
4. **Teleportation, nb3**: Aer 1,024 / 1,024 (cell 3), IonQ forte-1 simulator 195 / 200 (job `ionq:ionq:sim:simulator-a7ae-qjob-6af8baa7c8f5265fb3f203fa`, cell 4), H2 emulator 199 / 200 (job `quantinuum:quantinuum:sim:h2-emulator-a7ae-qjob-6af8babac8f5265fb3f2040d`, cell 6), **Rigetti real QPU 167 / 200 = 83.5%** (job `aws:rigetti:qpu:cepheus-1-108q-a7ae-qjob-6af8bab8c8f5265fb3f2040a`, cell 6). Where it fits: a "What real machines measured" card on the lab's Teleport tab, with one caveat line: "all three qubits on one chip, so this tests the circuit, not distance" (WRITEUP:242). This also makes the home "compare your counts with the measured ones" true (item 3) and fixes the roadmap (item 19).
5. **Route search Grover on Aer, nb3b cell 10**: 172 / 200 clean picks (86%) against exact 84.4% (random 37.5%). Where it fits: the live grid's Grover card (`ui.js:470`, Detailed), e.g. "Notebook 3b on Qiskit Aer: 172 of 200 draws clean (exact 84.4%)", or the home "Demonstration" card.
6. **Shor on Aer, nb2 cells 4-5**: r = 4, 15 = 3 × 5. Where it fits: one clause next to the Rigetti Shor note (lab `:249`).
7. **Hardware gap, nb2 cell 7 and WRITEUP:97-103**: the largest machines have 156 qubits (web catalog) or 107 (SDK), against under 1 million for RSA-2048 (Gidney 2025), a gap of about 4 orders of magnitude. Where it fits: one line on the lab's Grover tab, next to the AES sentence.
8. **Job IDs for the lab's simulator table** (`:207-212`): IonQ (…6af89d21…) and notebook 1 on QIR (…6af89fbc…) are on record, so add them as a Detailed column. The **QIR 12.96%** row has no job ID in any file; find it in the live-server log, or drop the row and keep the notebook 1 QIR row, which has one.
9. **Aer reference calibration** (`grid-twin/data/calibration.json`: 7 scenarios, largest gap 1.4σ): could be linked from the home "4 toolkits" Detailed line as the local Qiskit check.

---

## 4. Summary

| Verdict | Rows |
|---|---|
| MISMATCH | 18 (items 1-6, 8-10, 12-13, 15-20, 22; item 15 becomes one only after items 10/13 are fixed) |
| UNSOURCED | 4 (items 7, 11, 14, 21) |
| SOURCED | 34 |
| COMPUTED-OK | 17 |
| Missing results | 9 (Section 3) |

The notebooks and the WRITEUP run record agree with each other. The site's problems are of three kinds:
- **Stale numbers**: the teammate's IonQ job on the photon line, and the "Next: teleportation on hardware" roadmap line for a run that is already done.
- **Hidden unflattering results**: the blank N = 16 Grover cells on H2 and Rigetti.
- **A model number presented as a key fact**: "≈1 s" on the home page.

The project's real hardware results (Rigetti BB84 4.25%, Rigetti teleportation 83.5%) are missing from every page.
