# Agent context: Qrypt (read this first)

A shared briefing for any AI agent working in this repo. It is optional: point an agent at it ("read docs/AGENT_CONTEXT.md first"). It is not loaded automatically.

Last updated: Saturday 14 November 2026, after commit `1b5ad2f`. **If something here conflicts with the code or with the user, the user wins, then the code. Then update this file.**

---

## 1. What this is

The team's entry for the **Tennessee Quantum Hackathon, "Secure the Grid" track**. The problems come from UTC (the University of Tennessee at Chattanooga), and qBraid is the quantum-cloud sponsor. The scenario is a Chattanooga-style utility (like EPB) keeping its fiber network secret, both today and after quantum computers.

- **Due: Sunday 15 Nov 2026, 9:00 AM.** One 5-slide pitch deck and a ZIP of this folder, with the notebooks run and `WRITEUP.md`.
- **Judges score:** understanding, presentation, whether it works (plus the tools built), and **honesty about what failed**. Code counts less than clarity.
- **Repo:** `github.com/ekur1014/Qrypt`, branch `main`. Track rules: `README.md`. UTC's original problems: `background/`.

## 2. Hard rules for agents

1. **Don't overclaim.** Every number needs a source: a notebook output, a job ID, the data, or a cited paper. If you can't verify something, say so or leave it out. Label simulators and emulators as such, never as hardware.
2. **Hardware runs.** Cap each run at 200 shots (track rule), and log every job ID in `WRITEUP.md` (run record at the end).
3. **Secrets.** The qBraid API key lives in `~/.qrypt.env`, outside the repo. Load it with `set -a; . ~/.qrypt.env; set +a`. Never print it, commit it, or copy it into a file.
4. **Git**
   - Author: the user's GitHub noreply identity (already set in git config).
   - **No AI or Claude attribution lines** in commits or PRs.
   - Commit or push only when the user asks. Never force-push.
   - Fetch before pushing; if `origin/main` moved, rebase rather than overwrite.
5. **One session edits at a time.** Several Claude sessions have worked in this same folder at once, and commits have collided. Before editing, run `git status` and `git log -3`. If files you didn't touch are changing, stop and tell the user.
6. **Teammates' files.** These were written by teammates; change them only with the user's go-ahead:
   - Asheb wrote the dual-ring router (since removed; its search logic lives on in `chattanooga_router.py`), and the alarm-system draft now in `docs/archive/`.
   - **Web uploads have overwritten `WRITEUP.md` twice** (1ee92a3, 1efbdde). After any "Add files via upload" commit, diff `WRITEUP.md` against the last audited version before building on it.
   - Notebooks 1 and 3 were written by teammates.
7. **Generated files**
   - `site/` is built by `tools/build_site.sh` and ignored by git. Never edit it by hand.
   - `grid_twin.html` is built from `grid-twin/` by `node grid-twin/tools/build_standalone.mjs`. Rebuild it after any change in `grid-twin/`.
8. **Notebooks.** Keep each notebook's kernelspec as it is: notebook 1 uses the qBraid-SDK kernel so it opens in qBraid Lab. To test, run scratch copies outside the repo.
9. **Scope.** The mentors' advice: "do less better than more worse". Satellites and teleportation between institutions are roadmap only.

## 3. Current decisions (and one open conflict)

- **The main model is Chattanooga's real grid** (OpenStreetMap). That was the first thing built and it is the hero.
- **The dual ring is removed** (team decision, 14 Nov; recording in `remove the ring/`; done in commit `919d24a`). Only `vercel.json` redirects from its old URLs remain.
- **Next feature: route search on Chattanooga** (from the recording). Inputs are a start site, an end site and an adjustable QBER cutoff (default 11%). Links above the cutoff are blocked, and the search finds the best other path. If none exists: ML-KEM, then islanding.
  - Plus a Grover demonstration that reuses notebook 2b's oracle and diffuser to pick a clean route among 8–16 candidates.
  - Frame it honestly: Dijkstra already solves this exactly, so this is a demo, not a speed-up. Details in the plan.
