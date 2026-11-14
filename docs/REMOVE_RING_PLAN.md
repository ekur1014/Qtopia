# Plan: remove the dual ring, put the Chattanooga route search (with Grover) in its place

Saturday 14 November 2026. Status: **plan only, nothing changed yet.**

## Why

The team decided to drop the dual-ring model completely: it adds complexity and pulls attention away from the original main model, Chattanooga's real grid (the real map was the first thing built). In its place comes the search algorithm from the new recording.

Source: `remove the ring/` (55 s recording, 14 Nov 14:10, with its transcript and summary). What it asks for:

1. Work on **the first simulator model, the whole Chattanooga grid**.
2. A search algorithm with three inputs: a **start node**, an **end node**, and a **QBER cutoff**. A link above the cutoff is treated as tapped and **inaccessible**. The default is about **11%**, and it must be easy to change.
3. If the normal path fails, **search for the best possible other path**.
4. Sometimes **no path exists**. The recording calls that "the problem we should solve", but says to build the algorithm first.

The team also asked that the plan use **Grover's search** (notebook 2b). How it fits honestly is in section 3.

---

## 1. What to remove, edit and keep

Found by searching every tracked file for `dual ring`, `dualring`, `dual_ring`, `supernode`, `teamDesign` and `team design`. `site/` is a build output (ignored by git, rebuilt by Vercel), so it is not edited by hand.

### Delete

| File | What it is | Note |
|---|---|---|
| `dual_ring_quantum_routing.html` | The teammate's 2D ring router page | Its search logic is kept: it is ported in section 2 |
| `dual_ring_router.py` | The teammate's Python router (ring + satellite + ML-KEM tiers) | Port `find_best_path` / `_dijkstra` first (section 2), credit Asheb, then delete |
| `grid-twin/data/networks/dualring.json` and `dualring.js` | Ring network data | |
| `grid-twin/tools/make_dualring.mjs` | Generator for the ring data | |

### Edit

| File | Line(s) today | Change |
|---|---|---|
| `grid-twin/data/networks/index.json` | entry `dualring` (first in the list) | Remove the entry. Chattanooga is already the default (`main.js:57`) |
| `grid-twin/src/main.js` | 70-80 (`design` flag, "The Dual Ring" title, ring subtitle, "Dual Ring · Qrypt"), 191 (`dualring: "R3"` demo fiber) | Remove the `design` branch; keep the `real` / test-network branches. Remove `dualring` from the demo map |
| `grid-twin/src/ui.js` | 32 (`FOOT.design`), 42 ("Team design" optgroup), 114 (`teamDesign` footer pick) | Remove the design footer and optgroup; the footer becomes `real ? "real" : "lab"` |
| `grid-twin/style.css` | 331-332 (`.is-real .brand, .is-design .brand` and the title rule) | Drop only the `.is-design` selectors and keep `.is-real`. The body class is set in `main.js:72` |
| `grid-twin/tests/engine.test.mjs` | 291-304, the ring test | **Replace, don't just delete.** It is the only test that checks that a tapped fiber moves a key path onto another route. New test on Chattanooga: see section 5 |
| `shared/qbar.js` | 9, 12 | Remove the "Dual ring" entry; renumber steps: Real map 1, Live grid 2, Photon line 3, Quantum lab 4 |
| `index.html` | 7 (meta description), 217 ("Start with the dual ring" button), 240-250 (Step 1 card), 280 (network list text), 363 (ring caveat), and the step numbers 243-307 | Hero button goes to the real map; drop the ring card; renumber steps 1-4; remove the ring from the description and caveats |
| `chattanooga_quantum_map.html` | CSS 42-48, 117-134; card 183-197; legend 208; JS 269, 275, 361, 477-561 (`planRing`, `drawRing`, switch handler) | Remove the "Hypothetical dual ring" card, layer, legend and code. Change "Step 2 · Real map" (170) to Step 1 |
| `threejs_quantum_grid.html` | 7, 154 ("Step 5") | Step 4 |
| `tools/build_site.sh` | 21 | Remove the `cp dual_ring_quantum_routing.html` line |
| `vercel.json` | | Optional: redirect `/dual_ring_quantum_routing.html` to `/chattanooga_quantum_map.html`, so links already shared don't break |
| `grid_twin.html` | generated | **Rebuild** with `node grid-twin/tools/build_standalone.mjs` after the edits above. Never edit by hand |
| `WRITEUP.md` | Step 3 Part 1 (lines 96-105) | Rewrite to the Chattanooga design (section 4). This also removes the unmeasured "<12 ms" APS claim and the satellite tier. It is the teammate's text, so agree on it with Asheb |
| `grid-twin/README.md` | 76 (`dualring` row), 100, 165 | Remove the ring |
| `grid-twin/DESIGN.md` | 100-111 ("The dual ring") | Replace with the route search design (sections 2 and 3) |
| `grid-twin/FAQ.md` | 65-66 ("Why a dual ring?") | Replace with "How does the route search work, and where does Grover come in?" |
| `grid-twin/DEMO.md` | 29 (optional ring step) | Replace with a route-search step |
| `grid-twin/BUILD_LOG.md`, `docs/ALIGNMENT_AUDIT.md` §6, `docs/WORK_LOG.md` | historical | Don't rewrite history. Add a dated line: "14 Nov: dual ring removed by team decision, see docs/REMOVE_RING_PLAN.md" |

