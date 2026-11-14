# Audit of our work

Saturday 14 November 2026. Scope: everything this part of the team produced (notebooks 2 and 2b, `WRITEUP_step2.md`, `slides.md`, `check_grover.py`, `grid-twin/`, `docs/`), plus how it fits with teammates' files. Teammates' files were reviewed but not changed.

## What was re-checked, and the result

| Check | Result |
|---|---|
| Grid Twin tests (`node --test tests/*.test.mjs`) | 21 pass at the time of this audit (15 at its start; 6 added). Now 27, see grid-twin/BUILD_LOG.md |
| `check_grover.py` | 0 mismatches, N = 2 to 32 |
| Notebooks 2 and 2b, fresh clone of `main`, re-executed | No errors, no leftover TODOs, outputs present |
| Every job ID in `WRITEUP_step2.md` (8) re-queried on qBraid | All COMPLETED; counts match the write-up exactly |
| Commit authors and attribution (all our commits) | GitHub noreply identity; no attribution lines |
| Secrets in tracked files | None |
| Browser: desktop 1440×900, phone 375×812 | No console errors at either size after the fixes below |
| Grid Twin physics vs Qiskit Aer (7 scenarios) | All agree |
| Same fiber on Qiskit Aer, CUDA-Q, Guppy (Selene) | All within statistical error of theory |
| Published artifact renders (Three.js from jsDelivr through an import map) | Confirmed by the user, 14 Nov |

## Problems found and fixed

| # | Problem | Found by | Fix |
|---|---|---|---|
| 1 | A restored fiber reused its old alarm state (could show "abort" or "healthy" before any new measurement) | GLM review, reproduced | Restored fibers stay on ML-KEM keys until fresh measurements clear them; regression test added |
| 2 | Phone layout: toolbar wider than the screen; network framed far too close | Our phone test | Compact toolbar; camera now fits every site into the free screen area by search, on any screen |
| 3 | Fiber parameters credited to the wrong paper | Our fact-check | Now cited to Table 1 of Ma, Qi, Zhao and Lo (arXiv quant-ph/0503005); baseline formula confirmed as Eq. (8) of Lo, Ma and Chen |
| 4 | "A 140 km fiber is close to unusable" because of a 4.8% baseline | Our fact-check | Reworded: the real issue is about 537 times fewer photons than a 10 km fiber |
| 5 | Photons jumped when paused | Our code read | Animation time now advances only while running |
| 6 | Detection claim "a 7% tap is caught within seconds" | Our arithmetic check | Corrected: 10% is caught reliably, 7% sits on the line, 5% hides |
| 7 | Response logic too slow for big grids (one search per site per tick) | Scaling test | One shortest-path tree per tick: 2.6 ms on 300 buses |
| 8 | `slides.md` still said Step 3 was not started | Our read | Updated for Grid Twin |
| 9 | Our work log said history was rewritten once (it was twice) | Our read | Corrected |

## Things we checked and that held up

- The tap estimate is unbiased: 2,000 simulated windows gave 39.98% for a true 40%; in the live app, 15 independent readings averaged 38.9%. (Four early readings all came out high; that was chance, confirmed by the larger samples.)
- The fiber parameter values themselves (0.21 dB/km, 4.5% efficiency, 1.7e-6 dark counts, 3.3% detector error) match the published table.
- The 11% abort line matches Shor and Preskill's result.

## The multi-model code review

DeepSeek and GLM each reviewed `grid-twin/` independently with a 9-minute limit. Neither finished a full report: both were still reading when the limit hit. GLM found and reproduced problem 1 before stopping. DeepSeek produced no findings. Every other fix above came from our own checks.

## Alignment with the team's ideas

See `docs/ALIGNMENT_AUDIT.md`: a requirements matrix from every team source, a full usability walkthrough, and the QKD physics behind each feature.

## Conflicts with teammates' files (not changed by us)

The team chose Grid Twin's design. These need the teammates' attention before submission:

1. **`WRITEUP.md`, Step 2**: says RSA-2048 needs 4 to 20 million qubits and lists Rigetti "Aspen". Our verified `WRITEUP_step2.md` has the current figure (under 1 million, Gidney 2025) and the live device list. Replace their Step 2 with ours.
2. **`WRITEUP.md`, Step 3**: describes a design with QKD only between control centers and PQC on all substation links. Make it match Grid Twin (QKD backbone to major substations, ML-KEM to sub-units and long links).
3. **`interactive_grid_monitor.html`**: says "IonQ Forte Verified: 98.5% (197/200)", but its own run log shows that job ran on IonQ's simulator with a noise model, not the Forte QPU. Its alarm is a fixed 7% threshold, which a careful tap can hide under; Grid Twin's is per-fiber and statistical (about 4.7 to 5.0%). Decide whether to keep it; if kept, fix the label. *Update 14 Nov: kept as the first prototype; the label is removed and the alarm is now per-fiber.*
4. Small overclaims in `WRITEUP.md`: AES-256 called "unbreakable"; the monitor's title uses the EPB name, which could read as an official EPB tool.

## Not verified

- Performance on the 300-bus grid on an older laptop (the 118-bus grid ran at about 120 fps in the test browser).
