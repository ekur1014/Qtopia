# Work log: our contributions to Qtopia

Everything this part of the team built for the Tennessee Quantum Hackathon (Secure the Grid track), in order, with where it lives and how it was checked. Teammates' work (notebook 1, notebook 3, `WRITEUP.md`, `interactive_grid_monitor.html`) is theirs and not described here except where it affects ours.

## 1. Step 2: Shor, hardware gap, and the written analysis (Friday night)

- **Notebook 2** (`2_shor_harvest_now.ipynb`): filled the Part 1 TODO (factors from the period). Result r = 4, 15 = 3 × 5. Filled the Part 2 answers in cell 7 (device list: 107 qubits in the SDK list, 156 on IBM in the web catalog; RSA-2048 needs under 1 million physical qubits per Gidney 2025; gap about 4 orders of magnitude).
- **Notebook 2b** (`2b_grover_symmetric_keys.ipynb`): wrote the phase oracle and diffuser; added an N = 4, 8, 16 sweep. Aer success 100%, 95.5%, 96.0% against exact 100%, 94.5%, 96.1%. `check_grover.py` verifies the oracle and diffuser for every key from N = 2 to 32.
- **WRITEUP_step2.md**: Parts 1 to 5, the run record, and sources. Parts 3 and 4 (exposure map, migration plan) were drafted by two open models and merged and fact-checked by us; the key dates (NIST IR 8547, NERC CIP-012-2, CIP-005-8, EO 14412) were checked against primary pages.
- Commits: `ef6c418` (Step 2), `759f28d` (symmetric keys folded into the migration plan).

## 2. Hardware and emulator runs

| Device | What | Result | Credits |
|---|---|---|---|
| IonQ simulator (noise model forte-1) | Grover N = 4, 8, 16 | 100%, 71.5%, 36% | 0 |
| Quantinuum H2 emulator | Grover N = 4, 8 | 100%, 92.5% | 0 |
| Rigetti Cepheus (real QPU, AWS) | Grover N = 4, 8; Shor on 15 (reduced circuit) | 88.5%, 45%; 65% on the four ideal outcomes | 115.5 |

- All 8 job IDs in `WRITEUP_step2.md` were re-checked against qBraid during the audit: all completed, counts match.
- Did not work: Open Quantum IonQ jobs (first without a linked account, then out of Open Quantum credits); IBM machines (qBraid does not allow direct access from this account).
- Found and fixed a local tooling bug: `openqasm3` 1.0.2 rejects QASM 2 programs, which broke qBraid SDK submission; pinned 1.0.1.
- Commits: `febc221` (emulator), `f55a205` (Rigetti).

## 3. Reviews and corrections

- A five-model review (DeepSeek, GLM, big-pickle, two Beam variants) of the write-up; every finding was checked before changing anything. Fixed: the EO 14412 signature deadline (2031), the saved-run phase in Part 1, the IEC 62351-6:2020 move to symmetric MACs for GOOSE, DNP3 SAv5 details, RFC 9370 being IPsec only, and others. Commit `f7212b9`.
- `slides.md`: deck plan matched to the organizers' five-slide template (5 minutes): Problem, Ideal Customer Profile, Solution & Technology, The Team, What We Learned. Commits `77e4ad3`, `bea1942`, `f583157`, `9562e62`.

## 4. Repository housekeeping

- Commit author set to the GitHub account's noreply address; AI attribution lines removed from our commits. Shared history was rewritten twice for this (once for the author identity, once to remove the attribution lines), each time with a lease-protected force push after checking that no teammate had pushed in between. Teammates' commits were not changed.
- Every later push was a fast-forward. When a teammate pushed first (`175ebc6`), our commit was rebased on top of theirs, not forced.

## 5. Step 3: Grid Twin (Saturday)

- Direction from the team recordings: an interactive network view with live QBER and click-to-place eavesdroppers; satellites out of scope. Built in 3D with Three.js. Full details in `grid-twin/BUILD_LOG.md` and `grid-twin/DESIGN.md`.
- Commit `244a27e`. The team chose Grid Twin's design over the teammate's 2D monitor.
- 14 Nov: dual ring removed by team decision; replaced by the route search (see docs/REMOVE_RING_PLAN.md).

## 6. Audit (Saturday)

See `docs/AUDIT.md`: what was re-checked, what was found, and what was fixed.

## 7. Expansion (Saturday)

- IEEE 14/30/57/118/300-bus grids as selectable networks; visual pass (bigger nodes, restrained glow, alarm shockwaves, camera glide, key-path packets).
- Team ideas built: decoy mode (keep a tapped line running on fake traffic to measure the tap) and risk-aware routing.
- Real-time code runs: the page can re-run any fiber on Qiskit Aer, NVIDIA CUDA-Q and Quantinuum Guppy (Selene).
- Published as a private artifact: https://claude.ai/artifact/RMHGPbTvUVXPvKpzXgE6pH (share from its Share menu).
- Every notebook-page technology and chat idea is assessed in `docs/TECH_OPTIONS.md`.

## Local tools used (not in the repo)

- Python environment with Qiskit 2.6.2, Qiskit Aer 0.18.2, qBraid SDK 0.13.0 (`openqasm3` pinned to 1.0.1).
- Node 24 for the Grid Twin tests.
- qBraid API key kept outside the repo (never committed; checked in the audit).