### Keep (they say "ring" but are not the ring model)

- **Gold "relay rings"** in the live grid (`scene.js`, README line 121, DEMO line 26 and 41, FAQ line 45). They mark trusted relays on any network and stay.
- `New Chat Grid/`: the raw recording and whiteboard of the ring decision. Keep it as team history; it is not published.
- `interactive_grid_monitor.html`: a star network, not the ring. No change.

---

## 2. The classical route search (the recording's algorithm)

The teammate's `dual_ring_router.py` already implements exactly the recording's spec: a start and end node, an adjustable cutoff, links at or above the cutoff blocked, and Dijkstra with cost `km × (1 + 20 × QBER)`. The plan keeps that algorithm and moves it onto the Chattanooga graph. The ring topology and the satellite tier go.

**Where it lives**
- `grid-twin/src/route.js` (new, pure functions, so the browser and the node tests share it):
  `findRoute(net, start, end, { cutoff = 0.11, qberOf })` returns
  `{ ok, path: { nodes, links }, km, maxQber, relays, blocked: [linkIds], reason }`.
  It reuses `shortestPathTree`/`pathFromTree` patterns from `network.js`.
  A link is usable when it is in service (not quarantined) **and** its measured QBER is under the cutoff. Post-quantum (ML-KEM) fibers have no QBER and count as usable for data, but not for a QKD key path.
- `chattanooga_router.py` (replaces `dual_ring_router.py`, same author credit): the same algorithm in Python, loading `grid-twin/data/networks/chattanooga.json`. It is for the write-up and the notebook, and its `__main__` reproduces the teammate's four tests on real Chattanooga sites.

**How it decides**
1. Search the QKD fibers under the cutoff. If a path exists, that is the route, and the key is relayed through trusted nodes (gold rings), as today.
2. If not, **best possible other path**: search every fiber still in service, any QBER, and run that route on ML-KEM keys (post-quantum). This is the answer to the recording's "no path" problem: the data still gets through, just without a quantum key.
3. If there is no physical path at all, the site is **islanded**: it keeps power and runs on local protection, and a crew is dispatched. `response.js` already does this; the route search reports it in the same words.

**In the live grid** (`ui.js`, `main.js`): a new **Find a route** panel section with Start and End pickers (reuse the existing "Find a fiber or site" picker), and a **Cutoff** slider from 1% to 25%, default 11%, labelled "Shor–Preskill limit" at 11%. It highlights the route in 3D with the existing key-path highlight and lists hops, km, highest QBER, and the relays. It updates live when a tap is placed. Console hook: `gridTwin.route("S1", "S6", 0.11)`.

Note: the existing automatic response (`response.js`) stays as it is. It answers "how does every site reach a control center"; the route search answers "how does A reach B under my cutoff". Both use the same graph and the same live QBER.

---

## 3. Grover in the route search

**The idea:** notebook 2b uses Grover's search to find one secret key among N. The same circuit can pick a **clean route** among N candidate routes. The oracle marks every route whose fibers are all under the cutoff, and Grover amplifies them.