- **Design:** QKD (BB84) only on the high-voltage backbone; post-quantum cryptography (ML-KEM, ML-DSA) everywhere else.
  - An alarm never takes a fiber down: the fiber switches to ML-KEM and stays up.
  - Only an operator can quarantine a fiber.
  - Only communication paths are ever cut, never power.

## 4. Map of the repo

| Path | What |
|---|---|
| `1_bb84_eavesdropper.ipynb` | Step 1: BB84 with an eavesdropper. Saved outputs include the Rigetti hardware run and the free-backend comparison |
| `2_shor_harvest_now.ipynb` | Step 2: Shor factors 15, plus the qBraid device list |
| `2b_grover_symmetric_keys.ipynb` | Step 2 Part 5: Grover key search (N = 4, 8, 16). Checked by `check_grover.py` |
| `3_secure_grid_link.ipynb` | Step 3: teleportation link on Aer, the IonQ simulator, the H2 emulator and Rigetti (saved outputs) |
| `WRITEUP.md` | **The single write-up**: Steps 1–3 by Part, plus the full run record. The source of truth for numbers |
| `slides.md` | Deck plan and draft text for the organizers' 5-slide template (`Quantum_Hackathon_Five_Slide_Genric-Template.pptx`) |
| `grid-twin/` | The live 3D grid (Three.js). `src/` holds the physics, routing (`response.js`), UI and scene; `data/networks/` the Chattanooga, Tennessee 500 kV, IEEE and dual-ring networks; `sim/` the Python bridge that runs fibers on Qiskit, CUDA-Q, Guppy and qBraid; `tests/` the Node tests |
| Site pages | `index.html` (home), `chattanooga_quantum_map.html` (real map), `bb84_visualizer.html` (photon line), `threejs_quantum_grid.html` (quantum lab), `interactive_grid_monitor.html` (first prototype), `dual_ring_quantum_routing.html` (dual ring, slated for removal). All share `shared/qrypt.css` and `shared/qbar.js` (top bar and journey order) |
| `docs/` | Audits, mentor notes, tech options, work log, and this file. `REMOVE_RING_PLAN.md` is the ring plan |
| Recordings | `Idea/`, `New Chat Grid/`, `remove the ring/`, `Additional Mentor Recordings IMPORTANT/`: team and mentor recordings, transcripts and photos. `Video Resources/` is ignored by git (too large) |

## 5. How to run and check things

```bash
cd ~/VSCode/Qrypt
cd grid-twin && node --test tests/*.test.mjs && cd ..          # all must pass (40 as of the 14 Nov audit fixes)
python3 -m http.server 8000                                     # site at http://localhost:8000
python3 grid-twin/start.py                                      # live grid + quantum-code buttons
bash tools/build_site.sh                                        # build site/ (Vercel runs this too)
~/VSCode/qrypt-venv/bin/python check_grover.py                  # 0 mismatches expected
```

- **Python environment:** `~/VSCode/qrypt-venv` (Qiskit 2.6.2, Qiskit Aer 0.18.2, qBraid SDK 0.13.0, `openqasm3` pinned to 1.0.1: version 1.0.2 breaks QASM 2 submission).
- **Re-checking a job:** `from qbraid.runtime import QbraidJob; QbraidJob(id).result().data.get_counts()`. Counts come back in Qiskit order (qubit 0 is the last character).

## 6. Verified numbers (use these; the sources are in `WRITEUP.md`)

**Step 1 (BB84), 200 rounds, seed 42**
- **Aer:** QBER 0.000 clean, 0.258 with Eve on every qubit (theory 25%).
- **Batched circuit** (16 rounds, 200 shots, 1,200 sifted bits):

  | Device | QBER |
  |---|---|
  | Aer | 0.000 |
  | **Rigetti Cepheus (real)** | **4.25%** (51 bits wrong) |
  | IonQ simulator (aria-1) | 0.000 |
  | H2 emulator | 0.08% |
  | QIR simulator | 0.000 |

