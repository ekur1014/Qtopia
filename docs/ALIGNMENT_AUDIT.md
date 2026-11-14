# Alignment audit: does Grid Twin match what the team asked for?

Saturday 14 November 2026. Sources checked: the four team recordings and their transcripts (including the 15-minute late-night one, re-transcribed locally because its PDF was short), the whiteboard photos, the notebook page of technologies, the chat ideas, the track README (Step 3), and the teammates' notebooks 1 and 3.

## 1. Requirements matrix

| # | What the team said | Source | Grid Twin | Status |
|---|---|---|---|---|
| 1 | Interactive graph of the network | Lead, latest recording | 3D network of control centers, substations and sub-units | Met |
| 2 | Show QBER live, "based on the simulation it's running" | Lead | Every QKD fiber runs BB84 4 times a second; inspector shows QBER, error bar, chart, warning and abort lines | Met |
| 3 | Button to put an eavesdropper on a link "and see what happens" | Lead | Eavesdrop tool (click a fiber) or "Place tap here"; share of photons adjustable live | Met |
| 4 | "Just use notebook 1" | Lead | Same model as notebook 1 (encode X then H; Eve measures in a random basis and re-encodes; QBER on sifted bits), verified against Qiskit. New: the page can also run **the team's own notebook 1 code** (`Team notebook 1` engine) | Met: notebook 1 is finished, and its own code runs from the page, locally and on qBraid |
| 5 | Model existing infrastructure: fiber to every substation, keys already exchanged; "a tool to visualize a system that already exists" | Lead | Chattanooga's real grid from OpenStreetMap (the hero), the Tennessee 500 kV backbone, and the Simulation lab (stylized city, IEEE grids); fiber assumed along every power line (OPGW) | Met. Wording kept honest: EPB ran QKD field tests, but "every substation already exchanged keys" is not verified |
| 6 | QBER below about 11% means good entanglement; teleport between any nodes where QBER is low; entanglement swapping | Lead | **New teleportation view**: fibers under 11% light up as usable; each substation gets its entanglement-swapping route with the end-to-end error; swapping nodes are shown as not trusted | Met, with the assumption stated: the same fibers would run an entanglement-based protocol (BBM92) |
| 7 | Teleportation does not beat the speed of the fiber; needs a classical link | Disclaimer recording | Stated in the view and the FAQ: two classical bits per teleported qubit | Met |
| 8 | When a QKD link breaks, central command decides what to cut: "this part, or this part, or everything" | Lead, first recording | Response policy: alarmed fibers switch to ML-KEM and stay up; real traffic reroutes by risk; quarantine by operator; sites with no path keep power and run on local protection | Met. "Cut" means communication paths only, as decided |
| 9 | PQC over the existing fiber, QKD only where it is worth it (trusted-node problem) | Late-night recording | Backbone-only QKD design; trusted relays drawn as gold rings | Met |
| 10 | Whiteboard: QKD also on substation-to-sub-unit links | Whiteboard photo | **New QKD coverage switch**: "Backbone only" (design) or "Every fiber" (whiteboard); in the latter, sub-units get QKD keys | Met; the team picks which to present |
| 11 | Satellites | First recordings | Out of scope, as the lead decided. An optional drawing (off by default, labeled "concept, not simulated") exists for discussion; it will probably be removed unless a quantum application needs it | Not simulated |
| 12 | Three.js, artifact, real-time code runs, CUDA-Q, Guppy | Notebook page | All built (see TECH_OPTIONS.md) | Met |
| 13 | Data set import, more and bigger nodes, less glow | Chat | IEEE 14 to 300-bus grids; visual pass | Met |
| 14 | Decoy traffic instead of cutting a line | Chat | Decoy traffic runs automatically when a fiber alarms (if no site would be stranded), with an estimate of the tap | Met |
| 15 | Route real traffic with a decision model | Chat | Risk-weighted shortest path | Met; the named tools ("jev or laya") are unidentified |
| 16 | Build and run one link on qBraid | Track README, Step 3 Part 3 | **New qBraid engine**: a fiber's photons run as a real job on qBraid's free IonQ simulator from the page | Met (job IDs are logged) |
| 17 | Address distance limits, number of substations, trusted nodes, **timing synchronization** | Track README, Step 3 Part 1 | Distance (fiber baseline and photon loss), sites and trusted nodes are shown. Timing synchronization is not modeled | Partly: timing sync belongs in the write-up |
| 18 | Teammates not working on the same thing | Lead | The team chose Grid Twin; the teammate's 2D `interactive_grid_monitor.html` overlaps it | Decided: Grid Twin is the main tool; the 2D monitor is kept as the first prototype, with its physics fixed |

## 2. Usability walkthrough (real clicks and keyboard)

Every control was operated: the four tools, the network and coverage selectors, both sliders, both checkboxes, all panel buttons, the inspector buttons on QKD and post-quantum fibers, and the site inspector.