**How it works**
1. **Candidates (classical):** Yen's k-shortest simple paths from start to end on the Chattanooga graph, **N = 8 or 16**. That is 3 or 4 qubits: the sizes notebook 2b already ran on Aer, IonQ's simulator, the Quantinuum emulator and Rigetti Cepheus.
2. **Oracle:** a phase flip on every candidate index whose route is clean. This is 2b's oracle generalised from one marked key to **M marked routes** (one X-wrapped multi-controlled Z per marked index).
3. **Diffuser:** 2b's diffuser, unchanged.
4. **Iterations:** `round(π/4 · √(N/M))`. When M is not known (the real situation), use the BBHT schedule (Boyer, Brassard, Høyer, Tapp 1998): random iteration counts with a growing limit.
5. **Check (classical):** verify the measured route hop by hop. If it is clean, use it.
6. **Best route, not just a clean one (stretch):** Dürr–Høyer minimum finding, which is repeated Grover with the oracle "clean and shorter than the best so far". This finds the cheapest clean route among the candidates.
7. **No clean route (M = 0):** Grover's output stays uniform, so every check fails. After the BBHT limit, declare "no clean route" and fall back to section 2 step 2 (ML-KEM). That gives the recording's "no path" case a quantum-side answer too.

**What we say about it, honestly** (judges score honesty, and the mentors already said Grover for fault-finding is not needed):
- Dijkstra solves this exactly and fast on a classical computer. Grover only helps when searching an **unstructured** list, and here the oracle is built from QBER values we already know classically. This is a **demonstration that the same Grover circuit from 2b runs on the grid problem**, not a speed-up claim.
- What it does show: √N oracle queries against N, the same scaling that halves AES key strength in 2b. The quantum part and the classical part give the same answer.

**Where it lives**
- `3b_grover_route_search.ipynb` (new; Step 3 is where the network design belongs). It imports nothing from 2b's notebook but copies its `oracle`/`diffuser`, extended to M marked, so 2b's verified results stay untouched. It runs on Aer, with an optional single IonQ simulator or Rigetti run at N = 8 (about 40 credits, 200 shots, under the 200-shot rule). Record the job IDs in the run record.
- `check_grover.py`: add a multi-marked case (every subset of marks for N = 8) so the generalised oracle is verified like the original.
- In the browser: an exact state-vector Grover for N ≤ 16 in `grid-twin/src/route.js` (`groverRoutes(candidates, isClean)` returns per-index probabilities, iterations and success chance). This is the same kind of exact computation as the Quantum lab's Grover tab. The **Find a route** panel shows a small Grover card: N candidates, M clean, iterations, chance of drawing a clean route, and one sampled pick.
- Optional: a second scene in the Quantum lab's Grover tab ("Find a clean route"), next to "Crack a key".

---

## 4. Write-up and deck after the change

- **`WRITEUP.md` Step 3 Part 1:** Chattanooga's real grid from OpenStreetMap, 117 sites and 145 lines. QKD on the 34 backbone fibers (161 kV and up), ML-KEM on the 46 kV distribution lines. The route search with an adjustable cutoff, ML-KEM fallback and islanding. Grover as a demonstration (section 3, with the honesty lines). Timing synchronization stays as written. Remove the ring, the "<12 ms" claim and the satellite tier.
- **`slides.md` slide 3:** it describes the stylized-city Grid Twin. Update it to the Chattanooga hero and add one line on the route search and Grover.
- **Step 2 errors still open in `WRITEUP.md`** (from `docs/AUDIT.md`, unrelated to the ring but due at the same time): the RSA-2048 qubit figure, the Rigetti "Aspen" name, and AES-256 called "unbreakable".

---

## 5. Order of work, with a regression gate after each step

Before starting: make sure only **one** session is editing the repo (another session committed and pushed while this audit ran), and pull first.

**Baseline (record before touching anything)**
- `cd grid-twin && node --test tests/*.test.mjs`: 27 pass today.
- `bash tools/build_site.sh`: note the file list.
- Open each page (`python3 -m http.server 8000` from the repo root): home, real map, live grid (Chattanooga, Tennessee, city, IEEE 14), photon line, quantum lab, monitor. Note console errors (expected: none) and take screenshots.
- `python3 dual_ring_router.py`: save its four test outputs. The new router must reproduce the same behaviour on real sites.

**Step A. Add the route search first (nothing removed yet).** Add `route.js` and its tests, the panel section and `chattanooga_router.py`. Gate: all old tests and the new ones pass, and the live grid works on every network.