- **IonQ Forte was never run:** refused for credits.
- **Thresholds:** abort at 11% (Shor–Preskill). The alarm is per fiber and statistical, from the exact binomial tail (false alarms at most 3.4e-6 per check at z = 4.5). On Chattanooga (baseline 3.3%) the warning line is 4.4–5.1%: a 10% tap is above it on all 34 QKD fibers (reliably caught on 31), a 7% tap sits near it, and a 5% tap stays under it on 23 of 34.
- **Partial tap formula:** Q = p + f(1/4 − p/2).

**Step 2 (Shor and Grover)**
- **Shor on 15:** r = 4, 15 = 3 × 5. On Rigetti (hand-reduced circuit), 130 of 200 shots landed on the four ideal outcomes.
- **RSA-2048:** under 1 million physical qubits (Gidney 2025). The largest machine is 156 qubits (IBM, web catalog) or 107 (SDK list), so the gap is about 4 orders of magnitude.
- **Grover success:**

  | N | Aer | IonQ simulator | H2 emulator | **Rigetti (real)** |
  |---|---|---|---|---|
  | 4 | 100% | 100% | 100% | **88.5%** |
  | 8 | 95.5% | 71.5% | 92.5% | **45.0%** |
  | 16 | 96.0% | 36% | 87.0% | **4.5%** (below the 6.25% of random guessing) |

- **AES:** Grover halves the key exponent. AES-256 for new equipment; NIST says AES-128 stays secure for decades.

**Step 3 (design)**
- **Chattanooga, from OpenStreetMap:** 117 sites (2 control centers assumed: Oglethorpe and Chickamauga; 31 substations; 84 sub-units) and 145 lines.
  - QKD on 34 fibers (161, 230 and 500 kV); ML-KEM on 111 fibers (46 kV).
  - Line lengths 0.2–22.2 km, median 3.5 km.
- **Tennessee 500 kV:** 33 sites and 38 spans; 8 spans are over 80 km.
- **Teleportation, qubit 2 read 0:**

  | Device | Result |
  |---|---|
  | Aer | 1024 of 1024 |
  | IonQ simulator | 195 of 200 |
  | H2 emulator | 199 of 200 |
  | **Rigetti (real)** | **167 of 200** |

- **Live grid, one fiber with a 40% tap** (theory 12.64%):

  | Engine | QBER |
  |---|---|
  | Qiskit | 13.52% |
  | CUDA-Q | 12.11% |
  | Guppy | 11.15% |
  | qBraid IonQ simulator | 12.55% |
  | Team notebook 1 code on qBraid QIR | 12.48% |

**Claims that are wrong or unsourced (don't use them)**
- "Forte 98.5%"
- "<12 ms" failover
- "4–20 million qubits"
- "Rigetti Aspen"
- AES-256 "unbreakable"
- Any dollar price for QKD equipment (none is published)
- "Satellite" as part of the design
- Calling EPB's network "already exchanging keys everywhere"

## 7. Open work before the deadline

1. **The deck:** fill the 5-slide template from `slides.md`. Slide 3 still describes the old stylized city; update it to Chattanooga.
2. **`[TEAM]` items in `WRITEUP.md`:** confirm the rollout plan (Step 3 Part 4), and save Grid Twin screenshots as images for the Solution slide.
3. **The route search** (`grid-twin/src/route.js`, `chattanooga_router.py`, `3b_grover_route_search.ipynb`) is built. Its two early bugs are fixed: Grover now uses `floor(π / (4θ))` with θ = asin(√(M/N)), so it is never worse than a random pick; and fibers still on probation can't carry a QKD key.
4. **`bb84_visualizer.html`** now quotes the notebook's saved Eve result, 0.258 (it said 0.247 before 14 Nov).
5. **The submission ZIP:** about 72 MB of recordings are committed. Ask the user whether they belong in the ZIP.

## 8. People and sources

- **Team:** Ethan B. Chen (this machine; GitHub `EthanChenHyland`) and Asheb (GitHub `asheb8049-glitch`; dual-ring router). The repo owner is `ekur1014`. Use names only as they appear in the repo, and they/them pronouns unless told otherwise.
- **Mentor guidance:** `docs/MENTOR_NOTES.md`.
- **Team requirements matrix:** `docs/ALIGNMENT_AUDIT.md`.
- **Build history:** `grid-twin/BUILD_LOG.md` and `docs/WORK_LOG.md`.