| Found | Fix |
|---|---|
| Fibers and sites could only be selected by clicking in 3D (hard on a projector, impossible by keyboard) | **Find a fiber or site** picker in the panel |
| The tap slider only affected the next tap, not the selected one | Moving it now changes the selected fiber's tap live |
| Tap, decoy and quarantine buttons sat below the framework buttons | Moved to the top of the inspector |
| Auto-decoy checkbox had no proper accessible name | Labeled |
| The loading screen could stay up in a background tab (no animation frames run there) | Timer fallback |
| In "every fiber" mode, sub-units still got ML-KEM keys and the start message was wrong | Key rule now follows the network: any site with a healthy QKD chain gets QKD keys |
| A refused engine run showed as a server error | Returns a clear refusal (HTTP 422) with the reason |

## 3. QKD correctness of each feature

| Feature | Physics | Checked by |
|---|---|---|
| Error rate with a tap | Q = p + f(1/4 − p/2) | Tests; Qiskit Aer reference; three frameworks; qBraid cloud job |
| Fiber baseline | Single-photon case of Eq. (8), Lo, Ma and Chen 2005; parameters from Ma, Qi, Zhao and Lo, Table 1 | Citation check |
| Warning vs abort | Warning: statistically above the fiber's own baseline. Abort: 11% (Shor and Preskill) | Tests |
| Trusting keys | No QKD key before enough fresh measurements (probation) | Test and browser |
| Tap estimate (decoy mode) | f̂ = (Q − p)/(1/4 − p/2) | Unbiased in 2,000 windows and in the live app |
| Teleportation route | (1 − 2Q_end) = product of (1 − 2Q_i); usable under 11% | Monte Carlo test of the composition |
| Long fibers | 140 km detects about 537 times fewer photons, so it takes longer to build evidence (S7 shows "Measuring" for several seconds in every-fiber mode) | Browser |

Live engine results for one fiber (p = 3.3%, tap 40%, theory 12.64%): Qiskit Aer 13.52%, CUDA-Q 12.11%, Guppy/Selene 11.15%, qBraid IonQ simulator 12.55% (job `ionq:ionq:sim:simulator-a7ae-qjob-6af89d21c8f5265fb3f1dcf7`; corrected 14 Nov, see BUILD_LOG). Team notebook 1 code, finished by the teammate: 12.48% on qBraid's QIR simulator and 11.26% locally at a 40% tap. (Before it was finished, a scratch copy with `encode()` filled as its hint says gave 3.6%, 24.4%, 14.5% for taps of 0%, 100%, 40%; theory 3.3%, 26.7%, 12.6%), all within about 1σ.

## 4. What the team still needs to do

1. ~~Finish notebook 1~~ Done (14 Nov): the **Team notebook 1** buttons now run the team's own finished code, locally and on qBraid's QIR simulator.
2. Run notebook 3 once and save its outputs (it is filled in but has never been executed on GitHub).
3. ~~Decide the 2D monitor's fate~~ Done: kept as the first prototype, Forte label removed, alarm now per-fiber (baseline + 1.4 points, as on the map and in the lab).
4. Fix `WRITEUP.md` (Step 2 numbers, Step 3 design), and add a sentence on timing synchronization (Step 3 Part 1).
5. Pick which coverage to present: backbone only (our design) or every fiber (the whiteboard).

## 5. Follow-up: user feedback on Saturday afternoon

| Asked for | Done |
|---|---|
| Light mode (stations hard to see on dark) | Light theme is the default; dark one key away |
| Focus mode, zoom in and out, center, like a real 3D viewer | View dock and keys: + − Fit (H) Focus (F) |
| Cinematic orbit until interaction | Orbit (O), stops on interaction, resumes after 20 s idle |
| Satellite? | Optional concept drawing only (see row 11); likely to be removed |
| The response should happen automatically when a tap is placed, not through separate Quarantine and Decoy tools | Automatic response with an incident card; quarantine and decoy became operator overrides |

## 6. Team decision of 14 Nov, 12:48 (New Chat Grid)

| Asked for | Done |
|---|---|
| Model the dual ring: command center, nine supernodes, two rings so traffic can go either way | `?net=dualring`: 9 supernodes, 18 ring fibers (outer and inner), command center linked to supernodes 3 and 7 as drawn |
| QKD on every supernode connection | All 18 ring fibers and both command-center links run BB84 live |
| Best path: when an error rate is too high, go another way, all the way round if needed | One bad fiber: traffic moves to its twin. Both fibers of a span: the key goes the other way round (tested: supernode 4 moves from via 3 to via 7, 6, 5) |
| Don't worry about substations much | One substation per supernode, on ML-KEM |
| Remove the pitch deck | Done: no longer linked from our pages |
| Make sure it is justified | Open: the lead is checking how the real architecture works; distances are illustrative |

The task was given to a teammate (Asheb), and the lead is checking how the real architecture works. Grid Twin's version uses the same engine as everything else, so it can be compared with his.