**Step B. Replace the ring test.** New test on Chattanooga: find a site whose QKD key path has at least two links and has an alternative; set one of its links to `abort`; assert that the new key path avoids that link and still reaches a control center. Add route-search tests:
- clean path found;
- a link at the cutoff is blocked;
- lowering the cutoff blocks a 8.5% link (the teammate's Test 4);
- every QKD route blocked gives the ML-KEM fallback;
- no physical path gives islanded.

Gate: the test count goes up, not down.

**Step C. Remove the ring from the live grid:** `index.json`, `main.js`, `ui.js`, `style.css`, the data files, `make_dualring.mjs`, the old test. Gate: tests pass; `?net=dualring` falls back to Chattanooga without an error; the network list shows only "Real grid" and "Test networks".

**Step D. Remove the ring from the site:** `qbar.js`, `index.html`, the real map, the lab step number, `build_site.sh`, delete `dual_ring_quantum_routing.html` and `dual_ring_router.py`, and optionally add the Vercel redirect. Gate:
- `bash tools/build_site.sh` succeeds, and the list has one file fewer.
- A link check on `site/` finds no `href` pointing to a missing file, for example: `grep -rhoE 'href="[^"#:]+\.html' site | sort -u`, then test each one exists.
- Every page loads with no console errors, and the top bar shows four steps on every page.

**Step E. Grover:** `3b_grover_route_search.ipynb`, the `check_grover.py` extension, the browser Grover card. Gate: `check_grover.py` reports 0 mismatches including the multi-marked cases; browser probabilities equal the notebook's exact values for the same candidates.

**Step F. Rebuild and docs:** `node grid-twin/tools/build_standalone.mjs`, then the docs in section 1 and the write-up in section 4. Gate:
- `grep -rniE 'dual.?ring|dualring|supernode|teamDesign' --exclude-dir=.git --exclude-dir=site --exclude-dir='New Chat Grid' .` returns only the dated history lines.
- `grid_twin.html` opens by double-click and has no ring.

**Final check:** repeat the baseline page tour and compare the screenshots. Then commit as one or two clearly named commits and push; nothing gets force-pushed.

---

## 6. Are notebooks 1, 2 and 2b used? (checked 14 Nov)

| Notebook | Where it is used today | Gaps |
|---|---|---|
| **1** BB84 | **Strongly.** Photon line (`bb84_visualizer.html`) is built from it, step by step with cell references. `grid-twin/sim/engines.py` runs its own `encode()`/`measure()` locally and its batch circuit on qBraid's QIR simulator (`notebook1`, `notebook1-qbraid`). The Quantum lab's BB84 tab shows its numbers | Cell 10 has a saved error output (qBraid credits: 1,630 needed, 500 available), so no real-hardware BB84 run exists. `WRITEUP_step1.md` still has blank placeholders. A leftover `TODO` comment in cell 3 is harmless (the code is filled in) |
| **2** Shor | **Weakly.** Only in `WRITEUP_step2.md`, `slides.md` slide 1, a one-line note in the Quantum lab (Grover tab, "Shor on 15... 65%"), and a home-page link to the write-up. No page shows the Shor result | Consider a small "Why it matters" card in the Quantum lab or on the home page: 15 = 3 × 5, period 4, and Rigetti's 65% on the four ideal outcomes. At least, keep it on deck slide 1 |
| **2b** Grover | **Yes.** The Quantum lab's "Crack a key" tab (exact Grover in the browser, plus measured Aer, IonQ simulator, Quantinuum emulator and Rigetti Cepheus numbers, which match `docs/WORK_LOG.md`). `check_grover.py` verifies its oracle and diffuser | After this plan, its oracle and diffuser are also reused by the route search (section 3), so its role grows |

Notebook 3 (teleportation) is not part of the question but still has **no saved outputs**; run it once before submitting.

---

## 7. Risks and open questions

- **Teammate's work.** The ring page and router are Asheb's, and his upload this afternoon restored the ring version. Agree on the removal with him before deleting, and credit his router algorithm in `chattanooga_router.py` and the write-up.
- **Two sessions in one repo.** Finish or stop the other session before starting, or the edits will collide.
- **QBER noise near the cutoff.** A fiber's measured QBER moves from window to window, so a route may flicker near the cutoff. Option: use the upper end of the error bar, or require two windows in a row. Decide in Step A.
- **Which nodes can be Start/End?** Every site, or only substations and control centers? Suggested default: every site, with control centers listed first.
- **Grover's place in the pitch.** Keep it to one honest line on slide 3 or 5. The mentors' "do less better" advice still applies.
